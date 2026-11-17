ALTER TABLE public.applications
  ADD COLUMN goal_id uuid REFERENCES public.funding_goals(id) ON DELETE SET NULL,
  ADD COLUMN match_result_id uuid REFERENCES public.match_results(id) ON DELETE SET NULL;

CREATE TABLE public.application_outcomes (
  application_id uuid PRIMARY KEY REFERENCES public.applications(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  outcome_source text NOT NULL DEFAULT 'unknown' CHECK (outcome_source IN ('unknown','client_self_report','staff_observed','lender_document','lender_portal','lender_direct_confirmation')),
  verification_status text NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified','staff_verified')),
  outcome_date date,
  approved_amount numeric CHECK (approved_amount IS NULL OR approved_amount >= 0),
  approved_apr numeric CHECK (approved_apr IS NULL OR approved_apr >= 0),
  approved_term_months integer CHECK (approved_term_months IS NULL OR approved_term_months > 0),
  denial_reason text,
  denial_bureau text,
  denial_score_model text,
  evidence_document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  source_note text,
  reported_at timestamptz NOT NULL DEFAULT now(),
  verified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  verified_at timestamptz,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.application_outcomes TO authenticated;
GRANT ALL ON public.application_outcomes TO service_role;
ALTER TABLE public.application_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read application outcomes" ON public.application_outcomes FOR SELECT TO authenticated
  USING (public.is_client_staff(auth.uid(), client_id));
CREATE POLICY "staff insert application outcomes" ON public.application_outcomes FOR INSERT TO authenticated
  WITH CHECK (public.is_client_staff(auth.uid(), client_id) AND public.has_perm(auth.uid(), 'can_update_applications'));
CREATE POLICY "staff update application outcomes" ON public.application_outcomes FOR UPDATE TO authenticated
  USING (public.is_client_staff(auth.uid(), client_id) AND public.has_perm(auth.uid(), 'can_update_applications'))
  WITH CHECK (public.is_client_staff(auth.uid(), client_id) AND public.has_perm(auth.uid(), 'can_update_applications'));

CREATE OR REPLACE FUNCTION public.guard_application_links()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_goal public.funding_goals; v_match public.match_results;
BEGIN
  IF NEW.goal_id IS NOT NULL THEN
    SELECT * INTO v_goal FROM public.funding_goals WHERE id = NEW.goal_id;
    IF NOT FOUND OR v_goal.client_id <> NEW.client_id THEN RAISE EXCEPTION 'Application goal must belong to the same client'; END IF;
  END IF;
  IF NEW.match_result_id IS NOT NULL THEN
    SELECT * INTO v_match FROM public.match_results WHERE id = NEW.match_result_id;
    IF NOT FOUND OR v_match.client_id <> NEW.client_id THEN RAISE EXCEPTION 'Recommendation must belong to the same client'; END IF;
    IF NEW.product_id IS NOT NULL AND v_match.product_id <> NEW.product_id THEN RAISE EXCEPTION 'Recommendation and application products must match'; END IF;
  END IF;
  NEW.updated_by := auth.uid();
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status_date = OLD.status_date THEN
    NEW.status_date := now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_application_links BEFORE INSERT OR UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.guard_application_links();

CREATE OR REPLACE FUNCTION public.guard_application_outcome()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_application public.applications; v_document public.documents;
BEGIN
  SELECT * INTO v_application FROM public.applications WHERE id = NEW.application_id;
  IF NOT FOUND OR v_application.client_id <> NEW.client_id THEN RAISE EXCEPTION 'Outcome and application must belong to the same client'; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.application_id <> OLD.application_id OR NEW.client_id <> OLD.client_id) THEN
    RAISE EXCEPTION 'Outcome application and client are immutable';
  END IF;
  IF NEW.evidence_document_id IS NOT NULL THEN
    SELECT * INTO v_document FROM public.documents WHERE id = NEW.evidence_document_id;
    IF NOT FOUND OR v_document.client_id <> NEW.client_id THEN RAISE EXCEPTION 'Evidence document must belong to the same client'; END IF;
  END IF;
  IF char_length(coalesce(NEW.denial_reason, '')) > 4000 OR char_length(coalesce(NEW.source_note, '')) > 4000
    OR char_length(coalesce(NEW.denial_bureau, '')) > 120 OR char_length(coalesce(NEW.denial_score_model, '')) > 120 THEN
    RAISE EXCEPTION 'Outcome text is too long';
  END IF;
  IF NEW.verification_status = 'staff_verified' THEN
    IF NEW.outcome_source NOT IN ('lender_document','lender_portal','lender_direct_confirmation') THEN
      RAISE EXCEPTION 'Verified outcomes require lender-sourced evidence';
    END IF;
    IF NEW.evidence_document_id IS NULL AND char_length(trim(coalesce(NEW.source_note, ''))) < 2 THEN
      RAISE EXCEPTION 'Verified outcomes require an evidence document or source note';
    END IF;
    NEW.verified_by := auth.uid();
    NEW.verified_at := now();
  ELSE
    NEW.verified_by := NULL;
    NEW.verified_at := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER guard_application_outcome BEFORE INSERT OR UPDATE ON public.application_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.guard_application_outcome();
CREATE TRIGGER audit_application_outcomes AFTER INSERT OR UPDATE OR DELETE ON public.application_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();