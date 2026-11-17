ALTER TABLE public.tradelines ADD COLUMN IF NOT EXISTS is_chargeoff boolean NOT NULL DEFAULT false;

CREATE TABLE public.tradeline_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tradeline_id uuid NOT NULL REFERENCES public.tradelines(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  changed_fields text[] NOT NULL DEFAULT '{}',
  reason text NOT NULL,
  source_ref text,
  corrected_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tradeline_corrections TO authenticated;
GRANT ALL ON public.tradeline_corrections TO service_role;
ALTER TABLE public.tradeline_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assigned staff read tradeline corrections" ON public.tradeline_corrections
  FOR SELECT TO authenticated USING (public.is_client_staff(auth.uid(), client_id));
CREATE TRIGGER audit_tradeline_corrections AFTER INSERT OR UPDATE OR DELETE ON public.tradeline_corrections
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
COMMENT ON TABLE public.tradeline_corrections IS 'Staff correction reasons and changed field names only; no old/new account values or report text.';

CREATE OR REPLACE FUNCTION public.validate_client_extraction_payload(_payload jsonb)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_catalog
AS $function$
declare
  item jsonb;
  allowed_models text[] := array['FICO 8','FICO 9','FICO 10','FICO 10T','FICO Bankcard 8','FICO Auto 8','FICO 5 (Equifax)','FICO 4 (TransUnion)','FICO 2 (Experian)','VantageScore 3.0','VantageScore 4.0'];
  allowed_fields text[] := array['inquiries_30d','inquiries_3mo','inquiries_6mo','inquiries_12mo','inquiries_24mo','open_tradelines','utilization_pct','collections_count','chargeoffs_count','delinquent_accounts_count','late_30_count','late_60_count','late_90_count','late_payments_24mo','bankruptcy_on_file','months_since_bankruptcy'];
begin
  if _payload is null or jsonb_typeof(_payload) <> 'object' or pg_column_size(_payload) > 100000 then
    raise exception 'Extraction payload must be an object no larger than 100000 bytes';
  end if;
  if exists (select 1 from jsonb_object_keys(_payload) k where k not in ('parserVersion','provider','reportType','reportDate','pageCount','hasTextLayer','ocrUsed','bureausDetected','scores','fields','tradelines','status')) then
    raise exception 'Extraction payload contains unsupported data';
  end if;
  if coalesce(_payload->>'parserVersion','') !~ '^[A-Za-z0-9._-]{1,40}$' then raise exception 'Invalid parser version'; end if;
  if coalesce(_payload->>'provider','unknown') not in ('smartcredit','identityiq','myscoreiq','unknown') then raise exception 'Invalid report provider'; end if;
  if coalesce(_payload->>'reportType','unknown') not in ('tri_merge','experian','equifax','transunion','unknown') then raise exception 'Invalid report type'; end if;
  if _payload->>'status' not in ('awaiting_manual_entry','partial','unreadable','complete_unverified') then raise exception 'Invalid extraction status'; end if;
  if jsonb_typeof(_payload->'pageCount') <> 'number' or (_payload->>'pageCount')::int < 1 or (_payload->>'pageCount')::int > 80 then raise exception 'Invalid page count'; end if;
  if jsonb_typeof(_payload->'hasTextLayer') <> 'boolean' then raise exception 'Invalid text-layer flag'; end if;
  if _payload ? 'ocrUsed' and jsonb_typeof(_payload->'ocrUsed') <> 'boolean' then raise exception 'Invalid OCR provenance flag'; end if;
  if _payload->>'reportDate' is not null and (jsonb_typeof(_payload->'reportDate') <> 'string' or _payload->>'reportDate' !~ '^\d{4}-\d{2}-\d{2}$') then raise exception 'Invalid report date'; end if;
  if _payload->>'reportDate' is not null then perform (_payload->>'reportDate')::date; end if;
  if jsonb_typeof(_payload->'bureausDetected') <> 'array' or jsonb_array_length(_payload->'bureausDetected') > 3 or exists (select 1 from jsonb_array_elements_text(_payload->'bureausDetected') b where b not in ('experian','equifax','transunion')) then raise exception 'Invalid bureau list'; end if;
  if jsonb_typeof(_payload->'scores') <> 'array' or jsonb_array_length(_payload->'scores') > 12 or jsonb_typeof(_payload->'fields') <> 'array' or jsonb_array_length(_payload->'fields') > 60 or jsonb_typeof(_payload->'tradelines') <> 'array' or jsonb_array_length(_payload->'tradelines') > 200 then raise exception 'Invalid extraction item counts'; end if;

  for item in select value from jsonb_array_elements(_payload->'scores') loop
    if jsonb_typeof(item) <> 'object' or exists (select 1 from jsonb_object_keys(item) k where k not in ('bureau','model','value','scoreDate','sourcePage','confidence','needsReview')) then raise exception 'Invalid score structure'; end if;
    if item->>'bureau' not in ('experian','equifax','transunion') then raise exception 'Invalid score bureau'; end if;
    if item->>'model' is not null and (jsonb_typeof(item->'model') <> 'string' or item->>'model' <> all (allowed_models)) then raise exception 'Unknown or mismatched score model'; end if;
    if jsonb_typeof(item->'value') <> 'number' or (item->>'value')::numeric < 250 or (item->>'value')::numeric > 900 then raise exception 'Invalid score value'; end if;
    if item->>'scoreDate' is not null and (jsonb_typeof(item->'scoreDate') <> 'string' or item->>'scoreDate' !~ '^\d{4}-\d{2}-\d{2}$') then raise exception 'Invalid score date'; end if;
    if item->>'scoreDate' is not null then perform (item->>'scoreDate')::date; end if;
    if jsonb_typeof(item->'sourcePage') <> 'number' or (item->>'sourcePage')::int < 1 or (item->>'sourcePage')::int > (_payload->>'pageCount')::int then raise exception 'Invalid score source page'; end if;
    if item->>'confidence' not in ('high','medium','low') or jsonb_typeof(item->'needsReview') <> 'boolean' then raise exception 'Invalid score review metadata'; end if;
  end loop;

  for item in select value from jsonb_array_elements(_payload->'fields') loop
    if jsonb_typeof(item) <> 'object' or exists (select 1 from jsonb_object_keys(item) k where k not in ('bureau','key','value','sourcePage','confidence','needsReview')) then raise exception 'Invalid field structure'; end if;
    if item->>'bureau' not in ('experian','equifax','transunion') or item->>'key' <> all (allowed_fields) then raise exception 'Invalid field bureau or key'; end if;
    if jsonb_typeof(item->'value') <> 'number' or (item->>'value')::numeric < 0 or (item->>'value')::numeric > 100000 then raise exception 'Invalid field value'; end if;
    if item->>'key' = 'utilization_pct' and (item->>'value')::numeric > 1000 then raise exception 'Invalid utilization value'; end if;
    if item->>'key' <> 'utilization_pct' and (item->>'value')::numeric <> trunc((item->>'value')::numeric) then raise exception 'Count fields must be integers'; end if;
    if item->>'key' = 'bankruptcy_on_file' and (item->>'value')::numeric not in (0,1) then raise exception 'Bankruptcy presence must be explicit yes or no'; end if;
    if jsonb_typeof(item->'sourcePage') <> 'number' or (item->>'sourcePage')::int < 1 or (item->>'sourcePage')::int > (_payload->>'pageCount')::int then raise exception 'Invalid field source page'; end if;
    if item->>'confidence' not in ('high','medium','low') or jsonb_typeof(item->'needsReview') <> 'boolean' then raise exception 'Invalid field review metadata'; end if;
  end loop;

  for item in select value from jsonb_array_elements(_payload->'tradelines') loop
    if jsonb_typeof(item) <> 'object' or exists (select 1 from jsonb_object_keys(item) k where k not in ('bureau','creditor','last4','accountType','balance','creditLimit','isOpen','lateCount','isCollection','isChargeoff','sourcePage','needsReview')) then raise exception 'Invalid tradeline structure'; end if;
    if item->>'bureau' not in ('experian','equifax','transunion') then raise exception 'Invalid tradeline bureau'; end if;
    if coalesce(item->>'creditor','') !~ '^[A-Za-z][A-Za-z0-9 &.,''/-]{1,59}$' or item->>'creditor' ~ '\d{5,}' or item->>'creditor' ~ '\d{3}-\d{2}-\d{4}' then raise exception 'Creditor must be a short masked name without account identifiers'; end if;
    if item->>'last4' is not null and (jsonb_typeof(item->'last4') <> 'string' or item->>'last4' !~ '^\d{4}$') then raise exception 'Only four account-ending digits are allowed'; end if;
    if item->>'accountType' is not null and (jsonb_typeof(item->'accountType') <> 'string' or item->>'accountType' not in ('revolving','installment','mortgage','auto','student','other')) then raise exception 'Invalid account type'; end if;
    if item->>'balance' is not null and (jsonb_typeof(item->'balance') <> 'number' or (item->>'balance')::numeric < 0 or (item->>'balance')::numeric > 1000000000000) then raise exception 'Invalid balance'; end if;
    if item->>'creditLimit' is not null and (jsonb_typeof(item->'creditLimit') <> 'number' or (item->>'creditLimit')::numeric < 0 or (item->>'creditLimit')::numeric > 1000000000000) then raise exception 'Invalid credit limit'; end if;
    if item->>'isOpen' is not null and jsonb_typeof(item->'isOpen') <> 'boolean' then raise exception 'Invalid open-account flag'; end if;
    if item->>'lateCount' is not null and (jsonb_typeof(item->'lateCount') <> 'number' or (item->>'lateCount')::numeric < 0 or (item->>'lateCount')::numeric > 1000 or (item->>'lateCount')::numeric <> trunc((item->>'lateCount')::numeric)) then raise exception 'Invalid late count'; end if;
    if jsonb_typeof(item->'isCollection') <> 'boolean' or jsonb_typeof(item->'needsReview') <> 'boolean' then raise exception 'Invalid tradeline review flags'; end if;
    if item ? 'isChargeoff' and jsonb_typeof(item->'isChargeoff') <> 'boolean' then raise exception 'Invalid charge-off flag'; end if;
    if jsonb_typeof(item->'sourcePage') <> 'number' or (item->>'sourcePage')::int < 1 or (item->>'sourcePage')::int > (_payload->>'pageCount')::int then raise exception 'Invalid tradeline source page'; end if;
  end loop;
end
$function$;
REVOKE ALL ON FUNCTION public.validate_client_extraction_payload(jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.import_client_extraction(_submission_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
declare
  s public.client_extraction_submissions;
  r public.credit_reports;
  score_count int;
  field_count int;
  tradeline_count int;
begin
  select * into s from public.client_extraction_submissions where id = _submission_id for update;
  if not found or not public.is_client_staff(auth.uid(), s.client_id) or not public.has_perm(auth.uid(),'can_edit_extractions') then raise exception 'Only authorized staff can import client extractions'; end if;
  if s.review_status in ('imported','accepted') then return; end if;
  if s.review_status <> 'pending_review' then raise exception 'Submission is not available for import'; end if;
  select * into r from public.credit_reports where id = s.report_id and client_id = s.client_id and document_id = s.document_id;
  if not found then raise exception 'The source report or PDF no longer matches'; end if;
  if exists (select 1 from public.report_fields where report_id = s.report_id) or exists (select 1 from public.tradelines where report_id = s.report_id) then raise exception 'This report already has extracted data'; end if;

  insert into public.report_fields (report_id,client_id,bureau,field_key,score_model,value,status,source_ref,source_page,confidence,needs_review,score_date)
  select s.report_id,s.client_id,x.item->>'bureau','score',nullif(x.item->>'model',''),(x.item->>'value')::numeric,'extracted','Client-submitted automatic read; unverified until staff acceptance',(x.item->>'sourcePage')::int,x.item->>'confidence',true,nullif(x.item->>'scoreDate','')::date
  from jsonb_array_elements(s.payload->'scores') with ordinality x(item,n);
  insert into public.report_fields (report_id,client_id,bureau,field_key,score_model,value,status,source_ref,source_page,confidence,needs_review,score_date)
  select s.report_id,s.client_id,x.item->>'bureau',x.item->>'key',null,(x.item->>'value')::numeric,'extracted','Client-submitted automatic read; unverified until staff acceptance',(x.item->>'sourcePage')::int,x.item->>'confidence',true,null
  from jsonb_array_elements(s.payload->'fields') with ordinality x(item,n);
  insert into public.tradelines (report_id,client_id,bureau,creditor,account_type,account_ref_last4,is_open,balance,credit_limit,late_count,is_collection,is_chargeoff,reconcile_key,source_page,needs_review,extracted)
  select s.report_id,s.client_id,x.item->>'bureau',x.item->>'creditor',nullif(x.item->>'accountType',''),nullif(x.item->>'last4',''),nullif(x.item->>'isOpen','')::boolean,nullif(x.item->>'balance','')::numeric,nullif(x.item->>'creditLimit','')::numeric,nullif(x.item->>'lateCount','')::int,coalesce((x.item->>'isCollection')::boolean,false),coalesce((x.item->>'isChargeoff')::boolean,false),case when nullif(x.item->>'last4','') is not null then lower(x.item->>'creditor') || '|' || (x.item->>'last4') else s.id::text || ':account:' || x.n::text end,(x.item->>'sourcePage')::int,true,true
  from jsonb_array_elements(s.payload->'tradelines') with ordinality x(item,n);

  score_count := jsonb_array_length(s.payload->'scores');
  field_count := jsonb_array_length(s.payload->'fields');
  tradeline_count := jsonb_array_length(s.payload->'tradelines');
  update public.credit_reports set
    extraction_method='automated', extraction_status=(s.payload->>'status'), extracted_at=now(), detected_provider=(s.payload->>'provider'),
    report_type=case when report_type='unknown' then s.payload->>'reportType' else report_type end,
    report_date=coalesce(report_date,nullif(s.payload->>'reportDate','')::date),
    extraction_summary=jsonb_build_object('parser_version',s.parser_version,'pages',(s.payload->>'pageCount')::int,'text_layer',(s.payload->>'hasTextLayer')::boolean,'ocr_used',coalesce((s.payload->>'ocrUsed')::boolean,false),'bureaus',s.payload->'bureausDetected','scores',score_count,'fields',field_count,'tradelines',tradeline_count,'needs_review',score_count+field_count+tradeline_count,'source','client_submission')
  where id = s.report_id;
  update public.client_extraction_submissions set review_status='imported',reviewed_by=auth.uid(),reviewed_at=now() where id=s.id;
end
$function$;
REVOKE ALL ON FUNCTION public.import_client_extraction(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_client_extraction(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_staff_extraction(_report_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
declare r public.credit_reports; item_count int;
begin
  select * into r from public.credit_reports where id=_report_id for update;
  if not found or not public.is_client_staff(auth.uid(),r.client_id) or not public.has_perm(auth.uid(),'can_edit_extractions') then raise exception 'Only authorized staff can accept report extractions'; end if;
  if r.extraction_status in ('unreadable','awaiting_manual_entry','clearer_pdf_requested') then raise exception 'An unreadable or empty report cannot be accepted'; end if;
  select (select count(*) from public.report_fields where report_id=r.id) + (select count(*) from public.tradelines where report_id=r.id) into item_count;
  if item_count=0 then raise exception 'There are no extracted values to accept'; end if;
  update public.report_fields set needs_review=false,status='verified',updated_at=now() where report_id=r.id;
  update public.tradelines set needs_review=false where report_id=r.id;
  update public.credit_reports set extraction_status='verified' where id=r.id;
end
$function$;
REVOKE ALL ON FUNCTION public.accept_staff_extraction(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_staff_extraction(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.correct_tradeline(
  _tradeline_id uuid, _balance numeric, _credit_limit numeric, _late_count integer,
  _is_open boolean, _is_collection boolean, _is_chargeoff boolean,
  _source_page integer, _reason text, _source_ref text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
declare existing public.tradelines; changed text[];
begin
  select * into existing from public.tradelines where id=_tradeline_id for update;
  if not found or not public.is_client_staff(auth.uid(),existing.client_id) or not public.has_perm(auth.uid(),'can_edit_extractions') then raise exception 'Only authorized staff can correct tradelines'; end if;
  if length(trim(coalesce(_reason,''))) < 5 or length(_reason) > 500 then raise exception 'A correction reason between 5 and 500 characters is required'; end if;
  if (_balance is not null and (_balance < 0 or _balance > 1000000000000)) or (_credit_limit is not null and (_credit_limit < 0 or _credit_limit > 1000000000000)) or (_late_count is not null and (_late_count < 0 or _late_count > 1000)) then raise exception 'Invalid account value'; end if;
  if _source_page is not null and (_source_page < 1 or _source_page > 80) then raise exception 'Invalid source page'; end if;
  changed := array_remove(array[
    case when existing.balance is distinct from _balance then 'balance' end,
    case when existing.credit_limit is distinct from _credit_limit then 'credit_limit' end,
    case when existing.late_count is distinct from _late_count then 'late_count' end,
    case when existing.is_open is distinct from _is_open then 'is_open' end,
    case when existing.is_collection is distinct from _is_collection then 'is_collection' end,
    case when existing.is_chargeoff is distinct from _is_chargeoff then 'is_chargeoff' end,
    case when existing.source_page is distinct from _source_page then 'source_page' end,
    case when existing.needs_review then 'needs_review' end
  ]::text[],null::text);
  update public.tradelines set balance=_balance,credit_limit=_credit_limit,late_count=_late_count,is_open=_is_open,is_collection=_is_collection,is_chargeoff=_is_chargeoff,source_page=_source_page,needs_review=false where id=existing.id;
  insert into public.tradeline_corrections (tradeline_id,client_id,changed_fields,reason,source_ref,corrected_by)
  values (existing.id,existing.client_id,changed,trim(_reason),nullif(left(trim(coalesce(_source_ref,'')),200),''),auth.uid());
end
$function$;
REVOKE ALL ON FUNCTION public.correct_tradeline(uuid,numeric,numeric,integer,boolean,boolean,boolean,integer,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correct_tradeline(uuid,numeric,numeric,integer,boolean,boolean,boolean,integer,text,text) TO authenticated;
