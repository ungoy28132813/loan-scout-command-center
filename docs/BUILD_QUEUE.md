# Loan Scout Matching Tool — Build Queue

This queue applies only to the existing Loan Scout Matching Tool project. Sections are implemented and committed in order. Historical approved Q1–90 decisions remain authoritative; Q70, Q73, and Q87 remain undecided and retain neutral safety defaults. No section permits fabricated lender criteria, real client credit data in tests, fake authentication, or public deployment.

| Section | Scope | State |
| --- | --- | --- |
| 01 | Security, identity and consent | **completed** — available scope verified; two external capability blockers below |
| 02 | Credit PDF / OCR | queued |
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

OCR, lender research, further underwriting inputs, simulators, guided applications/outcomes, exports, bureau-pull intelligence, analytics, and final readiness remain in their ordered queued sections. No source rule was approved and nothing was published.
