# Loan Scout Matching Tool — Build Queue

This queue applies only to the existing Loan Scout Matching Tool project. Sections are implemented and committed in order. Historical approved Q1–90 decisions remain authoritative; Q70, Q73, and Q87 remain undecided and retain neutral safety defaults. No section permits fabricated lender criteria, real client credit data in tests, fake authentication, or public deployment.

| Section | Scope | State |
| --- | --- | --- |
| 01 | Security, identity and consent | **completed** — available scope verified; two external capability blockers below |
| 02 | Credit PDF / OCR | **completed** — local English OCR and verified-analysis scope verified; documented scan/layout limits below |
| 03 | Lender Catalog / Research | **completed** — official-source retrieval and owner review verified; AI interpretation remains pending |
| 04 | Underwriting Rules / Questionnaires | **completed** — goal-scoped provenance and deterministic rule coverage verified |
| 05 | Funding Planning / Simulators | **completed** — internal scenario planning, approval, and draft-only handoff verified |
| 06 | Guided Applications / Outcomes | **completed** — sourced guidance, staff-only evidence, and real-record metrics verified |
| 07 | Client Publishing / Documents / Exports | queued |
| 08 | Intelligence / Bureau Pulls / Analytics | queued |
| 09 | Final QA / Readiness | queued |

## Section 01 — Security, identity and consent

**State: completed for all safely available scope.** The app remains unpublished and is not production certified.

### Implemented and verified

- Preserved email/password Create Account and sign-in, magic links, email confirmation, and invitation-based roles. Added password recovery with a public recovery route and required current-password verification for signed-in changes; leaked-password protection remains enabled.
- Added genuine capability-gated WebAuthn registration, sign-in, listing, and removal through the installed auth client. No credential or authenticator behavior is simulated. The currently disabled backend state is shown honestly.
- Fixed confirmed client-invitation linking: the trusted auth lifecycle can link only the invitation's intended client, while signed-in clients and employees cannot link, unlink, or move portal accounts.
- Restricted employee profile reads to their own profile and profiles belonging to actively assigned clients. Deactivated employees lose assignment visibility as well as client-data access.
- Added active-employee assignment guards and an owner-only atomic departure action that revokes assignments, optionally transfers clients, deactivates the employee, and records audits without partial loop updates.
- Replaced dynamic permission SQL with a fixed permission map; invalid permission names return false.
- Required both current consent versions (`2026-11-v1`) for client uploads and structured extraction staging. Audit entries include consent kind, version, and acceptance time, never report contents.
- Preserved private PDF storage, short-lived signed views, unverified client staging, staff-only import/acceptance, owner-only lender-rule review, and unpublished-by-default recommendations.
- Updated the Security Center and Team & Access screens with accurate available/blocked behavior.

### Acceptance results — 2026-11-17

- **57/57 application tests passed** across 8 test files, including public routing for sign-in and password recovery.
- **TypeScript check passed.** Preview build reported **build OK**.
- **133/133 rollback-only or read-only database checks passed:**
  - 43 owner/employee/client/guest, cross-tenant, consent, assignment, and deactivated-access checks.
  - 10 invitation, role activation, revoked invitation, and portal-link checks.
  - 8 protected-profile-field checks.
  - 23 consented extraction staging, payload integrity, staff import/acceptance, and no-auto-publication checks.
  - 5 atomic employee-departure and audit checks.
  - 12 owner-bootstrap and single-owner checks.
  - 32 private storage, function privilege, consent, assignment, and owner-rule checks.
- **Synthetic browser workflow passed all assertions:** Create Account fields, recovery entry, invalid-recovery rejection, honest passkey-disabled state, owner dashboard, current-password fields, Security Center, public-signup-off state, and Team & Access. No browser page errors occurred.
- **Basic security scan completed with no findings.** The earlier dynamic-SQL warning was removed. This scan does not constitute deep code analysis or production certification.
- Live email delivery and an actual password change were not exercised, avoiding changes to the real owner account. No permanent test users, weak shared credentials, real reports, or real client credit data were used.
- Cleanup verification passed: no synthetic queue clients, invitations, or private files remain; one owner remains; public signup is off; all 13 source-review candidates remain; zero lender rules are active.

### Blocked capabilities

