ALTER TABLE public.lender_products
  ADD COLUMN application_url text,
  ADD COLUMN application_url_source_url text,
  ADD COLUMN application_url_verified_on date,
  ADD COLUMN application_checklist jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(application_checklist) = 'array'),
  ADD COLUMN required_documents jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(required_documents) = 'array'),
  ADD COLUMN application_guidance_source_url text,
  ADD COLUMN application_guidance_verified_on date,
  ADD COLUMN application_pull_risk text,
  ADD COLUMN pull_risk_source_url text,
  ADD COLUMN pull_risk_verified_on date;

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
  v_path text;
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
    if v_changes ? 'official_url' or v_changes ? 'application_url' then
      v_host := regexp_replace(split_part(lower(coalesce((regexp_match(coalesce(v_changes->>'official_url', v_changes->>'application_url'), '^https://([^/]+)'))[1], '')), ':', 1), '^www\.', '');
      if position('@' in coalesce(v_changes->>'official_url', v_changes->>'application_url', '')) > 0 or not (v_host = v_base or v_host like '%.' || v_base) then
        raise exception 'A proposed official or application URL must stay on the product website';
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
    if v_key not in ('official_url','published_min_amount','published_max_amount','published_apr_min','published_apr_max','published_term_min_months','published_term_max_months','term_as_of','product_note','channel_scope','amount_kind','apr_as_of','application_url','application_checklist','required_documents','application_pull_risk') then
      raise exception 'Unsupported proposed product field: %', v_key;
    end if;
    if v_key in ('published_min_amount','published_max_amount','published_apr_min','published_apr_max','published_term_min_months','published_term_max_months') then
      if jsonb_typeof(v_changes->v_key) <> 'number' then raise exception 'Proposed numeric values must be JSON numbers'; end if;
      v_number := (v_changes->>v_key)::numeric;
      if v_number < 0 or v_number > 1000000000 or (v_key like 'published_apr%' and v_number > 100) or (v_key like 'published_term%' and (v_number < 1 or v_number > 1200 or v_number <> trunc(v_number))) then
        raise exception 'Proposed numeric value is outside the allowed range';
      end if;
    end if;
    if v_key in ('application_checklist','required_documents') then
      if jsonb_typeof(v_changes->v_key) <> 'array' or jsonb_array_length(v_changes->v_key) > 40 then raise exception 'Application guidance must be a bounded array'; end if;
      if exists (select 1 from jsonb_array_elements(v_changes->v_key) as item(value) where jsonb_typeof(item.value) <> 'string' or char_length(trim(item.value #>> '{}')) < 2 or char_length(item.value #>> '{}') > 500) then
        raise exception 'Application guidance entries must be strings between 2 and 500 characters';
      end if;
    end if;
  end loop;
  if v_changes ? 'application_url' then
    v_path := coalesce((regexp_match(v_changes->>'application_url', '^https://[^/]+(/[^?#]*)?'))[1], '');
    if char_length(v_changes->>'application_url') > 2000 or v_changes->>'application_url' !~ '^https://' or position('@' in v_changes->>'application_url') > 0 or v_path in ('','/') then
      raise exception 'Application URL must be a credential-free HTTPS destination, not a website home page';
    end if;
  end if;
  if (v_changes ? 'application_pull_risk') and (jsonb_typeof(v_changes->'application_pull_risk') <> 'string' or char_length(v_changes->>'application_pull_risk') < 2 or char_length(v_changes->>'application_pull_risk') > 2000) then
    raise exception 'Pull-risk wording must be text between 2 and 2000 characters';
  end if;
  if (v_changes->>'amount_kind') is not null and v_changes->>'amount_kind' not in ('unknown','loan_cash','credit_limit','available_credit') then
    raise exception 'Invalid amount kind';
  end if;
  if (v_changes ? 'published_min_amount') and (v_changes ? 'published_max_amount') and (v_changes->>'published_min_amount')::numeric > (v_changes->>'published_max_amount')::numeric then
    raise exception 'Minimum amount cannot exceed maximum amount';
  end if;
  if (v_changes ? 'published_apr_min') and (v_changes ? 'published_apr_max') and (v_changes->>'published_apr_min')::numeric > (v_changes->>'published_apr_max')::numeric then
    raise exception 'Minimum APR cannot exceed maximum APR';
  end if;
  if (v_changes ? 'published_term_min_months') and (v_changes ? 'published_term_max_months') and (v_changes->>'published_term_min_months')::numeric > (v_changes->>'published_term_max_months')::numeric then
    raise exception 'Minimum term cannot exceed maximum term';
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
      published_term_min_months = case when c ? 'published_term_min_months' then (c->>'published_term_min_months')::integer else published_term_min_months end,
      published_term_max_months = case when c ? 'published_term_max_months' then (c->>'published_term_max_months')::integer else published_term_max_months end,
      term_source_url = case when c ? 'published_term_min_months' or c ? 'published_term_max_months' then r.source_url else term_source_url end,
      term_as_of = case when c ? 'published_term_min_months' or c ? 'published_term_max_months' then coalesce(nullif(c->>'term_as_of', '')::date, r.source_checked_on) else term_as_of end,
      application_url = case when c ? 'application_url' then c->>'application_url' else application_url end,
      application_url_source_url = case when c ? 'application_url' then r.source_url else application_url_source_url end,
      application_url_verified_on = case when c ? 'application_url' then r.source_checked_on else application_url_verified_on end,
      application_checklist = case when c ? 'application_checklist' then c->'application_checklist' else application_checklist end,
      required_documents = case when c ? 'required_documents' then c->'required_documents' else required_documents end,
      application_guidance_source_url = case when c ? 'application_checklist' or c ? 'required_documents' then r.source_url else application_guidance_source_url end,
      application_guidance_verified_on = case when c ? 'application_checklist' or c ? 'required_documents' then r.source_checked_on else application_guidance_verified_on end,
      application_pull_risk = case when c ? 'application_pull_risk' then c->>'application_pull_risk' else application_pull_risk end,
      pull_risk_source_url = case when c ? 'application_pull_risk' then r.source_url else pull_risk_source_url end,
      pull_risk_verified_on = case when c ? 'application_pull_risk' then r.source_checked_on else pull_risk_verified_on end,
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

UPDATE public.lender_products SET
  application_url = 'https://icomplete.wellsfargo.com/oas/status/personal-loans-rate-checker/getting-started/',
  application_url_source_url = 'https://www.wellsfargo.com/personal-loans/checklist/',
  application_url_verified_on = DATE '2026-11-17',
  application_checklist = jsonb_build_array(
    'Confirm the qualifying Wells Fargo consumer product has been open for at least 12 months.',
    'Gather the personal contact, employment, income, housing-payment, and requested-loan details listed on the official checklist.',
    'Check options first; selecting an option and submitting an application is a separate step.'
  ),
  required_documents = jsonb_build_array(
    'Recent pay stubs, W-2s, or tax returns — if requested',
    'Utility bills to verify address — if requested',
    'Copy of driver’s license or Social Security card — if requested',
    'Information to pay off current accounts — if requested',
    'Power of Attorney or applicant employment and income authorization form — if requested'
  ),
  application_guidance_source_url = 'https://www.wellsfargo.com/personal-loans/checklist/',
  application_guidance_verified_on = DATE '2026-11-17',
  application_pull_risk = 'Checking loan options does not affect the credit score. After an option is selected and an application is submitted, Wells Fargo states that it requests a full credit report from at least one bureau; this is a hard credit pull and can impact the credit score.',
  pull_risk_source_url = 'https://www.wellsfargo.com/personal-loans/',
  pull_risk_verified_on = DATE '2026-11-17'
WHERE name = 'Wells Fargo Personal Loan';

UPDATE public.lender_products SET
  application_url = 'https://www.prosper.com/pl-offers/get-rate/step-1',
  application_url_source_url = 'https://www.prosper.com/personal-loans',
  application_url_verified_on = DATE '2026-11-17',
  application_checklist = jsonb_build_array(
    'Check your rate in minutes.',
    'Choose from available offers, terms, and monthly payments.',
    'Complete the application on your device.'
  ),
  application_guidance_source_url = 'https://www.prosper.com/personal-loans',
  application_guidance_verified_on = DATE '2026-11-17',
  application_pull_risk = 'The official product page states that checking your rate will not affect your credit score. Confirm any later application credit-pull disclosure before submitting.',
  pull_risk_source_url = 'https://www.prosper.com/personal-loans',
  pull_risk_verified_on = DATE '2026-11-17'
WHERE name = 'Prosper Personal Loan';