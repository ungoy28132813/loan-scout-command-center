-- Transaction-isolated funding planner security and approval checks. Synthetic values only; everything rolls back.
begin;
create temporary table funding_strategy_results (check_name text primary key, pass boolean not null) on commit drop;
grant select, insert on pg_temp.funding_strategy_results to authenticated;
select set_config('request.jwt.claim.sub', id::text, true), set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from public.profiles where email = 'support@advancerevival.com';

insert into public.clients (id,user_id,display_name,stage,is_demo,created_by)
select '55000000-0000-4000-8000-000000000001',id,'SYNTHETIC STRATEGY CLIENT — ROLLBACK','intake',true,id from public.profiles where email='support@advancerevival.com';
insert into public.clients (id,display_name,stage,is_demo,created_by)
select '55000000-0000-4000-8000-000000000002','SYNTHETIC OTHER STRATEGY CLIENT — ROLLBACK','intake',true,id from public.profiles where email='support@advancerevival.com';
insert into public.funding_goals (id,client_id,title,goal_type) values
 ('65000000-0000-4000-8000-000000000001','55000000-0000-4000-8000-000000000001','SYNTHETIC STRATEGY GOAL','personal'),
 ('65000000-0000-4000-8000-000000000002','55000000-0000-4000-8000-000000000002','SYNTHETIC OTHER GOAL','personal');
insert into public.employee_permissions (user_id) select id from public.profiles where email='support@advancerevival.com' on conflict do nothing;
update public.employee_permissions set can_approve_publish=false where user_id=(select id from public.profiles where email='support@advancerevival.com');
insert into public.user_roles (user_id,role) select id,'employee' from public.profiles where email='support@advancerevival.com' on conflict do nothing;
insert into public.client_assignments (client_id,employee_id,active) select '55000000-0000-4000-8000-000000000001',id,true from public.profiles where email='support@advancerevival.com';

insert into public.funding_strategy_scenarios (id,client_id,goal_id,name,items) values (
 '75000000-0000-4000-8000-000000000001','55000000-0000-4000-8000-000000000001','65000000-0000-4000-8000-000000000001','SYNTHETIC SCENARIO',
 '[{"position":1,"review_status":"proposed","snapshot":{"product":"Synthetic only"}}]'::jsonb
);

do $$ begin
 insert into public.funding_strategy_scenarios (client_id,goal_id,name,items) values ('55000000-0000-4000-8000-000000000001','65000000-0000-4000-8000-000000000002','cross-client scenario','[]'::jsonb);
 insert into funding_strategy_results values ('cross-client scenario goal rejected',false);
exception when others then insert into funding_strategy_results values ('cross-client scenario goal rejected',true); end $$;
do $$ begin
 perform public.create_strategy_snapshot_draft('75000000-0000-4000-8000-000000000001');
 insert into funding_strategy_results values ('unapproved scenario cannot create snapshot',false);
exception when others then insert into funding_strategy_results values ('unapproved scenario cannot create snapshot',true); end $$;
do $$ begin
 update public.funding_strategy_scenarios set status='approved' where id='75000000-0000-4000-8000-000000000001';
 insert into funding_strategy_results values ('proposed items cannot receive scenario approval',false);
exception when others then insert into funding_strategy_results values ('proposed items cannot receive scenario approval',true); end $$;

-- Client boundary.
delete from public.user_roles where user_id=(select id from public.profiles where email='support@advancerevival.com');
insert into public.user_roles (user_id,role) select id,'client' from public.profiles where email='support@advancerevival.com';
set local role authenticated;
insert into funding_strategy_results values
 ('client cannot read internal scenario',(select count(*) from public.funding_strategy_scenarios where id='75000000-0000-4000-8000-000000000001')=0),
 ('client cannot read other internal scenarios',(select count(*) from public.funding_strategy_scenarios)=0);
do $$ begin
 insert into public.funding_strategy_scenarios (client_id,goal_id,name,items) values ('55000000-0000-4000-8000-000000000001','65000000-0000-4000-8000-000000000001','client scenario','[]'::jsonb);
 insert into funding_strategy_results values ('client cannot create scenario',false);
exception when others then insert into funding_strategy_results values ('client cannot create scenario',true); end $$;

