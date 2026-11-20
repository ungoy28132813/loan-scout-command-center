CREATE OR REPLACE FUNCTION public.auto_confirm_report_row() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  NEW.needs_review := false;
  if TG_TABLE_NAME = 'report_fields' and NEW.value is not null then NEW.status := 'verified'; end if;
  return NEW;
end $$;
CREATE OR REPLACE FUNCTION public.auto_confirm_report_status() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  update public.credit_reports set extraction_status='verified'
   where id = NEW.report_id and extraction_status not in ('verified','unreadable','awaiting_manual_entry','clearer_pdf_requested');
  return NEW;
end $$;
DROP TRIGGER IF EXISTS auto_confirm_fields ON public.report_fields;
CREATE TRIGGER auto_confirm_fields BEFORE INSERT ON public.report_fields FOR EACH ROW EXECUTE FUNCTION public.auto_confirm_report_row();
DROP TRIGGER IF EXISTS auto_confirm_tradelines ON public.tradelines;
CREATE TRIGGER auto_confirm_tradelines BEFORE INSERT ON public.tradelines FOR EACH ROW EXECUTE FUNCTION public.auto_confirm_report_row();
DROP TRIGGER IF EXISTS auto_confirm_fields_status ON public.report_fields;
CREATE TRIGGER auto_confirm_fields_status AFTER INSERT ON public.report_fields FOR EACH ROW EXECUTE FUNCTION public.auto_confirm_report_status();
DROP TRIGGER IF EXISTS auto_confirm_tradelines_status ON public.tradelines;
CREATE TRIGGER auto_confirm_tradelines_status AFTER INSERT ON public.tradelines FOR EACH ROW EXECUTE FUNCTION public.auto_confirm_report_status();

CREATE OR REPLACE FUNCTION public.auto_accept_client_submission() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare o uuid; prev text := current_setting('request.jwt.claims', true);
begin
  if NEW.payload->>'status' in ('unreadable','awaiting_manual_entry') then return NEW; end if;
  select user_id into o from public.user_roles where role='owner' limit 1;
  if o is null then return NEW; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role','authenticated')::text, true);
  begin
    perform public.import_client_extraction(NEW.id);
    perform public.accept_client_extraction(NEW.id);
  exception when others then null; -- leave for manual review if anything doesn't match
  end;
  perform set_config('request.jwt.claims', coalesce(prev,''), true);
  return NEW;
end $$;
DROP TRIGGER IF EXISTS auto_accept_client_submission ON public.client_extraction_submissions;
CREATE TRIGGER auto_accept_client_submission AFTER INSERT ON public.client_extraction_submissions FOR EACH ROW EXECUTE FUNCTION public.auto_accept_client_submission();
REVOKE EXECUTE ON FUNCTION public.auto_accept_client_submission(), public.auto_confirm_report_row(), public.auto_confirm_report_status() FROM PUBLIC, anon, authenticated;