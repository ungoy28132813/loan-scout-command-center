
-- ===== ROLES & PROFILES =====
create type public.app_role as enum ('owner','employee','client');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  theme text not null default 'light' check (theme in ('light','dark')),
  department text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles r join public.profiles p on p.id = r.user_id
                 where r.user_id = _user_id and r.role = _role and p.active)
$$;
create or replace function public.is_owner(_uid uuid) returns boolean language sql stable security definer set search_path = public as $$ select public.has_role(_uid,'owner') $$;
create or replace function public.is_staff(_uid uuid) returns boolean language sql stable security definer set search_path = public as $$ select public.has_role(_uid,'owner') or public.has_role(_uid,'employee') $$;

-- ===== SETTINGS =====
create table public.app_settings (
  id int primary key default 1 check (id = 1),
  public_signup boolean not null default false,
  match_mode text not null default 'strict' check (match_mode in ('strict','expanded')),
  updated_at timestamptz not null default now()
);
insert into public.app_settings (id) values (1);
grant select, update on public.app_settings to authenticated;
grant all on public.app_settings to service_role;
alter table public.app_settings enable row level security;
create policy "staff read settings" on public.app_settings for select to authenticated using (public.is_staff(auth.uid()));
create policy "owner update settings" on public.app_settings for update to authenticated using (public.is_owner(auth.uid()));

-- ===== EMPLOYEE PERMISSIONS =====
create table public.employee_permissions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  staff_role text not null default 'client_manager' check (staff_role in ('credit_analyst','funding_specialist','client_manager','custom')),
  custom_title text,
  can_upload_docs boolean not null default true,
  can_edit_extractions boolean not null default false,
  can_run_matching boolean not null default false,
  can_approve_publish boolean not null default false,
  can_update_applications boolean not null default false,
  can_manage_readiness boolean not null default false,
  can_post_announcements boolean not null default false,
  can_export_pdf boolean not null default false,
  can_propose_rules boolean not null default false,
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.employee_permissions to authenticated;
grant all on public.employee_permissions to service_role;
alter table public.employee_permissions enable row level security;