- **BLOCKED — live passkey ceremony:** the managed auth backend returns HTTP 404 `passkey_disabled`. No supported project control was available to enable it. Genuine WebAuthn integration is present and capability-gated, but registration/sign-in cannot complete until the backend supports and enables passkeys.
- **BLOCKED — owner-targeted forced remote sign-out:** the managed admin sign-out API requires the target user's access token, which is not available to the owner. Deactivation immediately blocks client data and assignment access, but existing auth tokens may remain valid until expiry. No unsupported token deletion or managed-auth-table workaround was attempted.

### Deferred to later queue sections

Lender research, further underwriting inputs, simulators, guided applications/outcomes, exports, bureau-pull intelligence, analytics, and final readiness remain in their ordered queued sections. No source rule was approved and nothing was published.

## Section 02 — Credit PDF / OCR and verified report analysis

**State: completed for the safely available, documented scope.** The app remains unpublished and is not production certified.

### Implemented and verified

- Added browser-local OCR for image-only and image-only pages in mixed PDFs using bundled pdf.js/Tesseract workers, WASM cores, and English language data under `public/ocr/`. No CDN, external AI, cloud OCR, report-image upload, or report-text logging is used.
- Preserved 25 MB / 80-page PDF limits and added a 20-scanned-page OCR cap with explicit truncation warnings. Clear failures cover unreadable/blank scans and advise a clearer upright English scan or text-based PDF. OCR values retain original text-layer provenance, page citations, low confidence, and mandatory review.
- Expanded deterministic parsing for explicit per-bureau inquiry summaries and dated listings across 30 days, 3/6/12/24 months, late/delinquent accounts, collections, charge-offs, and bankruptcy presence/filing age. Missing or ambiguous evidence remains Unknown; impossible dates are rejected.
- Dated inquiries are counted individually without assumed deduplication. Repeated same-bureau account identities stay separate for review; missing accounts are never interpreted as deletions. Balances, limits, utilization, lates, collections, and charge-offs remain bureau-specific.
- Added additive database validation for OCR provenance and new structured fields. Client staging still requires ownership, current consent, matching private PDF identity, masked account endings, size/schema checks, and staff import/acceptance. Raw text and unsupported keys are rejected.
- Added atomic staff whole-report acceptance, account-level confirmation/correction with required reasons, page citations, and staff-only correction audits containing changed field names but not old/new account values.
- Validated updates create fresh internal strict match runs when the staff member also has Run matching permission. Existing reports, published snapshots, and prior match runs are not rewritten; nothing auto-publishes. Staff without that permission are told who must recalculate.
- Preserved combined and separate report handling, sequential batch uploads, exact score model/bureau separation, historical comparisons, utilization scenarios, private files, and owner-only lender-rule approval.

### Acceptance results — 2026-11-17

- **68/68 application tests passed across 9 files**, including synthetic single/three-bureau fixtures, all inquiry windows, adverse evidence, duplicate caution, impossible dates, OCR provenance/failure, payload privacy, page/size limits, utilization, matching, and public routing.
- **TypeScript check passed.** Preview builds reported **build OK** during implementation; final build status is checked before commit.
- **41/41 targeted rollback-only database checks passed:** 18 new Section 02 checks plus all 23 pre-existing client-extraction checks. They cover consent, cross-tenant denial, raw-text/invalid-payload rejection, unverified staging, staff-only import/acceptance/correction, correction audits, OCR provenance, and no automatic publication. The other Section 01 suites were not re-run in this section.
- **Real Chromium synthetic PDF checks passed:** a text PDF used no OCR; an image-only PDF produced the expected synthetic Experian FICO 8 score 702, three fields, and a $1,200 / $5,000 revolving account with low-confidence review flags; a blank image PDF remained unreadable with zero extracted values. **Zero external requests** occurred during extraction/OCR, and no browser page errors occurred.
- **Full synthetic owner workflow passed twice:** create DEMO client and personal goal, upload scanned PDF, local OCR, review, whole-read acceptance, internal match recalculation, account correction, and correction-history readback. The final run created two fresh internal match runs across acceptance and correction, retained Needs Review results with no approved lender rules, and published nothing.
- **Basic security scan completed with no findings.** This is not deep code analysis or production certification.
- Cleanup verified after both workflows: private synthetic files were deleted through the owner UI, both synthetic clients were removed, and the final database check found zero synthetic clients/documents, zero active lender rules, 13 preserved source-review candidates, and zero published snapshots.

### Documented limits

