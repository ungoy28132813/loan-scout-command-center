-- Transaction-isolated Section 06 checks. Synthetic values only; rollback leaves no client, application, outcome, research, or rule changes.
begin;
create temporary table guided_application_results (check_name text primary key, pass boolean not null) on commit drop;
create temporary table guided_application_products (id uuid) on commit drop;
create temporary table guided_application_research (id uuid) on commit drop;
grant select, insert on pg_temp.guided_application_results to authenticated;
grant select, insert, delete on pg_temp.guided_application_products, pg_temp.guided_application_research to authenticated;
select set_config('request.jwt.claim.sub', id::text, true), set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from public.profiles where email = 'support@advancerevival.com';

insert into public.clients (id,user_id,display_name,stage,is_demo,created_by)
select '56000000-0000-4000-8000-000000000001',id,'SYNTHETIC APPLICATION CLIENT — ROLLBACK','intake',true,id from public.profiles where email='support@advancerevival.com';
insert into public.clients (id,display_name,stage,is_demo,created_by)
select '56000000-0000-4000-8000-000000000002','SYNTHETIC OTHER APPLICATION CLIENT — ROLLBACK','intake',true,id from public.profiles where email='support@advancerevival.com';
insert into public.funding_goals (id,client_id,title,goal_type) values
 ('66000000-0000-4000-8000-000000000001','56000000-0000-4000-8000-000000000001','SYNTHETIC APPLICATION GOAL','personal'),
 ('66000000-0000-4000-8000-000000000002','56000000-0000-4000-8000-000000000002','SYNTHETIC OTHER GOAL','personal');
insert into guided_application_products select id from public.lender_products where name='Wells Fargo Personal Loan';
insert into public.match_runs (id,client_id,goal_id,mode,engine_version,run_by)
select '86000000-0000-4000-8000-000000000001','56000000-0000-4000-8000-000000000001','66000000-0000-4000-8000-000000000001','strict','synthetic-section-06',id from public.profiles where email='support@advancerevival.com';
insert into public.match_results (id,run_id,client_id,product_id,status,conditions,review_status)
select '86000000-0000-4000-8000-000000000002','86000000-0000-4000-8000-000000000001','56000000-0000-4000-8000-000000000001',id,'needs_review','[]'::jsonb,'proposed' from guided_application_products;
insert into public.applications (id,client_id,product_id,goal_id,match_result_id,lender_label)
select '76000000-0000-4000-8000-000000000001','56000000-0000-4000-8000-000000000001',id,'66000000-0000-4000-8000-000000000001','86000000-0000-4000-8000-000000000002','SYNTHETIC APPLICATION' from guided_application_products;
insert into public.documents (id,client_id,category,storage_path,file_name,mime_type,size_bytes,uploaded_by)
select '96000000-0000-4000-8000-000000000001','56000000-0000-4000-8000-000000000002','other','56000000-0000-4000-8000-000000000002/synthetic-no-file','synthetic.txt','text/plain',1,id from public.profiles where email='support@advancerevival.com';
insert into public.employee_permissions (user_id,can_update_applications) select id,false from public.profiles where email='support@advancerevival.com' on conflict (user_id) do update set can_update_applications=false;
insert into public.user_roles (user_id,role) select id,'employee' from public.profiles where email='support@advancerevival.com' on conflict do nothing;
insert into public.client_assignments (client_id,employee_id,active) select '56000000-0000-4000-8000-000000000001',id,true from public.profiles where email='support@advancerevival.com';
set local role authenticated;

insert into guided_application_results values
 ('five statuses reject an invented sixth',true),
 ('seeded Wells application is not a home page',(select application_url like 'https://icomplete.wellsfargo.com/oas/%' and application_url_source_url='https://www.wellsfargo.com/personal-loans/checklist/' and application_url_verified_on=date '2026-11-17' from public.lender_products where id=(select id from guided_application_products))),
 ('Wells checklist and conditional documents are sourced',(select jsonb_array_length(application_checklist)=3 and jsonb_array_length(required_documents)=5 and application_guidance_source_url is not null and application_pull_risk like '%hard credit pull%' from public.lender_products where id=(select id from guided_application_products))),
 ('Prosper uses actual rate-check destination',(select application_url='https://www.prosper.com/pl-offers/get-rate/step-1' and jsonb_array_length(application_checklist)=3 from public.lender_products where name='Prosper Personal Loan')),
 ('no lender rules activated by guidance',(select count(*)=0 from public.lender_rules where approval_status='active'));

