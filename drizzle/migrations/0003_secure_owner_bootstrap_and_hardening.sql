
-- 1. Protected owner-bootstrap allowlist: no client roles can read or write it.
create table public.owner_bootstrap_allowlist (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);
revoke all on public.owner_bootstrap_allowlist from anon, authenticated, public;
grant all on public.owner_bootstrap_allowlist to service_role;
alter table public.owner_bootstrap_allowlist enable row level security;
-- no policies: inaccessible through the Data API
insert into public.owner_bootstrap_allowlist (email) values ('support@advancerevival.com') on conflict do nothing;

-- At most one owner, ever (prevents races).
create unique index user_roles_single_owner on public.user_roles (role) where role = 'owner';

-- 2. Pure decision function (testable). Owner only for a VERIFIED allowlisted email while no owner exists.
create or replace function public.bootstrap_role_decision(_email text, _confirmed boolean)
returns text language sql stable security definer set search_path = public as $$
  select case
    when _confirmed
     and exists (select 1 from public.owner_bootstrap_allowlist a where a.email = lower(_email))
     and not exists (select 1 from public.user_roles where role = 'owner')
    then 'owner' else 'none' end
$$;
revoke all on function public.bootstrap_role_decision(text, boolean) from public, anon, authenticated;

-- 3. Role grants happen only once the email is confirmed (magic-link click).
create or replace function public.grant_roles_on_confirm(_uid uuid, _email text)
returns void language plpgsql security definer set search_path = public as $$
declare inv record; s record;
begin
  if exists (select 1 from public.user_roles where user_id = _uid) then return; end if;
  perform pg_advisory_xact_lock(hashtext('loan_scout_owner_bootstrap'));
  if public.bootstrap_role_decision(_email, true) = 'owner' then
    insert into public.user_roles (user_id, role) values (_uid, 'owner');
    return;
  end if;
  select * into inv from public.invitations where lower(email) = lower(_email) and accepted_at is null and role <> 'owner' order by created_at desc limit 1;
  if found then
    insert into public.user_roles (user_id, role) values (_uid, inv.role) on conflict do nothing;
    if inv.role = 'employee' then insert into public.employee_permissions (user_id) values (_uid) on conflict do nothing; end if;
    if inv.role = 'client' and inv.client_id is not null then update public.clients set user_id = _uid where id = inv.client_id and user_id is null; end if;
    update public.invitations set accepted_at = now() where id = inv.id;
    return;
  end if;
  select * into s from public.app_settings where id = 1;
  if coalesce(s.public_signup, false) then
    insert into public.user_roles (user_id, role) values (_uid, 'client');
    -- Neutral safeguard (Q87 undecided): unassigned client; nothing publishes until owner assigns.
    insert into public.clients (user_id, display_name, email, stage) values (_uid, split_part(_email,'@',1), lower(_email), 'intake');
  end if;
end $$;
revoke all on function public.grant_roles_on_confirm(uuid, text) from public, anon, authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, lower(new.email)) on conflict (id) do nothing;
  if new.email_confirmed_at is not null then perform public.grant_roles_on_confirm(new.id, new.email); end if;
  return new;
end $$;

create or replace function public.handle_user_confirmed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.grant_roles_on_confirm(new.id, new.email);
  return new;
end $$;
create trigger on_auth_user_confirmed after update of email_confirmed_at on auth.users
  for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.handle_user_confirmed();

-- 4. Profiles: users may only edit name/theme; email/active not self-editable.
revoke update on public.profiles from authenticated;
grant update (full_name, theme, department, active) on public.profiles to authenticated;
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles for update to authenticated
  using (id = auth.uid() and active)
  with check (id = auth.uid() and active = (select p.active from public.profiles p where p.id = auth.uid()));

-- 5. Only owner may link/unlink a portal user to a client record.
create or replace function public.guard_client_update() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is distinct from old.user_id and not public.is_owner(auth.uid()) then
    raise exception 'Only the owner can change a client''s portal account';
  end if;
  return new;
end $$;
create trigger guard_client_update before update on public.clients for each row execute function public.guard_client_update();

-- 6. Credit report must reference a document of the same client.
create or replace function public.guard_credit_report() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.documents d where d.id = new.document_id and d.client_id = new.client_id and d.category = 'credit_reports') then
    raise exception 'Report document mismatch';
  end if;
  return new;
end $$;
create trigger guard_credit_report before insert or update on public.credit_reports for each row execute function public.guard_credit_report();

-- 7. has_perm: allowlisted permission names only.
create or replace function public.has_perm(_uid uuid, _perm text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare r boolean;
begin
  if _perm not in ('can_upload_docs','can_edit_extractions','can_run_matching','can_approve_publish','can_update_applications','can_manage_readiness','can_post_announcements','can_export_pdf','can_propose_rules') then return false; end if;
  if public.is_owner(_uid) then return true; end if;
  if not public.has_role(_uid,'employee') then return false; end if;
  execute format('select coalesce((select %I from public.employee_permissions where user_id = $1), false)', _perm) into r using _uid;
  return r;
end $$;

-- 8. log_event: fixed actions only, no free-form metadata (no PII in audit).
create or replace function public.log_event(_action text, _entity text, _entity_id text, _client_id uuid, _meta jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if _action not in ('view','export_pdf') or _entity not in ('document','published_snapshots') then raise exception 'invalid audit event'; end if;
  if _client_id is null or not public.can_access_client(auth.uid(), _client_id) then raise exception 'forbidden'; end if;
  insert into public.audit_logs (actor_id, action, entity, entity_id, client_id, metadata)
  values (auth.uid(), _action, _entity, left(_entity_id, 64), _client_id, '{}'::jsonb);
end $$;

-- 9. Helper functions: no anonymous execution.
revoke execute on function public.has_role(uuid, app_role), public.is_owner(uuid), public.is_staff(uuid), public.has_perm(uuid, text),
  public.is_client_staff(uuid, uuid), public.is_client_self(uuid, uuid), public.can_access_client(uuid, uuid),
  public.log_event(text, text, text, uuid, jsonb), public.client_mark_task(uuid, text) from public, anon;
grant execute on function public.has_role(uuid, app_role), public.is_owner(uuid), public.is_staff(uuid), public.has_perm(uuid, text),
  public.is_client_staff(uuid, uuid), public.is_client_self(uuid, uuid), public.can_access_client(uuid, uuid),
  public.log_event(text, text, text, uuid, jsonb), public.client_mark_task(uuid, text) to authenticated;
