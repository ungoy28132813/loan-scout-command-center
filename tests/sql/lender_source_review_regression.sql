-- Run with a read query. Every row should return ok = true.
select 'no active rules from seed' t, count(*) = 0 ok from public.lender_rules where approval_status = 'active' and approved_by is null;
select 'products not hard pull' t, bool_and(pull_type = 'unknown') ok from public.lender_products where name in ('Prosper Personal Loan','Happy Money The Payoff Loan','Wells Fargo Personal Loan','AmeriCU Quick Cash','AmeriCU Personal Unsecured Loan');
select 'seed products unique' t, count(*) = count(distinct (lender_id, name)) ok from public.lender_products;
select 'prospectus criteria only on Note Channel' t, bool_and(p.name like '%Note Channel%') ok from public.source_review_candidates c join public.lender_products p on p.id = c.product_id where c.source_url like '%Prospectus%';
select 'happy money not representable' t, not representable ok from public.source_review_candidates where seed_key = 'happymoney_fico620';
select 'candidates staff-only' t, bool_and(qual = 'is_staff(auth.uid())') ok from pg_policies where tablename = 'source_review_candidates';
select 'review fn owner check' t, pg_get_functiondef('public.review_source_candidate'::regproc) like '%is_owner(auth.uid())%' ok;