create or replace function public.has_perm(_uid uuid, _perm text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare r boolean;
begin
  if public.is_owner(_uid) then return true; end if;
  if not public.has_role(_uid,'employee') then return false; end if;
  execute format('select coalesce((select %I from public.employee_permissions where user_id = $1), false)', _perm) into r using _uid;
  return r;
end $$;

create policy "own or owner read perms" on public.employee_permissions for select to authenticated using (user_id = auth.uid() or public.is_owner(auth.uid()));
create policy "owner write perms" on public.employee_permissions for insert to authenticated with check (public.is_owner(auth.uid()));
create policy "owner update perms" on public.employee_permissions for update to authenticated using (public.is_owner(auth.uid()));

-- ===== CLIENTS & ASSIGNMENTS =====
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  display_name text not null,
  email text,
  stage text not null default 'intake' check (stage in ('intake','documents','analysis','review','published','applying','closed')),
  is_demo boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.clients to authenticated;
grant all on public.clients to service_role;
alter table public.clients enable row level security;

create table public.client_assignments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  temporary_until timestamptz,
  active boolean not null default true,
  assigned_by uuid,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.client_assignments to authenticated;
grant all on public.client_assignments to service_role;
alter table public.client_assignments enable row level security;

create or replace function public.is_client_staff(_uid uuid, _cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_owner(_uid) or (public.has_role(_uid,'employee') and exists (
    select 1 from public.client_assignments a where a.client_id = _cid and a.employee_id = _uid and a.active
      and (a.temporary_until is null or a.temporary_until > now())))
$$;
create or replace function public.is_client_self(_uid uuid, _cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.clients c join public.profiles p on p.id = c.user_id where c.id = _cid and c.user_id = _uid and p.active)
$$;
create or replace function public.can_access_client(_uid uuid, _cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_client_staff(_uid,_cid) or public.is_client_self(_uid,_cid)
$$;

create policy "read clients" on public.clients for select to authenticated using (public.can_access_client(auth.uid(), id));
create policy "owner create clients" on public.clients for insert to authenticated with check (public.is_owner(auth.uid()));
create policy "staff update clients" on public.clients for update to authenticated using (public.is_client_staff(auth.uid(), id));
create policy "owner delete clients" on public.clients for delete to authenticated using (public.is_owner(auth.uid()));

create policy "read assignments" on public.client_assignments for select to authenticated using (public.is_owner(auth.uid()) or employee_id = auth.uid());
create policy "owner assign" on public.client_assignments for insert to authenticated with check (public.is_owner(auth.uid()));
create policy "owner update assign" on public.client_assignments for update to authenticated using (public.is_owner(auth.uid()));

-- profiles policies (after helper fns)
create policy "read own or staff reads" on public.profiles for select to authenticated using (id = auth.uid() or public.is_staff(auth.uid()));
create policy "update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid() and active = (select p.active from public.profiles p where p.id = auth.uid()));
create policy "owner update profiles" on public.profiles for update to authenticated using (public.is_owner(auth.uid()));
create policy "read roles" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.is_owner(auth.uid()));

-- ===== INVITATIONS =====
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role app_role not null,
  client_id uuid references public.clients(id) on delete cascade,
  created_by uuid,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, delete on public.invitations to authenticated;
grant all on public.invitations to service_role;
alter table public.invitations enable row level security;
create policy "owner manage invites" on public.invitations for all to authenticated using (public.is_owner(auth.uid())) with check (public.is_owner(auth.uid()) and role <> 'owner');

-- ===== SIGNUP HANDLER =====
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare inv record; s record;
begin
  insert into public.profiles (id, email) values (new.id, lower(new.email));
  if not exists (select 1 from public.user_roles where role = 'owner') then
    insert into public.user_roles (user_id, role) values (new.id, 'owner');
    return new;
  end if;
  select * into inv from public.invitations where lower(email) = lower(new.email) and accepted_at is null order by created_at desc limit 1;
  if found then
    insert into public.user_roles (user_id, role) values (new.id, inv.role) on conflict do nothing;
    if inv.role = 'employee' then insert into public.employee_permissions (user_id) values (new.id) on conflict do nothing; end if;
    if inv.role = 'client' and inv.client_id is not null then update public.clients set user_id = new.id where id = inv.client_id and user_id is null; end if;
    update public.invitations set accepted_at = now() where id = inv.id;
    return new;
  end if;
  select * into s from public.app_settings where id = 1;
  if s.public_signup then
    insert into public.user_roles (user_id, role) values (new.id, 'client');
    -- Neutral safeguard (Q87 undecided): unassigned client record, no publication until owner assigns.
    insert into public.clients (user_id, display_name, email, stage) values (new.id, split_part(new.email,'@',1), lower(new.email), 'intake');
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ===== AUDIT LOG (append-only, no PII values) =====
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  client_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
grant select, insert on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;
alter table public.audit_logs enable row level security;
create policy "owner reads audit" on public.audit_logs for select to authenticated using (public.is_owner(auth.uid()));
-- inserts only via security definer functions; no direct insert policy

create or replace function public.log_event(_action text, _entity text, _entity_id text, _client_id uuid, _meta jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if _client_id is not null and not public.can_access_client(auth.uid(), _client_id) then raise exception 'forbidden'; end if;
  insert into public.audit_logs (actor_id, action, entity, entity_id, client_id, metadata) values (auth.uid(), _action, _entity, _entity_id, _client_id, coalesce(_meta,'{}'));
end $$;
grant execute on function public.log_event to authenticated;

create or replace function public.audit_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare rec jsonb; old_rec jsonb; cid uuid; changed text[];
begin
  rec := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  old_rec := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  cid := case when tg_table_name = 'clients' then (rec->>'id')::uuid else nullif(rec->>'client_id','')::uuid end;
  if tg_op = 'UPDATE' then
    select array_agg(k) into changed from jsonb_object_keys(rec) k where rec->k is distinct from old_rec->k and k not in ('updated_at');
  end if;
  insert into public.audit_logs (actor_id, action, entity, entity_id, client_id, metadata)
  values (auth.uid(), lower(tg_op), tg_table_name, rec->>'id', cid,
    jsonb_build_object('changed_fields', to_jsonb(changed))
    || case when tg_table_name in ('applications','match_results','published_snapshots','lender_rules','readiness_tasks') and rec ? 'status' then jsonb_build_object('status', rec->>'status', 'prev_status', old_rec->>'status') else '{}'::jsonb end
    || case when tg_table_name = 'match_results' then jsonb_build_object('review_status', rec->>'review_status') else '{}'::jsonb end
    || case when tg_table_name = 'lender_rules' then jsonb_build_object('approval_status', rec->>'approval_status') else '{}'::jsonb end);
  return null;
end $$;

-- ===== CONSENTS =====
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  client_id uuid references public.clients(id) on delete cascade,
  kind text not null check (kind in ('privacy_notice','report_analysis_authorization')),
  version text not null,
  accepted_at timestamptz not null default now()
);
grant select, insert on public.consents to authenticated;
grant all on public.consents to service_role;
alter table public.consents enable row level security;
create policy "insert own consent" on public.consents for insert to authenticated with check (user_id = auth.uid() and (client_id is null or public.is_client_self(auth.uid(), client_id)));
create policy "read consents" on public.consents for select to authenticated using (user_id = auth.uid() or (client_id is not null and public.is_client_staff(auth.uid(), client_id)));

-- ===== GOALS / BUSINESS =====
create table public.business_profiles (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  months_in_business int,
  annual_revenue numeric,
  monthly_expenses numeric,
  created_at timestamptz not null default now()
);
create table public.funding_goals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null,
  goal_type text not null default 'personal' check (goal_type in ('personal','business')),
  target_amount numeric,
  business_profile_id uuid references public.business_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.business_profiles, public.funding_goals to authenticated;
grant all on public.business_profiles, public.funding_goals to service_role;
alter table public.business_profiles enable row level security;
alter table public.funding_goals enable row level security;
create policy "access bp" on public.business_profiles for select to authenticated using (public.can_access_client(auth.uid(), client_id));
create policy "write bp" on public.business_profiles for insert to authenticated with check (public.can_access_client(auth.uid(), client_id));
create policy "update bp" on public.business_profiles for update to authenticated using (public.can_access_client(auth.uid(), client_id));
create policy "access goals" on public.funding_goals for select to authenticated using (public.can_access_client(auth.uid(), client_id));
create policy "write goals" on public.funding_goals for insert to authenticated with check (public.can_access_client(auth.uid(), client_id));
create policy "update goals" on public.funding_goals for update to authenticated using (public.can_access_client(auth.uid(), client_id));
create policy "staff delete goals" on public.funding_goals for delete to authenticated using (public.is_client_staff(auth.uid(), client_id));

-- ===== DOCUMENTS =====
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  category text not null check (category in ('credit_reports','identification','income','banking','business_documents','other')),
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  batch_id uuid,
  uploaded_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint credit_pdf_only check (category <> 'credit_reports' or mime_type = 'application/pdf')
);
grant select, insert, delete on public.documents to authenticated;
grant all on public.documents to service_role;
alter table public.documents enable row level security;
create policy "read docs" on public.documents for select to authenticated using (public.can_access_client(auth.uid(), client_id));
create policy "upload docs" on public.documents for insert to authenticated with check (
  uploaded_by = auth.uid() and (public.is_client_self(auth.uid(), client_id) or (public.is_client_staff(auth.uid(), client_id) and public.has_perm(auth.uid(),'can_upload_docs'))));
create policy "owner deletes docs" on public.documents for delete to authenticated using (public.is_owner(auth.uid()));

-- ===== CREDIT REPORTS / EXTRACTION =====
create table public.credit_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  report_type text not null default 'unknown' check (report_type in ('tri_merge','experian','equifax','transunion','unknown')),
  report_date date,
  extraction_status text not null default 'awaiting_manual_entry' check (extraction_status in ('awaiting_manual_entry','partial','unreadable','clearer_pdf_requested','complete_unverified','verified')),
  extraction_method text not null default 'manual' check (extraction_method in ('manual','automated')),
  created_at timestamptz not null default now()
);
create table public.report_fields (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.credit_reports(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  bureau text not null check (bureau in ('experian','equifax','transunion')),
  field_key text not null,
  score_model text,
  value numeric,
  status text not null default 'unknown' check (status in ('unknown','entered','corrected','verified')),
  source_ref text,
  updated_at timestamptz not null default now(),
  unique (report_id, bureau, field_key, score_model)
);
create table public.field_corrections (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references public.report_fields(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  old_value numeric,
  new_value numeric,
  reason text not null,
  source_ref text,
  corrected_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
create table public.tradelines (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.credit_reports(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  bureau text not null check (bureau in ('experian','equifax','transunion')),
  creditor text not null,
  account_type text,
  account_ref_last4 text,
  is_open boolean,
  balance numeric,
  credit_limit numeric,
  late_count int,
  is_collection boolean not null default false,
  reconcile_key text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.credit_reports, public.report_fields, public.tradelines to authenticated;
grant select, insert on public.field_corrections to authenticated;
grant all on public.credit_reports, public.report_fields, public.field_corrections, public.tradelines to service_role;
alter table public.credit_reports enable row level security;
alter table public.report_fields enable row level security;
alter table public.field_corrections enable row level security;
alter table public.tradelines enable row level security;
create policy "staff read reports" on public.credit_reports for select to authenticated using (public.is_client_staff(auth.uid(), client_id) or public.is_client_self(auth.uid(), client_id));
create policy "insert reports" on public.credit_reports for insert to authenticated with check (public.can_access_client(auth.uid(), client_id));
create policy "staff update reports" on public.credit_reports for update to authenticated using (public.is_client_staff(auth.uid(), client_id) and public.has_perm(auth.uid(),'can_edit_extractions'));
create policy "staff read fields" on public.report_fields for select to authenticated using (public.is_client_staff(auth.uid(), client_id));
create policy "staff insert fields" on public.report_fields for insert to authenticated with check (public.is_client_staff(auth.uid(), client_id) and public.has_perm(auth.uid(),'can_edit_extractions'));
create policy "staff update fields" on public.report_fields for update to authenticated using (public.is_client_staff(auth.uid(), client_id) and public.has_perm(auth.uid(),'can_edit_extractions'));
create policy "staff read corrections" on public.field_corrections for select to authenticated using (public.is_client_staff(auth.uid(), client_id));
create policy "staff insert corrections" on public.field_corrections for insert to authenticated with check (corrected_by = auth.uid() and public.is_client_staff(auth.uid(), client_id) and public.has_perm(auth.uid(),'can_edit_extractions'));
create policy "staff read tl" on public.tradelines for select to authenticated using (public.is_client_staff(auth.uid(), client_id));
create policy "staff insert tl" on public.tradelines for insert to authenticated with check (public.is_client_staff(auth.uid(), client_id) and public.has_perm(auth.uid(),'can_edit_extractions'));
create policy "staff update tl" on public.tradelines for update to authenticated using (public.is_client_staff(auth.uid(), client_id) and public.has_perm(auth.uid(),'can_edit_extractions'));

-- ===== QUESTIONNAIRE =====
create table public.questionnaire_answers (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  question_key text not null,
  value_numeric numeric,
  value_text text,
  status text not null default 'unknown' check (status in ('answered','unknown','skipped')),
  verified boolean not null default false,
  answered_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (client_id, question_key)
);
grant select, insert, update on public.questionnaire_answers to authenticated;
grant all on public.questionnaire_answers to service_role;
alter table public.questionnaire_answers enable row level security;
create policy "read qa" on public.questionnaire_answers for select to authenticated using (public.can_access_client(auth.uid(), client_id));
create policy "insert qa" on public.questionnaire_answers for insert to authenticated with check (public.can_access_client(auth.uid(), client_id) and (verified = false or public.is_client_staff(auth.uid(), client_id)));
create policy "update qa" on public.questionnaire_answers for update to authenticated using (public.can_access_client(auth.uid(), client_id)) with check (verified = false or public.is_client_staff(auth.uid(), client_id));

-- ===== LENDERS =====
create table public.lenders (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  official_url text,
  research_status text not null default 'awaiting_verified_research' check (research_status in ('awaiting_verified_research','partially_verified','verified')),
  notes text,
  created_at timestamptz not null default now()
);
create table public.lender_products (
  id uuid primary key default gen_random_uuid(),
  lender_id uuid not null references public.lenders(id) on delete cascade,
  name text not null,
  product_type text not null default 'unknown' check (product_type in ('personal_loan','credit_card','business_credit_card','business_loan','line_of_credit','unknown')),
  official_url text,
  published_min_amount numeric,
  published_max_amount numeric,
  amount_kind text not null default 'unknown' check (amount_kind in ('loan_cash','credit_limit','unknown')),
  pull_type text not null default 'unknown' check (pull_type in ('soft_prequal','hard','unknown')),
  research_status text not null default 'awaiting_verified_research' check (research_status in ('awaiting_verified_research','partially_verified','verified')),
  created_at timestamptz not null default now()
);
create table public.lender_rules (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.lender_products(id) on delete cascade,
  rule_key text not null check (rule_key in ('min_score','max_inquiries','max_dti_pct','min_open_tradelines','min_months_since_bankruptcy','max_utilization_pct','min_months_in_business','min_annual_revenue','min_annual_income')),
  bureau text check (bureau in ('experian','equifax','transunion','any')),
  score_model text,
  lookback_months int,
  threshold numeric not null,
  source_tier text not null check (source_tier in ('verified_primary','secondary_source','observational')),
  source_title text not null,
  source_url text not null,
  verified_on date not null,
  effective_date date,
  stale_after_days int not null default 180,
  approval_status text not null default 'proposed' check (approval_status in ('proposed','active','rejected','retired')),
  version int not null default 1,
  supersedes uuid references public.lender_rules(id),
  proposed_by uuid default auth.uid(),
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.lenders, public.lender_products, public.lender_rules to authenticated;
grant all on public.lenders, public.lender_products, public.lender_rules to service_role;
alter table public.lenders enable row level security;
alter table public.lender_products enable row level security;
alter table public.lender_rules enable row level security;
create policy "staff read lenders" on public.lenders for select to authenticated using (public.is_staff(auth.uid()));
create policy "owner write lenders" on public.lenders for insert to authenticated with check (public.is_owner(auth.uid()));
create policy "owner update lenders" on public.lenders for update to authenticated using (public.is_owner(auth.uid()));
create policy "staff read products" on public.lender_products for select to authenticated using (public.is_staff(auth.uid()));
create policy "owner write products" on public.lender_products for insert to authenticated with check (public.is_owner(auth.uid()));
create policy "owner update products" on public.lender_products for update to authenticated using (public.is_owner(auth.uid()));
create policy "staff read rules" on public.lender_rules for select to authenticated using (public.is_staff(auth.uid()));
create policy "propose rules" on public.lender_rules for insert to authenticated with check (approval_status = 'proposed' and proposed_by = auth.uid() and public.has_perm(auth.uid(),'can_propose_rules'));
create policy "owner approves rules" on public.lender_rules for update to authenticated using (public.is_owner(auth.uid()));

-- ===== MATCHING =====
create table public.match_runs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  goal_id uuid references public.funding_goals(id) on delete set null,
  mode text not null check (mode in ('strict','expanded')),
  engine_version text not null,
  critical_warnings jsonb not null default '[]',
  run_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
create table public.match_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.match_runs(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  product_id uuid not null references public.lender_products(id) on delete cascade,
  status text not null check (status in ('potential_match','needs_review','does_not_meet_published')),
  suitability_score int check (suitability_score between 0 and 100),
  conditions jsonb not null default '[]',
  review_status text not null default 'proposed' check (review_status in ('proposed','approved','rejected')),
  rank int,
  private_note text,
  manual_added boolean not null default false,
  manual_reason text,
  created_at timestamptz not null default now()
);
create table public.published_snapshots (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  version int not null,
  scope text not null default 'strategy' check (scope in ('individual','group','strategy')),
  status text not null default 'draft' check (status in ('draft','scheduled','published','withdrawn','superseded')),
  content jsonb not null,
  scheduled_for timestamptz,
  needs_rereview boolean not null default false,
  created_by uuid not null default auth.uid(),
  published_by uuid,
  published_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.match_runs, public.match_results, public.published_snapshots to authenticated;
grant delete on public.match_results to authenticated;
grant all on public.match_runs, public.match_results, public.published_snapshots to service_role;
alter table public.match_runs enable row level security;
alter table public.match_results enable row level security;
alter table public.published_snapshots enable row level security;
create policy "staff runs" on public.match_runs for select to authenticated using (public.is_client_staff(auth.uid(), client_id));
create policy "staff insert runs" on public.match_runs for insert to authenticated with check (public.is_client_staff(auth.uid(), client_id) and public.has_perm(auth.uid(),'can_run_matching'));
create policy "staff results" on public.match_results for select to authenticated using (public.is_client_staff(auth.uid(), client_id));
create policy "staff insert results" on public.match_results for insert to authenticated with check (public.is_client_staff(auth.uid(), client_id) and public.has_perm(auth.uid(),'can_run_matching'));
create policy "staff review results" on public.match_results for update to authenticated using (public.is_client_staff(auth.uid(), client_id) and public.has_perm(auth.uid(),'can_approve_publish'));
create policy "staff remove manual" on public.match_results for delete to authenticated using (public.is_client_staff(auth.uid(), client_id) and public.has_perm(auth.uid(),'can_approve_publish') and manual_added);
create policy "staff snapshots" on public.published_snapshots for select to authenticated using (public.is_client_staff(auth.uid(), client_id) or (public.is_client_self(auth.uid(), client_id) and status = 'published'));
create policy "staff create snapshots" on public.published_snapshots for insert to authenticated with check (public.is_client_staff(auth.uid(), client_id) and public.has_perm(auth.uid(),'can_approve_publish') and status in ('draft','scheduled','published'));
create policy "staff update snapshots" on public.published_snapshots for update to authenticated using (public.is_client_staff(auth.uid(), client_id) and public.has_perm(auth.uid(),'can_approve_publish'));

-- Q73 safeguard: a new credit report flags the current published snapshot for re-review (client keeps seeing the previous approved snapshot).
create or replace function public.flag_rereview() returns trigger language plpgsql security definer set search_path = public as $$
begin update public.published_snapshots set needs_rereview = true where client_id = new.client_id and status = 'published'; return new; end $$;
create trigger credit_report_rereview after insert on public.credit_reports for each row execute function public.flag_rereview();

-- ===== APPLICATIONS =====
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  product_id uuid references public.lender_products(id) on delete set null,
  lender_label text not null,
  status text not null default 'not_started' check (status in ('not_started','submitted','pending','approved','denied')),
  status_date timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
grant select, insert, update on public.applications to authenticated;
grant all on public.applications to service_role;
alter table public.applications enable row level security;
create policy "read apps" on public.applications for select to authenticated using (public.can_access_client(auth.uid(), client_id));
create policy "staff insert apps" on public.applications for insert to authenticated with check (public.is_client_staff(auth.uid(), client_id) and public.has_perm(auth.uid(),'can_update_applications'));
create policy "staff update apps" on public.applications for update to authenticated using (public.is_client_staff(auth.uid(), client_id) and public.has_perm(auth.uid(),'can_update_applications'));

-- ===== READINESS, ANNOUNCEMENTS, NOTES =====
create table public.readiness_tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null,
  description text,
  published boolean not null default false,
  status text not null default 'open' check (status in ('open','client_marked_done','verified')),
  client_note text,
  created_by uuid default auth.uid(),
  verified_by uuid,
  created_at timestamptz not null default now()
);
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null,
  body text not null,
  kind text not null default 'general' check (kind in ('general','document_request')),
  published boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create table public.internal_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  body text not null,
  author uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
grant select, insert, update on public.readiness_tasks, public.announcements to authenticated;
grant select, insert on public.internal_notes to authenticated;
grant all on public.readiness_tasks, public.announcements, public.internal_notes to service_role;
alter table public.readiness_tasks enable row level security;
alter table public.announcements enable row level security;
alter table public.internal_notes enable row level security;
create policy "read tasks" on public.readiness_tasks for select to authenticated using (public.is_client_staff(auth.uid(), client_id) or (published and public.is_client_self(auth.uid(), client_id)));
create policy "staff insert tasks" on public.readiness_tasks for insert to authenticated with check (public.is_client_staff(auth.uid(), client_id) and public.has_perm(auth.uid(),'can_manage_readiness'));
create policy "staff update tasks" on public.readiness_tasks for update to authenticated using (public.is_client_staff(auth.uid(), client_id) and public.has_perm(auth.uid(),'can_manage_readiness'));
create policy "read ann" on public.announcements for select to authenticated using (public.is_client_staff(auth.uid(), client_id) or (published and public.is_client_self(auth.uid(), client_id)));
create policy "staff ann" on public.announcements for insert to authenticated with check (public.is_client_staff(auth.uid(), client_id) and public.has_perm(auth.uid(),'can_post_announcements'));
create policy "staff ann upd" on public.announcements for update to authenticated using (public.is_client_staff(auth.uid(), client_id) and public.has_perm(auth.uid(),'can_post_announcements'));
create policy "staff notes" on public.internal_notes for select to authenticated using (public.is_client_staff(auth.uid(), client_id));
create policy "staff notes ins" on public.internal_notes for insert to authenticated with check (author = auth.uid() and public.is_client_staff(auth.uid(), client_id));

-- client may only mark own published task done + add note
create or replace function public.client_mark_task(_task uuid, _note text)
returns void language plpgsql security definer set search_path = public as $$
declare t record;
begin
  select * into t from public.readiness_tasks where id = _task;
  if not found or not t.published or not public.is_client_self(auth.uid(), t.client_id) then raise exception 'forbidden'; end if;
  if t.status = 'verified' then raise exception 'already verified'; end if;
  update public.readiness_tasks set status = 'client_marked_done', client_note = left(_note, 2000) where id = _task;
end $$;
grant execute on function public.client_mark_task to authenticated;

-- ===== SAVED VIEWS & SHORTLISTS =====
create table public.saved_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  name text not null,
  filters jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create table public.shortlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  name text not null,
  product_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.saved_views, public.shortlists to authenticated;
grant all on public.saved_views, public.shortlists to service_role;
alter table public.saved_views enable row level security;
alter table public.shortlists enable row level security;
create policy "own views" on public.saved_views for all to authenticated using (user_id = auth.uid() and public.is_staff(auth.uid())) with check (user_id = auth.uid() and public.is_staff(auth.uid()));
create policy "own shortlists" on public.shortlists for all to authenticated using (user_id = auth.uid() and public.is_staff(auth.uid())) with check (user_id = auth.uid() and public.is_staff(auth.uid()));

-- ===== AUDIT TRIGGERS =====
do $$ declare t text; begin
  foreach t in array array['clients','client_assignments','employee_permissions','invitations','app_settings','documents','credit_reports','report_fields','field_corrections','tradelines','questionnaire_answers','lenders','lender_products','lender_rules','match_runs','match_results','published_snapshots','applications','readiness_tasks','announcements','internal_notes','user_roles','profiles','funding_goals','business_profiles','consents'] loop
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I for each row execute function public.audit_trigger()', t);
  end loop;
end $$;

-- ===== SEED: 24 LENDER IDENTITIES ONLY (no policies) =====
insert into public.lenders (name) values
('AmeriCU'),('American Express'),('Bank of America'),('Best Egg'),('Chase'),('Citizens'),
('Digital Federal Credit Union (DCU)'),('Dollar Bank'),('Elan Financial Services'),('FNBO (First National Bank of Omaha)'),
('Fifth Third Bank'),('First Citizens Bank'),('Happy Money'),('Huntington Bank'),('KeyBank'),('M&T Bank'),
('My Apex Card'),('NIH Federal Credit Union'),('Navy Federal Credit Union'),('Prosper'),('SoFi'),('Truist'),('Wells Fargo'),('Zions Bank');
