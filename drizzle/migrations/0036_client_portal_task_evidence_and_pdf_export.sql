ALTER TABLE public.readiness_tasks
  ADD COLUMN evidence_document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  ADD COLUMN position integer NOT NULL DEFAULT 100,
  ADD COLUMN client_completed_at timestamptz,
  ADD COLUMN verified_at timestamptz;

ALTER TABLE public.readiness_tasks
  ADD CONSTRAINT readiness_tasks_position_check CHECK (position BETWEEN 1 AND 9999);

CREATE OR REPLACE FUNCTION public.guard_readiness_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF new.evidence_document_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = new.evidence_document_id AND d.client_id = new.client_id
  ) THEN
    RAISE EXCEPTION 'Evidence document must belong to the same client';
  END IF;

  IF tg_op = 'UPDATE' THEN
    IF new.status = 'verified' AND old.status IS DISTINCT FROM 'verified' THEN
      IF NOT public.is_client_staff(auth.uid(), new.client_id)
         OR NOT public.has_perm(auth.uid(), 'can_manage_readiness') THEN
        RAISE EXCEPTION 'Only authorized staff can verify a task';
      END IF;
      new.verified_by = auth.uid();
      new.verified_at = now();
    ELSIF new.status <> 'verified' THEN
      new.verified_by = NULL;
      new.verified_at = NULL;
    END IF;

    IF new.status = 'client_marked_done' AND old.status IS DISTINCT FROM 'client_marked_done' THEN
      new.client_completed_at = coalesce(new.client_completed_at, now());
    ELSIF new.status = 'open' THEN
      new.client_completed_at = NULL;
    END IF;
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS guard_readiness_task ON public.readiness_tasks;
CREATE TRIGGER guard_readiness_task
BEFORE INSERT OR UPDATE ON public.readiness_tasks
FOR EACH ROW EXECUTE FUNCTION public.guard_readiness_task();

CREATE OR REPLACE FUNCTION public.client_mark_task(_task uuid, _note text, _evidence_document_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE t record;
BEGIN
  SELECT * INTO t FROM public.readiness_tasks WHERE id = _task;
  IF NOT found OR NOT t.published OR NOT public.is_client_self(auth.uid(), t.client_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF t.status = 'verified' THEN RAISE EXCEPTION 'already verified'; END IF;
  IF _evidence_document_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = _evidence_document_id
      AND d.client_id = t.client_id
      AND d.uploaded_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Evidence must be your own document for this client';
  END IF;
  UPDATE public.readiness_tasks
  SET status = 'client_marked_done',
      client_note = left(coalesce(_note, ''), 2000),
      evidence_document_id = _evidence_document_id,
      client_completed_at = now(),
      verified_by = NULL,
      verified_at = NULL
  WHERE id = _task;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.client_mark_task(uuid, text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.client_mark_task(uuid, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_publication()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF new.status = 'scheduled' AND (tg_op = 'INSERT' OR old.status <> 'scheduled') THEN
    RAISE EXCEPTION 'Automatic scheduled publishing is unavailable; save a draft and publish manually after staff approval';
  END IF;
  IF new.status = 'published' AND NOT EXISTS (
    SELECT 1 FROM public.client_assignments a
    WHERE a.client_id = new.client_id AND a.active
      AND (a.temporary_until IS NULL OR a.temporary_until > now())
  ) THEN
    RAISE EXCEPTION 'Client must be assigned to a team member before recommendations can be published';
  END IF;
  IF tg_op = 'UPDATE' AND old.status IN ('published','superseded','withdrawn')
     AND new.content IS DISTINCT FROM old.content THEN
    RAISE EXCEPTION 'Published snapshots are immutable; create a new version';
  END IF;
  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_strategy_export(_snapshot_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE s record;
DECLARE client_name text;
BEGIN
  SELECT * INTO s FROM public.published_snapshots WHERE id = _snapshot_id;
  IF NOT found THEN RAISE EXCEPTION 'Strategy not found'; END IF;
  IF NOT (
    public.is_client_self(auth.uid(), s.client_id)
    OR (public.is_client_staff(auth.uid(), s.client_id) AND public.has_perm(auth.uid(), 'can_export_pdf'))
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF s.status <> 'published' THEN RAISE EXCEPTION 'Only a currently published strategy can be exported'; END IF;

  SELECT display_name INTO client_name FROM public.clients WHERE id = s.client_id;
  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, client_id, metadata)
  VALUES (auth.uid(), 'export_pdf', 'published_snapshots', s.id::text, s.client_id, jsonb_build_object('version', s.version));

  RETURN jsonb_build_object(
    'client_name', client_name,
    'snapshot_id', s.id,
    'version', s.version,
    'published_at', s.published_at,
    'content', s.content
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.prepare_strategy_export(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.prepare_strategy_export(uuid) TO authenticated;
