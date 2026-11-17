-- Transaction-isolated Section 02 OCR/staging/review checks. Synthetic values only; everything rolls back.
begin;
create temporary table credit_ocr_results (check_name text primary key, pass boolean not null) on commit drop;
create temporary table credit_ocr_ids (id uuid not null) on commit drop;
create temporary table credit_ocr_account_id (id uuid not null) on commit drop;
grant select, insert on pg_temp.credit_ocr_results to authenticated;
grant select, insert on pg_temp.credit_ocr_ids to authenticated;
grant select, insert on pg_temp.credit_ocr_account_id to authenticated;

select set_config('request.jwt.claim.sub', id::text, true), set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from public.profiles where email='support@advancerevival.com';
insert into public.clients (id,user_id,display_name,stage,is_demo,created_by)
select '12000000-0000-4000-8000-000000000001',id,'SYNTHETIC OCR CLIENT — ROLLBACK','intake',true,id from public.profiles where email='support@advancerevival.com';
insert into public.documents (id,client_id,category,storage_path,file_name,mime_type,size_bytes,uploaded_by)
select '22000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001','credit_reports','12000000-0000-4000-8000-000000000001/synthetic-ocr.pdf','synthetic-ocr.pdf','application/pdf',100,id from public.profiles where email='support@advancerevival.com';
insert into public.credit_reports (id,client_id,document_id) values ('32000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001');

create temporary table credit_ocr_payload (payload jsonb not null) on commit drop;
grant select on pg_temp.credit_ocr_payload to authenticated;
insert into credit_ocr_payload values ('{
 "parserVersion":"ls-parse-1.1.0","provider":"unknown","reportType":"experian","reportDate":"2026-11-01","pageCount":2,"hasTextLayer":false,"ocrUsed":true,"bureausDetected":["experian"],"status":"partial",
 "scores":[{"bureau":"experian","model":"FICO 8","value":702,"scoreDate":"2026-10-31","sourcePage":1,"confidence":"low","needsReview":true}],
 "fields":[{"bureau":"experian","key":"inquiries_30d","value":1,"sourcePage":1,"confidence":"low","needsReview":true},{"bureau":"experian","key":"inquiries_3mo","value":2,"sourcePage":1,"confidence":"low","needsReview":true},{"bureau":"experian","key":"inquiries_24mo","value":4,"sourcePage":1,"confidence":"low","needsReview":true},{"bureau":"experian","key":"chargeoffs_count","value":1,"sourcePage":2,"confidence":"low","needsReview":true},{"bureau":"experian","key":"bankruptcy_on_file","value":1,"sourcePage":2,"confidence":"low","needsReview":true},{"bureau":"experian","key":"months_since_bankruptcy","value":33,"sourcePage":2,"confidence":"low","needsReview":true}],
 "tradelines":[{"bureau":"experian","creditor":"DEMO OCR BANK","last4":"4444","accountType":"revolving","balance":1200,"creditLimit":5000,"isOpen":true,"lateCount":2,"isCollection":false,"isChargeoff":true,"sourcePage":2,"needsReview":true}]
}');

delete from public.user_roles where user_id=(select id from public.profiles where email='support@advancerevival.com');
insert into public.user_roles (user_id,role) select id,'client' from public.profiles where email='support@advancerevival.com';
set local role authenticated;

do $$ begin
  perform public.submit_client_extraction('32000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000001',(select payload from credit_ocr_payload));
  insert into credit_ocr_results values ('OCR client staging requires current consent',false);
exception when others then insert into credit_ocr_results values ('OCR client staging requires current consent',true); end $$;
insert into public.consents (user_id,client_id,kind,version)
select id,'12000000-0000-4000-8000-000000000001',kind,'2026-11-v1' from public.profiles,lateral (values ('privacy_notice'),('report_analysis_authorization')) kinds(kind) where email='support@advancerevival.com';

do $$ begin
  perform public.submit_client_extraction('32000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000001',(select payload from credit_ocr_payload)||'{"rawText":"private OCR text"}');
  insert into credit_ocr_results values ('raw OCR text is rejected',false);
exception when others then insert into credit_ocr_results values ('raw OCR text is rejected',true); end $$;
do $$ begin
  perform public.submit_client_extraction('32000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000001',jsonb_set((select payload from credit_ocr_payload),'{tradelines,0,isChargeoff}','"yes"'));
  insert into credit_ocr_results values ('nonboolean charge-off flag is rejected',false);
