-- Transaction-isolated owner departure action; synthetic dual-role principal, rolled back.
begin;
create temporary table employee_deactivation_results (check_name text primary key, pass boolean not null) on commit drop;

select set_config('request.jwt.claim.sub', id::text, true),
       set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from public.profiles where email = 'support@advancerevival.com';

insert into public.clients (id, display_name, stage, is_demo, created_by)
select '13000000-0000-4000-8000-000000000001', 'SYNTHETIC DEPARTURE — ROLLBACK', 'intake', true, id
from public.profiles where email = 'support@advancerevival.com';
insert into public.user_roles (user_id, role)
select id, 'employee' from public.profiles where email = 'support@advancerevival.com' on conflict do nothing;
insert into public.client_assignments (client_id, employee_id, active, assigned_by)
select '13000000-0000-4000-8000-000000000001', id, true, id from public.profiles where email = 'support@advancerevival.com';

do $$
begin
  perform public.deactivate_employee(auth.uid(), '99999999-9999-4999-8999-999999999999');
  insert into employee_deactivation_results values ('invalid transfer target is rejected', false);
exception when others then
  insert into employee_deactivation_results values ('invalid transfer target is rejected', true);
end $$;

select public.deactivate_employee(auth.uid(), null);
insert into employee_deactivation_results values
  ('owner departure action deactivates employee', not exists (select 1 from public.profiles where email='support@advancerevival.com' and active)),
  ('owner departure action revokes assignments', not exists (select 1 from public.client_assignments where client_id='13000000-0000-4000-8000-000000000001' and active)),
  ('deactivated principal loses staff helper access', not public.is_staff((select id from public.profiles where email='support@advancerevival.com'))),
  ('departure records audited activation field', exists (select 1 from public.audit_logs where entity='profiles' and entity_id=(select id::text from public.profiles where email='support@advancerevival.com') and metadata->'changed_fields' ? 'active'));

select check_name, pass from employee_deactivation_results order by check_name;
rollback;
