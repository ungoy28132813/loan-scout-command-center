CREATE OR REPLACE FUNCTION public.active_goal_question_definitions()
RETURNS TABLE (rule_key text, input_key text, requires_verified_facts boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
  SELECT DISTINCT r.rule_key, r.input_key, r.requires_verified_facts
  FROM public.lender_rules r
  WHERE r.approval_status = 'active';
$$;
REVOKE ALL ON FUNCTION public.active_goal_question_definitions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.active_goal_question_definitions() TO authenticated;
COMMENT ON FUNCTION public.active_goal_question_definitions() IS 'Returns only active question metadata for goal forms; no product, lender, source, threshold, or client data.';