- OCR supports **English only**, at most **20 scanned pages per PDF**, and clear upright scans. Non-English, rotated, low-quality, heavily redacted, or unusually formatted reports may require manual entry or a text-based PDF; no unsupported language is guessed.
- Parser layouts are best-effort for SmartCredit, IdentityIQ, MyScoreIQ, and similar reports, not a claim to support every provider layout. Unreadable fields remain Unknown and automatic reads never become verified without staff action.
- A separate live client-browser upload session was not run in this section; client staging and cross-tenant boundaries were exercised by the rollback-only database suite. The actual owner browser workflow and local OCR pipeline were run end to end.
- No lender-specific utilization simulation or lender rule approval was added. No real client report, credential, external OCR service, or public deployment was used.

## Section 03 — Lender products, on-demand research and source review

**State: completed for the safely available, documented scope.** The app remains unpublished and is not production certified.

### Implemented and verified

- Expanded the existing 24-lender directory from 6 to **49 unique product records** using 43 additional official-source identities. The catalog now covers personal credit cards, personal loans, personal lines of credit, business credit cards, business loans, and business lines of credit. No original product list was invented or backfilled.
- Added explicit `personal_line_of_credit`, `business_line_of_credit`, and `credit_card_feature` taxonomy. Personal and business credit lines enter only their matching goal scope; card features and ambiguous legacy credit lines stay out of automatic goal matching. Chase My Chase Loan is an eligible existing-card feature using available card credit, not a standalone personal loan.
- Recorded official URLs, product/channel scope, public-source checked dates, and only explicitly supported marketed amounts and APR ranges. Introductory and standard APRs are distinguished. Interest-only rates, monthly loan fees, as-low-as rates, and pricing examples were not converted into APR ranges. Missing values remain unknown.
- Added an authenticated on-demand official-page retrieval function for staff with research permission. Retrieval requires HTTPS, stays on the product's official host across redirects, uses a 15-second timeout, accepts only readable HTML/text, caps responses at 1 MB and excerpts at 12,000 characters, and returns a content hash. It performs no AI interpretation, scheduled monitoring, or automatic criterion extraction.
- Added manual source submission for unsupported PDFs, retrieval failures, and secondary sources. Research records include excerpt/locator, official or secondary tier, retrieval method, channel scope, version/effective/check dates, content hash when retrieved, and proposed marketing-only changes.
- Added a separate owner-only product-research review queue. Official approval can apply only allowlisted marketing fields; it cannot change product taxonomy, pull type, or any lender rule. Secondary approval remains a note and cannot update verified product fields. No research action publishes recommendations or activates matching rules.
- Extended existing criterion candidates with excerpt, version, effective-date, and freshness metadata. Secondary criterion candidates cannot become verified active rules. The original **13 pending criteria remain pending and unapproved**.
- Added stale warnings for product research and existing criteria. Corrected inherited table privileges so authenticated users have only staff-RLS reads; submissions and reviews require checked functions. Reconciled lender aliases that initially skipped 17 seed rows rather than treating the partial count as complete.

### Acceptance results — 2026-11-17

- **76/76 application tests passed across 11 files**, including official-source URL isolation, redirect-host rules, text sanitization/bounds, stale detection, all six categories, 43 idempotent seed rows, card-feature exclusion, personal/business credit-line scope, prior parser/OCR, business isolation, matching, and routing tests.
- **TypeScript check passed.** Preview builds reported **build OK**, including after the final UI changes.
- **23/23 targeted transaction-rollback database checks passed.** They cover 49 unique products, all categories, card-feature taxonomy, 13 preserved pending criteria, zero active rules, least-privilege table grants, secondary-rule rejection, cross-host and taxonomy-change rejection, pending official research, owner marketing-only approval, secondary note-only approval, and client read/submit/review denial. Every synthetic change was rolled back.
- **Synthetic owner Chromium workflow passed:** 24 lender identities and 49 products rendered; My Chase Loan displayed as a card feature with available-credit wording; the on-demand Chase official-page retrieval returned **8,662 public characters** for human review. The form was then cancelled without submitting. No browser page errors occurred and no research record was retained.
- **Basic security scan completed with no findings.** This is not deep code analysis or production certification.
- Submission and owner approval were exercised by the transaction-rollback database suite rather than retained through the browser. No real client data, files, credentials, or reports were used.
- Final cleanup readback found **49/49 unique products, 13 pending criteria, 0 active rules, 0 product-research rows, 0 synthetic candidates, 0 clients, and 0 documents**. The research table's final privileges are service-role administration plus authenticated read-only access subject to staff RLS.

