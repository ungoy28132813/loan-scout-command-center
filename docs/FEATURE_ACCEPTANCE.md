# Feature Acceptance — Loan Scout Matching Tool (2026-11-18)

Statuses: **BUILT** (code exists), **TESTED** (verified by automated/rollback/browser checks recorded in BUILD_QUEUE.md), **PARTIAL**, **BLOCKED**, **NOT BUILT**.
Evidence this pass: 115/115 unit tests (14 files), TypeScript clean, basic backend security scan clean, live readback below. No browser run was performed in this pass; browser evidence cited is from earlier sections.

Live readback: 0 clients, 0 demo clients, 0 documents, 0 stored files, 24 lenders, 49 products, 0 approved rules, 13 pending source candidates, 0 published snapshots.

| Area | Requirement | Status | Reason / evidence |
| --- | --- | --- | --- |
| Brand | Original logo + MATCHING TOOL subtitle, palette, fonts, light/dark per user | TESTED | Logo asset unchanged; theme saved on profile |
| Auth | Email+password Create Account, magic link, recovery | TESTED | Section 01 |
| Auth | Passkeys | BLOCKED | Backend returns `passkey_disabled`; no fake WebAuthn |
| Roles | Owner bootstrap allowlist, invitations, single owner | TESTED | Section 01 regression SQL |
| Roles | Employee deactivation + client transfer | TESTED | Existing sessions persist until token expiry (BLOCKED remote sign-out) |
| Access | Assignment-based RLS, cross-tenant isolation | TESTED | 133 rollback checks (Section 01) |
| Documents | Private bucket, signed URLs, owner-only delete, six categories | TESTED | Sections 01/02 |
| Credit PDF | Browser-local parsing + local English OCR, consented client staging | TESTED | Section 02; non-English/poor scans = manual review |
| Credit | Per-bureau scores with exact model/date, no model swap | TESTED | Sections 02/04 |
| Phase 2 | Historical comparison, utilization simulator | TESTED | Module 1 |
| Business | Multiple business profiles, goal-scoped facts | TESTED | Module 2 |
| Catalog | 24 lenders, 49 sourced products; original 35 not reconstructed | TESTED | Section 03; no invented products |
| Research | On-demand official retrieval + manual submission, owner review | TESTED | Section 03 |
| Research | AI-assisted source interpretation | NOT BUILT | Section 08 not implemented |
| Rules | Deterministic engine, unknown never disqualifies, 0–100 suitability only | TESTED | Section 04 |
| Rules | Owner-only activation | TESTED | 0 active rules; 13 candidates pending by design |
| Planner | Goal-scoped scenarios, approval gate, draft-only handoff | TESTED | Section 05 |
| Applications | Five statuses, staff-only edits, silent changes, optional outcomes (Q70 undecided) | TESTED | Section 06 |
| Applications | Guided application guidance for all lenders | PARTIAL | Only Wells Fargo/Prosper have reviewed guidance |
| Portal | Published-only client view, announcements, read-only statuses | BUILT | Pre-existing; Section 07 re-verification incomplete |
| Portal | Task evidence attachments + staff verification | TESTED | Section 07 DB checks; staff view not browser-tested |
| Publishing | Manual-only release; scheduled release disabled | TESTED | Section 07 DB checks |
| Publishing | Q73 re-review flag on new report | BUILT | `flag_rereview` trigger; Q73 undecided |
| Export | Downloadable strategy PDF without internal notes | TESTED | Chromium download + unit/DB checks |
| Intelligence | Bureau-pull observations, outcome aggregates with sample thresholds | TESTED | Section 08 DB + unit checks; panel not browser-tested |
| Ops | Rate limits on research/auth endpoints | PARTIAL | Managed auth limits only; no app-level limits verified |
| QA | Mobile/contrast/dark-mode audit | NOT TESTED | No browser audit this pass |
