ALTER TABLE public.report_fields ADD COLUMN IF NOT EXISTS source_page integer, ADD COLUMN IF NOT EXISTS confidence text, ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS score_date date;
ALTER TABLE public.report_fields DROP CONSTRAINT IF EXISTS report_fields_status_check;
ALTER TABLE public.report_fields ADD CONSTRAINT report_fields_status_check CHECK (status = ANY (ARRAY['unknown','entered','corrected','verified','extracted']));
ALTER TABLE public.report_fields ADD CONSTRAINT report_fields_confidence_check CHECK (confidence IS NULL OR confidence = ANY (ARRAY['high','medium','low']));
ALTER TABLE public.tradelines ADD COLUMN IF NOT EXISTS source_page integer, ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS extracted boolean NOT NULL DEFAULT false;
ALTER TABLE public.credit_reports ADD COLUMN IF NOT EXISTS extraction_summary jsonb, ADD COLUMN IF NOT EXISTS extracted_at timestamptz, ADD COLUMN IF NOT EXISTS detected_provider text;
COMMENT ON COLUMN public.credit_reports.extraction_summary IS 'Counts, page count, warnings and parser version only. Never raw report text or identifiers.';