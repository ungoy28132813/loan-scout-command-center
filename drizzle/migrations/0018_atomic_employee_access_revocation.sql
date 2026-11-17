CREATE OR REPLACE FUNCTION public.deactivate_employee(_employee_id uuid, _transfer_to uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Only the owner can revoke employee access';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _employee_id AND role = 'employee'
  ) THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;
  IF _transfer_to IS NOT NULL AND (
    _transfer_to = _employee_id OR NOT public.has_role(_transfer_to, 'employee')
  ) THEN
    RAISE EXCEPTION 'Transfer requires another active employee';
  END IF;

  WITH revoked AS (
    UPDATE public.client_assignments
    SET active = false
    WHERE employee_id = _employee_id AND active
    RETURNING client_id
  ), transferred AS (
    INSERT INTO public.client_assignments (client_id, employee_id, active, assigned_by)
    SELECT r.client_id, _transfer_to, true, auth.uid()
    FROM revoked r
    WHERE _transfer_to IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.client_assignments a
        WHERE a.client_id = r.client_id
          AND a.employee_id = _transfer_to
          AND a.active
      )
    RETURNING id
  )
  UPDATE public.profiles SET active = false WHERE id = _employee_id;
END
$$;
REVOKE ALL ON FUNCTION public.deactivate_employee(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deactivate_employee(uuid, uuid) TO authenticated;