-- Transaction-isolated goal-answer provenance and cross-client checks. Synthetic values only; everything rolls back.
begin;
create temporary table goal_rule_results (check_name text primary key, pass boolean not null) on commit drop;
grant select, insert on pg_temp.goal_rule_results to authenticated;
select set_config('request.jwt.claim.sub', id::text, true), set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from public.profiles where email = 'support@advancerevival.com';

insert into public.clients (id,user_id,display_name,stage,is_demo,created_by)
select '54000000-0000-4000-8000-000000000001',id,'SYNTHETIC GOAL CLIENT — ROLLBACK','intake',true,id from public.profiles where email='support@advancerevival.com';
insert into public.clients (id,display_name,stage,is_demo,created_by)
select '54000000-0000-4000-8000-000000000002','SYNTHETIC OTHER GOAL CLIENT — ROLLBACK','intake',true,id from public.profiles where email='support@advancerevival.com';
insert into public.funding_goals (id,client_id,title,goal_type) values
 ('64000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000001','SYNTHETIC OWN GOAL','personal'),
 ('64000000-0000-4000-8000-000000000002','54000000-0000-4000-8000-000000000001','SYNTHETIC SECOND GOAL','personal'),
 ('64000000-0000-4000-8000-000000000003','54000000-0000-4000-8000-000000000002','SYNTHETIC OTHER GOAL','personal');

insert into public.goal_questionnaire_answers (client_id,goal_id,question_key,value_numeric,status,verified,financial_source)
values ('54000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000001','annual_income',100000,'answered',true,'staff_entered');

-- Use the existing identity as a client JWT subject; all role changes roll back.
delete from public.user_roles where user_id=(select id from public.profiles where email='support@advancerevival.com');
insert into public.user_roles (user_id,role) select id,'client' from public.profiles where email='support@advancerevival.com';
set local role authenticated;

insert into goal_rule_results values
 ('own goal answer is visible',(select count(*) from public.goal_questionnaire_answers where goal_id='64000000-0000-4000-8000-000000000001')=1),
 ('cross-client goal answer is invisible',(select count(*) from public.goal_questionnaire_answers where goal_id='64000000-0000-4000-8000-000000000003')=0);

update public.goal_questionnaire_answers set value_numeric=90000,verified=false,financial_source='self_reported' where goal_id='64000000-0000-4000-8000-000000000001' and question_key='annual_income';
insert into goal_rule_results values ('client edit resets staff verification',(select value_numeric=90000 and not verified and financial_source='self_reported' from public.goal_questionnaire_answers where goal_id='64000000-0000-4000-8000-000000000001' and question_key='annual_income'));

do $$ begin
 update public.goal_questionnaire_answers set verified=true where goal_id='64000000-0000-4000-8000-000000000001' and question_key='annual_income';
 insert into goal_rule_results values ('client cannot self-verify existing goal answer',false);
exception when others then insert into goal_rule_results values ('client cannot self-verify existing goal answer',true); end $$;
do $$ begin
 insert into public.goal_questionnaire_answers (client_id,goal_id,question_key,value_numeric,status,verified) values ('54000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000001','membership_months',12,'answered',true);
 insert into goal_rule_results values ('client cannot self-verify new goal answer',false);
exception when others then insert into goal_rule_results values ('client cannot self-verify new goal answer',true); end $$;
do $$ begin
 insert into public.goal_questionnaire_answers (client_id,goal_id,question_key,value_numeric,status) values ('54000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000003','annual_income',50000,'answered');
 insert into goal_rule_results values ('cross-client goal answer insert rejected',false);
exception when others then insert into goal_rule_results values ('cross-client goal answer insert rejected',true); end $$;

insert into public.goal_questionnaire_answers (client_id,goal_id,question_key,status) values ('54000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000001','monthly_gross_income','skipped');
insert into public.goal_questionnaire_answers (client_id,goal_id,question_key,value_numeric,status) values ('54000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000001','monthly_debt_payments',0,'answered');
insert into public.goal_questionnaire_answers (client_id,goal_id,question_key,value_text,status) values ('54000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000001','direct_deposit','yes','answered');
insert into goal_rule_results values
 ('skip remains null unknown and unverified',(select value_numeric is null and value_text is null and status='skipped' and not verified from public.goal_questionnaire_answers where goal_id='64000000-0000-4000-8000-000000000001' and question_key='monthly_gross_income')),
 ('explicit zero is preserved',(select value_numeric=0 from public.goal_questionnaire_answers where goal_id='64000000-0000-4000-8000-000000000001' and question_key='monthly_debt_payments')),
 ('answer author is audited',(select answered_by=auth.uid() from public.goal_questionnaire_answers where goal_id='64000000-0000-4000-8000-000000000001' and question_key='direct_deposit'));

do $$ begin
 update public.goal_questionnaire_answers set goal_id='64000000-0000-4000-8000-000000000002' where goal_id='64000000-0000-4000-8000-000000000001' and question_key='direct_deposit';
 insert into goal_rule_results values ('goal answer cannot move between goals',false);
exception when others then insert into goal_rule_results values ('goal answer cannot move between goals',true); end $$;
do $$ begin
 insert into public.goal_questionnaire_answers (client_id,goal_id,question_key,value_text,status) values ('54000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000001','application_mode','unsupported','answered');
 insert into goal_rule_results values ('unsupported application mode rejected',false);
exception when others then insert into goal_rule_results values ('unsupported application mode rejected',true); end $$;

reset role;
select 'owner review still requires owner' check_name, pg_get_functiondef('public.review_source_candidate'::regproc) like '%is_owner(auth.uid())%' pass;
select 'review carries verification metadata' check_name, pg_get_functiondef('public.review_source_candidate'::regproc) like '%requires_verified_facts%' pass;
select check_name,pass from goal_rule_results order by check_name;
rollback;
