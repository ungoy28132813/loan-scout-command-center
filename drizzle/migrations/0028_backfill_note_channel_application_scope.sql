UPDATE public.source_review_candidates c
SET application_mode = 'individual'
FROM public.lender_products p
WHERE p.id = c.product_id
  AND p.name = 'Prosper Personal Loan — Note Channel (individual borrower)'
  AND c.scope ILIKE '%single borrower%';

UPDATE public.source_review_candidates c
SET application_mode = 'joint'
FROM public.lender_products p
WHERE p.id = c.product_id
  AND p.name = 'Prosper Personal Loan — Note Channel (individual borrower)'
  AND c.scope ILIKE '%JOINT borrowers%';