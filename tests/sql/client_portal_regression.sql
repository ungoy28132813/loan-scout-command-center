-- Section 07 rollback-only checks (synthetic; owner profile acts as client login with staff roles removed inside the transaction).
begin;
create temporary table r (check_name text primary key, pass boolean not null) on commit drop;
grant select, insert, update on pg_temp.r to authenticated;
select set_config('request.jwt.claim.sub', id::text, true), set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true) from public.profiles where email = 'support@advancerevival.com';
insert into public.clients (id,user_id,display_name,stage,is_demo,created_by) select '57000000-0000-4000-8000-000000000001',id,'SYNTHETIC PORTAL CLIENT A — ROLLBACK','intake',true,id from public.profiles where email='support@advancerevival.com';
insert into public.clients (id,display_name,stage,is_demo,created_by) select '57000000-0000-4000-8000-000000000002','SYNTHETIC PORTAL CLIENT B — ROLLBACK','intake',true,id from public.profiles where email='support@advancerevival.com';
insert into public.user_roles (user_id,role) select id,'employee' from public.profiles where email='support@advancerevival.com' on conflict do nothing;
insert into public.client_assignments (client_id,employee_id,active) select c,id,true from public.profiles, unnest(array['57000000-0000-4000-8000-000000000001','57000000-0000-4000-8000-000000000002']::uuid[]) c where email='support@advancerevival.com';
insert into public.documents (id,client_id,category,storage_path,file_name,mime_type,size_bytes,uploaded_by) select d,c,'other',c||'/synthetic-no-file','synthetic.txt','text/plain',1,id from public.profiles,
 (values ('97000000-0000-4000-8000-000000000001'::uuid,'57000000-0000-4000-8000-000000000001'::uuid),('97000000-0000-4000-8000-000000000002','57000000-0000-4000-8000-000000000002')) v(d,c) where email='support@advancerevival.com';
insert into public.readiness_tasks (id,client_id,title,published) values
 ('a7000000-0000-4000-8000-000000000001','57000000-0000-4000-8000-000000000001','SYNTH published',true),
 ('a7000000-0000-4000-8000-000000000002','57000000-0000-4000-8000-000000000001','SYNTH draft',false),
 ('a7000000-0000-4000-8000-000000000003','57000000-0000-4000-8000-000000000002','SYNTH other client',true);
insert into public.internal_notes (client_id,body,author) select '57000000-0000-4000-8000-000000000001','SYNTH-INTERNAL-NOTE',id from public.profiles where email='support@advancerevival.com';
insert into public.published_snapshots (id,client_id,version,scope,status,content,created_by,published_by,published_at) select s,c,1,'strategy',st,'{"items":[],"disclaimer":"SYNTH"}'::jsonb,id,id,now() from public.profiles,
 (values ('b7000000-0000-4000-8000-000000000001'::uuid,'57000000-0000-4000-8000-000000000001'::uuid,'published'),('b7000000-0000-4000-8000-000000000002','57000000-0000-4000-8000-000000000001','draft'),('b7000000-0000-4000-8000-000000000003','57000000-0000-4000-8000-000000000002','published')) v(s,c,st) where email='support@advancerevival.com';
do $$ begin
 insert into public.published_snapshots (client_id,version,scope,status,content,created_by) select '57000000-0000-4000-8000-000000000001',9,'strategy','scheduled','{}'::jsonb,id from public.profiles where email='support@advancerevival.com';
 insert into r values ('scheduled publication rejected',false);
exception when others then insert into r values ('scheduled publication rejected',true); end $$;
do $$ begin
 update public.published_snapshots set content='{"items":[],"disclaimer":"CHANGED"}' where id='b7000000-0000-4000-8000-000000000001';
 insert into r values ('published snapshot immutable',false);
exception when others then insert into r values ('published snapshot immutable',true); end $$;
delete from public.user_roles where user_id=(select id from public.profiles where email='support@advancerevival.com') and role in ('owner','employee');
set local role authenticated;
insert into r values
 ('client sees only published own tasks',(select count(*)=1 from public.readiness_tasks where client_id in ('57000000-0000-4000-8000-000000000001','57000000-0000-4000-8000-000000000002'))),
 ('client sees only own published snapshot',(select array_agg(id)=array['b7000000-0000-4000-8000-000000000001'::uuid] from public.published_snapshots where client_id in ('57000000-0000-4000-8000-000000000001','57000000-0000-4000-8000-000000000002'))),
 ('client cannot read internal notes',(select count(*)=0 from public.internal_notes where client_id='57000000-0000-4000-8000-000000000001')),
 ('client cannot see other client documents',(select count(*)=0 from public.documents where client_id='57000000-0000-4000-8000-000000000002'));
do $$ begin perform public.client_mark_task('a7000000-0000-4000-8000-000000000001','n','97000000-0000-4000-8000-000000000002'); insert into r values ('other-client evidence rejected',false);
exception when others then insert into r values ('other-client evidence rejected',true); end $$;
do $$ begin perform public.client_mark_task('a7000000-0000-4000-8000-000000000002','n',null); insert into r values ('unpublished task rejected',false);
exception when others then insert into r values ('unpublished task rejected',true); end $$;
do $$ begin perform public.client_mark_task('a7000000-0000-4000-8000-000000000003','n',null); insert into r values ('other client task rejected',false);
exception when others then insert into r values ('other client task rejected',true); end $$;
select public.client_mark_task('a7000000-0000-4000-8000-000000000001','synthetic note','97000000-0000-4000-8000-000000000001');
insert into r values ('own evidence accepted, awaiting verification',(select status='client_marked_done' and evidence_document_id='97000000-0000-4000-8000-000000000001' and verified_by is null from public.readiness_tasks where id='a7000000-0000-4000-8000-000000000001'));
do $$ begin update public.readiness_tasks set status='verified' where id='a7000000-0000-4000-8000-000000000001';
 if (select status from public.readiness_tasks where id='a7000000-0000-4000-8000-000000000001')='verified' then insert into r values ('client cannot self-verify',false); else insert into r values ('client cannot self-verify',true); end if;
exception when others then insert into r values ('client cannot self-verify',true); end $$;
insert into r values ('export of own published strategy excludes notes',(select (x->>'version')='1' and x::text not like '%SYNTH-INTERNAL-NOTE%' from (select public.prepare_strategy_export('b7000000-0000-4000-8000-000000000001') x) t));
do $$ begin perform public.prepare_strategy_export('b7000000-0000-4000-8000-000000000002'); insert into r values ('draft export rejected',false);
exception when others then insert into r values ('draft export rejected',true); end $$;
do $$ begin perform public.prepare_strategy_export('b7000000-0000-4000-8000-000000000003'); insert into r values ('other client export rejected',false);
exception when others then insert into r values ('other client export rejected',true); end $$;
reset role;
do $$ begin raise exception 'RESULTS %', (select string_agg(check_name||'='||pass, '; ' order by check_name) from r); end $$; -- aborts the transaction so everything rolls back
rollback;
