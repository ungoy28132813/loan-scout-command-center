ALTER TABLE public.published_snapshots DROP CONSTRAINT published_snapshots_source_scenario_id_fkey;
ALTER TABLE public.published_snapshots ADD CONSTRAINT published_snapshots_source_scenario_id_fkey FOREIGN KEY (source_scenario_id) REFERENCES public.funding_strategy_scenarios(id) ON DELETE SET NULL;

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
  if tg_op = 'UPDATE' and old.status = 'approved' and new.status not in ('approved','archived') then
    raise exception 'Approved scenarios cannot be reopened; create a new draft';
  end if;
  if tg_op = 'UPDATE' and old.status = 'approved' and new.status = 'archived' and not public.has_perm(auth.uid(), 'can_approve_publish') then
    raise exception 'Approval permission required to archive an approved scenario';
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
      where coalesce(item->>'review_status', '') <> 'approved' or coalesce(jsonb_typeof(item->'snapshot'), 'missing') <> 'object'
    ) then
      raise exception 'Every included strategy item must be individually approved with complete snapshot content';
    end if;
    if tg_op = 'INSERT' or old.status is distinct from 'approved' then new.approved_by := auth.uid(); new.approved_at := now(); end if;
  elsif new.status = 'draft' then
    new.approved_by := null; new.approved_at := null;
  end if;
  new.updated_at := now();
  return new;
end $function$;