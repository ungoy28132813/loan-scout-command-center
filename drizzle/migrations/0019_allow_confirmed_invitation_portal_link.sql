CREATE OR REPLACE FUNCTION public.guard_client_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Auth lifecycle triggers run without a browser JWT. They may complete the
  -- invitation-selected link; signed-in non-owners remain blocked.
  IF auth.uid() IS NOT NULL
     AND new.user_id IS DISTINCT FROM old.user_id
     AND NOT public.is_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Only the owner can change a client''s portal account';
  END IF;
  RETURN new;
END
$$;
REVOKE ALL ON FUNCTION public.guard_client_update() FROM PUBLIC, anon, authenticated;