do $$ begin
 update public.applications set status='processing' where id='76000000-0000-4000-8000-000000000001';
 update guided_application_results set pass=false where check_name='five statuses reject an invented sixth';
exception when check_violation then null; end $$;

do $$ begin
 update public.applications set goal_id='66000000-0000-4000-8000-000000000002' where id='76000000-0000-4000-8000-000000000001';
 insert into guided_application_results values ('cross-client goal link rejected',false);
exception when others then insert into guided_application_results values ('cross-client goal link rejected',true); end $$;
do $$ begin
 insert into public.application_outcomes (application_id,client_id) values ('76000000-0000-4000-8000-000000000001','56000000-0000-4000-8000-000000000002');
 insert into guided_application_results values ('cross-client outcome rejected',false);
exception when others then insert into guided_application_results values ('cross-client outcome rejected',true); end $$;

insert into public.application_outcomes (application_id,client_id,outcome_source,verification_status,denial_reason)
values ('76000000-0000-4000-8000-000000000001','56000000-0000-4000-8000-000000000001','client_self_report','unverified','SYNTHETIC SELF REPORT — NOT VERIFIED');
insert into guided_application_results values
 ('self-report remains unverified',(select verification_status='unverified' and verified_by is null from public.application_outcomes where application_id='76000000-0000-4000-8000-000000000001')),
 ('optional Q70 amount APR and term may be null',(select approved_amount is null and approved_apr is null and approved_term_months is null from public.application_outcomes where application_id='76000000-0000-4000-8000-000000000001'));
do $$ begin
 update public.application_outcomes set verification_status='staff_verified' where application_id='76000000-0000-4000-8000-000000000001';
 insert into guided_application_results values ('self-report cannot become lender verified',false);
exception when others then insert into guided_application_results values ('self-report cannot become lender verified',true); end $$;
do $$ begin
 update public.application_outcomes set outcome_source='lender_document',verification_status='staff_verified' where application_id='76000000-0000-4000-8000-000000000001';
 insert into guided_application_results values ('verification requires evidence or source note',false);
exception when others then insert into guided_application_results values ('verification requires evidence or source note',true); end $$;
do $$ begin
 update public.application_outcomes set outcome_source='lender_document',verification_status='staff_verified',evidence_document_id='96000000-0000-4000-8000-000000000001',source_note='Synthetic lender evidence' where application_id='76000000-0000-4000-8000-000000000001';
 insert into guided_application_results values ('cross-client evidence document rejected',false);
exception when others then insert into guided_application_results values ('cross-client evidence document rejected',true); end $$;
update public.application_outcomes set outcome_source='lender_document',verification_status='staff_verified',source_note='Synthetic lender decision letter, page 1' where application_id='76000000-0000-4000-8000-000000000001';
insert into guided_application_results values ('lender evidence records verifier without mandatory Q70 fields',(select verification_status='staff_verified' and verified_by=auth.uid() and verified_at is not null and approved_amount is null and approved_apr is null from public.application_outcomes where application_id='76000000-0000-4000-8000-000000000001'));

update public.applications set status='approved' where id='76000000-0000-4000-8000-000000000001';
insert into guided_application_results values
 ('actual outcome does not rewrite original recommendation',(select status='needs_review' and review_status='proposed' from public.match_results where id='86000000-0000-4000-8000-000000000002')),
 ('status change creates no announcements',(select count(*)=0 from public.announcements where client_id='56000000-0000-4000-8000-000000000001')),
 ('status change creates no follow-up tasks',(select count(*)=0 from public.readiness_tasks where client_id='56000000-0000-4000-8000-000000000001')),
 ('application status audit is recorded',(select count(*)>0 from public.audit_logs where entity='applications' and entity_id='76000000-0000-4000-8000-000000000001' and metadata->>'status'='approved' and metadata->>'prev_status'='not_started')),
 ('outcome audit stores field names not outcome values',(select count(*)>0 from public.audit_logs where entity='application_outcomes' and client_id='56000000-0000-4000-8000-000000000001' and metadata::text not like '%SYNTHETIC SELF REPORT%'));

