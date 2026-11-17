-- Transaction-isolated profile guard checks; every change is rolled back.
begin;
create temporary table profile_guard_results (check_name text primary key, pass boolean not null) on commit drop;
grant select, insert on pg_temp.profile_guard_results to authenticated;

select set_config('request.jwt.claim.sub', id::text, true), set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true) from public.profiles where email = 'support@advancerevival.com';
delete from public.user_roles where user_id = (select id from public.profiles where email = 'support@advancerevival.com');
insert into public.user_roles (user_id, role) select id, 'employee' from public.profiles where email = 'support@advancerevival.com';
set local role authenticated;

do $$ declare msg text; begin
  update public.profiles set email = 'synthetic-employee@example.com' where id = auth.uid();
  insert into profile_guard_results values ('employee cannot change profile email', false);
exception when others then get stacked diagnostics msg = message_text;
  insert into profile_guard_results values ('employee cannot change profile email', msg = 'Profile email is managed by verified authentication, not editable here' or msg ilike '%permission denied%');
end $$;
do $$ declare msg text; begin
  update public.profiles set active = false where id = auth.uid();
  insert into profile_guard_results values ('employee cannot deactivate profile', false);
exception when others then get stacked diagnostics msg = message_text;
  insert into profile_guard_results values ('employee cannot deactivate profile', msg = 'Only owner may change employee activation or department');
end $$;
do $$ declare msg text; begin
  update public.profiles set department = 'Synthetic escalation' where id = auth.uid();
  insert into profile_guard_results values ('employee cannot change department', false);
exception when others then get stacked diagnostics msg = message_text;
  insert into profile_guard_results values ('employee cannot change department', msg = 'Only owner may change employee activation or department');
end $$;
update public.profiles set full_name = 'Synthetic Employee', theme = 'dark' where id = auth.uid();
insert into profile_guard_results select 'employee can change name and theme', full_name = 'Synthetic Employee' and theme = 'dark' from public.profiles where id = auth.uid();
reset role;

select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
delete from public.user_roles where user_id = (select id from public.profiles where email = 'support@advancerevival.com');
insert into public.user_roles (user_id, role) select id, 'client' from public.profiles where email = 'support@advancerevival.com';
select set_config('request.jwt.claim.sub', id::text, true), set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true) from public.profiles where email = 'support@advancerevival.com';
set local role authenticated;

do $$ declare msg text; begin
  update public.profiles set email = 'synthetic-client@example.com' where id = auth.uid();
  insert into profile_guard_results values ('client cannot change profile email', false);
exception when others then get stacked diagnostics msg = message_text;
  insert into profile_guard_results values ('client cannot change profile email', msg = 'Profile email is managed by verified authentication, not editable here' or msg ilike '%permission denied%');
end $$;
do $$ declare msg text; begin
  update public.profiles set active = false where id = auth.uid();
  insert into profile_guard_results values ('client cannot deactivate profile', false);
exception when others then get stacked diagnostics msg = message_text;
  insert into profile_guard_results values ('client cannot deactivate profile', msg = 'Only owner may change employee activation or department');
end $$;
do $$ declare msg text; begin
  update public.profiles set department = 'Synthetic escalation' where id = auth.uid();
  insert into profile_guard_results values ('client cannot change department', false);
exception when others then get stacked diagnostics msg = message_text;
  insert into profile_guard_results values ('client cannot change department', msg = 'Only owner may change employee activation or department');
end $$;
update public.profiles set full_name = 'Synthetic Client', theme = 'light' where id = auth.uid();
insert into profile_guard_results select 'client can change name and theme', full_name = 'Synthetic Client' and theme = 'light' from public.profiles where id = auth.uid();
reset role;

select check_name, pass from profile_guard_results order by check_name;
rollback;
