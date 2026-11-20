CREATE FUNCTION public.local_ai_outcome_context(_product_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE n int; a int; d int;
BEGIN
 SELECT count(*),count(*) FILTER(WHERE ap.status='approved'),count(*) FILTER(WHERE ap.status='denied') INTO n,a,d
 FROM public.applications ap JOIN public.application_outcomes oc ON oc.application_id=ap.id JOIN public.clients c ON c.id=ap.client_id
 WHERE ap.product_id=_product_id AND ap.status IN('approved','denied') AND oc.verification_status='verified' AND NOT c.is_demo;
 IF n<5 OR a=0 OR d=0 THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('sample',n,'approved',a,'denied',d);
END $$;
REVOKE ALL ON FUNCTION public.local_ai_outcome_context(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.local_ai_outcome_context(uuid) TO service_role;
CREATE FUNCTION public.enqueue_local_ai_job(_owner_id uuid,_product_id uuid,_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w public.local_ai_workers; j public.local_ai_jobs;
BEGIN
 IF NOT public.is_owner(_owner_id) THEN RAISE EXCEPTION 'Owner access required'; END IF;
 SELECT * INTO w FROM public.local_ai_workers WHERE owner_id=_owner_id AND enabled FOR UPDATE;
 IF NOT FOUND OR w.last_seen_at IS NULL OR w.last_seen_at<now()-interval '90 seconds' THEN RAISE EXCEPTION 'Your local AI computer is offline'; END IF;
 IF jsonb_typeof(_input)<>'object' OR octet_length(_input::text)>48000 OR (_input-'product'-'source'-'outcomes')<>'{}'::jsonb THEN RAISE EXCEPTION 'Invalid public-source input'; END IF;
 UPDATE public.local_ai_jobs SET status='failed',error_code='expired',finished_at=now() WHERE worker_id=w.id AND status IN('queued','running') AND (expires_at<=now() OR (status='running' AND lease_until<=now()));
 SELECT * INTO j FROM public.local_ai_jobs WHERE owner_id=_owner_id AND product_id=_product_id AND model=w.model AND input=_input AND status='completed' AND review_status<>'rejected' AND created_at>now()-interval '24 hours' ORDER BY created_at DESC LIMIT 1;
 IF FOUND THEN RETURN jsonb_build_object('jobId',j.id,'cached',true); END IF;
 IF EXISTS(SELECT 1 FROM public.local_ai_jobs WHERE worker_id=w.id AND status IN('queued','running')) THEN RAISE EXCEPTION 'Wait for the current analysis to finish'; END IF;
 IF (SELECT count(*) FROM public.local_ai_jobs WHERE owner_id=_owner_id AND created_at>=date_trunc('day',now()))>=30 THEN RAISE EXCEPTION 'Daily limit of 30 local analyses reached'; END IF;
 INSERT INTO public.local_ai_jobs(worker_id,owner_id,product_id,input,model) VALUES(w.id,_owner_id,_product_id,_input,w.model) RETURNING * INTO j;
 RETURN jsonb_build_object('jobId',j.id,'cached',false);
END $$;
REVOKE ALL ON FUNCTION public.enqueue_local_ai_job(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_local_ai_job(uuid,uuid,jsonb) TO service_role;