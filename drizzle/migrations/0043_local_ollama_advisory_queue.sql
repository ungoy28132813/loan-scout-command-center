CREATE TABLE public.local_ai_workers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES public.profiles(id), label text NOT NULL CHECK(length(label) BETWEEN 1 AND 80), model text NOT NULL CHECK(length(model) BETWEEN 1 AND 160), token_hash text NOT NULL UNIQUE, enabled boolean NOT NULL DEFAULT true, last_seen_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT(id,owner_id,label,model,enabled,last_seen_at,created_at) ON public.local_ai_workers TO authenticated;
GRANT ALL ON public.local_ai_workers TO service_role;
ALTER TABLE public.local_ai_workers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner read local worker" ON public.local_ai_workers FOR SELECT TO authenticated USING(owner_id=auth.uid() AND public.is_owner(auth.uid()));
CREATE TRIGGER audit_local_ai_workers AFTER INSERT OR UPDATE OR DELETE ON public.local_ai_workers FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
CREATE TABLE public.local_ai_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), worker_id uuid NOT NULL REFERENCES public.local_ai_workers(id), owner_id uuid NOT NULL REFERENCES public.profiles(id), product_id uuid NOT NULL REFERENCES public.lender_products(id), input jsonb NOT NULL CHECK(octet_length(input::text)<=48000), model text NOT NULL CHECK(length(model) BETWEEN 1 AND 160), status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','running','completed','failed','cancelled')), lease_id uuid, lease_until timestamptz, expires_at timestamptz NOT NULL DEFAULT(now()+interval '15 minutes'), result jsonb CHECK(result IS NULL OR octet_length(result::text)<=16000), error_code text CHECK(error_code IS NULL OR error_code IN('model_unavailable','invalid_output','local_timeout','local_error','expired')), review_status text NOT NULL DEFAULT 'pending' CHECK(review_status IN('pending','accepted_note','rejected')), reviewed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz
);
GRANT SELECT ON public.local_ai_jobs TO authenticated;
GRANT ALL ON public.local_ai_jobs TO service_role;
ALTER TABLE public.local_ai_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner read local advice" ON public.local_ai_jobs FOR SELECT TO authenticated USING(owner_id=auth.uid() AND public.is_owner(auth.uid()));
CREATE UNIQUE INDEX local_ai_one_active_job ON public.local_ai_jobs(worker_id) WHERE status IN('queued','running');
CREATE INDEX local_ai_job_time ON public.local_ai_jobs(owner_id,created_at);
CREATE TRIGGER audit_local_ai_jobs AFTER INSERT OR UPDATE OR DELETE ON public.local_ai_jobs FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
CREATE FUNCTION public.pair_local_ai_worker(_label text,_model text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE t text; w uuid;
BEGIN
 IF NOT public.is_owner(auth.uid()) THEN RAISE EXCEPTION 'Owner access required'; END IF;
 IF length(_label) NOT BETWEEN 1 AND 80 OR length(_model) NOT BETWEEN 1 AND 160 OR _model !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]*$' THEN RAISE EXCEPTION 'Invalid connection settings'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(auth.uid()::text));
 UPDATE public.local_ai_jobs SET status='cancelled',finished_at=now() WHERE owner_id=auth.uid() AND status IN('queued','running');
 UPDATE public.local_ai_workers SET enabled=false WHERE owner_id=auth.uid() AND enabled;
 t:=encode(gen_random_bytes(32),'hex');
 INSERT INTO public.local_ai_workers(owner_id,label,model,token_hash) VALUES(auth.uid(),_label,_model,encode(digest(t,'sha256'),'hex')) RETURNING id INTO w;
 RETURN jsonb_build_object('workerId',w,'token',t);
