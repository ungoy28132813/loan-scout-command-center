REVOKE ALL ON TABLE public.local_ai_workers,public.local_ai_jobs FROM anon,authenticated;
GRANT SELECT(id,owner_id,label,model,enabled,last_seen_at,created_at) ON public.local_ai_workers TO authenticated;
GRANT SELECT ON public.local_ai_jobs TO authenticated;
GRANT ALL ON public.local_ai_workers,public.local_ai_jobs TO service_role;