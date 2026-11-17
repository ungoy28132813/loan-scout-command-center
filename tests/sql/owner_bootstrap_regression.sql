-- Regression: owner bootstrap must only succeed for a confirmed, allowlisted email while no owner exists.
-- Run with a privileged read query; every row must have pass = true.
select 'arbitrary confirmed signup is not owner' as check, public.bootstrap_role_decision('attacker@example.com', true) = 'none' as pass
union all select 'test user domain is not owner', public.bootstrap_role_decision('agent-test+x@example.com', true) = 'none'
union all select 'allowlisted but unconfirmed is not owner', public.bootstrap_role_decision('support@advancerevival.com', false) = 'none'
union all select 'allowlisted + confirmed becomes owner (when none exists)', public.bootstrap_role_decision('SUPPORT@advancerevival.com', true) = (case when exists (select 1 from public.user_roles where role='owner') then 'none' else 'owner' end)
union all select 'authenticated cannot read allowlist', not has_table_privilege('authenticated', 'public.owner_bootstrap_allowlist', 'select')
union all select 'anon cannot read allowlist', not has_table_privilege('anon', 'public.owner_bootstrap_allowlist', 'select')
union all select 'authenticated cannot call decision fn', not has_function_privilege('authenticated', 'public.bootstrap_role_decision(text,boolean)', 'execute')
union all select 'authenticated cannot call grant fn', not has_function_privilege('authenticated', 'public.grant_roles_on_confirm(uuid,text)', 'execute')
union all select 'authenticated cannot insert roles', not has_table_privilege('authenticated', 'public.user_roles', 'insert')
union all select 'authenticated cannot update profile email', not has_column_privilege('authenticated', 'public.profiles', 'email', 'update')
union all select 'public signup off', (select not public_signup from public.app_settings where id = 1)
union all select 'single-owner index exists', exists (select 1 from pg_indexes where indexname = 'user_roles_single_owner');