END $$;
REVOKE ALL ON FUNCTION public.pair_local_ai_worker(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pair_local_ai_worker(text,text) TO authenticated;
CREATE FUNCTION public.revoke_local_ai_worker(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_owner(auth.uid()) THEN RAISE EXCEPTION 'Owner access required'; END IF;
 UPDATE public.local_ai_workers SET enabled=false WHERE id=_id AND owner_id=auth.uid();
 UPDATE public.local_ai_jobs SET status='cancelled',finished_at=now() WHERE worker_id=_id AND owner_id=auth.uid() AND status IN('queued','running');
END $$;
REVOKE ALL ON FUNCTION public.revoke_local_ai_worker(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.revoke_local_ai_worker(uuid) TO authenticated;
CREATE FUNCTION public.verify_local_ai_token(_token text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
 SELECT length(_token)=64 AND EXISTS(SELECT 1 FROM public.local_ai_workers w WHERE w.token_hash=encode(digest(_token,'sha256'),'hex') AND w.enabled AND public.is_owner(w.owner_id));
$$;
REVOKE ALL ON FUNCTION public.verify_local_ai_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_local_ai_token(text) TO anon,authenticated,service_role;
CREATE FUNCTION public.local_ai_worker_exchange(_token text,_action text,_job_id uuid DEFAULT NULL,_lease_id uuid DEFAULT NULL,_result jsonb DEFAULT NULL,_error_code text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE w public.local_ai_workers; j public.local_ai_jobs;
BEGIN
 SELECT * INTO w FROM public.local_ai_workers WHERE token_hash=encode(digest(_token,'sha256'),'hex') AND enabled FOR UPDATE;
 IF NOT FOUND OR length(_token)<>64 OR NOT public.is_owner(w.owner_id) THEN RAISE EXCEPTION 'Invalid worker credential'; END IF;
 UPDATE public.local_ai_workers SET last_seen_at=now() WHERE id=w.id;
 IF _action='poll' THEN
  UPDATE public.local_ai_jobs SET status='failed',error_code='expired',finished_at=now() WHERE worker_id=w.id AND status IN('queued','running') AND (expires_at<=now() OR (status='running' AND lease_until<=now()));
  SELECT * INTO j FROM public.local_ai_jobs WHERE worker_id=w.id AND status='queued' AND expires_at>now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('job',NULL); END IF;
  UPDATE public.local_ai_jobs SET status='running',lease_id=gen_random_uuid(),lease_until=now()+interval '5 minutes' WHERE id=j.id RETURNING * INTO j;
  RETURN jsonb_build_object('job',jsonb_build_object('id',j.id,'leaseId',j.lease_id,'model',j.model,'input',j.input));
 ELSIF _action='complete' THEN
  SELECT * INTO j FROM public.local_ai_jobs WHERE id=_job_id AND worker_id=w.id AND lease_id=_lease_id AND status='running' AND lease_until>now() AND expires_at>now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Job is no longer assigned'; END IF;
  IF _error_code IS NOT NULL THEN
   IF _error_code NOT IN('model_unavailable','invalid_output','local_timeout','local_error') THEN RAISE EXCEPTION 'Invalid failure'; END IF;
   UPDATE public.local_ai_jobs SET status='failed',error_code=_error_code,finished_at=now() WHERE id=j.id;
  ELSE
   IF _result IS NULL OR jsonb_typeof(_result)<>'object' OR octet_length(_result::text)>16000 THEN RAISE EXCEPTION 'Invalid result'; END IF;
   UPDATE public.local_ai_jobs SET status='completed',result=_result,finished_at=now() WHERE id=j.id;
  END IF;
  RETURN jsonb_build_object('ok',true);
 END IF;
 RAISE EXCEPTION 'Invalid worker action';
END $$;
REVOKE ALL ON FUNCTION public.local_ai_worker_exchange(text,text,uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.local_ai_worker_exchange(text,text,uuid,uuid,jsonb,text) TO service_role;
CREATE FUNCTION public.review_local_ai_job(_id uuid,_decision text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_owner(auth.uid()) THEN RAISE EXCEPTION 'Owner access required'; END IF;
 IF _decision NOT IN('accepted_note','rejected') THEN RAISE EXCEPTION 'Invalid review'; END IF;
 UPDATE public.local_ai_jobs SET review_status=_decision,reviewed_at=now() WHERE id=_id AND owner_id=auth.uid() AND status='completed' AND review_status='pending';
 IF NOT FOUND THEN RAISE EXCEPTION 'Advice unavailable for review'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.review_local_ai_job(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_local_ai_job(uuid,text) TO authenticated;
COMMENT ON TABLE public.local_ai_jobs IS 'Owner-only advisory public-source analyses. No raw reports, client identifiers, eligibility rules, training or publication. Reviewed results remain notes.';