### Documented limits and pending capability

- **AI source analysis is pending and visibly labeled.** No AI research connector is configured. The implemented workflow retrieves and stores public source text for human review; it does not summarize, infer criteria, or activate rules with AI.
- Direct retrieval supports public HTML/text only. PDFs, blocked pages, unsupported content types, responses over 1 MB, timeouts, and unreadable pages require truthful manual source submission with an excerpt/locator. No retrieval failure is treated as verified evidence.
- Product identities and marketing ranges are not underwriting criteria. Fifth Third and Zions offers that could not be verified in the research pass were omitted rather than guessed; lender identities with no verified products remain visible.
- No background/scheduled research, automatic lender applications, bureau pulls, owner rule approval, client publication, or public deployment was added.

## Section 04 — Underwriting engine, rule coverage and conditional financial questions

**State: completed for the safely available, documented scope.** The app remains unpublished and is not production certified.

### Implemented and verified

- Added `goal_questionnaire_answers` with per-goal numeric/text values, explicit `answered`/`unknown`/`skipped` state, financial-source provenance, staff-only verification, author timestamps, immutable goal/client linkage, audit triggers, and active-assignment/client RLS. Unknown and skipped values remain null; explicit zero is preserved.
- Added goal-specific conditional question UI to staff and client goal views. Active rules determine relevant questions through a narrow authenticated definition function that returns only question metadata, never lender/product/source/threshold/client records. Every row has “I don’t know / Skip for now”; client edits reset staff verification.
- Legacy client-global financial answers are no longer matching inputs. Personal goals use their own goal answers, business goals use only the selected business plus goal answers, and custom product input keys never fall back to another relationship or business.
- Expanded deterministic coverage for exact bureau/model scores (including equivalent FICO 08/FICO 8 spelling without version swaps), inquiry lookbacks, DTI, tradelines, utilization, bankruptcy, late payments, delinquencies, collections, charge-offs, existing-product age, membership age, direct deposit, business age/revenue, banking/deposit history, ownership, income, and cited allowed-state lists.
- Added rule `input_key`, `text_threshold`, `application_mode`, and `requires_verified_facts` metadata to direct proposals and owner source review in migrations `0027`–`0029`. Existing Prosper Note Channel candidates were backfilled only on the new scope fields: six individual-only criteria and one joint note. All 13 remain pending.
- Self-reported evidence is labeled separately from verified evidence. Verification-required conditions remain Unknown until staff verification. Joint applications receive no suitability score and remain Needs Review unless an explicitly joint-scoped rule exists.
- Strict mode remains verified-primary-only. Expanded secondary/observational signals cannot automatically disqualify; a secondary failure now always forces review rather than appearing as a potential match.
- Added mismatch explanations, improvement/review checklists, source links/dates, stale/effective handling, and explicit product-level APR/amount assumptions. Suitability remains 0–100 relative fit, never approval probability; no automatic publication.

### Acceptance results — 2026-11-17

- **96/96 application tests passed across 12 files.** Tests cover model/bureau swaps, FICO 08 aliases, unknown/zero, verified vs self-reported inputs, custom input isolation, DTI, inquiry windows, derogatories, location, joint scope, secondary signals, and improvement explanations.
- **TypeScript check and production build passed.** Existing dependency deprecation/bundling warnings remain non-blocking.
- **11/11 transaction-isolated synthetic database checks passed** for own/cross-client visibility and writes, client self-verification attempts, verification reset on edit, Skip/null, explicit zero, author audit, immutable goal linkage, and application-mode validation. Two read-only checks confirmed owner-only review and narrow question metadata.
- **Synthetic owner Chromium workflow passed:** created a DEMO client and personal goal, saved unverified and verified joint answers, exercised Skip, restored a verified answer, and evaluated 24 personal-scope products. Every result was Needs Review with null score because no rules are active; the joint warning rendered; zero console errors occurred; nothing published. No separate employee/client browser session was used in this section.
- **Basic security scan completed with no issues found.** This was not deep code analysis or production certification.
- Cleanup/readback found **0 clients, 0 goal answers, 0 match runs, 0 published snapshots, 0 active rules, and 13 pending source candidates**. No files or real client data were used.

### Documented limits

