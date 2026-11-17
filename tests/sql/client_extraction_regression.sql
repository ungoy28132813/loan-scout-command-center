-- Transaction-isolated client extraction security checks. Synthetic values only; everything rolls back.
begin;
create temporary table client_extraction_results (check_name text primary key, pass boolean not null) on commit drop;
create temporary table client_extraction_ids (id uuid not null) on commit drop;
grant select, insert on pg_temp.client_extraction_results to authenticated;
grant select, insert on pg_temp.client_extraction_ids to authenticated;

select set_config('request.jwt.claim.sub', id::text, true), set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from public.profiles where email = 'support@advancerevival.com';

insert into public.clients (id, user_id, display_name, stage, is_demo, created_by)
select '11000000-0000-4000-8000-000000000001', id, 'SYNTHETIC CLIENT EXTRACTION — ROLLBACK', 'intake', true, id from public.profiles where email = 'support@advancerevival.com';
insert into public.clients (id, display_name, stage, is_demo, created_by)
select '11000000-0000-4000-8000-000000000002', 'SYNTHETIC OTHER CLIENT — ROLLBACK', 'intake', true, id from public.profiles where email = 'support@advancerevival.com';
insert into public.documents (id, client_id, category, storage_path, file_name, mime_type, size_bytes, uploaded_by)
select '21000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 'credit_reports', '11000000-0000-4000-8000-000000000001/synthetic.pdf', 'synthetic.pdf', 'application/pdf', 100, id from public.profiles where email = 'support@advancerevival.com';
insert into public.documents (id, client_id, category, storage_path, file_name, mime_type, size_bytes, uploaded_by)
select '21000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000002', 'credit_reports', '11000000-0000-4000-8000-000000000002/synthetic.pdf', 'synthetic.pdf', 'application/pdf', 100, id from public.profiles where email = 'support@advancerevival.com';
insert into public.credit_reports (id, client_id, document_id) values
 ('31000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001'),
 ('31000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000002');

delete from public.user_roles where user_id = (select id from public.profiles where email = 'support@advancerevival.com');
insert into public.user_roles (user_id, role) select id, 'client' from public.profiles where email = 'support@advancerevival.com';
set local role authenticated;

-- A valid structured synthetic payload; deliberately contains no raw text or full account number.
create temporary table client_extraction_payloads (name text primary key, payload jsonb not null) on commit drop;
insert into client_extraction_payloads values ('valid', '{
 "parserVersion":"ls-parse-1.0.0","provider":"unknown","reportType":"tri_merge","reportDate":"2026-11-01","pageCount":2,"hasTextLayer":true,"bureausDetected":["transunion","experian"],"status":"partial",
 "scores":[{"bureau":"transunion","model":"FICO 8","value":690,"scoreDate":"2026-11-01","sourcePage":1,"confidence":"high","needsReview":false},{"bureau":"experian","model":null,"value":701,"scoreDate":null,"sourcePage":1,"confidence":"low","needsReview":true}],
 "fields":[{"bureau":"transunion","key":"utilization_pct","value":25.5,"sourcePage":1,"confidence":"high","needsReview":false}],
 "tradelines":[{"bureau":"transunion","creditor":"DEMO BANK","last4":"1234","accountType":"revolving","balance":100,"creditLimit":1000,"isOpen":true,"isCollection":false,"sourcePage":2,"needsReview":false}]
}');

do $$
begin
  perform public.submit_client_extraction('31000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001',(select payload from client_extraction_payloads where name='valid'));
  insert into client_extraction_results values ('client without consent is rejected', false);
exception when others then insert into client_extraction_results values ('client without consent is rejected', true);
end $$;

insert into public.consents (user_id, client_id, kind, version)
select id, '11000000-0000-4000-8000-000000000001', kind, 'regression' from public.profiles, lateral (values ('privacy_notice'),('report_analysis_authorization')) kinds(kind) where email='support@advancerevival.com';

do $$
begin
  perform public.submit_client_extraction('31000000-0000-4000-8000-000000000002','31000000-0000-4000-8000-000000000002',(select payload from client_extraction_payloads where name='valid'));
  insert into client_extraction_results values ('client cannot submit for another client', false);
exception when others then insert into client_extraction_results values ('client cannot submit for another client', true);
end $$;

do $$
begin
  perform public.submit_client_extraction('99999999-9999-4999-8999-999999999999','31000000-0000-4000-8000-000000000001',(select payload from client_extraction_payloads where name='valid'));
  insert into client_extraction_results values ('forged report id is rejected', false);
exception when others then insert into client_extraction_results values ('forged report id is rejected', true);
end $$;

do $$
begin
  insert into public.client_extraction_submissions (client_id,report_id,document_id,submitted_by,idempotency_key,parser_version,payload)
  values ('11000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000002',auth.uid(),'31000000-0000-4000-8000-000000000001','forged','{}');
  insert into client_extraction_results values ('client cannot directly insert forged document id', false);
exception when others then insert into client_extraction_results values ('client cannot directly insert forged document id', true);
end $$;

do $$
begin
  perform public.submit_client_extraction('31000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001',(select payload from client_extraction_payloads where name='valid') || '{"rawText":"private report text"}');
  insert into client_extraction_results values ('raw report text key is rejected', false);
exception when others then insert into client_extraction_results values ('raw report text key is rejected', true);
end $$;

