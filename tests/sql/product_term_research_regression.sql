-- Transaction-isolated documented-term research checks. No source claim or product change is retained.
begin;
create temporary table term_research_results (check_name text primary key, pass boolean not null) on commit drop;
create temporary table term_test_product (id uuid, url text) on commit drop;
create temporary table term_research_ids (id uuid) on commit drop;
grant select, insert on pg_temp.term_research_results, pg_temp.term_test_product, pg_temp.term_research_ids to authenticated;
select set_config('request.jwt.claim.sub', id::text, true), set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from public.profiles where email='support@advancerevival.com';
insert into term_test_product select id,official_url from public.lender_products where name='Prosper Personal Loan' limit 1;

insert into term_research_ids
select public.submit_product_research(jsonb_build_object(
 'product_id',(select id from term_test_product),
 'source_url',(select url from term_test_product),
 'source_title','SYNTHETIC TERM VALIDATION — ROLLBACK',
 'retrieval_method','manual','source_tier','official_primary',
 'channel_scope','Synthetic transaction test only','source_checked_on','2026-11-17',
 'proposed_changes',jsonb_build_object('published_term_min_months',12,'published_term_max_months',84,'term_as_of','2026-11-17')
));
select public.review_product_research((select id from term_research_ids limit 1),'approve');
insert into term_research_results values ('owner-approved official terms retain provenance',(select published_term_min_months=12 and published_term_max_months=84 and term_source_url=(select url from term_test_product) and term_as_of='2026-11-17' from public.lender_products where id=(select id from term_test_product)));
delete from term_research_ids;

do $$ begin
 perform public.submit_product_research(jsonb_build_object(
  'product_id',(select id from term_test_product),'source_url',(select url from term_test_product),'source_title','INVALID SYNTHETIC RANGE',
  'retrieval_method','manual','source_tier','official_primary','channel_scope','Synthetic test','source_checked_on','2026-11-17',
  'proposed_changes',jsonb_build_object('published_term_min_months',84,'published_term_max_months',12)
 ));
 insert into term_research_results values ('reversed term range rejected',false);
exception when others then insert into term_research_results values ('reversed term range rejected',true); end $$;

insert into term_research_ids
select public.submit_product_research(jsonb_build_object(
 'product_id',(select id from term_test_product),'source_url','https://example.com/secondary-term-test',
 'source_title','SYNTHETIC SECONDARY NOTE — ROLLBACK','retrieval_method','manual','source_tier','secondary_source',
 'channel_scope','Synthetic secondary test','source_checked_on','2026-11-17',
 'proposed_changes',jsonb_build_object('published_term_min_months',99)
));
select public.review_product_research((select id from term_research_ids order by id desc limit 1),'approve');
insert into term_research_results values ('secondary source cannot change verified terms',(select published_term_min_months=12 and published_term_max_months=84 from public.lender_products where id=(select id from term_test_product)));

delete from public.user_roles where user_id=(select id from public.profiles where email='support@advancerevival.com');
insert into public.user_roles (user_id,role) select id,'client' from public.profiles where email='support@advancerevival.com';
set local role authenticated;
do $$ begin
 perform public.submit_product_research(jsonb_build_object(
  'product_id',(select id from term_test_product),'source_url',(select url from term_test_product),'source_title','CLIENT ATTEMPT',
  'retrieval_method','manual','source_tier','official_primary','channel_scope','Synthetic test','source_checked_on','2026-11-17',
  'proposed_changes',jsonb_build_object('published_term_min_months',99)
 ));
 insert into term_research_results values ('client cannot submit product research',false);
exception when others then insert into term_research_results values ('client cannot submit product research',true); end $$;
reset role;
insert into term_research_results values ('term research activates no lender rules',(select count(*)=0 from public.lender_rules where approval_status='active'));
select check_name,pass from term_research_results order by check_name;
rollback;
