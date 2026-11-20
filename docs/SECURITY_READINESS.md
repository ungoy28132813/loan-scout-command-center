# Security Readiness — NOT production certified (2026-11-18)

No go-live approval has been given. Do not process real client data or publish until the gaps below are closed and the owner approves.

## Verified controls
- RLS on all app tables with security-definer helpers; assignment-scoped staff access; owner-only deletes of reports.
- Private document bucket, short-lived signed URLs, owner-only orphan cleanup.
- Owner bootstrap allowlist + single-owner index; roles only via confirmation/invitation.
- Audit trigger on app tables records field names only (no values).
- Credit PDFs and OCR processed only in the browser; no report text sent to external services.
- Consent version `2026-11-v1` required for uploads/staging and audited.
- Basic backend security scan: no findings (2026-11-18).

## Outstanding gaps
1. **Passkeys BLOCKED** — backend returns `passkey_disabled`.
2. **Remote session revocation BLOCKED** — deactivated employees' tokens remain valid until expiry, though data access is blocked by RLS.
3. Section 07 verified 2026-11-20; Safari/iOS download not tested.
4. Section 08 partial — observations and k>=5 owner aggregates verified; AI source analysis not built.
5. **No app-level rate limiting** verified on research retrieval or exports.
6. **No end-to-end browser QA this pass** for mobile, contrast, or dark mode.
7. **No penetration test or deep code review** performed.

## Consent, retention and regulated data
- Credit reports are consumer report data; owner should obtain legal review (FCRA, GLBA Safeguards Rule, state privacy laws) before go-live.
- Retention: reports kept until owner deletes, unless law requires otherwise; there is no automated retention schedule yet.
- Consent text/version should be legally reviewed; changing it requires a new version string.
- Breach response, vendor agreements, and backups policy are not documented in-app.
