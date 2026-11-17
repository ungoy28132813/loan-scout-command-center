# Roadmap
## Build queue — current
- [x] Section 01: security, identity, consent; audit and test owner/employee/client boundaries
- [x] Section 01: safely available fixes, acceptance results, blockers, verification and cleanup (docs/BUILD_QUEUE.md)
- [x] Section 02: browser-local OCR, evidence parsing, review acceptance, and validated-match recomputation
- [x] Section 02: final build log, cleanup verification, and commit (tests and documentation complete)
- [ ] Section 03: verified product catalog expansion and on-demand source research/review
- [ ] Section 03: seed/security/browser verification, documentation, cleanup, and commit
- [ ] Sections 04–09: queued in docs/BUILD_QUEUE.md; do not start until submitted in order
## Phase 1 — open
- [x] Install original Loan Scout LLC logo (public/loan-scout-approved-logo.webp)
- [x] Automated credit-report PDF extraction — browser-local, text-layer PDFs, best effort
- [x] OCR for scanned/image-only reports — browser-local English OCR, 20 scanned-page cap, mandatory review
- [x] Review-confirm action for automatically read accounts — atomic staff acceptance and audited corrections
- [x] Signed-in end-to-end upload test — owner session, DEMO client, synthetic 3-bureau PDF read in browser
- [ ] Passkey sign-in
- [ ] Forced remote sign-out on deactivation
- [ ] Automatic release of scheduled publications
- [x] First real product catalog (5 products + scoped Prosper Note Channel record) and owner source review queue
- [ ] Owner reviews 13 pending source criteria (waiting on owner)
- [ ] Questionnaire inputs + rule types for existing-account age, membership duration, direct deposit (kept as notes for now)
- [ ] Optional: Chase My Chase Loan as a card-feature product type (not added)
- [x] Production-readiness pass: owner empty states and accurate security/authentication copy
- [x] Production-readiness pass: internal function privileges and rollback-only role/RLS regression checks
- [x] Production-readiness pass: synthetic owner workflow through publication and cleanup
- [ ] Temporary-account browser role tests (waiting on test-user creation approval; SQL role simulations passed)
- [x] Persist live profile email/activation/department safeguard and regression tests
- [x] Owner-only orphaned private test-file inventory and safe cleanup (known synthetic orphan deleted)
- [x] Client-local PDF extraction into consented unverified staging with staff import/acceptance
- [x] Client extraction security regression tests and synthetic client-to-staff browser workflow
- [x] Phase 2 historical credit-report comparison with confirmed provenance-aware changes
- [x] Phase 2 revolving utilization/paydown simulator with conservative account reconciliation
- [x] Phase 2 synthetic unit and browser verification with cleanup
- [ ] Lender-specific simulation from hypothetical utilization (not built; utilization math only)
- [x] Phase 2 multi-business profiles, independent goals, and verified-state financial inputs
- [x] Goal/business-specific matching facts and product scope
- [x] Multi-business security, unit, and synthetic browser verification with cleanup
- [ ] Advanced business financial modeling and affordability scenarios (not built; basic comparable-period math is live)
## Phase 2 / 3 — see /roadmap page in app
