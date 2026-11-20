CREATE TABLE public.bureau_pull_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.lender_products(id),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  application_id uuid REFERENCES public.applications(id) ON DELETE SET NULL,
  location_state text CHECK (location_state IS NULL OR location_state ~ '^[A-Z]{2}$'),
  observed_on date NOT NULL,
  bureaus text[] NOT NULL DEFAULT '{}' CHECK (bureaus <@ ARRAY['transunion','experian','equifax']::text[]),
  pull_type text NOT NULL DEFAULT 'unknown' CHECK (pull_type IN ('hard','soft','unknown')),
  provenance text NOT NULL CHECK (provenance IN ('client_reported','staff_observed','officially_documented')),
  confidence text NOT NULL DEFAULT 'low' CHECK (confidence IN ('low','medium','high')),
  verification_status text NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified','verified','rejected')),
  source_url text CHECK (source_url IS NULL OR source_url ~ '^https://'),
  note text CHECK (note IS NULL OR length(note) <= 1000),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  verified_by uuid,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT documented_needs_source CHECK (provenance <> 'officially_documented' OR source_url IS NOT NULL)
);
COMMENT ON TABLE public.bureau_pull_observations IS 'Observations only; never feed lender_rules or eligibility automatically.';
CREATE INDEX ON public.bureau_pull_observations (product_id);
CREATE INDEX ON public.bureau_pull_observations (client_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bureau_pull_observations TO authenticated;
GRANT ALL ON public.bureau_pull_observations TO service_role;
ALTER TABLE public.bureau_pull_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read observations" ON public.bureau_pull_observations FOR SELECT TO authenticated
  USING (public.is_owner(auth.uid()) OR (public.is_staff(auth.uid()) AND (client_id IS NULL OR public.is_client_staff(auth.uid(), client_id))));
CREATE POLICY "staff add observations" ON public.bureau_pull_observations FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()) AND created_by = auth.uid() AND verification_status = 'unverified'
    AND (client_id IS NULL OR public.is_client_staff(auth.uid(), client_id)));
CREATE POLICY "staff update observations" ON public.bureau_pull_observations FOR UPDATE TO authenticated
  USING (public.is_owner(auth.uid()) OR (public.is_staff(auth.uid()) AND (client_id IS NULL OR public.is_client_staff(auth.uid(), client_id))))
  WITH CHECK (public.is_owner(auth.uid()) OR (public.is_staff(auth.uid()) AND (client_id IS NULL OR public.is_client_staff(auth.uid(), client_id))));
CREATE POLICY "owner delete observations" ON public.bureau_pull_observations FOR DELETE TO authenticated USING (public.is_owner(auth.uid()));

CREATE OR REPLACE FUNCTION public.guard_bureau_observation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF new.application_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.applications a WHERE a.id = new.application_id AND a.client_id IS NOT DISTINCT FROM new.client_id AND a.product_id = new.product_id) THEN
    RAISE EXCEPTION 'Application must belong to the same client and product';
  END IF;
  IF tg_op = 'UPDATE' THEN
    new.created_by = old.created_by;
    IF new.verification_status <> old.verification_status THEN
      IF new.verification_status <> 'unverified' AND new.created_by = auth.uid() AND NOT public.is_owner(auth.uid()) THEN
        RAISE EXCEPTION 'A different staff member or the owner must verify an observation';
      END IF;
      new.verified_by = CASE WHEN new.verification_status = 'unverified' THEN NULL ELSE auth.uid() END;
      new.verified_at = CASE WHEN new.verification_status = 'unverified' THEN NULL ELSE now() END;
    ELSE
      new.verified_by = old.verified_by; new.verified_at = old.verified_at;
    END IF;
  ELSE
    new.verified_by = NULL; new.verified_at = NULL;
  END IF;
  RETURN new;
END; $$;
REVOKE EXECUTE ON FUNCTION public.guard_bureau_observation() FROM public, anon, authenticated;
CREATE TRIGGER guard_bureau_observation BEFORE INSERT OR UPDATE ON public.bureau_pull_observations FOR EACH ROW EXECUTE FUNCTION public.guard_bureau_observation();
CREATE TRIGGER audit_bureau_pull_observations AFTER INSERT OR UPDATE OR DELETE ON public.bureau_pull_observations FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

CREATE OR REPLACE FUNCTION public.lender_intelligence_summary(_min_sample integer DEFAULT 5)
RETURNS TABLE(product_id uuid, verified_pull_observations integer, hard_pct numeric, transunion_pct numeric, experian_pct numeric, equifax_pct numeric,
  verified_outcomes integer, approved_pct numeric, suppressed boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE k integer := greatest(coalesce(_min_sample, 5), 5);
BEGIN
  IF NOT public.is_owner(auth.uid()) THEN RAISE EXCEPTION 'Only the owner can view intelligence summaries'; END IF;
  RETURN QUERY
  WITH o AS (SELECT b.product_id, count(*)::int n, avg((b.pull_type='hard')::int)*100 h, avg(('transunion'=ANY(b.bureaus))::int)*100 tu,
      avg(('experian'=ANY(b.bureaus))::int)*100 ex, avg(('equifax'=ANY(b.bureaus))::int)*100 eq
    FROM public.bureau_pull_observations b WHERE b.verification_status='verified' GROUP BY b.product_id),
  a AS (SELECT ap.product_id, count(*)::int n, avg((ap.status='approved')::int)*100 ok
    FROM public.applications ap JOIN public.application_outcomes oc ON oc.application_id = ap.id
    WHERE oc.verification_status='verified' AND ap.status IN ('approved','denied') AND ap.product_id IS NOT NULL GROUP BY ap.product_id)
  SELECT p.id, coalesce(o.n,0), CASE WHEN o.n>=k THEN round(o.h,0) END, CASE WHEN o.n>=k THEN round(o.tu,0) END,
    CASE WHEN o.n>=k THEN round(o.ex,0) END, CASE WHEN o.n>=k THEN round(o.eq,0) END,
    coalesce(a.n,0), CASE WHEN a.n>=k THEN round(a.ok,0) END,
    (coalesce(o.n,0) < k OR coalesce(a.n,0) < k)
  FROM public.lender_products p LEFT JOIN o ON o.product_id=p.id LEFT JOIN a ON a.product_id=p.id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.lender_intelligence_summary(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.lender_intelligence_summary(integer) TO authenticated;