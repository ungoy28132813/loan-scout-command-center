CREATE TABLE public.product_research_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.lender_products(id),
  source_url text NOT NULL,
  source_title text NOT NULL,
  source_excerpt text,
  source_locator text,
  retrieval_method text NOT NULL DEFAULT 'manual',
  source_tier text NOT NULL DEFAULT 'official_primary',
  channel_scope text NOT NULL,
  version_label text,
  effective_date date,
  source_checked_on date NOT NULL,
  retrieved_at timestamptz,
  content_sha256 text,
  proposed_changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  review_status text NOT NULL DEFAULT 'pending',
  submitted_by uuid NOT NULL,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_research_method_chk CHECK (retrieval_method IN ('server_fetch','manual')),
  CONSTRAINT product_research_tier_chk CHECK (source_tier IN ('official_primary','secondary_source')),
  CONSTRAINT product_research_status_chk CHECK (review_status IN ('pending','approved_applied','approved_note','rejected')),
  CONSTRAINT product_research_excerpt_size_chk CHECK (source_excerpt IS NULL OR char_length(source_excerpt) <= 12000),
  CONSTRAINT product_research_changes_object_chk CHECK (jsonb_typeof(proposed_changes) = 'object')
);
GRANT SELECT ON public.product_research_sources TO authenticated;
GRANT ALL ON public.product_research_sources TO service_role;
ALTER TABLE public.product_research_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read product research" ON public.product_research_sources FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE TRIGGER audit_product_research_sources AFTER INSERT OR UPDATE OR DELETE ON public.product_research_sources FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

ALTER TABLE public.source_review_candidates
  ADD COLUMN IF NOT EXISTS effective_date date,
  ADD COLUMN IF NOT EXISTS stale_after_days integer NOT NULL DEFAULT 180,
  ADD COLUMN IF NOT EXISTS source_excerpt text,
  ADD COLUMN IF NOT EXISTS version_label text;

