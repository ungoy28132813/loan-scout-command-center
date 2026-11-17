-- Transaction-isolated invitation and role-activation checks.
-- Uses an existing auth identity with synthetic invitation addresses; no auth user is created.
begin;
create temporary table invitation_role_results (check_name text primary key, pass boolean not null) on commit drop;
grant select, insert on pg_temp.invitation_role_results to authenticated;

select set_config('request.jwt.claim.sub', id::text, true),
       set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from public.profiles where email = 'support@advancerevival.com';

insert into public.clients (id, display_name, stage, is_demo, created_by)
select '12000000-0000-4000-8000-000000000001', 'SYNTHETIC INVITED CLIENT — ROLLBACK', 'intake', true, id
from public.profiles where email = 'support@advancerevival.com';

-- A pending employee invitation activates only the invited non-owner role.
insert into public.invitations (email, role, created_by)
select 'synthetic-employee@example.com', 'employee', id from public.profiles where email = 'support@advancerevival.com';
delete from public.user_roles where user_id = (select id from public.profiles where email = 'support@advancerevival.com');
select public.grant_roles_on_confirm(id, 'synthetic-employee@example.com') from public.profiles where email = 'support@advancerevival.com';
insert into invitation_role_results values
  ('employee invitation grants employee role', exists (select 1 from public.user_roles r join public.profiles p on p.id=r.user_id where p.email='support@advancerevival.com' and r.role='employee')),
  ('employee invitation never grants owner', not exists (select 1 from public.user_roles r join public.profiles p on p.id=r.user_id where p.email='support@advancerevival.com' and r.role='owner')),
  ('employee invitation creates default permissions', exists (select 1 from public.employee_permissions p join public.profiles u on u.id=p.user_id where u.email='support@advancerevival.com')),
  ('employee invitation is marked accepted', exists (select 1 from public.invitations where email='synthetic-employee@example.com' and accepted_at is not null));

-- A revoked invitation grants no role while public signup is off.
delete from public.user_roles where user_id = (select id from public.profiles where email = 'support@advancerevival.com');
insert into public.invitations (email, role, created_by)
select 'synthetic-revoked@example.com', 'employee', id from public.profiles where email = 'support@advancerevival.com';
delete from public.invitations where email = 'synthetic-revoked@example.com';
select public.grant_roles_on_confirm(id, 'synthetic-revoked@example.com') from public.profiles where email = 'support@advancerevival.com';
insert into invitation_role_results values
  ('revoked invitation grants no role', not exists (select 1 from public.user_roles r join public.profiles p on p.id=r.user_id where p.email='support@advancerevival.com')),
  ('public signup remains disabled', (select not public_signup from public.app_settings where id=1));

-- A client invitation activates the client role and links only its intended client record.
insert into public.invitations (email, role, client_id, created_by)
select 'synthetic-client@example.com', 'client', '12000000-0000-4000-8000-000000000001', id from public.profiles where email = 'support@advancerevival.com';
-- Real auth lifecycle triggers have no browser JWT.
select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
select public.grant_roles_on_confirm(id, 'synthetic-client@example.com') from public.profiles where email = 'support@advancerevival.com';
insert into invitation_role_results values
  ('client invitation grants client role', exists (select 1 from public.user_roles r join public.profiles p on p.id=r.user_id where p.email='support@advancerevival.com' and r.role='client')),
  ('client invitation links intended client only', (select user_id = (select id from public.profiles where email='support@advancerevival.com') from public.clients where id='12000000-0000-4000-8000-000000000001')),
  ('client invitation never grants staff role', not exists (select 1 from public.user_roles r join public.profiles p on p.id=r.user_id where p.email='support@advancerevival.com' and r.role in ('owner','employee')));

-- A signed-in client still cannot move a portal account to another client.
select set_config('request.jwt.claim.sub', id::text, true), set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true) from public.profiles where email = 'support@advancerevival.com';
set local role authenticated;
do $$
begin
  update public.clients set user_id = null where id = '12000000-0000-4000-8000-000000000001';
  insert into invitation_role_results
  select 'client cannot unlink portal account', user_id = (select id from public.profiles where email='support@advancerevival.com')
  from public.clients where id = '12000000-0000-4000-8000-000000000001';
exception when others then
  insert into invitation_role_results values ('client cannot unlink portal account', true);
end $$;
reset role;

select check_name, pass from invitation_role_results order by check_name;
rollback;
