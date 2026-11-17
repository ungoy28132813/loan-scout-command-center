CREATE OR REPLACE FUNCTION public.validate_client_extraction_required(_payload jsonb)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_catalog
AS $function$
declare item jsonb; item_count int;
begin
  if not (_payload ? 'status') or not (_payload ? 'pageCount') or not (_payload ? 'hasTextLayer') or not (_payload ? 'scores') or not (_payload ? 'fields') or not (_payload ? 'tradelines') then raise exception 'Missing required extraction metadata'; end if;
  if jsonb_typeof(_payload->'scores') <> 'array' or jsonb_typeof(_payload->'fields') <> 'array' or jsonb_typeof(_payload->'tradelines') <> 'array' then raise exception 'Extraction collections must be arrays'; end if;
  for item in select value from jsonb_array_elements(_payload->'scores') loop
    if not (item ? 'bureau') or not (item ? 'value') or not (item ? 'sourcePage') or not (item ? 'confidence') or not (item ? 'needsReview') then raise exception 'Missing required score data'; end if;
  end loop;
  for item in select value from jsonb_array_elements(_payload->'fields') loop
    if not (item ? 'bureau') or not (item ? 'key') or not (item ? 'value') or not (item ? 'sourcePage') or not (item ? 'confidence') or not (item ? 'needsReview') then raise exception 'Missing required field data'; end if;
  end loop;
  for item in select value from jsonb_array_elements(_payload->'tradelines') loop
    if not (item ? 'bureau') or not (item ? 'creditor') or not (item ? 'isCollection') or not (item ? 'sourcePage') or not (item ? 'needsReview') then raise exception 'Missing required tradeline data'; end if;
  end loop;
  item_count := jsonb_array_length(_payload->'scores') + jsonb_array_length(_payload->'fields') + jsonb_array_length(_payload->'tradelines');
  if _payload->>'status' in ('unreadable','awaiting_manual_entry') and item_count <> 0 then raise exception 'Unreadable or empty reads cannot contain extracted values'; end if;
  if _payload->>'status' in ('partial','complete_unverified') and item_count = 0 then raise exception 'A populated extraction status requires at least one structured value'; end if;
  if _payload->>'status' = 'unreadable' and (_payload->>'hasTextLayer')::boolean then raise exception 'Unreadable reports cannot claim a text layer'; end if;
end
$function$;
REVOKE ALL ON FUNCTION public.validate_client_extraction_required(jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_client_extraction(_report_id uuid, _idempotency_key uuid, _payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
declare
  r record;
  existing public.client_extraction_submissions;
  new_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select cr.id, cr.client_id, cr.document_id, d.uploaded_by, d.category, d.mime_type
    into r from public.credit_reports cr
    join public.documents d on d.id = cr.document_id and d.client_id = cr.client_id
   where cr.id = _report_id;
  if not found or not public.is_client_self(auth.uid(), r.client_id) then raise exception 'You can submit only for your own client record'; end if;
  if r.uploaded_by <> auth.uid() then raise exception 'You can submit only for a PDF you uploaded'; end if;
  if r.category <> 'credit_reports' or r.mime_type <> 'application/pdf' then raise exception 'A matching credit-report PDF is required'; end if;
  if not public.has_client_consent(auth.uid(), r.client_id) then raise exception 'Required consent has not been recorded'; end if;
  perform public.validate_client_extraction_required(_payload);
  perform public.validate_client_extraction_payload(_payload);
  select * into existing from public.client_extraction_submissions where report_id = _report_id;
  if found then
    if existing.submitted_by = auth.uid() and existing.idempotency_key = _idempotency_key and existing.payload = _payload then return existing.id; end if;
    raise exception 'This report already has an extraction submission';
  end if;
  insert into public.client_extraction_submissions (client_id, report_id, document_id, submitted_by, idempotency_key, parser_version, payload)
  values (r.client_id, r.id, r.document_id, auth.uid(), _idempotency_key, _payload->>'parserVersion', _payload)
  returning id into new_id;
  return new_id;
end
$function$;
REVOKE ALL ON FUNCTION public.submit_client_extraction(uuid,uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_client_extraction(uuid,uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_client_extraction(_submission_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
declare s public.client_extraction_submissions;
begin
  select * into s from public.client_extraction_submissions where id = _submission_id for update;
  if not found or not public.is_client_staff(auth.uid(), s.client_id) or not public.has_perm(auth.uid(),'can_edit_extractions') then raise exception 'Only authorized staff can accept client extractions'; end if;
  if s.review_status = 'accepted' then return; end if;
  if s.review_status <> 'imported' then raise exception 'Import the extraction before accepting it'; end if;
  if s.payload->>'status' in ('unreadable','awaiting_manual_entry') then raise exception 'An unreadable or empty report cannot be accepted'; end if;
  if jsonb_array_length(s.payload->'scores') + jsonb_array_length(s.payload->'fields') + jsonb_array_length(s.payload->'tradelines') = 0 then raise exception 'There are no extracted values to accept'; end if;
  update public.report_fields set needs_review=false,status='verified',updated_at=now() where report_id=s.report_id;
  update public.tradelines set needs_review=false where report_id=s.report_id;
  update public.credit_reports set extraction_status='verified' where id=s.report_id;
  update public.client_extraction_submissions set review_status='accepted',reviewed_by=auth.uid(),reviewed_at=now() where id=s.id;
end
$function$;
REVOKE ALL ON FUNCTION public.accept_client_extraction(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_client_extraction(uuid) TO authenticated;