-- Assigned employee without approval permission can read but cannot approve or create a snapshot.
reset role;
delete from public.user_roles where user_id=(select id from public.profiles where email='support@advancerevival.com');
insert into public.user_roles (user_id,role) select id,'employee' from public.profiles where email='support@advancerevival.com';
set local role authenticated;
insert into funding_strategy_results values ('assigned employee can read internal scenario',(select count(*) from public.funding_strategy_scenarios where id='75000000-0000-4000-8000-000000000001')=1);
do $$ begin
 update public.funding_strategy_scenarios set items='[{"position":1,"review_status":"approved","snapshot":{"product":"Synthetic only"}}]'::jsonb,status='approved' where id='75000000-0000-4000-8000-000000000001';
 insert into funding_strategy_results values ('employee without approval permission cannot approve',false);
exception when others then insert into funding_strategy_results values ('employee without approval permission cannot approve',true); end $$;
do $$ begin
 perform public.create_strategy_snapshot_draft('75000000-0000-4000-8000-000000000001');
 insert into funding_strategy_results values ('employee without approval permission cannot create snapshot',false);
exception when others then insert into funding_strategy_results values ('employee without approval permission cannot create snapshot',true); end $$;

-- Owner approves complete items, creates an idempotent draft, and cannot mutate approved content.
reset role;
delete from public.user_roles where user_id=(select id from public.profiles where email='support@advancerevival.com');
insert into public.user_roles (user_id,role) select id,'owner' from public.profiles where email='support@advancerevival.com';
set local role authenticated;
update public.funding_strategy_scenarios set items='[{"position":1,"review_status":"approved","snapshot":{"product":"Synthetic only"}}]'::jsonb,status='approved' where id='75000000-0000-4000-8000-000000000001';
insert into funding_strategy_results values ('owner approval records approver',(select status='approved' and approved_by=auth.uid() and approved_at is not null from public.funding_strategy_scenarios where id='75000000-0000-4000-8000-000000000001'));
do $$ begin
 update public.funding_strategy_scenarios set assumptions='changed after approval' where id='75000000-0000-4000-8000-000000000001';
 insert into funding_strategy_results values ('approved scenario content immutable',false);
exception when others then insert into funding_strategy_results values ('approved scenario content immutable',true); end $$;
do $$ begin
 update public.funding_strategy_scenarios set status='draft' where id='75000000-0000-4000-8000-000000000001';
 insert into funding_strategy_results values ('approved scenario cannot reopen',false);
exception when others then insert into funding_strategy_results values ('approved scenario cannot reopen',true); end $$;

create temporary table strategy_snapshot_ids (id uuid) on commit drop;
grant select, insert on pg_temp.strategy_snapshot_ids to authenticated;
insert into strategy_snapshot_ids select public.create_strategy_snapshot_draft('75000000-0000-4000-8000-000000000001');
insert into strategy_snapshot_ids select public.create_strategy_snapshot_draft('75000000-0000-4000-8000-000000000001');
insert into funding_strategy_results values
 ('approved scenario creates draft only',(select count(*)=1 and bool_and(status='draft') from public.published_snapshots where source_scenario_id='75000000-0000-4000-8000-000000000001')),
 ('draft creation is idempotent',(select count(distinct id)=1 from strategy_snapshot_ids)),
 ('no automatic publication',(select count(*)=0 from public.published_snapshots where source_scenario_id='75000000-0000-4000-8000-000000000001' and status='published'));
update public.funding_strategy_scenarios set status='archived' where id='75000000-0000-4000-8000-000000000001';
insert into funding_strategy_results values ('archive preserves approval provenance',(select status='archived' and approved_by=auth.uid() and approved_at is not null from public.funding_strategy_scenarios where id='75000000-0000-4000-8000-000000000001'));

-- Client cannot see the linked draft even after scenario approval.
reset role;
delete from public.user_roles where user_id=(select id from public.profiles where email='support@advancerevival.com');
insert into public.user_roles (user_id,role) select id,'client' from public.profiles where email='support@advancerevival.com';
set local role authenticated;
insert into funding_strategy_results values ('client cannot see scenario-created draft',(select count(*) from public.published_snapshots where source_scenario_id='75000000-0000-4000-8000-000000000001')=0);

reset role;
select check_name,pass from funding_strategy_results order by check_name;
rollback;
