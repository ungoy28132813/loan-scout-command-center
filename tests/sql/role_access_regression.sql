-- Transaction-isolated role/RLS regression checks.
-- Uses the existing owner identity only as a JWT subject; no new auth account is created.
-- Every synthetic row and role change is rolled back. Run through a privileged SQL runner.
begin;

create temporary table role_access_results (check_name text primary key, pass boolean not null) on commit drop;
grant select, insert on pg_temp.role_access_results to authenticated;

select set_config('request.jwt.claim.sub', id::text, true),
       set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from public.profiles where email = 'support@advancerevival.com';

insert into public.clients (id, display_name, email, stage, is_demo, created_by)
select '10000000-0000-4000-8000-000000000001', 'SYNTHETIC ASSIGNED — ROLLBACK', null, 'intake', true, id from public.profiles where email = 'support@advancerevival.com';
insert into public.clients (id, display_name, email, stage, is_demo, created_by)
select '10000000-0000-4000-8000-000000000002', 'SYNTHETIC OTHER — ROLLBACK', null, 'intake', true, id from public.profiles where email = 'support@advancerevival.com';

insert into public.client_assignments (client_id, employee_id, active, assigned_by)
select '10000000-0000-4000-8000-000000000001', id, true, id from public.profiles where email = 'support@advancerevival.com';

insert into public.documents (id, client_id, category, storage_path, file_name, mime_type, size_bytes, uploaded_by)
select '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'credit_reports', '10000000-0000-4000-8000-000000000001/synthetic.pdf', 'synthetic.pdf', 'application/pdf', 100, id from public.profiles where email = 'support@advancerevival.com';
insert into public.documents (id, client_id, category, storage_path, file_name, mime_type, size_bytes, uploaded_by)
select '20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'credit_reports', '10000000-0000-4000-8000-000000000002/synthetic.pdf', 'synthetic.pdf', 'application/pdf', 100, id from public.profiles where email = 'support@advancerevival.com';

insert into public.credit_reports (id, client_id, document_id) values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002');

insert into public.report_fields (id, report_id, client_id, bureau, field_key, score_model, value, status) values
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'transunion', 'credit_score', 'FICO 8', 700, 'verified'),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'experian', 'credit_score', 'FICO 8', 710, 'verified');

insert into public.match_runs (id, client_id, mode, engine_version, run_by)
select '50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'strict', 'regression', id from public.profiles where email = 'support@advancerevival.com';
insert into public.match_runs (id, client_id, mode, engine_version, run_by)
select '50000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'strict', 'regression', id from public.profiles where email = 'support@advancerevival.com';

insert into public.match_results (id, run_id, client_id, product_id, status, conditions, private_note)
select '60000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', id, 'needs_review', '{}', 'synthetic private note' from public.lender_products order by created_at limit 1;
insert into public.match_results (id, run_id, client_id, product_id, status, conditions, private_note)
select '60000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', id, 'needs_review', '{}', 'synthetic private note' from public.lender_products order by created_at limit 1;

insert into public.published_snapshots (id, client_id, version, scope, status, content, created_by, published_by, published_at)
select '70000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 1, 'strategy', 'published', '{"items":[]}', id, id, now() from public.profiles where email = 'support@advancerevival.com';
insert into public.published_snapshots (id, client_id, version, scope, status, content, created_by)
select '70000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 2, 'strategy', 'draft', '{"items":[]}', id from public.profiles where email = 'support@advancerevival.com';

insert into public.internal_notes (client_id, body, author)
select '10000000-0000-4000-8000-000000000001', 'synthetic private note', id from public.profiles where email = 'support@advancerevival.com';
insert into public.internal_notes (client_id, body, author)
select '10000000-0000-4000-8000-000000000002', 'synthetic private note', id from public.profiles where email = 'support@advancerevival.com';