-- Client can read only the application row, not staff-only outcome evidence, and cannot edit either.
reset role;
delete from public.user_roles where user_id=(select id from public.profiles where email='support@advancerevival.com');
insert into public.user_roles (user_id,role) select id,'client' from public.profiles where email='support@advancerevival.com';
set local role authenticated;
insert into guided_application_results values
 ('client reads own status and date',(select count(*)=1 from public.applications where id='76000000-0000-4000-8000-000000000001' and status='approved' and status_date is not null)),
 ('client cannot read staff outcome evidence',(select count(*)=0 from public.application_outcomes where application_id='76000000-0000-4000-8000-000000000001'));
update public.applications set status='denied' where id='76000000-0000-4000-8000-000000000001';
insert into guided_application_results values ('client status update has no effect',(select status='approved' from public.applications where id='76000000-0000-4000-8000-000000000001'));
do $$ begin
 insert into public.applications (client_id,lender_label) values ('56000000-0000-4000-8000-000000000001','client attempt');
 insert into guided_application_results values ('client cannot create application',false);
exception when others then insert into guided_application_results values ('client cannot create application',true); end $$;

-- Assigned employee needs the existing application permission and active assignment.
reset role;
delete from public.user_roles where user_id=(select id from public.profiles where email='support@advancerevival.com');
insert into public.user_roles (user_id,role) select id,'employee' from public.profiles where email='support@advancerevival.com';
set local role authenticated;
update public.applications set status='pending' where id='76000000-0000-4000-8000-000000000001';
insert into guided_application_results values ('employee without application permission cannot edit',(select status='approved' from public.applications where id='76000000-0000-4000-8000-000000000001'));
update public.employee_permissions set can_update_applications=true where user_id=auth.uid();
insert into guided_application_results values ('employee cannot self-grant application permission',(select not public.has_perm(auth.uid(),'can_update_applications')));
reset role;
delete from public.user_roles where user_id=(select id from public.profiles where email='support@advancerevival.com');
insert into public.user_roles (user_id,role) select id,'owner' from public.profiles where email='support@advancerevival.com';
set local role authenticated;
update public.employee_permissions set can_update_applications=true where user_id=auth.uid();
reset role;
delete from public.user_roles where user_id=(select id from public.profiles where email='support@advancerevival.com');
insert into public.user_roles (user_id,role) select id,'employee' from public.profiles where email='support@advancerevival.com';
set local role authenticated;
update public.applications set status='pending' where id='76000000-0000-4000-8000-000000000001';
insert into guided_application_results values ('authorized assigned employee can edit',(select status='pending' from public.applications where id='76000000-0000-4000-8000-000000000001'));
reset role;
delete from public.user_roles where user_id=(select id from public.profiles where email='support@advancerevival.com');
insert into public.user_roles (user_id,role) select id,'owner' from public.profiles where email='support@advancerevival.com';
set local role authenticated;
update public.client_assignments set active=false where client_id='56000000-0000-4000-8000-000000000001' and employee_id=auth.uid();
reset role;
delete from public.user_roles where user_id=(select id from public.profiles where email='support@advancerevival.com');
insert into public.user_roles (user_id,role) select id,'employee' from public.profiles where email='support@advancerevival.com';
set local role authenticated;
update public.applications set status='denied' where id='76000000-0000-4000-8000-000000000001';
insert into guided_application_results values ('inactive assignment blocks application edit',(select status='pending' from public.applications where id='76000000-0000-4000-8000-000000000001'));

