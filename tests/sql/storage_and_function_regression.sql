-- Read-only security regression checks. Every row must have pass = true.
select 'client document bucket is private' as check, not public as pass from storage.buckets where id = 'client-documents'
union all select 'storage read checks client access', exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='client-docs read' and qual like '%can_access_client%')
union all select 'storage read requires a document record', exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='client-docs read' and qual like '%d.storage_path = objects.name%')
union all select 'client storage upload requires consent', exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='client-docs upload' and with_check like '%has_client_consent%')
union all select 'staff storage upload requires permission', exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='client-docs upload' and with_check like '%can_upload_docs%')
union all select 'only owner storage delete policy', exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='client-docs owner delete' and qual like '%is_owner%')
union all select 'no anonymous client document policy', not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'client-docs%' and roles::text like '%anon%')
union all select 'client snapshot policy requires published', exists (select 1 from pg_policies where schemaname='public' and tablename='published_snapshots' and policyname='staff snapshots' and qual like '%is_client_self%status = ''published''%')
union all select 'clients have no report field read policy', not exists (select 1 from pg_policies where schemaname='public' and tablename='report_fields' and cmd='SELECT' and qual like '%is_client_self%')
union all select 'clients have no match result read policy', not exists (select 1 from pg_policies where schemaname='public' and tablename='match_results' and cmd='SELECT' and qual like '%is_client_self%')
union all select 'source candidates cannot be inserted by users', not has_table_privilege('authenticated','public.source_review_candidates','insert')
union all select 'source candidates cannot be updated by users', not has_table_privilege('authenticated','public.source_review_candidates','update')
union all select 'source candidates cannot be deleted by users', not has_table_privilege('authenticated','public.source_review_candidates','delete')
union all select 'source review function checks owner', pg_get_functiondef('public.review_source_candidate(uuid,text)'::regprocedure) like '%if not public.is_owner(auth.uid()) then raise exception%'
union all select 'role helper checks active profile', pg_get_functiondef('public.has_role(uuid,public.app_role)'::regprocedure) like '%p.active%'
union all select 'audit trigger not callable by anon', not has_function_privilege('anon','public.audit_trigger()','execute')
union all select 'audit trigger not callable by authenticated', not has_function_privilege('authenticated','public.audit_trigger()','execute')
union all select 'signup trigger not callable by anon', not has_function_privilege('anon','public.handle_new_user()','execute')
union all select 'signup trigger not callable by authenticated', not has_function_privilege('authenticated','public.handle_new_user()','execute')
union all select 'confirmation trigger not callable by anon', not has_function_privilege('anon','public.handle_user_confirmed()','execute')
union all select 'confirmation trigger not callable by authenticated', not has_function_privilege('authenticated','public.handle_user_confirmed()','execute')
union all select 'publication guard not callable by authenticated', not has_function_privilege('authenticated','public.guard_publication()','execute')
union all select 'report guard not callable by authenticated', not has_function_privilege('authenticated','public.guard_credit_report()','execute')
union all select 'profile guard not callable by authenticated', not has_function_privilege('authenticated','public.guard_profile_self_update()','execute');
