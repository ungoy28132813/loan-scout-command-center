# Loan Scout build roadmap

## Platform / security
- [x] Role-based auth, invitations, active assignments, private documents, consent, audit logs, Security Center
- [x] Private owner bootstrap; no first-signup takeover; public registration off by default
- [x] Profile self-update safeguard and regression checks
- [x] Owner-only orphaned private-file inventory and safe cleanup
- [x] Optional email/password Create Account + magic links; no shared admin login
- [x] Section 01 security/identity/consent acceptance; passkey and remote sign-out blockers documented

## Phase 1
- [x] Client directory, documents, staff extraction and client staging
- [x] Browser-local PDF parser + synthetic fixtures; consented client structured submission and staff import/acceptance
- [x] Source-backed lender products and pending owner-only source review (no active rules yet)
- [x] Deterministic matching, review center, immutable published snapshots, PDF export
- [x] Basic application pipeline, readiness tasks, one-way announcements

## Phase 2
- [x] Business funding profiles + goal-specific financial scoping (implemented before the build queue)
- [x] Historical credit-report comparison + utilization/paydown simulator (implemented before the build queue)
- [x] Section 02 browser-local OCR and expanded verified report analysis
- [x] Section 03 expanded official-source product catalog and on-demand research/review
- [x] Section 04 goal-scoped conditional answers, provenance, expanded deterministic rule coverage, joint safeguards
- [ ] Business financial modeling / cross-product funding scenarios
- [ ] Observed outcomes / learning (Phase 3; owner review required)
- [ ] On-demand lender policy research (Phase 3; no scheduled monitoring)

## Build queue acceptance
- [x] Sections 01–04 completed with documented acceptance and rollback/security checks
- [ ] Sections 05–09: queued in docs/BUILD_QUEUE.md; do not start until submitted in order
