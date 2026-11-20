CREATE OR REPLACE FUNCTION public.auto_accept_client_submission() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE s public.client_extraction_submissions; r record;
BEGIN
 SELECT * INTO s FROM public.client_extraction_submissions WHERE id=NEW.id FOR UPDATE;
 IF NOT FOUND OR s.review_status <> 'pending_review' THEN RETURN NEW; END IF;
 SELECT cr.id,cr.client_id,cr.document_id,d.uploaded_by,d.category,d.mime_type INTO r
 FROM public.credit_reports cr JOIN public.documents d ON d.id=cr.document_id AND d.client_id=cr.client_id
 WHERE cr.id=s.report_id AND cr.client_id=s.client_id AND cr.document_id=s.document_id;
 IF NOT FOUND OR s.submitted_by IS DISTINCT FROM auth.uid() OR r.uploaded_by IS DISTINCT FROM s.submitted_by
 OR NOT public.is_client_self(s.submitted_by,s.client_id) OR NOT public.has_client_consent(s.submitted_by,s.client_id)
 OR r.category <> 'credit_reports' OR r.mime_type <> 'application/pdf' THEN
 RAISE EXCEPTION 'Automatic extraction ownership or consent mismatch'; END IF;
 PERFORM public.validate_client_extraction_required(s.payload);
 PERFORM public.validate_client_extraction_payload(s.payload);
 IF s.payload->>'status' IN ('unreadable','awaiting_manual_entry') THEN RETURN NEW; END IF;
 IF jsonb_array_length(s.payload->'scores')+jsonb_array_length(s.payload->'fields')+jsonb_array_length(s.payload->'tradelines')=0 THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM public.report_fields WHERE report_id=s.report_id) OR EXISTS(SELECT 1 FROM public.tradelines WHERE report_id=s.report_id) THEN RAISE EXCEPTION 'This report already has extracted data'; END IF;
 INSERT INTO public.report_fields(report_id,client_id,bureau,field_key,score_model,value,status,source_ref,source_page,confidence,needs_review,score_date)
 SELECT s.report_id,s.client_id,x.item->>'bureau','score',nullif(x.item->>'model',''),(x.item->>'value')::numeric,'extracted','Automatic client read confirmed by owner policy; not human reviewed',(x.item->>'sourcePage')::int,x.item->>'confidence',true,nullif(x.item->>'scoreDate','')::date FROM jsonb_array_elements(s.payload->'scores') WITH ORDINALITY x(item,n);
 INSERT INTO public.report_fields(report_id,client_id,bureau,field_key,score_model,value,status,source_ref,source_page,confidence,needs_review,score_date)
 SELECT s.report_id,s.client_id,x.item->>'bureau',x.item->>'key',null,(x.item->>'value')::numeric,'extracted','Automatic client read confirmed by owner policy; not human reviewed',(x.item->>'sourcePage')::int,x.item->>'confidence',true,null FROM jsonb_array_elements(s.payload->'fields') WITH ORDINALITY x(item,n);
 INSERT INTO public.tradelines(report_id,client_id,bureau,creditor,account_type,account_ref_last4,is_open,balance,credit_limit,late_count,is_collection,is_chargeoff,reconcile_key,source_page,needs_review,extracted)
 SELECT s.report_id,s.client_id,x.item->>'bureau',x.item->>'creditor',nullif(x.item->>'accountType',''),nullif(x.item->>'last4',''),nullif(x.item->>'isOpen','')::boolean,nullif(x.item->>'balance','')::numeric,nullif(x.item->>'creditLimit','')::numeric,nullif(x.item->>'lateCount','')::int,coalesce((x.item->>'isCollection')::boolean,false),coalesce((x.item->>'isChargeoff')::boolean,false),CASE WHEN nullif(x.item->>'last4','') IS NOT NULL THEN lower(x.item->>'creditor')||'|'||(x.item->>'last4') ELSE s.id::text||':account:'||x.n::text END,(x.item->>'sourcePage')::int,true,true FROM jsonb_array_elements(s.payload->'tradelines') WITH ORDINALITY x(item,n);
 UPDATE public.credit_reports SET extraction_method='automated',extraction_status='verified',extracted_at=now(),detected_provider=s.payload->>'provider',
 report_type=CASE WHEN report_type='unknown' THEN s.payload->>'reportType' ELSE report_type END,report_date=coalesce(report_date,nullif(s.payload->>'reportDate','')::date),
 extraction_summary=jsonb_build_object('parser_version',s.parser_version,'pages',(s.payload->>'pageCount')::int,'text_layer',(s.payload->>'hasTextLayer')::boolean,'ocr_used',coalesce((s.payload->>'ocrUsed')::boolean,false),'bureaus',s.payload->'bureausDetected','scores',jsonb_array_length(s.payload->'scores'),'fields',jsonb_array_length(s.payload->'fields'),'tradelines',jsonb_array_length(s.payload->'tradelines'),'source','client_submission','confirmation','automatic_owner_policy','human_reviewed',false)
 WHERE id=s.report_id;
 UPDATE public.client_extraction_submissions SET review_status='accepted',reviewed_by=NULL,reviewed_at=now() WHERE id=s.id;
 RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.auto_accept_client_submission() FROM PUBLIC,anon,authenticated;
COMMENT ON FUNCTION public.auto_accept_client_submission() IS 'Owner-policy automatic confirmation after ownership, consent and structured payload validation. No owner impersonation; accepted does not mean human reviewed.';