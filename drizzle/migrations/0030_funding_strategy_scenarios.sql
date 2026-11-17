ALTER TABLE public.lender_products
  ADD COLUMN IF NOT EXISTS published_term_min_months integer,
  ADD COLUMN IF NOT EXISTS published_term_max_months integer,
  ADD COLUMN IF NOT EXISTS term_source_url text,
  ADD COLUMN IF NOT EXISTS term_as_of date;
ALTER TABLE public.lender_products ADD CONSTRAINT lender_products_term_range_chk CHECK ((published_term_min_months IS NULL OR published_term_min_months > 0) AND (published_term_max_months IS NULL OR published_term_max_months > 0) AND (published_term_min_months IS NULL OR published_term_max_months IS NULL OR published_term_min_months <= published_term_max_months));
COMMENT ON COLUMN public.lender_products.published_term_min_months IS 'Optional marketed term range from an owner-approved official product source; never inferred for payment calculations.';

CREATE TABLE public.funding_strategy_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  goal_id uuid NOT NULL REFERENCES public.funding_goals(id) ON DELETE CASCADE,
  name text NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  assumptions text NOT NULL DEFAULT '',
  affordability_notes text NOT NULL DEFAULT '',
  sequencing_notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  created_by uuid NOT NULL DEFAULT auth.uid(),
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT funding_strategy_name_chk CHECK (char_length(name) BETWEEN 2 AND 160),
  CONSTRAINT funding_strategy_status_chk CHECK (status IN ('draft','approved','archived')),
  CONSTRAINT funding_strategy_items_chk CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) <= 30 AND octet_length(items::text) <= 250000),
  CONSTRAINT funding_strategy_notes_size_chk CHECK (char_length(assumptions) <= 12000 AND char_length(affordability_notes) <= 12000 AND char_length(sequencing_notes) <= 12000)
);
GRANT SELECT, INSERT, UPDATE ON public.funding_strategy_scenarios TO authenticated;
GRANT ALL ON public.funding_strategy_scenarios TO service_role;
ALTER TABLE public.funding_strategy_scenarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read funding scenarios" ON public.funding_strategy_scenarios FOR SELECT TO authenticated USING (public.is_client_staff(auth.uid(), client_id));
CREATE POLICY "staff create funding scenarios" ON public.funding_strategy_scenarios FOR INSERT TO authenticated WITH CHECK (public.is_client_staff(auth.uid(), client_id));
CREATE POLICY "staff update funding scenarios" ON public.funding_strategy_scenarios FOR UPDATE TO authenticated USING (public.is_client_staff(auth.uid(), client_id)) WITH CHECK (public.is_client_staff(auth.uid(), client_id));
CREATE TRIGGER audit_funding_strategy_scenarios AFTER INSERT OR UPDATE OR DELETE ON public.funding_strategy_scenarios FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

CREATE OR REPLACE FUNCTION public.guard_funding_strategy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $function$
begin
  if not exists (select 1 from public.funding_goals g where g.id = new.goal_id and g.client_id = new.client_id) then
    raise exception 'Scenario goal belongs to a different client';
  end if;
  if not public.is_client_staff(auth.uid(), new.client_id) then raise exception 'Assigned staff access required'; end if;
  if tg_op = 'UPDATE' and (new.client_id is distinct from old.client_id or new.goal_id is distinct from old.goal_id or new.created_by is distinct from old.created_by) then
    raise exception 'Scenario ownership and goal cannot be changed';
  end if;
  if tg_op = 'UPDATE' and old.status = 'approved' and (new.name is distinct from old.name or new.items is distinct from old.items or new.assumptions is distinct from old.assumptions or new.affordability_notes is distinct from old.affordability_notes or new.sequencing_notes is distinct from old.sequencing_notes) then
    raise exception 'Approved scenarios are immutable; create a new draft';
  end if;
  if tg_op = 'UPDATE' and old.status = 'archived' and new.status <> 'archived' then raise exception 'Archived scenarios cannot be reopened'; end if;
  if new.status = 'approved' then
    if not public.has_perm(auth.uid(), 'can_approve_publish') then raise exception 'Approval permission required'; end if;
    if jsonb_array_length(new.items) = 0 or not exists (
      select 1 from jsonb_array_elements(new.items) item
      where item->>'review_status' = 'approved' and jsonb_typeof(item->'snapshot') = 'object'
    ) or exists (
      select 1 from jsonb_array_elements(new.items) item
      where item->>'review_status' <> 'approved' or jsonb_typeof(item->'snapshot') <> 'object'
    ) then
      raise exception 'Every included strategy item must be individually approved with complete snapshot content';
    end if;
    if tg_op = 'INSERT' or old.status is distinct from 'approved' then new.approved_by := auth.uid(); new.approved_at := now(); end if;
  else
    new.approved_by := null; new.approved_at := null;
  end if;
  new.updated_at := now();
  return new;
