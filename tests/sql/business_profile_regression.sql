-- Transaction-isolated multi-business goal and RLS checks. Synthetic values only; everything rolls back.
begin;
create temporary table business_profile_results (check_name text primary key, pass boolean not null) on commit drop;
grant select, insert on pg_temp.business_profile_results to authenticated;
select set_config('request.jwt.claim.sub', id::text, true), set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from public.profiles where email = 'support@advancerevival.com';

insert into public.clients (id,user_id,display_name,stage,is_demo,created_by)
select '14000000-0000-4000-8000-000000000001',id,'SYNTHETIC BUSINESS CLIENT — ROLLBACK','intake',true,id from public.profiles where email='support@advancerevival.com';
insert into public.clients (id,display_name,stage,is_demo,created_by)
select '14000000-0000-4000-8000-000000000002','SYNTHETIC OTHER BUSINESS CLIENT — ROLLBACK','intake',true,id from public.profiles where email='support@advancerevival.com';
insert into public.business_profiles (id,client_id,name,annual_revenue) values
 ('24000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001','SYNTHETIC BUSINESS A',200000),
 ('24000000-0000-4000-8000-000000000002','14000000-0000-4000-8000-000000000001','SYNTHETIC BUSINESS B',null),
 ('24000000-0000-4000-8000-000000000003','14000000-0000-4000-8000-000000000002','SYNTHETIC OTHER BUSINESS',999000);
update public.business_profiles set verification_status='verified' where id='24000000-0000-4000-8000-000000000002';
insert into public.funding_goals (id,client_id,title,goal_type,business_profile_id) values
 ('34000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001','A first goal','business','24000000-0000-4000-8000-000000000001'),
 ('34000000-0000-4000-8000-000000000002','14000000-0000-4000-8000-000000000001','A second goal','business','24000000-0000-4000-8000-000000000001'),
 ('34000000-0000-4000-8000-000000000003','14000000-0000-4000-8000-000000000001','B unknown goal','business','24000000-0000-4000-8000-000000000002');

-- Use the existing identity as a client JWT subject; all role changes roll back.
delete from public.user_roles where user_id=(select id from public.profiles where email='support@advancerevival.com');
insert into public.user_roles (user_id,role) select id,'client' from public.profiles where email='support@advancerevival.com';
set local role authenticated;
insert into business_profile_results values
 ('owning client sees only own two businesses',(select count(*) from public.business_profiles where id in ('24000000-0000-4000-8000-000000000001','24000000-0000-4000-8000-000000000002','24000000-0000-4000-8000-000000000003'))=2),
 ('cross-client business is invisible',(select count(*) from public.business_profiles where id='24000000-0000-4000-8000-000000000003')=0),
 ('one business supports two independent goals',(select count(*) from public.funding_goals where business_profile_id='24000000-0000-4000-8000-000000000001')=2),
 ('unknown business revenue stays null',(select annual_revenue is null from public.business_profiles where id='24000000-0000-4000-8000-000000000002'));

do $$ begin
 insert into public.funding_goals (client_id,title,goal_type,business_profile_id) values ('14000000-0000-4000-8000-000000000001','cross-client goal','business','24000000-0000-4000-8000-000000000003');
 insert into business_profile_results values ('cross-client goal link rejected',false);
exception when others then insert into business_profile_results values ('cross-client goal link rejected',true); end $$;
do $$ begin
 insert into public.funding_goals (client_id,title,goal_type,business_profile_id) values ('14000000-0000-4000-8000-000000000001','unlinked business goal','business',null);
 insert into business_profile_results values ('business goal requires business',false);
exception when others then insert into business_profile_results values ('business goal requires business',true); end $$;
do $$ begin
 insert into public.funding_goals (client_id,title,goal_type,business_profile_id) values ('14000000-0000-4000-8000-000000000001','personal with business','personal','24000000-0000-4000-8000-000000000001');
 insert into business_profile_results values ('personal goal cannot link business',false);
exception when others then insert into business_profile_results values ('personal goal cannot link business',true); end $$;
do $$ begin
 insert into public.business_profiles (client_id,name,annual_revenue,verification_status) values ('14000000-0000-4000-8000-000000000001','self verified attempt',50000,'verified');
 insert into business_profile_results values ('client cannot self-verify new business',false);
exception when others then insert into business_profile_results values ('client cannot self-verify new business',true); end $$;
do $$ begin
 update public.business_profiles set verification_status='verified' where id='24000000-0000-4000-8000-000000000001';
 insert into business_profile_results values ('client cannot self-verify existing business',false);
exception when others then insert into business_profile_results values ('client cannot self-verify existing business',true); end $$;
update public.business_profiles set annual_revenue=0 where id='24000000-0000-4000-8000-000000000002';
insert into business_profile_results values ('explicit zero preserved and client edit resets verification',(select annual_revenue=0 and verification_status='self_reported' and verified_by is null from public.business_profiles where id='24000000-0000-4000-8000-000000000002'));

do $$ begin
 insert into public.business_questionnaire_answers (client_id,business_profile_id,question_key,value_numeric,status,verified) values ('14000000-0000-4000-8000-000000000001','24000000-0000-4000-8000-000000000003','business_cash_on_hand',5000,'answered',false);
 insert into business_profile_results values ('cross-client business answer rejected',false);
exception when others then insert into business_profile_results values ('cross-client business answer rejected',true); end $$;
do $$ begin
 insert into public.business_questionnaire_answers (client_id,business_profile_id,question_key,value_numeric,status,verified) values ('14000000-0000-4000-8000-000000000001','24000000-0000-4000-8000-000000000002','business_cash_on_hand',5000,'answered',true);
 insert into business_profile_results values ('client cannot verify business answer',false);
exception when others then insert into business_profile_results values ('client cannot verify business answer',true); end $$;
insert into public.business_questionnaire_answers (client_id,business_profile_id,question_key,value_numeric,status) values ('14000000-0000-4000-8000-000000000001','24000000-0000-4000-8000-000000000002','business_collateral_value',null,'skipped');
insert into business_profile_results values ('skipped business answer remains unknown and unverified',(select value_numeric is null and status='skipped' and not verified and answered_by=auth.uid() from public.business_questionnaire_answers where business_profile_id='24000000-0000-4000-8000-000000000002' and question_key='business_collateral_value'));

reset role;
select check_name,pass from business_profile_results order by check_name;
rollback;