do $$
begin
  perform public.submit_client_extraction('31000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001',jsonb_set((select payload from client_extraction_payloads where name='valid'),'{tradelines,0,creditor}','"DEMO 123456789012"'));
  insert into client_extraction_results values ('full account number in creditor is rejected', false);
exception when others then insert into client_extraction_results values ('full account number in creditor is rejected', true);
end $$;

do $$
begin
  perform public.submit_client_extraction('31000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001',jsonb_set((select payload from client_extraction_payloads where name='valid'),'{scores,0,model}','"FICO 8 guessed"'));
  insert into client_extraction_results values ('unknown mismatched model label is rejected', false);
exception when others then insert into client_extraction_results values ('unknown mismatched model label is rejected', true);
end $$;

do $$
begin
  perform public.submit_client_extraction('31000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001',jsonb_set((select payload from client_extraction_payloads where name='valid'),'{scores,0,bureau}','null'));
  insert into client_extraction_results values ('null score bureau is rejected', false);
exception when others then insert into client_extraction_results values ('null score bureau is rejected', true);
end $$;

insert into client_extraction_ids select public.submit_client_extraction('31000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001',(select payload from client_extraction_payloads where name='valid'));
insert into client_extraction_results values
 ('valid own consented submission is pending', (select review_status='pending_review' from public.client_extraction_submissions where id=(select id from client_extraction_ids))),
 ('client submission has no evidence or raw text keys', not ((select payload::text from public.client_extraction_submissions where id=(select id from client_extraction_ids)) like '%evidence%' or (select payload::text from public.client_extraction_submissions where id=(select id from client_extraction_ids)) like '%rawText%')),
 ('client cannot read trusted staff report fields', (select count(*) from public.report_fields where report_id='31000000-0000-4000-8000-000000000001')=0);

insert into client_extraction_results values ('same idempotency key returns same submission', public.submit_client_extraction('31000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001',(select payload from client_extraction_payloads where name='valid'))=(select id from client_extraction_ids));

do $$
begin
  update public.client_extraction_submissions set review_status='accepted' where id=(select id from client_extraction_ids);
  insert into client_extraction_results values ('client cannot mark submission accepted', (select review_status='pending_review' from public.client_extraction_submissions where id=(select id from client_extraction_ids)));
exception when others then insert into client_extraction_results values ('client cannot mark submission accepted', true);
end $$;
reset role;

-- Staff import once; every imported value remains unverified and no recommendation is published.
delete from public.user_roles where user_id=(select id from public.profiles where email='support@advancerevival.com');
insert into public.user_roles (user_id,role) select id,'owner' from public.profiles where email='support@advancerevival.com';
set local role authenticated;
select public.import_client_extraction((select id from client_extraction_ids));
select public.import_client_extraction((select id from client_extraction_ids));
insert into client_extraction_results values
 ('staff import is idempotent', (select count(*) from public.report_fields where report_id='31000000-0000-4000-8000-000000000001')=3 and (select count(*) from public.tradelines where report_id='31000000-0000-4000-8000-000000000001')=1),
 ('all imported fields remain needs review', (select bool_and(needs_review) from public.report_fields where report_id='31000000-0000-4000-8000-000000000001')),
 ('unknown model remains null', (select score_model is null and needs_review from public.report_fields where report_id='31000000-0000-4000-8000-000000000001' and bureau='experian')),
 ('import does not publish a client strategy', not exists (select 1 from public.published_snapshots where client_id='11000000-0000-4000-8000-000000000001'));
reset role;

-- The client still cannot read promoted staff facts or change review state.
delete from public.user_roles where user_id=(select id from public.profiles where email='support@advancerevival.com');
insert into public.user_roles (user_id,role) select id,'client' from public.profiles where email='support@advancerevival.com';
set local role authenticated;
insert into client_extraction_results values
 ('client cannot read imported staff fields', (select count(*) from public.report_fields where report_id='31000000-0000-4000-8000-000000000001')=0),
 ('client cannot read imported staff tradelines', (select count(*) from public.tradelines where report_id='31000000-0000-4000-8000-000000000001')=0),
 ('client can read only own submission', (select count(*) from public.client_extraction_submissions where id=(select id from client_extraction_ids))=1);
reset role;

-- Explicit whole-read staff acceptance makes facts usable; no automatic publication occurs.
delete from public.user_roles where user_id=(select id from public.profiles where email='support@advancerevival.com');
insert into public.user_roles (user_id,role) select id,'owner' from public.profiles where email='support@advancerevival.com';
set local role authenticated;
select public.accept_client_extraction((select id from client_extraction_ids));
insert into client_extraction_results values
 ('staff whole-read acceptance clears review flags', (select bool_and(not needs_review and status='verified') from public.report_fields where report_id='31000000-0000-4000-8000-000000000001')),
 ('acceptance still does not publish a strategy', not exists (select 1 from public.published_snapshots where client_id='11000000-0000-4000-8000-000000000001')),
 ('audit metadata contains no creditor or report text', not exists (select 1 from public.audit_logs where entity_id in ((select id::text from client_extraction_ids),'31000000-0000-4000-8000-000000000001') and (metadata::text like '%DEMO BANK%' or metadata::text like '%private report text%')));
reset role;

select check_name, pass from client_extraction_results order by check_name;
rollback;