-- Owner-reviewed application guidance; secondary sources stay notes and URLs cannot be home pages or cross-host.
reset role;
delete from public.user_roles where user_id=(select id from public.profiles where email='support@advancerevival.com');
insert into public.user_roles (user_id,role) select id,'owner' from public.profiles where email='support@advancerevival.com';
set local role authenticated;
do $$ begin
 perform public.submit_product_research(jsonb_build_object('product_id',(select id from guided_application_products),'source_url','https://www.wellsfargo.com/personal-loans/checklist/','source_title','Synthetic home page attempt','source_tier','official_primary','channel_scope','Synthetic test','source_checked_on',current_date,'proposed_changes','{"application_url":"https://www.wellsfargo.com/"}'::jsonb));
 insert into guided_application_results values ('home page rejected as application destination',false);
exception when others then insert into guided_application_results values ('home page rejected as application destination',true); end $$;
do $$ begin
 perform public.submit_product_research(jsonb_build_object('product_id',(select id from guided_application_products),'source_url','https://www.wellsfargo.com/personal-loans/checklist/','source_title','Synthetic cross-host application','source_tier','official_primary','channel_scope','Synthetic test','source_checked_on',current_date,'proposed_changes','{"application_url":"https://example.org/apply"}'::jsonb));
 insert into guided_application_results values ('cross-host official application URL rejected',false);
exception when others then insert into guided_application_results values ('cross-host official application URL rejected',true); end $$;
do $$ begin
 perform public.submit_product_research(jsonb_build_object('product_id',(select id from guided_application_products),'source_url','https://www.wellsfargo.com/personal-loans/checklist/','source_title','Synthetic combined URL attempt','source_tier','official_primary','channel_scope','Synthetic test','source_checked_on',current_date,'proposed_changes',jsonb_build_object('official_url','https://www.wellsfargo.com/personal-loans/','application_url','https://example.org/apply')));
 insert into guided_application_results values ('combined product and application URLs require separate host review',false);
exception when others then insert into guided_application_results values ('combined product and application URLs require separate host review',true); end $$;
insert into guided_application_research select public.submit_product_research(jsonb_build_object('product_id',(select id from guided_application_products),'source_url','https://www.wellsfargo.com/personal-loans/checklist/','source_title','Synthetic official guidance — rollback','source_tier','official_primary','channel_scope','Synthetic test','source_checked_on',current_date,'proposed_changes',jsonb_build_object('application_url','https://icomplete.wellsfargo.com/oas/status/personal-loans-rate-checker/getting-started/?synthetic=rollback','application_checklist',jsonb_build_array('Synthetic sourced checklist item'))));
select public.review_product_research((select id from guided_application_research),'approve');
insert into guided_application_results values ('owner approval applies sourced application guidance',(select application_url like '%synthetic=rollback' and application_url_source_url='https://www.wellsfargo.com/personal-loans/checklist/' and application_checklist=jsonb_build_array('Synthetic sourced checklist item') from public.lender_products where id=(select id from guided_application_products)));
delete from guided_application_research;
insert into guided_application_research select public.submit_product_research(jsonb_build_object('product_id',(select id from guided_application_products),'source_url','https://example.org/secondary','source_title','Synthetic secondary guidance — rollback','source_tier','secondary_source','channel_scope','Synthetic test','source_checked_on',current_date,'proposed_changes',jsonb_build_object('application_url','https://example.org/apply','required_documents',jsonb_build_array('Invented secondary requirement'))));
select public.review_product_research((select id from guided_application_research),'approve');
insert into guided_application_results values
 ('secondary application guidance remains note only',(select review_status='approved_note' from public.product_research_sources where id=(select id from guided_application_research))),
 ('secondary guidance cannot replace verified fields',(select application_url like '%synthetic=rollback' and required_documents<>jsonb_build_array('Invented secondary requirement') from public.lender_products where id=(select id from guided_application_products))),
 ('research approval still activates no rules',(select count(*)=0 from public.lender_rules where approval_status='active'));

reset role;
select check_name,pass from guided_application_results order by check_name;
rollback;
