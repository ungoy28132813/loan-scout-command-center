REVOKE ALL ON public.product_research_sources FROM anon;
REVOKE ALL ON public.product_research_sources FROM authenticated;
GRANT SELECT ON public.product_research_sources TO authenticated;
GRANT ALL ON public.product_research_sources TO service_role;