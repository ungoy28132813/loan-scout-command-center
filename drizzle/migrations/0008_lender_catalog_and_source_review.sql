ALTER TABLE public.lender_products
  ADD COLUMN IF NOT EXISTS channel_scope text,
  ADD COLUMN IF NOT EXISTS source_verified_on date,
  ADD COLUMN IF NOT EXISTS published_apr_min numeric,
  ADD COLUMN IF NOT EXISTS published_apr_max numeric,
  ADD COLUMN IF NOT EXISTS apr_source_url text,
  ADD COLUMN IF NOT EXISTS apr_as_of date,
  ADD COLUMN IF NOT EXISTS product_note text;
COMMENT ON COLUMN public.lender_products.published_apr_min IS 'Marketed product-level APR range from the cited page; not a pricing matrix or an offer.';
CREATE UNIQUE INDEX IF NOT EXISTS lender_products_lender_name_uq ON public.lender_products (lender_id, name);

CREATE TABLE public.source_review_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.lender_products(id),
  seed_key text NOT NULL UNIQUE,
  criterion text NOT NULL,
  scope text NOT NULL,
  rule_key text,
  bureau text,
  score_model text,
  lookback_months integer,
  threshold numeric,
  representable boolean NOT NULL DEFAULT false,
  not_enforced_reason text,
  source_title text NOT NULL,
  source_url text NOT NULL,
  source_locator text,
  verified_on date NOT NULL,
  evidence_status text NOT NULL DEFAULT 'primary_source_pending_owner',
  review_status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  resulting_rule_id uuid REFERENCES public.lender_rules(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT src_review_status_chk CHECK (review_status IN ('pending','approved_active','kept_as_note','rejected')),
  CONSTRAINT src_evidence_chk CHECK (evidence_status IN ('primary_source_pending_owner','secondary_source_pending_owner')),
  CONSTRAINT src_repr_chk CHECK (NOT representable OR (rule_key IS NOT NULL AND threshold IS NOT NULL)),
  CONSTRAINT src_rule_key_chk CHECK (rule_key IS NULL OR rule_key IN ('min_score','max_inquiries','max_dti_pct','min_open_tradelines','min_months_since_bankruptcy','max_utilization_pct','min_months_in_business','min_annual_revenue','min_annual_income')),
  CONSTRAINT src_score_model_chk CHECK (rule_key IS DISTINCT FROM 'min_score' OR NOT representable OR (score_model IS NOT NULL AND bureau IS NOT NULL))
);
GRANT SELECT ON public.source_review_candidates TO authenticated;
GRANT ALL ON public.source_review_candidates TO service_role;
ALTER TABLE public.source_review_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read source candidates" ON public.source_review_candidates FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE TRIGGER audit_source_review_candidates AFTER INSERT OR UPDATE OR DELETE ON public.source_review_candidates FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- Owner-only review decisions. Only representable candidates can become active engine rules.
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
    insert into public.lender_rules (product_id, rule_key, bureau, score_model, lookback_months, threshold, source_tier, source_title, source_url, verified_on, stale_after_days, approval_status, version, proposed_by, approved_by, approved_at)
    values (c.product_id, c.rule_key, c.bureau, c.score_model, c.lookback_months, c.threshold, 'verified_primary', c.source_title || coalesce(' — ' || c.source_locator, ''), c.source_url, c.verified_on, 180, 'active', 1, auth.uid(), auth.uid(), now())
    returning id into rid;
    update public.source_review_candidates set review_status = 'approved_active', reviewed_by = auth.uid(), reviewed_at = now(), resulting_rule_id = rid where id = _id;
  elsif _decision = 'keep_note' then
    update public.source_review_candidates set review_status = 'kept_as_note', reviewed_by = auth.uid(), reviewed_at = now() where id = _id;
  elsif _decision = 'reject' then
    update public.source_review_candidates set review_status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now() where id = _id;
  else raise exception 'Unknown decision';
  end if;
  return rid;
end $$;
REVOKE ALL ON FUNCTION public.review_source_candidate(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_source_candidate(uuid, text) TO authenticated;