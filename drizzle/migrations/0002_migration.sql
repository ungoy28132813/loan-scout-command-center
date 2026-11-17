
create or replace function public.guard_publication() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'published' and not exists (
    select 1 from public.client_assignments a where a.client_id = new.client_id and a.active and (a.temporary_until is null or a.temporary_until > now())) then
    raise exception 'Client must be assigned to a team member before recommendations can be published';
  end if;
  if tg_op = 'UPDATE' and old.status in ('published','superseded','withdrawn') and new.content is distinct from old.content then
    raise exception 'Published snapshots are immutable; create a new version';
  end if;
  return new;
end $$;
create trigger guard_publication before insert or update on public.published_snapshots for each row execute function public.guard_publication();