exception when others then insert into credit_ocr_results values ('nonboolean charge-off flag is rejected',true); end $$;
do $$ begin
  perform public.submit_client_extraction('32000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000001',jsonb_set((select payload from credit_ocr_payload),'{fields,4,value}','2'));
  insert into credit_ocr_results values ('ambiguous bankruptcy value is rejected',false);
exception when others then insert into credit_ocr_results values ('ambiguous bankruptcy value is rejected',true); end $$;

insert into credit_ocr_ids select public.submit_client_extraction('32000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000001',(select payload from credit_ocr_payload));
insert into credit_ocr_results values
 ('valid OCR payload remains pending and unverified',(select review_status='pending_review' from public.client_extraction_submissions where id=(select id from credit_ocr_ids))),
 ('client cannot write trusted OCR fields',(select count(*) from public.report_fields where report_id='32000000-0000-4000-8000-000000000001')=0);
do $$ begin
  perform public.accept_staff_extraction('32000000-0000-4000-8000-000000000001');
  insert into credit_ocr_results values ('client cannot accept staff extraction',false);
exception when others then insert into credit_ocr_results values ('client cannot accept staff extraction',true); end $$;
reset role;

delete from public.user_roles where user_id=(select id from public.profiles where email='support@advancerevival.com');
insert into public.user_roles (user_id,role) select id,'owner' from public.profiles where email='support@advancerevival.com';
set local role authenticated;
select public.import_client_extraction((select id from credit_ocr_ids));
insert into credit_ocr_account_id select id from public.tradelines where report_id='32000000-0000-4000-8000-000000000001';
insert into credit_ocr_results values
 ('expanded OCR fields import with page citations',(select count(*)=7 and bool_and(needs_review) and bool_and(source_page is not null) from public.report_fields where report_id='32000000-0000-4000-8000-000000000001')),
 ('late count and charge-off import separately',(select late_count=2 and is_chargeoff and not is_collection and needs_review from public.tradelines where report_id='32000000-0000-4000-8000-000000000001')),
 ('OCR provenance is preserved in counts-only summary',(select extraction_summary->>'ocr_used'='true' and extraction_summary->>'text_layer'='false' from public.credit_reports where id='32000000-0000-4000-8000-000000000001')),
 ('import never publishes recommendations',not exists (select 1 from public.published_snapshots where client_id='12000000-0000-4000-8000-000000000001'));

select public.accept_client_extraction((select id from credit_ocr_ids));
select public.correct_tradeline((select id from public.tradelines where report_id='32000000-0000-4000-8000-000000000001'),1000,5000,1,true,false,true,2,'Verified synthetic OCR values against page 2','page 2');
select public.accept_staff_extraction('32000000-0000-4000-8000-000000000001');
insert into credit_ocr_results values
 ('whole-read staff acceptance confirms all fields',(select bool_and(not needs_review and status='verified') from public.report_fields where report_id='32000000-0000-4000-8000-000000000001')),
 ('account correction is atomic and confirmed',(select balance=1000 and late_count=1 and not needs_review from public.tradelines where report_id='32000000-0000-4000-8000-000000000001')),
 ('granular account audit lists fields without values',(select changed_fields @> array['balance','late_count'] and reason like 'Verified synthetic%' from public.tradeline_corrections where client_id='12000000-0000-4000-8000-000000000001')),
 ('acceptance and correction never publish',not exists (select 1 from public.published_snapshots where client_id='12000000-0000-4000-8000-000000000001')),
 ('audit metadata contains no OCR text or creditor',not exists (select 1 from public.audit_logs where client_id='12000000-0000-4000-8000-000000000001' and (metadata::text like '%private OCR text%' or metadata::text like '%DEMO OCR BANK%')));
reset role;

delete from public.user_roles where user_id=(select id from public.profiles where email='support@advancerevival.com');
insert into public.user_roles (user_id,role) select id,'client' from public.profiles where email='support@advancerevival.com';
set local role authenticated;
insert into credit_ocr_results values ('client cannot read account correction audit',(select count(*) from public.tradeline_corrections where client_id='12000000-0000-4000-8000-000000000001')=0);
do $$ begin
  perform public.correct_tradeline((select id from credit_ocr_account_id),0,5000,0,true,false,false,2,'client attempted change',null);
  insert into credit_ocr_results values ('client cannot correct trusted account',false);
exception when others then insert into credit_ocr_results values ('client cannot correct trusted account',true); end $$;
reset role;

select check_name,pass from credit_ocr_results order by check_name;
rollback;