Undisclosed lender calculations and unsupported joint variations intentionally remain Needs Review rather than inferred rules. Existing candidate thresholds, representability, review status, and sources were not changed; no owner approval or rule activation occurred. No external capability is blocked for this section.

## Section 05 — Funding strategy planner and scenario simulations

**State: completed for the safely available, documented scope.** The app remains unpublished and is not production certified. No external capability is blocked.

### Implemented and verified

- Added a staff-only, exact goal-scoped funding planner for personal goals and each separately selected business. Existing goal/business facts remain isolated; no client-global or other-business revenue, expenses, debt, or cash flow is substituted.
- Added staff-entered conservative, medium, and expanded hypothetical request amounts. These are explicitly labeled assumptions, not applicant-specific lender estimates, approvals, expected offers, or cash guarantees.
- Added product-marketing amount comparison and amortizing payment ranges only when owner-reviewed APR and term values and their official sources exist. Unknown APR, term, sources, or comparable inputs remain Unknown. Undocumented fees and exact rate/term availability are not inferred.
- Added separate hypothetical loan-cash and revolving-limit totals. Card limits and available credit are never added to cash. Personal DTI and business remaining-cash-flow arithmetic appear only with documented comparable inputs; no affordability or approval threshold is invented.
- Added product reordering, exclusion/inclusion, per-item assumptions, affordability notes, source-linked eligibility explanations, and editorial sequencing notes. Unknown pull type, membership, or product-age requirements remain uncertain.
- Added immutable approved scenarios with staff-only RLS, approval provenance, audit field names, archive support, and exact client/goal binding. Clients have no direct scenario-table access.
- Added separate employee-controlled creation of an unpublished recommendation draft from an approved scenario. Existing manual publication, active-assignment, and immutable-published-snapshot safeguards remain unchanged; scenario approval never publishes or runs matching.
- Added internal hypothetical per-bureau utilization/paydown preview against active documented `max_utilization` rules only, with bureau/model mismatch, missing evidence, ambiguous tradelines, and inactive rules excluded. No FICO/score prediction or automatic recommendation update.
- Extended owner-reviewed product-term research with source URL/date validation. Secondary sources remain notes and cannot apply marketing terms or activate rules.

### Acceptance results — 2026-11-17

- **110/110 application tests passed across 13 files**, including synthetic payment math, unknown APR/term/source handling, revolving-limits-not-cash, personal DTI, Business A versus Business B cash-flow isolation, unknown inputs, and sequencing uncertainty. Existing parser, matching, goal, business, catalog, and routing suites remain green.
- **17/17 transaction-rollback funding-strategy database checks passed**: client denial, staff/owner approval, goal binding, approved immutability, archive provenance, snapshot-draft separation, source-scenario deletion safety, grants, and audit coverage.
- **5/5 transaction-rollback documented-term research checks passed**, including official owner review, missing-source rejection, secondary-note isolation, and no rule activation. The existing **23/23 product-research regression checks also passed**.
- TypeScript check and production build passed. Basic security scan found no issues; this is not a deep security certification.
- Synthetic owner browser workflow passed: personal goal → scoped Prosper product → three request tiers → Unknown payment with undocumented term → saved draft → item approval → complete strategy approval → unpublished draft v1. The separate **Publish now** button remained visible and was not used; final resumed-page console errors were zero.
- Cleanup/readback: **0 clients, 0 scenarios, 0 snapshots, 0 match runs, 0 product-research rows, 0 products with documented terms, 0 active rules, and 13 original pending source criteria**. No real report, client data, or external client disclosure was used.

### Documented limits and deferred work

- No documented product terms are currently approved, so live payment calculations correctly remain Unknown until the owner reviews sourced terms. Existing marketed APRs are not treated as guaranteed pricing.
- Conservative/medium/expanded values require staff assumptions; the system does not fabricate applicant-specific funding ranges.
- Sequencing is editorial guidance, not an automated application schedule. No application is submitted and Q70 outcome handling remains undecided.
- Utilization-linked rule preview has no lender-specific result while active documented rules are zero. It does not alter stored matches, reports, or published recommendations.
- No client-visible published strategy was created or tested in this section; only the internal approved scenario and unpublished staff draft were exercised. Q73/Q87 remain undecided.

## Section 06 — Guided application pipeline and outcome evidence

**State: completed for the safely available, documented scope.** The app remains unpublished and is not production certified. No external capability is blocked.

### Implemented and verified

