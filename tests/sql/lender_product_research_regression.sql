-- Transaction-isolated Section 03 checks. Synthetic values only; rollback leaves no research or rule changes.
begin;
create temporary table product_research_results (check_name text primary key, pass boolean not null) on commit drop;
create temporary table product_research_ids (id uuid) on commit drop;
grant select, insert on pg_temp.product_research_results to authenticated;
grant select, insert, delete on pg_temp.product_research_ids to authenticated;

insert into public.source_review_candidates (seed_key, product_id, criterion, scope, rule_key, bureau, score_model, threshold, representable, source_title, source_url, verified_on, evidence_status)
select 'synthetic_secondary_rollback', id, 'Synthetic secondary score note', 'Synthetic test only', 'min_score', 'transunion', 'FICO 8', 600, true, 'Synthetic secondary source', 'https://example.org/secondary', current_date, 'secondary_source_pending_owner'
from public.lender_products where name = 'Chase My Chase Loan®';

insert into public.lender_products (lender_id, name, product_type, official_url, amount_kind)
select lender_id, name, product_type, official_url, amount_kind from public.lender_products where name = 'Chase My Chase Loan®'
on conflict (lender_id, name) do nothing;

select set_config('request.jwt.claim.sub', id::text, true), set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from public.profiles where email = 'support@advancerevival.com';
set local role authenticated;
insert into product_research_results values
  ('catalog has 49 unique products', (select count(*) = 49 and count(distinct (lender_id,name)) = 49 from public.lender_products)),
  ('all six requested categories are present', (select count(distinct product_type) >= 6 and bool_or(product_type='credit_card_feature') from public.lender_products)),
  ('My Chase Loan is only a card feature', (select product_type = 'credit_card_feature' and amount_kind = 'available_credit' from public.lender_products where name = 'Chase My Chase Loan®')),
  ('existing 13 criteria remain pending', (select count(*) = 13 from public.source_review_candidates where review_status = 'pending' and seed_key not like 'synthetic_%')),
  ('no active rules after catalog seed', (select count(*) = 0 from public.lender_rules where approval_status = 'active')),
  ('research table has no direct authenticated insert grant', not has_table_privilege('authenticated','public.product_research_sources','insert')),
  ('research table has no direct authenticated update grant', not has_table_privilege('authenticated','public.product_research_sources','update')),
  ('research table has no direct authenticated delete grant', not has_table_privilege('authenticated','public.product_research_sources','delete'));

do $$
begin
  perform public.review_source_candidate((select id from public.source_review_candidates where seed_key='synthetic_secondary_rollback'), 'approve_active');
  insert into product_research_results values ('secondary criterion cannot become verified active rule', false);
exception when others then
  insert into product_research_results values ('secondary criterion cannot become verified active rule', (select count(*) = 0 from public.lender_rules where approval_status='active'));
end $$;

do $$
begin
  perform public.submit_product_research(jsonb_build_object('product_id',(select id from public.lender_products where name='Chase My Chase Loan®'),'source_url','https://example.org/chase','source_title','Synthetic cross-host source','source_tier','official_primary','channel_scope','Synthetic test','source_checked_on',current_date));
  insert into product_research_results values ('official retrieval submission rejects cross-host URL', false);
exception when others then
  insert into product_research_results values ('official retrieval submission rejects cross-host URL', true);
end $$;

do $$
begin
  perform public.submit_product_research(jsonb_build_object('product_id',(select id from public.lender_products where name='Chase My Chase Loan®'),'source_url','https://www.chase.com/personal/credit-cards/mychaseloan','source_title','Synthetic unsafe field','source_tier','official_primary','channel_scope','Synthetic test','source_checked_on',current_date,'proposed_changes','{"product_type":"personal_loan"}'::jsonb));
  insert into product_research_results values ('research cannot change product taxonomy', false);
exception when others then
  insert into product_research_results values ('research cannot change product taxonomy', true);
end $$;

insert into product_research_ids
select public.submit_product_research(jsonb_build_object(
  'product_id',(select id from public.lender_products where name='Chase My Chase Loan®'),
  'source_url','https://www.chase.com/personal/credit-cards/mychaseloan',
  'source_title','Synthetic official review — rollback','source_excerpt','Synthetic public excerpt only.',
  'source_tier','official_primary','retrieval_method','manual','channel_scope','Eligible card feature synthetic review',
  'version_label','synthetic-v1','effective_date',current_date,'source_checked_on',current_date,
  'proposed_changes','{"published_min_amount":750}'::jsonb));
insert into product_research_results values
  ('owner can submit pending official research', (select review_status='pending' from public.product_research_sources where id=(select id from product_research_ids))),
  ('submission does not create rule', (select count(*) = 0 from public.lender_rules where approval_status='active'));
select public.review_product_research((select id from product_research_ids), 'approve');
insert into product_research_results values
  ('owner approval applies only proposed marketing field', (select published_min_amount=750 and product_type='credit_card_feature' from public.lender_products where name='Chase My Chase Loan®')),
  ('official research marked applied', (select review_status='approved_applied' from public.product_research_sources where id=(select id from product_research_ids))),
  ('official approval still creates no rule', (select count(*) = 0 from public.lender_rules where approval_status='active'));

delete from product_research_ids;
insert into product_research_ids
select public.submit_product_research(jsonb_build_object(
  'product_id',(select id from public.lender_products where name='Chase My Chase Loan®'),
  'source_url','https://example.org/secondary','source_title','Synthetic secondary review — rollback',
  'source_tier','secondary_source','channel_scope','Synthetic secondary note','source_checked_on',current_date,
  'proposed_changes','{"published_max_amount":999999}'::jsonb));
select public.review_product_research((select id from product_research_ids), 'approve');
insert into product_research_results values
  ('secondary approval remains note only', (select review_status='approved_note' from public.product_research_sources where id=(select id from product_research_ids))),
  ('secondary approval cannot change verified marketing', (select published_max_amount is null from public.lender_products where name='Chase My Chase Loan®')),
  ('secondary approval creates no rule', (select count(*) = 0 from public.lender_rules where approval_status='active'));
reset role;

-- Temporarily make the synthetic principal a client; all role changes roll back.
delete from public.user_roles where user_id=(select id from public.profiles where email='support@advancerevival.com');
insert into public.user_roles (user_id,role) select id,'client' from public.profiles where email='support@advancerevival.com';
set local role authenticated;
insert into product_research_results values
  ('client cannot read product research', (select count(*) = 0 from public.product_research_sources)),
  ('client still cannot read source criteria', (select count(*) = 0 from public.source_review_candidates));
do $$
begin
  perform public.submit_product_research(jsonb_build_object('product_id',(select id from public.lender_products where name='Chase My Chase Loan®'),'source_url','https://www.chase.com/personal/credit-cards/mychaseloan','source_title','Client synthetic attempt','channel_scope','Invalid','source_checked_on',current_date));
  insert into product_research_results values ('client cannot submit product research', false);
exception when others then
  insert into product_research_results values ('client cannot submit product research', true);
end $$;
do $$
begin
  select public.review_product_research((select id from product_research_ids),'reject');
  insert into product_research_results values ('client cannot review product research', false);
exception when others then
  insert into product_research_results values ('client cannot review product research', true);
end $$;
reset role;

select check_name, pass from product_research_results order by check_name;
rollback;
