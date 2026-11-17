<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules (Loan Scout Matching Tool)
- Access control lives in the database (RLS + security-definer helpers `is_owner`, `is_client_staff`, `is_client_self`, `has_perm`); UI permission checks are cosmetic only. Why: sensitive credit data must be server-enforced.
- Client documents go to the private `client-documents` bucket under `{client_id}/…`, viewed only via short-lived signed URLs; only the owner may delete. Why: no public links to reports.
- Auditing is done by the `audit_trigger` on every app table, recording field names only (no values). Why: complete audit trail without PII in logs.
- Matching is the pure deterministic module `src/lib/match-engine.ts` (tested); it evaluates only owner-approved rules with provenance, unknown never disqualifies, estimates never fail. Why: honesty and reproducibility.
- Clients only ever see `published_snapshots` with status `published`; snapshots are immutable after publish and require an active assignment (DB trigger). Why: human review before any client visibility.
- After bootstrap, roles come only from owner invitations (or the public-signup toggle → unassigned client). Why: no self-granted privileges.
- The official logo is `public/loan-scout-approved-logo.webp`, rendered only via `src/components/brand/Logo.tsx` on a white holder; never generate, redraw or imitate it.
- Owner bootstrap: only a confirmed email in the private `owner_bootstrap_allowlist` table becomes owner, and only while no owner exists (single-owner unique index). All roles are granted on email confirmation via `grant_roles_on_confirm`. Why: prevents first-signup ownership takeover.
- Security regression checks live in `tests/sql/owner_bootstrap_regression.sql`; run them with a read query after any auth/role change.
- Credit-report PDF reading runs only in the staff browser (`src/lib/credit-report-parser/`, pdf.js with a locally bundled worker); clients' uploads wait for staff, who need `can_edit_extractions`. Why: no report text leaves the browser and RLS is unchanged.
- The parser saves only structured values with page/confidence and `needs_review`; models are never inferred, unknown stays null, status is never set to verified automatically, and `needs_review` values are excluded from matching facts. Why: partial reads must not pass as verified.
- Lender underwriting criteria from public sources live in `source_review_candidates` (seeded idempotently from `supabase/seed/`); only the owner's `review_source_candidate` function can turn a representable candidate into an active rule, and non-representable criteria stay non-enforced notes. Why: owner approves every policy change and the engine never mis-maps criteria.
- Channel-specific criteria attach to a separately named scoped product record, never to the generic product. Why: channel eligibility must not be generalized.
- Orphaned storage inventory and cleanup use owner-checked server functions; admin access loads only after verification, returns metadata without URLs, and deletes only unregistered UUID paths past a waiting period. Why: test-file cleanup must not expose or casually delete private reports.
