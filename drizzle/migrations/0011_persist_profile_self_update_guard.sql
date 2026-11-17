CREATE OR REPLACE FUNCTION public.guard_profile_self_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is not null then
    if new.email is distinct from old.email then
      raise exception 'Profile email is managed by verified authentication, not editable here';
    end if;
    if not public.is_owner(auth.uid()) and
       (new.active is distinct from old.active or
        new.department is distinct from old.department) then
      raise exception 'Only owner may change employee activation or department';
    end if;
  end if;
  return new;
end $function$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'guard_profile_self_update'
      AND tgrelid = 'public.profiles'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER guard_profile_self_update
      BEFORE UPDATE ON public.profiles
      FOR EACH ROW EXECUTE FUNCTION public.guard_profile_self_update();
  END IF;
END $guard$;

REVOKE ALL ON FUNCTION public.guard_profile_self_update() FROM PUBLIC, anon, authenticated;