-- Assigned employee: sees only the assigned client and cannot review owner sources.
delete from public.user_roles where user_id = (select id from public.profiles where email = 'support@advancerevival.com');
insert into public.user_roles (user_id, role) select id, 'employee' from public.profiles where email = 'support@advancerevival.com';
insert into public.employee_permissions (user_id, can_upload_docs, can_edit_extractions, can_run_matching, can_approve_publish, can_update_applications, can_manage_readiness, can_post_announcements, can_export_pdf, can_propose_rules)
select id, true, true, true, true, true, true, true, true, true from public.profiles where email = 'support@advancerevival.com'
on conflict (user_id) do update set can_upload_docs = true, can_edit_extractions = true, can_run_matching = true, can_approve_publish = true, can_update_applications = true, can_manage_readiness = true, can_post_announcements = true, can_export_pdf = true, can_propose_rules = true;
set local role authenticated;
insert into role_access_results values
  ('assigned employee is not owner', not public.is_owner(auth.uid())),
  ('assigned employee can access assigned client', public.is_client_staff(auth.uid(), '10000000-0000-4000-8000-000000000001')),
  ('assigned employee cannot access unassigned client', not public.is_client_staff(auth.uid(), '10000000-0000-4000-8000-000000000002')),
  ('assigned employee client rows are isolated', (select count(*) from public.clients where id in ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002')) = 1),
  ('assigned employee report fields are isolated', (select count(*) from public.report_fields where id in ('40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002')) = 1),
  ('assigned employee match results are isolated', (select count(*) from public.match_results where id in ('60000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002')) = 1),
  ('assigned employee can read staff source queue', (select count(*) from public.source_review_candidates) = 13);

do $$
begin
  perform public.review_source_candidate((select id from public.source_review_candidates order by seed_key limit 1), 'reject');
  insert into role_access_results values ('employee cannot review owner source candidate', false);
exception when others then
  insert into role_access_results values ('employee cannot review owner source candidate', true);
end $$;
reset role;

-- Deactivated employee: role remains, but active=false must revoke all data visibility.
select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
update public.profiles set active = false where email = 'support@advancerevival.com';
select set_config('request.jwt.claim.sub', id::text, true), set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true) from public.profiles where email = 'support@advancerevival.com';
set local role authenticated;
insert into role_access_results values
  ('deactivated employee role check fails', not public.has_role(auth.uid(), 'employee')),
  ('deactivated employee staff check fails', not public.is_client_staff(auth.uid(), '10000000-0000-4000-8000-000000000001')),
  ('deactivated employee sees no synthetic clients', (select count(*) from public.clients where id in ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002')) = 0),
  ('deactivated employee sees no report fields', (select count(*) from public.report_fields where id in ('40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002')) = 0),
  ('deactivated employee sees no source queue', (select count(*) from public.source_review_candidates) = 0);
reset role;

-- Client owner: own documents and published snapshot only; no staff facts, notes, runs, or queue.
select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
update public.profiles set active = true where email = 'support@advancerevival.com';
update public.clients set user_id = (select id from public.profiles where email = 'support@advancerevival.com') where id = '10000000-0000-4000-8000-000000000001';
delete from public.user_roles where user_id = (select id from public.profiles where email = 'support@advancerevival.com');
insert into public.user_roles (user_id, role) select id, 'client' from public.profiles where email = 'support@advancerevival.com';
select set_config('request.jwt.claim.sub', id::text, true), set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true) from public.profiles where email = 'support@advancerevival.com';
set local role authenticated;
insert into role_access_results values
  ('client can access own client row', public.is_client_self(auth.uid(), '10000000-0000-4000-8000-000000000001')),
  ('client cannot access other client row', not public.can_access_client(auth.uid(), '10000000-0000-4000-8000-000000000002')),
  ('client sees only own synthetic document', (select count(*) from public.documents where id in ('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002')) = 1),
  ('client cannot read staff report fields', (select count(*) from public.report_fields where id in ('40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002')) = 0),
  ('client cannot read match runs', (select count(*) from public.match_runs where id in ('50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002')) = 0),
  ('client cannot read match results or private notes', (select count(*) from public.match_results where id in ('60000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002')) = 0),
  ('client cannot read internal notes', (select count(*) from public.internal_notes where client_id in ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002')) = 0),
  ('client sees only published snapshot', (select count(*) from public.published_snapshots where id in ('70000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000002') and status = 'published') = 1),
  ('client cannot see draft snapshot', (select count(*) from public.published_snapshots where id = '70000000-0000-4000-8000-000000000002') = 0),
  ('client cannot read staff source queue', (select count(*) from public.source_review_candidates) = 0),
  ('client consent starts unknown', not public.has_client_consent(auth.uid(), '10000000-0000-4000-8000-000000000001'));

insert into public.consents (user_id, client_id, kind, version)
select id, '10000000-0000-4000-8000-000000000001', kind, 'regression' from public.profiles, lateral (values ('privacy_notice'), ('report_analysis_authorization')) as kinds(kind) where email = 'support@advancerevival.com';
insert into role_access_results values ('both client consent kinds are required and recognized', public.has_client_consent(auth.uid(), '10000000-0000-4000-8000-000000000001'));

do $$
begin
  insert into public.report_fields (report_id, client_id, bureau, field_key, value, status) values ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'transunion', 'credit_score', 850, 'verified');
  insert into role_access_results values ('client cannot write staff report fields', false);
exception when others then
  insert into role_access_results values ('client cannot write staff report fields', true);
end $$;

do $$
begin
  perform public.review_source_candidate((select id from public.source_review_candidates order by seed_key limit 1), 'reject');
  insert into role_access_results values ('client cannot review owner source candidate', false);
exception when others then
  insert into role_access_results values ('client cannot review owner source candidate', true);
end $$;
reset role;

-- Authenticated guest with no role: no synthetic client or staff data.
select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
delete from public.user_roles where user_id = (select id from public.profiles where email = 'support@advancerevival.com');
select set_config('request.jwt.claim.sub', '99999999-9999-4999-8999-999999999999', true), set_config('request.jwt.claims', '{"sub":"99999999-9999-4999-8999-999999999999","role":"authenticated"}', true);
set local role authenticated;
insert into role_access_results values
  ('guest sees no synthetic clients', (select count(*) from public.clients where id in ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002')) = 0),
  ('guest sees no synthetic documents', (select count(*) from public.documents where id in ('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002')) = 0),
  ('guest sees no staff report fields', (select count(*) from public.report_fields where id in ('40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002')) = 0),
  ('guest sees no published or draft snapshots', (select count(*) from public.published_snapshots where id in ('70000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000002')) = 0),
  ('guest sees no source queue', (select count(*) from public.source_review_candidates) = 0);
reset role;

select check_name, pass from role_access_results order by check_name;
rollback;
