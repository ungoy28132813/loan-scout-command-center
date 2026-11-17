CREATE TABLE public.goal_questionnaire_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  goal_id uuid NOT NULL REFERENCES public.funding_goals(id) ON DELETE CASCADE,
  question_key text NOT NULL,
  value_numeric numeric,
  value_text text,
  status text NOT NULL DEFAULT 'unknown',
  verified boolean NOT NULL DEFAULT false,
  financial_source text NOT NULL DEFAULT 'self_reported',
  answered_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (goal_id, question_key),
  CONSTRAINT goal_answer_status_chk CHECK (status IN ('answered','unknown','skipped')),
  CONSTRAINT goal_answer_source_chk CHECK (financial_source IN ('self_reported','staff_entered','document_backed')),
  CONSTRAINT goal_answer_key_chk CHECK (question_key ~ '^[a-z][a-z0-9_]{1,119}$'),
  CONSTRAINT goal_answer_value_chk CHECK ((status = 'answered' AND ((value_numeric IS NOT NULL)::integer + (value_text IS NOT NULL)::integer) = 1) OR (status <> 'answered' AND value_numeric IS NULL AND value_text IS NULL)),
  CONSTRAINT goal_answer_nonnegative_chk CHECK (value_numeric IS NULL OR value_numeric >= 0),
  CONSTRAINT goal_answer_text_size_chk CHECK (value_text IS NULL OR char_length(value_text) BETWEEN 1 AND 500),
  CONSTRAINT goal_answer_verified_chk CHECK (NOT verified OR status = 'answered'),
  CONSTRAINT goal_answer_application_chk CHECK (question_key <> 'application_mode' OR status <> 'answered' OR value_text IN ('individual','joint')),
  CONSTRAINT goal_answer_deposit_chk CHECK (question_key <> 'direct_deposit' OR status <> 'answered' OR value_text IN ('yes','no'))
);
GRANT SELECT, INSERT, UPDATE ON public.goal_questionnaire_answers TO authenticated;
GRANT ALL ON public.goal_questionnaire_answers TO service_role;
ALTER TABLE public.goal_questionnaire_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read goal answers" ON public.goal_questionnaire_answers FOR SELECT TO authenticated USING (public.can_access_client(auth.uid(), client_id));
CREATE POLICY "insert goal answers" ON public.goal_questionnaire_answers FOR INSERT TO authenticated WITH CHECK (public.can_access_client(auth.uid(), client_id));
CREATE POLICY "update goal answers" ON public.goal_questionnaire_answers FOR UPDATE TO authenticated USING (public.can_access_client(auth.uid(), client_id)) WITH CHECK (public.can_access_client(auth.uid(), client_id));
CREATE TRIGGER audit_goal_questionnaire_answers AFTER INSERT OR UPDATE OR DELETE ON public.goal_questionnaire_answers FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

CREATE OR REPLACE FUNCTION public.guard_goal_answer_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $function$
begin
  if tg_op = 'UPDATE' and (new.goal_id is distinct from old.goal_id or new.client_id is distinct from old.client_id) then
    raise exception 'A goal answer cannot be moved to another goal or client';
  end if;
  if not exists (select 1 from public.funding_goals g where g.id = new.goal_id and g.client_id = new.client_id) then
    raise exception 'Goal answer belongs to a different client';
  end if;
  if not public.is_client_staff(auth.uid(), new.client_id) and (new.verified or new.financial_source <> 'self_reported') then
    raise exception 'Clients cannot self-verify goal answers';
  end if;
  if new.status <> 'answered' then new.verified := false; end if;
  new.answered_by := auth.uid();
  new.updated_at := now();
  return new;
end $function$;
CREATE TRIGGER guard_goal_answer_write BEFORE INSERT OR UPDATE ON public.goal_questionnaire_answers FOR EACH ROW EXECUTE FUNCTION public.guard_goal_answer_write();
CREATE INDEX goal_questionnaire_answers_client_idx ON public.goal_questionnaire_answers(client_id);

ALTER TABLE public.lender_rules
  ADD COLUMN IF NOT EXISTS input_key text,
  ADD COLUMN IF NOT EXISTS text_threshold text,
  ADD COLUMN IF NOT EXISTS application_mode text NOT NULL DEFAULT 'any',
  ADD COLUMN IF NOT EXISTS requires_verified_facts boolean NOT NULL DEFAULT false;
ALTER TABLE public.lender_rules ADD CONSTRAINT lender_rules_input_key_chk CHECK (input_key IS NULL OR input_key ~ '^[a-z][a-z0-9_]{1,119}$');
ALTER TABLE public.lender_rules ADD CONSTRAINT lender_rules_application_chk CHECK (application_mode IN ('any','individual','joint'));
ALTER TABLE public.lender_rules ADD CONSTRAINT lender_rules_text_threshold_chk CHECK (text_threshold IS NULL OR char_length(text_threshold) BETWEEN 1 AND 200);

