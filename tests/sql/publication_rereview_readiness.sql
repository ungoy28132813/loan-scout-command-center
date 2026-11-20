-- Read-only readiness checks; pair with the real post-revocation upload browser regression.
-- No client data or role changes are performed by this file.
select 'publication trigger is attached' as check, exists (
  select 1 from pg_trigger where tgrelid='public.published_snapshots'::regclass
  and tgname='guard_publication' and not tgisinternal
) as pass
union all select 'new report review trigger is attached', exists (
  select 1 from pg_trigger where tgrelid='public.credit_reports'::regclass
  and tgname='credit_report_rereview' and not tgisinternal
)
union all select 'clients cannot directly invoke publication trigger',
  not has_function_privilege('authenticated','public.guard_publication()','execute')
union all select 'anonymous cannot invoke publication trigger',
  not has_function_privilege('anon','public.guard_publication()','execute')
union all select 'private documents retain RLS',
  (select relrowsecurity from pg_class where oid='public.documents'::regclass)
union all select 'published snapshots retain RLS',
  (select relrowsecurity from pg_class where oid='public.published_snapshots'::regclass)
union all select 'internal guard functions have no public execution', not exists (
  select 1 from pg_proc where pronamespace='public'::regnamespace
  and proname in ('guard_application_links','guard_application_outcome','guard_business_answer_link',
    'guard_business_profile_write','guard_funding_goal_business_link','guard_funding_strategy',
    'guard_goal_answer_write','guard_readiness_task')
  and (has_function_privilege('anon',oid,'execute') or has_function_privilege('authenticated',oid,'execute'))
)
union all select 'automatic processing never impersonates owner claims',
  position('set_config' in pg_get_functiondef('public.auto_accept_client_submission()'::regprocedure)) = 0
union all select 'automatic processing is not callable by clients',
  not has_function_privilege('authenticated','public.auto_accept_client_submission()','execute');