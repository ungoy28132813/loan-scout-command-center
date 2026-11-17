# Roadmap
## Phase 1 — open
- [x] Install original Loan Scout LLC logo (public/loan-scout-approved-logo.webp)
- [x] Automated credit-report PDF extraction — browser-local, text-layer PDFs, best effort
- [ ] OCR for scanned/image-only reports (not built; flagged as unreadable)
- [ ] Review-confirm action for automatically read accounts
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
- [ ] Phase 2 multi-business profiles, independent goals, and verified-state financial inputs
- [ ] Goal/business-specific matching facts and product scope
- [ ] Multi-business security, unit, and synthetic browser verification with cleanup
## Phase 2 / 3 — see /roadmap page in app
