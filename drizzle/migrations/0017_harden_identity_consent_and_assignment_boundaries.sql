-- Replace dynamic SQL with a fixed permission map. The previous allowlist and identifier
-- quoting were defensive, but a static CASE removes the scanner finding entirely.
CREATE OR REPLACE FUNCTION public.has_perm(_uid uuid, _perm text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result boolean;
BEGIN
  IF public.is_owner(_uid) THEN RETURN true; END IF;
  IF NOT public.has_role(_uid, 'employee') THEN RETURN false; END IF;

  SELECT COALESCE(CASE _perm
    WHEN 'can_upload_docs' THEN p.can_upload_docs
    WHEN 'can_edit_extractions' THEN p.can_edit_extractions
    WHEN 'can_run_matching' THEN p.can_run_matching
    WHEN 'can_approve_publish' THEN p.can_approve_publish
    WHEN 'can_update_applications' THEN p.can_update_applications
    WHEN 'can_manage_readiness' THEN p.can_manage_readiness
    WHEN 'can_post_announcements' THEN p.can_post_announcements
    WHEN 'can_export_pdf' THEN p.can_export_pdf
    WHEN 'can_propose_rules' THEN p.can_propose_rules
    ELSE false
  END, false)
  INTO result
  FROM public.employee_permissions p
  WHERE p.user_id = _uid;

  RETURN COALESCE(result, false);
END
$$;

-- Staff no longer receive every user's profile merely by being staff.
CREATE OR REPLACE FUNCTION public.can_read_profile(_viewer uuid, _profile uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _viewer = _profile
    OR public.is_owner(_viewer)
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.user_id = _profile
        AND public.is_client_staff(_viewer, c.id)
    )
$$;
REVOKE ALL ON FUNCTION public.can_read_profile(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_profile(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "read own or staff reads" ON public.profiles;
CREATE POLICY "read own or authorized profiles" ON public.profiles
FOR SELECT TO authenticated
USING (public.can_read_profile(auth.uid(), id));

-- A deactivated employee must not retain even assignment metadata visibility.
DROP POLICY IF EXISTS "read assignments" ON public.client_assignments;
CREATE POLICY "read assignments" ON public.client_assignments
FOR SELECT TO authenticated
USING (
  public.is_owner(auth.uid())
  OR (employee_id = auth.uid() AND public.has_role(auth.uid(), 'employee'))
);

-- Preserve assignment identities and ensure active assignments name active employees.
CREATE OR REPLACE FUNCTION public.guard_client_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Only the owner can manage client assignments';
  END IF;
  IF TG_OP = 'UPDATE' AND (new.client_id IS DISTINCT FROM old.client_id OR new.employee_id IS DISTINCT FROM old.employee_id) THEN
    RAISE EXCEPTION 'Assignment identities are immutable; revoke and create a new assignment';
  END IF;
  IF new.active AND NOT public.has_role(new.employee_id, 'employee') THEN
    RAISE EXCEPTION 'Active assignments require an active employee';
  END IF;
  IF TG_OP = 'INSERT' THEN
    new.assigned_by := auth.uid();
  ELSE
    new.assigned_by := old.assigned_by;
  END IF;
  RETURN new;
END
$$;
DROP TRIGGER IF EXISTS guard_client_assignment ON public.client_assignments;
CREATE TRIGGER guard_client_assignment
BEFORE INSERT OR UPDATE ON public.client_assignments
FOR EACH ROW EXECUTE FUNCTION public.guard_client_assignment();
REVOKE ALL ON FUNCTION public.guard_client_assignment() FROM PUBLIC, anon, authenticated;

-- Only the current consent text authorizes client uploads and structured staging.
CREATE OR REPLACE FUNCTION public.has_client_consent(_uid uuid, _cid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    SELECT count(DISTINCT kind)
    FROM public.consents
    WHERE user_id = _uid
      AND client_id = _cid
      AND kind IN ('privacy_notice', 'report_analysis_authorization')
      AND version = '2026-11-v1'
  ) = 2
$$;

-- Record useful consent provenance without consent text or report contents.
CREATE OR REPLACE FUNCTION public.audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE rec jsonb; old_rec jsonb; cid uuid; changed text[];
BEGIN
  rec := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(old) ELSE to_jsonb(new) END;
  old_rec := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(old) ELSE NULL END;
  cid := CASE WHEN TG_TABLE_NAME = 'clients' THEN (rec->>'id')::uuid ELSE nullif(rec->>'client_id', '')::uuid END;
  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(k) INTO changed FROM jsonb_object_keys(rec) k
    WHERE rec->k IS DISTINCT FROM old_rec->k AND k NOT IN ('updated_at');
  END IF;
  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, client_id, metadata)
  VALUES (auth.uid(), lower(TG_OP), TG_TABLE_NAME, rec->>'id', cid,
    jsonb_build_object('changed_fields', to_jsonb(changed))
    || CASE WHEN TG_TABLE_NAME IN ('applications', 'match_results', 'published_snapshots', 'lender_rules', 'readiness_tasks') AND rec ? 'status'
      THEN jsonb_build_object('status', rec->>'status', 'prev_status', old_rec->>'status') ELSE '{}'::jsonb END
    || CASE WHEN TG_TABLE_NAME = 'match_results'
      THEN jsonb_build_object('review_status', rec->>'review_status') ELSE '{}'::jsonb END
    || CASE WHEN TG_TABLE_NAME = 'lender_rules'
      THEN jsonb_build_object('approval_status', rec->>'approval_status') ELSE '{}'::jsonb END
    || CASE WHEN TG_TABLE_NAME = 'consents'
      THEN jsonb_build_object('kind', rec->>'kind', 'version', rec->>'version', 'accepted_at', rec->>'accepted_at') ELSE '{}'::jsonb END);
  RETURN NULL;
END
$$;
REVOKE ALL ON FUNCTION public.audit_trigger() FROM PUBLIC, anon, authenticated;