ALTER TABLE public.source_review_candidates
  ADD COLUMN IF NOT EXISTS input_key text,
  ADD COLUMN IF NOT EXISTS text_threshold text,
  ADD COLUMN IF NOT EXISTS application_mode text NOT NULL DEFAULT 'any',
  ADD COLUMN IF NOT EXISTS requires_verified_facts boolean NOT NULL DEFAULT false;
ALTER TABLE public.source_review_candidates ADD CONSTRAINT src_input_key_chk CHECK (input_key IS NULL OR input_key ~ '^[a-z][a-z0-9_]{1,119}$');
ALTER TABLE public.source_review_candidates ADD CONSTRAINT src_application_chk CHECK (application_mode IN ('any','individual','joint'));
ALTER TABLE public.source_review_candidates ADD CONSTRAINT src_text_threshold_chk CHECK (text_threshold IS NULL OR char_length(text_threshold) BETWEEN 1 AND 200);
ALTER TABLE public.source_review_candidates DROP CONSTRAINT src_repr_chk;
ALTER TABLE public.source_review_candidates ADD CONSTRAINT src_repr_chk CHECK (NOT representable OR (rule_key IS NOT NULL AND (threshold IS NOT NULL OR (rule_key = 'allowed_states' AND text_threshold IS NOT NULL))));
ALTER TABLE public.source_review_candidates DROP CONSTRAINT src_rule_key_chk;
ALTER TABLE public.source_review_candidates ADD CONSTRAINT src_rule_key_chk CHECK (rule_key IS NULL OR rule_key IN ('min_score','max_inquiries','max_dti_pct','min_open_tradelines','min_months_since_bankruptcy','max_utilization_pct','min_months_in_business','min_annual_revenue','min_annual_income','min_existing_product_months','min_membership_months','requires_direct_deposit','max_late_payments','max_delinquent_accounts','max_collections','max_chargeoffs','min_banking_history_months','min_average_monthly_deposits','min_owner_share_pct','allowed_states'));

-- Backfill only the new application-scope column for the already isolated Note Channel candidates.
UPDATE public.source_review_candidates c SET application_mode = 'individual'
FROM public.lender_products p
WHERE p.id = c.product_id AND p.channel_scope ILIKE '%Prosper Note Channel%';

CREATE OR REPLACE FUNCTION public.review_source_candidate(_id uuid, _decision text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare c public.source_review_candidates; rid uuid;
begin
  if not public.is_owner(auth.uid()) then raise exception 'Only the owner can review lender sources'; end if;
  select * into c from public.source_review_candidates where id = _id for update;
  if not found then raise exception 'Candidate not found'; end if;
  if c.review_status <> 'pending' then raise exception 'Candidate already reviewed'; end if;
  if _decision = 'approve_active' then
    if not c.representable then raise exception 'This criterion cannot be enforced safely by the engine; keep it as a source note'; end if;
    if c.evidence_status <> 'primary_source_pending_owner' then raise exception 'Secondary sources cannot become verified engine rules'; end if;
    insert into public.lender_rules (product_id, rule_key, bureau, score_model, lookback_months, threshold, text_threshold, input_key, application_mode, requires_verified_facts, source_tier, source_title, source_url, verified_on, effective_date, stale_after_days, approval_status, version, proposed_by, approved_by, approved_at)
    values (c.product_id, c.rule_key, c.bureau, c.score_model, c.lookback_months, coalesce(c.threshold, 0), c.text_threshold, c.input_key, c.application_mode, c.requires_verified_facts, 'verified_primary', c.source_title || coalesce(' — ' || c.source_locator, ''), c.source_url, c.verified_on, c.effective_date, c.stale_after_days, 'active', 1, auth.uid(), auth.uid(), now())
    returning id into rid;
    update public.source_review_candidates set review_status = 'approved_active', reviewed_by = auth.uid(), reviewed_at = now(), resulting_rule_id = rid where id = _id;
  elsif _decision = 'keep_note' then
    update public.source_review_candidates set review_status = 'kept_as_note', reviewed_by = auth.uid(), reviewed_at = now() where id = _id;
  elsif _decision = 'reject' then
    update public.source_review_candidates set review_status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now() where id = _id;
  else raise exception 'Unknown decision'; end if;
  return rid;
end $$;
REVOKE ALL ON FUNCTION public.review_source_candidate(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_source_candidate(uuid, text) TO authenticated;

COMMENT ON TABLE public.goal_questionnaire_answers IS 'Goal-specific conditional answers. Unknown and skipped values remain null; clients cannot self-verify.';
COMMENT ON COLUMN public.lender_rules.input_key IS 'Optional goal/business answer key for product-specific evidence; never inferred from another product or business.';
COMMENT ON COLUMN public.lender_rules.application_mode IS 'Rule applies only to the documented application mode. Unsupported joint applications remain Needs Review.';
COMMENT ON COLUMN public.lender_rules.requires_verified_facts IS 'When true, self-reported or unverified inputs produce Unknown rather than pass or fail.';