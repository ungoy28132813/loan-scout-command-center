CREATE TABLE public.benchmark_diagnostics (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL,
 input_hash text NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
 symptoms jsonb NOT NULL CHECK (jsonb_typeof(symptoms) = 'object' AND octet_length(symptoms::text) <= 24000),
 status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','complete','failed','stopped')),
 result jsonb CHECK (result IS NULL OR (jsonb_typeof(result) = 'object' AND octet_length(result::text) <= 24000)),
 error_message text CHECK (length(error_message) <= 1500), gateway_run_id text CHECK (length(gateway_run_id) <= 200),
 recovery_id text CHECK (recovery_id IN ('start_ollama','check_models','reduce_load','review_output','restart_worker','redownload_benchmark','manual_review')),
 recovery_outcome text NOT NULL DEFAULT 'unconfirmed' CHECK (recovery_outcome IN ('unconfirmed','resolved','not_resolved')),
 confirmed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz
);
GRANT SELECT ON public.benchmark_diagnostics TO authenticated;
GRANT ALL ON public.benchmark_diagnostics TO service_role;
ALTER TABLE public.benchmark_diagnostics ENABLE ROW LEVEL SECURITY;
CREATE POLICY benchmark_owner_read ON public.benchmark_diagnostics FOR SELECT TO authenticated USING (owner_id = auth.uid() AND public.is_owner(auth.uid()));
CREATE INDEX benchmark_diagnostics_owner_time ON public.benchmark_diagnostics(owner_id,created_at DESC);
CREATE UNIQUE INDEX benchmark_one_running ON public.benchmark_diagnostics(owner_id) WHERE status='running';
CREATE TRIGGER benchmark_diagnostics_audit AFTER INSERT OR UPDATE OR DELETE ON public.benchmark_diagnostics FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
CREATE TABLE public.benchmark_ai_controls (
 id uuid PRIMARY KEY, paused boolean NOT NULL DEFAULT false,
 pause_kind text CHECK (pause_kind IN ('credits','policy','provider','unavailable')),
 message text CHECK (length(message) <= 1500), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.benchmark_ai_controls TO authenticated;
GRANT ALL ON public.benchmark_ai_controls TO service_role;
ALTER TABLE public.benchmark_ai_controls ENABLE ROW LEVEL SECURITY;
CREATE POLICY benchmark_controls_owner_read ON public.benchmark_ai_controls FOR SELECT TO authenticated USING (id=auth.uid() AND public.is_owner(auth.uid()));
CREATE TRIGGER benchmark_controls_audit AFTER INSERT OR UPDATE OR DELETE ON public.benchmark_ai_controls FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
CREATE FUNCTION public.begin_benchmark_diagnosis(_owner_id uuid,_hash text,_symptoms jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE found public.benchmark_diagnostics; control public.benchmark_ai_controls; new_id uuid;
BEGIN
 IF NOT public.is_owner(_owner_id) THEN RAISE EXCEPTION 'Owner access required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_owner_id::text,79));
 SELECT * INTO found FROM public.benchmark_diagnostics WHERE owner_id=_owner_id AND input_hash=_hash AND status='complete' ORDER BY created_at DESC LIMIT 1;
 IF found.id IS NOT NULL THEN RETURN jsonb_build_object('id',found.id,'cached',true); END IF;
 SELECT * INTO control FROM public.benchmark_ai_controls WHERE id=_owner_id;
 IF control.paused THEN RAISE EXCEPTION 'Hosted diagnosis paused. Restore access and resume explicitly.'; END IF;
 IF EXISTS (SELECT 1 FROM public.benchmark_diagnostics WHERE owner_id=_owner_id AND status='running') THEN RAISE EXCEPTION 'An analysis is already running. Stop or release the interrupted analysis first.'; END IF;
 IF (SELECT count(*) FROM public.benchmark_diagnostics WHERE owner_id=_owner_id AND created_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') >= 5 THEN RAISE EXCEPTION 'Five new diagnoses per day reached. Saved results remain available.'; END IF;
 INSERT INTO public.benchmark_diagnostics(owner_id,input_hash,symptoms) VALUES(_owner_id,_hash,_symptoms) RETURNING id INTO new_id;
 RETURN jsonb_build_object('id',new_id,'cached',false);
END $$;
REVOKE ALL ON FUNCTION public.begin_benchmark_diagnosis(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_benchmark_diagnosis(uuid,text,jsonb) TO service_role;
CREATE FUNCTION public.confirm_benchmark_recovery(_id uuid,_recovery text,_outcome text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_owner(auth.uid()) THEN RAISE EXCEPTION 'Owner access required'; END IF;
 IF _outcome NOT IN ('resolved','not_resolved') THEN RAISE EXCEPTION 'Invalid recovery outcome'; END IF;
 UPDATE public.benchmark_diagnostics SET recovery_id=_recovery,recovery_outcome=_outcome,confirmed_at=now() WHERE id=_id AND owner_id=auth.uid() AND status='complete' AND result->'recoveryIds' ? _recovery;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recovery must be recommended by this completed diagnosis'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.confirm_benchmark_recovery(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.confirm_benchmark_recovery(uuid,text,text) TO authenticated,service_role;
CREATE FUNCTION public.resume_benchmark_diagnosis() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_owner(auth.uid()) THEN RAISE EXCEPTION 'Owner access required'; END IF;
 UPDATE public.benchmark_ai_controls SET paused=false,pause_kind=null,message=null,updated_at=now() WHERE id=auth.uid();
END $$;
REVOKE ALL ON FUNCTION public.resume_benchmark_diagnosis() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.resume_benchmark_diagnosis() TO authenticated,service_role;
CREATE FUNCTION public.stop_benchmark_diagnosis(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_owner(auth.uid()) THEN RAISE EXCEPTION 'Owner access required'; END IF;
 UPDATE public.benchmark_diagnostics SET status='stopped',finished_at=now(),error_message='Stopped by operator; no automatic retry.' WHERE id=_id AND owner_id=auth.uid() AND status='running';
END $$;
REVOKE ALL ON FUNCTION public.stop_benchmark_diagnosis(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.stop_benchmark_diagnosis(uuid) TO authenticated,service_role;