-- Read-only ownership, cost-control and audit readiness; contains no real client data.
select 'diagnosis_rls' as rule, relrowsecurity as passed from pg_class where oid='public.benchmark_diagnostics'::regclass
union all select 'controls_rls', relrowsecurity from pg_class where oid='public.benchmark_ai_controls'::regclass
union all select 'no_anon_diagnosis_read', not has_table_privilege('anon','public.benchmark_diagnostics','SELECT')
union all select 'no_client_diagnosis_write', not has_table_privilege('authenticated','public.benchmark_diagnostics','INSERT,UPDATE,DELETE')
union all select 'owner_has_read_grant', has_table_privilege('authenticated','public.benchmark_diagnostics','SELECT')
union all select 'diagnosis_owner_policy', exists(select 1 from pg_policies where schemaname='public' and tablename='benchmark_diagnostics' and qual like '%is_owner%' and qual like '%auth.uid%')
union all select 'queue_admin_only', not has_function_privilege('authenticated','public.begin_benchmark_diagnosis(uuid,text,jsonb)','EXECUTE') and not has_function_privilege('anon','public.begin_benchmark_diagnosis(uuid,text,jsonb)','EXECUTE')
union all select 'queue_checks_owner', pg_get_functiondef('public.begin_benchmark_diagnosis(uuid,text,jsonb)'::regprocedure) like '%is_owner(_owner_id)%'
union all select 'five_daily_limit', pg_get_functiondef('public.begin_benchmark_diagnosis(uuid,text,jsonb)'::regprocedure) like '%>= 5%'
union all select 'single_active_job', exists(select 1 from pg_indexes where schemaname='public' and indexname='benchmark_one_running' and indexdef like '%UNIQUE%' and indexdef like '%running%')
union all select 'cached_before_paid_job', pg_get_functiondef('public.begin_benchmark_diagnosis(uuid,text,jsonb)'::regprocedure) like '%cached%true%'
union all select 'persistent_pause_gate', pg_get_functiondef('public.begin_benchmark_diagnosis(uuid,text,jsonb)'::regprocedure) like '%control.paused%'
union all select 'feedback_owner_gate', pg_get_functiondef('public.confirm_benchmark_recovery(uuid,text,text)'::regprocedure) like '%is_owner(auth.uid())%'
union all select 'feedback_recommended_only', pg_get_functiondef('public.confirm_benchmark_recovery(uuid,text,text)'::regprocedure) like '%recoveryIds%_recovery%'
union all select 'audit_both_tables', (select count(*) from pg_trigger where tgrelid in ('public.benchmark_diagnostics'::regclass,'public.benchmark_ai_controls'::regclass) and tgfoid='public.audit_trigger()'::regprocedure and not tgisinternal)=2;