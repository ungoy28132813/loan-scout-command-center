ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS industry text,
  ADD COLUMN IF NOT EXISTS location_state text,
  ADD COLUMN IF NOT EXISTS formation_date date,
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS monthly_revenue numeric,
  ADD COLUMN IF NOT EXISTS monthly_net_cash_flow numeric,
  ADD COLUMN IF NOT EXISTS existing_monthly_debt_payments numeric,
  ADD COLUMN IF NOT EXISTS banking_history_months integer,
  ADD COLUMN IF NOT EXISTS average_monthly_deposits numeric,
  ADD COLUMN IF NOT EXISTS owner_share_pct numeric,
  ADD COLUMN IF NOT EXISTS business_credit_score numeric,
  ADD COLUMN IF NOT EXISTS business_credit_model text,
  ADD COLUMN IF NOT EXISTS business_credit_source_url text,
  ADD COLUMN IF NOT EXISTS business_credit_verified_on date,
  ADD COLUMN IF NOT EXISTS financial_source text NOT NULL DEFAULT 'self_reported',
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'self_reported',
  ADD COLUMN IF NOT EXISTS source_note text,
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.business_profiles ADD CONSTRAINT business_profiles_lifecycle_check CHECK (lifecycle_status IN ('startup','established','unknown'));
ALTER TABLE public.business_profiles ADD CONSTRAINT business_profiles_source_check CHECK (financial_source IN ('self_reported','staff_entered','document_backed'));
ALTER TABLE public.business_profiles ADD CONSTRAINT business_profiles_verification_check CHECK (verification_status IN ('self_reported','reviewed','verified'));
ALTER TABLE public.business_profiles ADD CONSTRAINT business_profiles_owner_share_check CHECK (owner_share_pct IS NULL OR (owner_share_pct >= 0 AND owner_share_pct <= 100));
ALTER TABLE public.business_profiles ADD CONSTRAINT business_profiles_nonnegative_financials_check CHECK ((monthly_revenue IS NULL OR monthly_revenue >= 0) AND (existing_monthly_debt_payments IS NULL OR existing_monthly_debt_payments >= 0) AND (average_monthly_deposits IS NULL OR average_monthly_deposits >= 0) AND (banking_history_months IS NULL OR banking_history_months >= 0));

CREATE OR REPLACE FUNCTION public.guard_business_profile_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $function$
begin
  if (new.business_credit_score is not null or new.business_credit_model is not null) and (new.business_credit_source_url is null or new.business_credit_verified_on is null) then
    raise exception 'Business credit information requires a source URL and source date';
  end if;
  if not public.is_client_staff(auth.uid(), new.client_id) then
    if tg_op = 'INSERT' and (new.verification_status <> 'self_reported' or new.financial_source <> 'self_reported' or new.verified_by is not null or new.verified_at is not null) then
      raise exception 'Clients cannot self-verify business financial information';
    end if;
    if tg_op = 'UPDATE' and (new.verification_status is distinct from old.verification_status or new.financial_source is distinct from old.financial_source or new.verified_by is distinct from old.verified_by or new.verified_at is distinct from old.verified_at) then
      raise exception 'Only assigned staff can change business verification or provenance';
    end if;
  elsif new.verification_status = 'verified' and (old is null or old.verification_status is distinct from 'verified') then
    new.verified_by := auth.uid(); new.verified_at := now();
  end if;
  if new.verification_status <> 'verified' then new.verified_by := null; new.verified_at := null; end if;
  new.updated_at := now();
  return new;
end $function$;
CREATE TRIGGER guard_business_profile_write BEFORE INSERT OR UPDATE ON public.business_profiles FOR EACH ROW EXECUTE FUNCTION public.guard_business_profile_write();

CREATE OR REPLACE FUNCTION public.guard_funding_goal_business_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $function$
begin
  if new.goal_type = 'personal' and new.business_profile_id is not null then raise exception 'Personal goals cannot link to a business profile'; end if;
  if new.goal_type = 'business' and new.business_profile_id is null then raise exception 'Choose a business profile for a business goal'; end if;
  if new.business_profile_id is not null and not exists (select 1 from public.business_profiles b where b.id = new.business_profile_id and b.client_id = new.client_id) then raise exception 'Business profile belongs to a different client'; end if;
  return new;
end $function$;
CREATE TRIGGER guard_funding_goal_business_link BEFORE INSERT OR UPDATE ON public.funding_goals FOR EACH ROW EXECUTE FUNCTION public.guard_funding_goal_business_link();

CREATE TABLE public.business_questionnaire_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  business_profile_id uuid NOT NULL REFERENCES public.business_profiles(id) ON DELETE CASCADE,
  question_key text NOT NULL,
  value_numeric numeric,
  value_text text,
  status text NOT NULL DEFAULT 'unknown' CHECK (status IN ('answered','unknown','skipped')),
  verified boolean NOT NULL DEFAULT false,
  financial_source text NOT NULL DEFAULT 'self_reported' CHECK (financial_source IN ('self_reported','staff_entered','document_backed')),
  answered_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_profile_id, question_key)
);
GRANT SELECT, INSERT, UPDATE ON public.business_questionnaire_answers TO authenticated;
GRANT ALL ON public.business_questionnaire_answers TO service_role;
ALTER TABLE public.business_questionnaire_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read business answers" ON public.business_questionnaire_answers FOR SELECT TO authenticated USING (public.can_access_client(auth.uid(),client_id));
CREATE POLICY "insert business answers" ON public.business_questionnaire_answers FOR INSERT TO authenticated WITH CHECK (public.can_access_client(auth.uid(),client_id) AND ((verified=false AND financial_source='self_reported') OR public.is_client_staff(auth.uid(),client_id)));
CREATE POLICY "update business answers" ON public.business_questionnaire_answers FOR UPDATE TO authenticated USING (public.can_access_client(auth.uid(),client_id)) WITH CHECK (public.can_access_client(auth.uid(),client_id) AND ((verified=false AND financial_source='self_reported') OR public.is_client_staff(auth.uid(),client_id)));
CREATE TRIGGER audit_business_questionnaire_answers AFTER INSERT OR UPDATE OR DELETE ON public.business_questionnaire_answers FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

CREATE OR REPLACE FUNCTION public.guard_business_answer_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $function$
begin
  if not exists (select 1 from public.business_profiles b where b.id=new.business_profile_id and b.client_id=new.client_id) then raise exception 'Business answer belongs to a different client'; end if;
  if not public.is_client_staff(auth.uid(),new.client_id) and (new.verified or new.financial_source <> 'self_reported') then raise exception 'Clients cannot self-verify business answers'; end if;
  new.updated_at := now();
  return new;
end $function$;
CREATE TRIGGER guard_business_answer_link BEFORE INSERT OR UPDATE ON public.business_questionnaire_answers FOR EACH ROW EXECUTE FUNCTION public.guard_business_answer_link();
CREATE INDEX IF NOT EXISTS funding_goals_business_profile_idx ON public.funding_goals(business_profile_id);
CREATE INDEX IF NOT EXISTS business_profiles_client_idx ON public.business_profiles(client_id);