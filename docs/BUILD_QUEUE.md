# Loan Scout Matching Tool — Build Queue

This queue applies only to the existing Loan Scout Matching Tool project. Sections are implemented and committed in order. Historical approved Q1–90 decisions remain authoritative; Q70, Q73, and Q87 remain undecided and retain neutral safety defaults. No section permits fabricated lender criteria, real client credit data in tests, fake authentication, or public deployment.

| Section | Scope | State |
| --- | --- | --- |
| 01 | Security, identity and consent | **completed** — available scope verified; two external capability blockers below |
| 02 | Credit PDF / OCR | **completed** — local English OCR and verified-analysis scope verified; documented scan/layout limits below |
| 03 | Lender Catalog / Research | queued |
| 04 | Underwriting Rules / Questionnaires | queued |
| 05 | Funding Planning / Simulators | queued |
| 06 | Guided Applications / Outcomes | queued |
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