end $function$;
CREATE TRIGGER guard_funding_strategy BEFORE INSERT OR UPDATE ON public.funding_strategy_scenarios FOR EACH ROW EXECUTE FUNCTION public.guard_funding_strategy();

ALTER TABLE public.published_snapshots ADD COLUMN IF NOT EXISTS source_scenario_id uuid REFERENCES public.funding_strategy_scenarios(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS published_snapshots_source_scenario_uq ON public.published_snapshots(source_scenario_id) WHERE source_scenario_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_strategy_snapshot_draft(_scenario_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $function$
declare
  s public.funding_strategy_scenarios;
  v_items jsonb;
  v_version integer;
  v_id uuid;
  v_goal text;
begin
  select * into s from public.funding_strategy_scenarios where id = _scenario_id for update;
  if not found then raise exception 'Scenario not found'; end if;
  if not public.is_client_staff(auth.uid(), s.client_id) or not public.has_perm(auth.uid(), 'can_approve_publish') then raise exception 'Approval permission required'; end if;
  if s.status <> 'approved' then raise exception 'Approve the complete scenario before creating a draft'; end if;
  select id into v_id from public.published_snapshots where source_scenario_id = s.id;
  if found then return v_id; end if;
  select coalesce(jsonb_agg(item->'snapshot' order by (item->>'position')::integer), '[]'::jsonb) into v_items
  from jsonb_array_elements(s.items) item;
  select coalesce(max(version), 0) + 1 into v_version from public.published_snapshots where client_id = s.client_id;
  select g.title || coalesce(' — ' || b.name, ' — Personal') into v_goal
  from public.funding_goals g left join public.business_profiles b on b.id = g.business_profile_id
  where g.id = s.goal_id;
  insert into public.published_snapshots (client_id, version, scope, status, content, source_scenario_id)
  values (
    s.client_id,
    v_version,
    case when jsonb_array_length(v_items) = 1 then 'individual' else 'strategy' end,
    'draft',
    jsonb_build_object(
      'items', v_items,
      'disclaimer', 'These are informational recommendations prepared and reviewed by Loan Scout LLC staff. Scenario amounts are hypothetical planning inputs, not expected approvals. Suitability is not approval probability. Lenders make all credit decisions. No approval, rate, credit limit or funding amount is guaranteed. A credit limit is not cash funding. Unknown information remains unverified.',
      'goal', v_goal,
      'approved_note', s.assumptions,
      'planner', jsonb_build_object('scenario_id', s.id, 'affordability_notes', s.affordability_notes, 'sequencing_notes', s.sequencing_notes)
    ),
    s.id
  ) returning id into v_id;
  return v_id;
end $function$;
REVOKE ALL ON FUNCTION public.create_strategy_snapshot_draft(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_strategy_snapshot_draft(uuid) TO authenticated;
COMMENT ON TABLE public.funding_strategy_scenarios IS 'Internal hypothetical funding strategies. Never client-visible; approval and draft snapshot creation are separate from manual publication.';