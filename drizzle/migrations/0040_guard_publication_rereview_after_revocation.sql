CREATE OR REPLACE FUNCTION public.guard_publication() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF TG_OP = 'UPDATE' AND NEW.client_id IS DISTINCT FROM OLD.client_id THEN
   RAISE EXCEPTION 'Snapshot client ownership is immutable';
 END IF;
 IF NEW.status = 'scheduled' AND (TG_OP = 'INSERT' OR OLD.status <> 'scheduled') THEN
   RAISE EXCEPTION 'Automatic scheduled publishing is unavailable; save a draft and publish manually after staff approval';
 END IF;
 IF NEW.status = 'published' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published') AND NOT EXISTS (
   SELECT 1 FROM public.client_assignments a
   WHERE a.client_id = NEW.client_id AND a.active
     AND (a.temporary_until IS NULL OR a.temporary_until > now())
     AND public.has_role(a.employee_id,'employee')
 ) THEN
   RAISE EXCEPTION 'Client must be assigned to an active team member before recommendations can be published';
 END IF;
 IF TG_OP = 'UPDATE' AND OLD.status IN ('published','superseded','withdrawn') AND NEW.content IS DISTINCT FROM OLD.content THEN
   RAISE EXCEPTION 'Published snapshots are immutable; create a new version';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.guard_publication() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_application_links(), public.guard_application_outcome(), public.guard_business_answer_link(), public.guard_business_profile_write(), public.guard_funding_goal_business_link(), public.guard_funding_strategy(), public.guard_goal_answer_write(), public.guard_readiness_task() FROM PUBLIC, anon, authenticated;