CREATE OR REPLACE FUNCTION public.submit_product_research(_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare
  v_product public.lender_products;
  v_id uuid;
  v_url text := left(coalesce(_payload->>'source_url', ''), 2000);
  v_tier text := coalesce(_payload->>'source_tier', 'official_primary');
  v_method text := coalesce(_payload->>'retrieval_method', 'manual');
  v_changes jsonb := coalesce(_payload->'proposed_changes', '{}'::jsonb);
  v_base text;
  v_host text;
  v_key text;
  v_number numeric;
begin
  if auth.uid() is null or not (public.is_owner(auth.uid()) or public.has_perm(auth.uid(), 'can_propose_rules')) then
    raise exception 'Lender research permission required';
  end if;
  if _payload is null or jsonb_typeof(_payload) <> 'object' or jsonb_typeof(v_changes) <> 'object' then
    raise exception 'Invalid research payload';
  end if;
  select * into v_product from public.lender_products where id = (_payload->>'product_id')::uuid;
  if not found then raise exception 'Product not found'; end if;
  if v_tier not in ('official_primary','secondary_source') or v_method not in ('server_fetch','manual') then
    raise exception 'Invalid source classification';
  end if;
  if v_url !~ '^https://' or position('@' in v_url) > 0 then
    raise exception 'A credential-free HTTPS source URL is required';
  end if;
  if v_tier = 'official_primary' then
    if v_product.official_url is null or v_product.official_url !~ '^https://' then
      raise exception 'The product needs an official HTTPS URL';
    end if;
    v_base := regexp_replace(split_part(lower(coalesce((regexp_match(v_product.official_url, '^https://([^/]+)'))[1], '')), ':', 1), '^www\.', '');
    v_host := regexp_replace(split_part(lower(coalesce((regexp_match(v_url, '^https://([^/]+)'))[1], '')), ':', 1), '^www\.', '');
    if v_base = '' or not (v_host = v_base or v_host like '%.' || v_base) then
      raise exception 'Official research must stay on the product website';
    end if;
    if v_changes ? 'official_url' then
      v_host := regexp_replace(split_part(lower(coalesce((regexp_match(v_changes->>'official_url', '^https://([^/]+)'))[1], '')), ':', 1), '^www\.', '');
      if position('@' in coalesce(v_changes->>'official_url', '')) > 0 or not (v_host = v_base or v_host like '%.' || v_base) then
        raise exception 'A proposed official URL must stay on the product website';
      end if;
    end if;
  end if;
  if char_length(coalesce(_payload->>'source_title', '')) < 2 or char_length(coalesce(_payload->>'source_title', '')) > 300 then
    raise exception 'Source title is required and must be at most 300 characters';
  end if;
  if char_length(coalesce(_payload->>'source_excerpt', '')) > 12000 or char_length(coalesce(_payload->>'channel_scope', '')) < 2 or char_length(coalesce(_payload->>'channel_scope', '')) > 500 then
    raise exception 'Excerpt or channel scope is invalid';
  end if;
  if octet_length(v_changes::text) > 12000 then raise exception 'Too many proposed changes'; end if;
  for v_key in select jsonb_object_keys(v_changes) loop
    if v_key not in ('official_url','published_min_amount','published_max_amount','published_apr_min','published_apr_max','product_note','channel_scope','amount_kind','apr_as_of') then
      raise exception 'Unsupported proposed product field: %', v_key;
    end if;
    if v_key in ('published_min_amount','published_max_amount','published_apr_min','published_apr_max') then
      if jsonb_typeof(v_changes->v_key) <> 'number' then raise exception 'Proposed numeric values must be JSON numbers'; end if;
      v_number := (v_changes->>v_key)::numeric;
      if v_number < 0 or v_number > 1000000000 or (v_key like 'published_apr%' and v_number > 100) then
        raise exception 'Proposed numeric value is outside the allowed range';
      end if;
    end if;
  end loop;
  if (v_changes->>'amount_kind') is not null and v_changes->>'amount_kind' not in ('unknown','loan_cash','credit_limit','available_credit') then
    raise exception 'Invalid amount kind';
  end if;
  if (v_changes ? 'published_min_amount') and (v_changes ? 'published_max_amount') and (v_changes->>'published_min_amount')::numeric > (v_changes->>'published_max_amount')::numeric then
    raise exception 'Minimum amount cannot exceed maximum amount';
  end if;
  if (v_changes ? 'published_apr_min') and (v_changes ? 'published_apr_max') and (v_changes->>'published_apr_min')::numeric > (v_changes->>'published_apr_max')::numeric then
    raise exception 'Minimum APR cannot exceed maximum APR';
  end if;
  insert into public.product_research_sources (
    product_id, source_url, source_title, source_excerpt, source_locator, retrieval_method,
    source_tier, channel_scope, version_label, effective_date, source_checked_on,
    retrieved_at, content_sha256, proposed_changes, submitted_by
  ) values (
    v_product.id, v_url, _payload->>'source_title', nullif(_payload->>'source_excerpt', ''),
    nullif(_payload->>'source_locator', ''), v_method, v_tier, _payload->>'channel_scope',
    nullif(_payload->>'version_label', ''), nullif(_payload->>'effective_date', '')::date,
    coalesce(nullif(_payload->>'source_checked_on', '')::date, current_date),
    nullif(_payload->>'retrieved_at', '')::timestamptz, nullif(_payload->>'content_sha256', ''),
    v_changes, auth.uid()
  ) returning id into v_id;
  return v_id;
end $$;
REVOKE ALL ON FUNCTION public.submit_product_research(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_product_research(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_product_research(_id uuid, _decision text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare r public.product_research_sources; c jsonb;
begin
  if not public.is_owner(auth.uid()) then raise exception 'Only the owner can review product research'; end if;
  select * into r from public.product_research_sources where id = _id for update;
  if not found then raise exception 'Research item not found'; end if;
  if r.review_status <> 'pending' then raise exception 'Research item already reviewed'; end if;
  if _decision = 'reject' then
    update public.product_research_sources set review_status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now() where id = r.id;
    return;
  elsif _decision <> 'approve' then
    raise exception 'Unknown decision';
  end if;
  if r.source_tier = 'official_primary' then
    c := r.proposed_changes;
    update public.lender_products set
      official_url = coalesce(c->>'official_url', official_url),
      published_min_amount = case when c ? 'published_min_amount' then (c->>'published_min_amount')::numeric else published_min_amount end,
      published_max_amount = case when c ? 'published_max_amount' then (c->>'published_max_amount')::numeric else published_max_amount end,
      published_apr_min = case when c ? 'published_apr_min' then (c->>'published_apr_min')::numeric else published_apr_min end,
      published_apr_max = case when c ? 'published_apr_max' then (c->>'published_apr_max')::numeric else published_apr_max end,
      product_note = coalesce(c->>'product_note', product_note),
      channel_scope = coalesce(c->>'channel_scope', channel_scope),
      amount_kind = coalesce(c->>'amount_kind', amount_kind),
      apr_source_url = case when c ? 'published_apr_min' or c ? 'published_apr_max' then r.source_url else apr_source_url end,
      apr_as_of = case when c ? 'published_apr_min' or c ? 'published_apr_max' then coalesce(nullif(c->>'apr_as_of', '')::date, r.source_checked_on) else apr_as_of end,
      source_verified_on = r.source_checked_on,
      research_status = 'partially_verified'
    where id = r.product_id;
    update public.product_research_sources set review_status = 'approved_applied', reviewed_by = auth.uid(), reviewed_at = now() where id = r.id;
  else
    update public.product_research_sources set review_status = 'approved_note', reviewed_by = auth.uid(), reviewed_at = now() where id = r.id;
  end if;
end $$;
REVOKE ALL ON FUNCTION public.review_product_research(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_product_research(uuid, text) TO authenticated;

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
    insert into public.lender_rules (product_id, rule_key, bureau, score_model, lookback_months, threshold, source_tier, source_title, source_url, verified_on, effective_date, stale_after_days, approval_status, version, proposed_by, approved_by, approved_at)
    values (c.product_id, c.rule_key, c.bureau, c.score_model, c.lookback_months, c.threshold, 'verified_primary', c.source_title || coalesce(' — ' || c.source_locator, ''), c.source_url, c.verified_on, c.effective_date, c.stale_after_days, 'active', 1, auth.uid(), auth.uid(), now())
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
