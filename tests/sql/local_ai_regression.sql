-- Read-only privilege regression. All rows must return pass=true.
SELECT 'anon cannot read local jobs' AS check, NOT has_table_privilege('anon','public.local_ai_jobs','select') AS pass
UNION ALL SELECT 'clients cannot insert jobs',NOT has_table_privilege('authenticated','public.local_ai_jobs','insert')
UNION ALL SELECT 'clients cannot update jobs',NOT has_table_privilege('authenticated','public.local_ai_jobs','update')
UNION ALL SELECT 'token hash not selectable',NOT has_column_privilege('authenticated','public.local_ai_workers','token_hash','select')
UNION ALL SELECT 'anon cannot exchange',NOT has_function_privilege('anon','public.local_ai_worker_exchange(text,text,uuid,uuid,jsonb,text)','execute')
UNION ALL SELECT 'authenticated cannot enqueue',NOT has_function_privilege('authenticated','public.enqueue_local_ai_job(uuid,uuid,jsonb)','execute')
UNION ALL SELECT 'anon cannot pair',NOT has_function_privilege('anon','public.pair_local_ai_worker(text,text)','execute')
UNION ALL SELECT 'RLS both tables',(SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN ('public.local_ai_workers'::regclass,'public.local_ai_jobs'::regclass))
UNION ALL SELECT 'advice cannot modify rules directly',NOT has_table_privilege('anon','public.lender_rules','update');