- Preserved exactly five statuses: **Not Started, Submitted, Pending, Approved, Denied**. Only the owner or actively assigned employees with `can_update_applications` can create or edit tracking rows; clients retain read-only status/date views.
- Added optional goal and original-recommendation links with same-client/product database guards. Actual outcomes never rewrite match results, suitability scores, review status, reports, or published recommendations.
- Replaced the basic pipeline with guided staff application cards: official product source, verified application/rate-check destination, sourced preparation checklist, lender-stated document requirements, pull-risk wording, and explicit no-automatic-submission language.
- Verified and seeded two real destinations: Wells Fargo’s `icomplete.wellsfargo.com` rate-check/getting-started flow and Prosper’s `/pl-offers/get-rate/step-1` flow. Wells Fargo includes three checklist items, five conditional document items, and official wording distinguishing no-impact option checks from a hard pull after application submission. Prosper includes three sourced steps and limited rate-check wording; no unsupported document list or later-pull claim was added.
- Extended owner-reviewed product research with application URL, checklist, document, and pull-risk fields. Credential-free HTTPS and non-home-page destinations are required; official URLs remain on the lender’s domain, secondary sources remain notes, and no research action activates underwriting rules.
- Added separate staff-only `application_outcomes` records with optional amount, APR, term, denial reason, bureau/model, evidence document, source note, and provenance. Q70 remains undecided: none of those detail fields is mandatory.
- Client self-reports and staff observations remain unverified. `staff_verified` requires lender document/portal/direct-confirmation provenance plus a same-client evidence document or source note, and records verifier/time. Clients cannot read this staff-only outcome table.
- Added current/previous-month metrics calculated only from actual non-demo application rows. Recorded counts and lender-evidence-verified counts are separate; self-reports, demo rows, match recommendations, and unsupported statuses never become verified outcome metrics.
- Status and outcome edits are audited with changed field names, not outcome values. No status/outcome trigger creates announcements, email, SMS, reminders, readiness tasks, or other follow-up tasks.

### Acceptance results — 2026-11-17

- **115/115 application tests passed across 14 files**, including exact status labels, demo/other-month/invalid-status exclusion, self-report versus verified metrics, application URL provenance, home-page/HTTP rejection, guidance parsing, and all previous suites.
- **32/32 transaction-rollback Section 06 database checks passed**: exact statuses, same-client links/evidence, optional Q70 fields, self-report verification rejection, lender-evidence verification, recommendation immutability, silent status changes, audits, client read-only boundaries, employee permission/assignment enforcement, real guidance seeds, home-page/cross-host rejection, separate host review for combined URL proposals, owner review, secondary-note isolation, and zero rule activation.
- The existing **23/23 product-research regression checks also passed** after extending the research functions.
- TypeScript check and production build passed. Basic security scan found no issues; this is not deep code analysis or production certification.
- Synthetic owner Chromium workflow passed with zero console errors: DEMO client and personal goal → Wells Fargo tracking row → verified destination/checklist/documents/pull risk → Submitted → unverified client self-report → lender-document verification with no amount/APR/term → Approved. The external application link was inspected but not opened or submitted.
- Settled UI readback showed **Approved** and **lender evidence verified**. Database readback showed null optional amount/APR/term, zero announcements, and zero readiness tasks. Command Center monthly metrics showed zero for the synthetic DEMO row.
- Cleanup/readback found **0 clients, 0 applications, 0 outcomes, 0 product-research rows, 0 active rules, 0 published snapshots, 13 pending source criteria, and 2 guided products**. No real client data, report, file, credential, or lender application was used.

### Documented limits and deferred work

- Only Wells Fargo Personal Loan and Prosper Personal Loan currently have verified application destinations. Other products show an honest empty state until official guidance is submitted and owner-reviewed; a lender home page is never substituted.
- Prosper’s sourced document list and later application pull impact remain Unknown rather than inferred. Wells Fargo document items are conditional “if requested,” not mandatory for every applicant.
- Monthly metrics are operational counts, not approval probabilities or lender-performance learning. Observed-outcome learning remains Phase 3 and subject to owner review; Q70 detailed outcome design remains undecided.
- A separate live client-browser session was not used in this section. Client read-only status/date access and denial of outcome-table reads/writes were exercised by rollback database tests; the owner browser workflow was exercised end to end.
- No automated submission, bureau pull, email/SMS, dashboard notification, reminder, follow-up task, recommendation publication, or public deployment was added. Q73/Q87 remain undecided.
