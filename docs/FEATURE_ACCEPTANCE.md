# Feature Acceptance — Loan Scout Matching Tool (updated 2026-11-20)

Statuses: **BUILT** (code exists), **TESTED** (verified by automated/rollback/browser checks recorded in BUILD_QUEUE.md), **PARTIAL**, **BLOCKED**, **NOT BUILT**.
Evidence this pass: 136/136 unit tests (17 files), automatic preview build/typecheck OK; 21/21 read-only DB checks (owner bootstrap + publication/automatic-processing readiness). Real authenticated Chromium client/employee/owner synthetic workflows and WebKit client PDF download passed. This is not production certification or complete Q1–90 acceptance.

Cleanup readback: 0 clients, documents, reports, submissions, readiness tasks, assignments, published snapshots and stored files; 0 temporary app roles/profiles. 24 lenders, 49 products, 13 source candidates and 4 active owner-approved Prosper Note Channel rules. This QA activated no rules. The earlier 0-active/13-pending checkpoint predates the owner's explicit approval (4 approved, 9 kept as notes). Disposable hosted test users are automatically removed at turn end; no permanent test credentials were created.

| Area | Requirement | Status | Reason / evidence |
| --- | --- | --- | --- |
| Brand | Original logo + MATCHING TOOL subtitle, palette, fonts, light/dark per user | TESTED | Logo asset unchanged; theme saved on profile |
| Auth | Email+password Create Account, magic link, recovery | TESTED | Section 01 |
| Auth | Passkeys | BLOCKED | Backend returns `passkey_disabled`; no fake WebAuthn |
| Roles | Owner bootstrap allowlist, invitations, single owner | TESTED | Section 01 regression SQL |
| Roles | Employee deactivation + client transfer | TESTED | Synthetic employee's existing session showed Access suspended and lost document access immediately; forced token invalidation remains blocked |
| Access | Assignment-based RLS, cross-tenant isolation | TESTED | 133 rollback checks (Section 01) |
| Documents | Private bucket, signed URLs, owner-only delete, six categories | TESTED | Sections 01/02 |
| Credit PDF | Browser-local parsing + local English OCR, consented client staging | TESTED | Section 02; non-English/poor scans = manual review |
| Credit | Per-bureau scores with exact model/date, no model swap | TESTED | Latest report-date selection; no old-field fallback; conflicting, missing and low-confidence facts Unknown; 10 new synthetic regressions |
| Credit | Owner-policy automatic report confirmation | PARTIAL | Direct ownership/consent/payload validation, no JWT identity impersonation, no human reviewer attribution; auto-confirmation is not independent verification. Low-confidence fields excluded by loadFacts; OCR/tradeline uncertainty remains a readiness risk |
| Phase 2 | Historical comparison, utilization simulator | TESTED | Module 1 |
| Business | Multiple business profiles, goal-scoped facts | TESTED | Module 2 |
| Catalog | 24 lenders, 49 sourced products; original 35 not reconstructed | TESTED | Section 03; no invented products |
| Research | On-demand official retrieval + manual submission, owner review | TESTED | Section 03 |
| Research | AI-assisted source interpretation | NOT BUILT | Section 08 not implemented |
| Rules | Deterministic engine, unknown never disqualifies, 0–100 suitability only | TESTED | Section 04 |
| Rules | Owner-only activation | TESTED | 4 clear Prosper Note Channel rules explicitly approved by owner; 9 items remain non-enforcing notes; QA changed none |
| Planner | Goal-scoped scenarios, approval gate, draft-only handoff | TESTED | Section 05 |
| Applications | Five statuses, staff-only edits, silent changes, optional outcomes (Q70 undecided) | TESTED | Section 06 |
| Applications | Guided application guidance for all lenders | PARTIAL | Only Wells Fargo/Prosper have reviewed guidance |
| Portal | Published-only client view, announcements, read-only statuses | TESTED | Chromium synthetic client sees own published strategy/task only; draft/internal/cross-client reads denied; client status modification denied |
| Portal | Task evidence attachments + staff verification | TESTED | Synthetic client upload/attachment; assigned staff opens signed PDF without opener, access audit recorded, verifies task; verification reads back in client portal |
| Publishing | Manual-only release; scheduled release disabled | TESTED | Section 07 DB checks |
| Publishing | Q73 re-review flag on new report | TESTED | New upload after staff revocation now succeeds and flags published snapshot; status/content unchanged; unassigned new publication, ownership mutation and content rewrite denied; Q73 remains undecided |
| Export | Downloadable strategy PDF without internal notes | TESTED | Real Chromium and mobile WebKit downloads; pypdf validated citations/date/disclaimer and absence of planted confidential/draft/cross-client content; no physical iOS test |
| Intelligence | Bureau-pull observations, outcome aggregates with sample thresholds | TESTED | Section 08 DB + unit checks and prior owner browser history/coverage check; AI interpretation remains unbuilt |
| Ops | Rate limits on research/auth endpoints | PARTIAL | Managed auth limits only; no app-level limits verified |
| QA | Mobile/contrast/dark-mode audit | PARTIAL | All six client tabs fit 390px; light/dark screenshots inspected; prior owner desktop/mobile checks. No exhaustive automated contrast/keyboard/screen-reader audit |

## Accuracy and security corrections in this QA
- `report-facts.ts` selects a current snapshot per bureau by report date instead of merging older report values into a newer incomplete report. Date ambiguity, unreadable newest reports, conflicting score-model aliases and low-confidence fields remain Unknown.
- Migration 0040 allows review-metadata updates after assignments are revoked without permitting a fresh publication, changing client ownership or rewriting released content. Eight internal trigger helpers no longer have authenticated/anonymous execution grants.
- Migration 0041 removes owner JWT impersonation from automatic client imports; validates source identities and consent again, preserves citations/confidence and records automatic confirmation without a human reviewer.
- Evidence viewing records a document-view audit before navigating to a 60-second signed PDF URL. Portal data refreshes after uploads and reports actual confirmation receipt status.
- Detailed limits and remaining work: SECURITY_READINESS.md. Sections 08 and 09 remain partial; no public deployment or real customer report processing occurred.

## Final deep-review correction (2026-11-20)
- Completed deep review reported one staff-assignment probe warning and three automatic-verification errors. Migration 0042 restricts caller-selected relationship checks and disables automatic promotion to verified evidence. Automatic receipt/import is retained, but staff acceptance is now required for trusted matching; this safety correction supersedes earlier automatic-confirmation statements above. Owner-requested automation cannot establish independent accuracy of client-supplied readings.
- Final real synthetic browser check passed: imported submission has no staff reviewer; client verification attempt and another-user assignment probe denied; loadFacts has no scores before staff review and exact Experian FICO 8=702 after authorized owner acceptance. Final synthetic file/client removed; no policies approved or public deployment.
- Deep findings were addressed and tested locally; a fresh deep rescan is still required before claiming clearance. Sections 08/09 remain partial; passkeys, remote token invalidation, AI interpretation, abuse throttles, large-PDF stress, full accessibility and legal go-live approval remain open.
