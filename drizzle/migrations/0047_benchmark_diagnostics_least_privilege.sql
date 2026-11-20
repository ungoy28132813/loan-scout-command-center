REVOKE ALL ON public.benchmark_diagnostics,public.benchmark_ai_controls FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.benchmark_diagnostics,public.benchmark_ai_controls TO authenticated;
GRANT ALL ON public.benchmark_diagnostics,public.benchmark_ai_controls TO service_role;