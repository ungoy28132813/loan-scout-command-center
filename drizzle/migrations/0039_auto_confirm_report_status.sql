CREATE OR REPLACE FUNCTION public.auto_confirm_report_status() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  update public.credit_reports set extraction_status='verified'
   where id = NEW.report_id and extraction_status not in ('verified','unreadable','clearer_pdf_requested');
  return NEW;
end $$;
CREATE OR REPLACE FUNCTION public.auto_confirm_report_update() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  if NEW.extraction_status in ('partial','complete_unverified') then NEW.extraction_status := 'verified'; end if;
  return NEW;
end $$;
DROP TRIGGER IF EXISTS auto_confirm_report_update ON public.credit_reports;
CREATE TRIGGER auto_confirm_report_update BEFORE INSERT OR UPDATE OF extraction_status ON public.credit_reports FOR EACH ROW EXECUTE FUNCTION public.auto_confirm_report_update();
REVOKE EXECUTE ON FUNCTION public.auto_confirm_report_update() FROM PUBLIC, anon, authenticated;