# Security Readiness — NOT production certified (updated 2026-11-20)

No go-live approval has been given. Do not process real client data or publish until the gaps below are closed and the owner approves.

## Verified controls
- RLS on all app tables with security-definer helpers; assignment-scoped staff access; owner-only deletes of reports.
- Private document bucket, short-lived signed URLs, owner-only orphan cleanup.
- Owner bootstrap allowlist + single-owner index; roles only via confirmation/invitation.
- Audit trigger on app tables records field names only (no values).
- Credit PDFs and OCR processed only in the browser; no report text sent to external services.
- Consent version `2026-11-v1` required for uploads/staging and audited.
- Basic backend security scan: no findings (2026-11-18).
- Current authenticated synthetic QA: client cannot read confidential notes, other-client records or draft recommendations, self-grant roles, assign employees, complete unpublished/other-client tasks or export drafts. Assigned staff evidence views use a detached opener and short-lived signed PDF; document-view audit observed. Revoked employee's still-live token cannot read documents and UI displays Access suspended.
- Automatic client report processing no longer changes JWT claims to impersonate an owner. Migration 0041 revalidates ownership, uploader, consent, document/report identity and the complete structured payload; automatic acceptance has no human reviewer. Low-confidence/conflicting report fields remain Unknown in loadFacts even when automatically confirmed under owner policy.
- Post-revocation new uploads and Q73 review flags verified. Migration 0040 requires active staff assignment for publication transitions, while released content/client ownership remain immutable.
- 136 unit tests, 21 read-only DB safeguards and real synthetic role/browser tests passed. Latest preview build/typecheck OK. Cleanup: no clients, reports, documents, tasks, submissions, snapshots, assignments, private objects or temporary app roles/profiles left. Disposable hosted auth users are removed automatically at turn end.

## Outstanding gaps
1. **Passkeys BLOCKED** — backend returns `passkey_disabled`.
2. **Remote session revocation BLOCKED** — deactivated employees' tokens remain valid until expiry, though data access is blocked by RLS.
3. Section 07 verified 2026-11-20; Chromium and mobile WebKit PDF downloads tested, physical Safari/iOS device and large-report memory stress not tested.
4. Section 08 partial — local AI public-source pilot built and app flow verified with simulated worker replies; actual owner Windows/model execution remains outstanding. No raw reports enter the pilot; results remain unverified advisory notes. See LOCAL_AI.md.
5. **No app-level rate limiting** verified on research retrieval or exports.
6. All six client tabs checked at 390px, light/dark screenshots inspected, employee and client flows exercised; exhaustive color-contrast/keyboard/screen-reader audit remains incomplete.
7. Deep security review was requested this pass but no completed result was available when checked; retrieved scan results were older (2026-11-17), not evidence of a clean current deep review. No penetration test or production certification.
8. **Automatic confirmation accuracy risk** — owner chose confirmation of every reading, including uncertain values. Automatic acceptance is not human verification and medium-confidence/self-submitted values can still be wrong or manipulated. Low-confidence fields are now excluded in loadFacts, but tradeline/history/planner paths and evidence tampering need a comprehensive policy review before real-data use. No independent server-side PDF verification is claimed; OCR remains browser-local.
9. Database linter: private bootstrap allowlist intentionally has RLS with no policies. 25 authenticated security-definer helpers remain reported after revoking eight unnecessary trigger-helper grants; they are expected app entry points but every permission/validation path still needs deeper review. Linter warnings are not certification or blanket clearance.
10. PDF handling has 25MB/80 text-page/20 OCR-page caps and timeouts; error/cancellation memory cleanup and worst-case scanned-document stress remain to be tested comprehensively. Research/export app-level abuse throttles remain open.

## Consent, retention and regulated data
- Credit reports are consumer report data; owner should obtain legal review (FCRA, GLBA Safeguards Rule, state privacy laws) before go-live.
- Retention: reports kept until owner deletes, unless law requires otherwise; there is no automated retention schedule yet.
- Consent text/version should be legally reviewed; changing it requires a new version string.
- Breach response, vendor agreements, and backups policy are not documented in-app.

## Final deep-review correction (2026-11-20)
- Completed deep review reported one staff-assignment probe warning and three automatic-verification errors. Migration 0042 restricts caller-selected relationship checks and disables automatic promotion to verified evidence. Automatic receipt/import is retained, but staff acceptance is now required for trusted matching; this safety correction supersedes earlier automatic-confirmation statements above. Owner-requested automation cannot establish independent accuracy of client-supplied readings.
- Final real synthetic browser check passed: imported submission has no staff reviewer; client verification attempt and another-user assignment probe denied; loadFacts has no scores before staff review and exact Experian FICO 8=702 after authorized owner acceptance. Final synthetic file/client removed; no policies approved or public deployment.
- Deep findings were addressed and tested locally; a fresh deep rescan is still required before claiming clearance. Sections 08/09 remain partial; passkeys, remote token invalidation, AI interpretation, abuse throttles, large-PDF stress, full accessibility and legal go-live approval remain open.
