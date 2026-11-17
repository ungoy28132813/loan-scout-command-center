# Loan Scout Codex handoff

## Existing project, not a rebuild

Lovable project: https://lovable.dev/projects/7644a367-5d5b-4460-94f0-a1594863acc9
GitHub repository: https://github.com/ungoy28132813/loan-scout-command-center
Default branch: main. Repository visibility was verified as Private, and Lovable reported in sync at connection time.
Project name: Loan Scout Command Center / Loan Scout Matching Tool.
Use this repository's existing application, logo, database, security model and approved decisions. Do not substitute the older Loan Scout Journey marketing funnel.

Read AGENTS.md, docs/BUILD_QUEUE.md, roadmap.md, and the approved requirements below before changing code. Existing AGENTS.md retains all Lovable-managed rules. Never rewrite pushed git history.

## Handoff status, November 16, 2026 (America/New_York)

- Sections 01-06 were recorded as completed in the existing build queue. Their results are prior Lovable-reported results, not new Codex verification.
- Section 06 was completed in commits 104457d and ca853db.
- Section 07 stopped when Lovable workspace credits ran out. Lovable reported partial backend support for prioritized tasks, same-client task evidence attachments, manual-only publication, and permission-checked strategy exports. Downloadable PDF generation code was added and TypeScript passed.
- Section 07 UI integration, actual PDF download/browser tests, production build verification, acceptance documentation, and an explicit final section commit were still unfinished. Do not treat a platform checkpoint or stale queue state as proof that Section 07 is complete.
- Sections 08 and 09 remain queued in Lovable. The queue was paused during GitHub setup. Coordinate writers; do not run competing edits on the same files or resume the Lovable queue while Codex is editing those sections.
- No public deployment is authorized. The app remains unpublished.
- Passkeys and owner-targeted remote sign-out had documented backend capability blockers. Read current code and documentation before making claims.
- The codebase contains the official logo at public/loan-scout-approved-logo.webp. The older knowledge statement that the logo is unavailable is superseded by that repository asset and AGENTS.md.
- The catalog was expanded to 49 documented product records across the 24 lender identities. This is not proof of restoring the exact original 35-product list; do not invent that mapping.
- Source criteria remain pending until explicit owner approval. Never automatically activate them.

## Codex environment setup

Keep the GitHub repository private and the reusable environment accessible to Only me.
Use the existing TanStack Start, React, TypeScript, Tailwind, Vite, Supabase and Drizzle stack.

1. Inspect package.json, bun.lock, bunfig.toml and current configuration.
2. Use a supported Node.js version for the pinned dependencies, preferably Node 22. Use Bun compatible with the checked-in lockfile. Run bun install --frozen-lockfile. Preserve the lockfile and bunfig.toml supply-chain rules; diagnose dependency failures rather than silently replacing the stack.
3. Run bun run test, bunx tsc --noEmit, and bun run build. Record actual results and failures. Run lint as applicable, separating pre-existing failures from changes.
4. Use bun run dev --host 0.0.0.0 to start the development server. Verify the server's actual URL and readiness.
5. Keep required secrets in supported secret/environment settings. Never put service-role keys, database passwords, session tokens, raw credit reports or real client data in code, logs or prompts. The existing .env uses Supabase project identifiers/URLs and publishable keys; these do not provide staff/owner access.
6. Existing backend schema and generated files are Lovable-managed under AGENTS.md. Do not edit drizzle/ or supabase/migrations/ directly. Coordinate required schema changes through Lovable and report unavailable access as blocked.
7. Use synthetic test data only. Do not modify real owner credentials, run destructive cleanup, publish recommendations, activate lender rules or deploy production as part of setup.
8. Finish setup by reviewing the actual installation/build report and publishing the reusable Codex environment. Publishing an environment is distinct from deploying the app. This handoff file itself does not mean an environment has been created or published.

## Next development sequence

First audit the Section 07 checkpoint against the following scope, preserve partial work, complete and verify it, then proceed in order:

### Section 07: Client portal, publication, tasks, documents and PDF export

Show only explicitly published lender comparisons and individual/whole strategies, an approved prioritized readiness roadmap, staff announcements with no client replies, read-only application statuses, and each client's own document/report uploads. Secure task self-completion must support optional notes/attachments and require staff verification. Staff publish/retract controls need immutable version audits. Scheduled publication must execute only after prior staff approval and only if reliable; otherwise expose honest manual release. Q73 remains undecided: flag recommendations for review after a new report, never silently republish. Document requests use announcements and the six approved categories. Downloadable PDFs must contain only authorized approved strategies, citations, dates and suitability disclaimers, never confidential internal notes or another client's data. Test permissions, PDF output, browser downloads and full build; update queue and acceptance evidence.

### Section 08: Lender intelligence and bureau observations

On-demand supported AI/source investigation, product/source version history, owner approval and freshness/missing-rule visibility for the existing 24 lenders and unlimited additions. No background polling. Record bureau observations by product/state/date with clear user-reported versus officially documented provenance and hard/soft confidence. Do not generalize a lender's bureau use. Optional outcome details need verification state; privacy-preserving aggregates need minimum sample thresholds. Observations never automatically become lender policies or eligibility decisions. Verify governance, versioning and privacy; update queue.

### Section 09: Final integration and readiness

Audit against approved requirements; fix integration, permissions, ownership/audit, arbitrary file access, malformed inputs, PDF memory, exports, navigation, empty states, responsive and theme issues. Write docs/FEATURE_ACCEPTANCE.md with BUILT/TESTED/PARTIAL/BLOCKED evidence and docs/SECURITY_READINESS.md with actual gaps. Run appropriate synthetic unit, integration and browser checks, remove only authorized test fixtures, and record remaining blockers honestly. No public deployment or processing of real client data without explicit go-live approval.

## Approved requirements copied from existing Lovable project knowledge

The following preserves the existing approved decisions. The handoff status above clarifies later implementation facts and does not change product decisions. Historical lender-source notes are research candidates, not active or newly verified rules.

# LOAN SCOUT MATCHING TOOL | Approved Product Decisions (Questions 1-90, November 2026)
Owner: Loan Scout LLC. Build new Lovable first, with secure PostgreSQL backend. Never substitute unapproved defaults for explicit decisions. This file is enduring project memory.

## Branding
Official existing Loan Scout LLC interlocking LS logo unchanged with separate "MATCHING TOOL" subtitle. Approved brand guide colors: emerald #007A53; forest #00563C; mint #5EE2B0; charcoal #2B333D; slate #35414B; slate2 #42535C; mist #F4F8F5; light border #D5E5DC; white #FFF; muted sage #B9C8C4; gold #D8B879 sparingly. Inter UI, Bebas Neue headlines, Montserrat wordmarks/labels. Light/dark theme switcher saved per user. Need original uploaded logo integrated when file made available; do NOT hallucinate logo.

## Roles, access, privacy
Owner, employees, clients. Owner complete Command Center: every client, funding performance, underwriting/rule governance, approvals, employee assignment/roles/permissions, Security Center/audits. Employees combined operations Command Center; clients focused Funding Dashboard, not sprawling internal credit view. Owner manually assigns/reassigns clients; owner configurable department roles, individual feature rights and temporary shares; employees see only authorized clients. Revoke departing employee access and reassign clients. Only owner can permanently delete client credit reports; retain until then unless legal obligation applies. Private encrypted report/document storage and consent, strict tenant isolation, RLS, audits. Passwordless employee login; client magic link and passkey; implement only genuinely secure available approaches. Client onboarding manual/public toggle/invites. Client uploads + employee uploads. Employees and owner can review/publish funding recommendations; never auto-publish.
Q87 handling of unassigned new registrations was SKIPPED, do not assert choice. Q73 handling published recommendations on fresh report SKIPPED, default safety hold for review. Q70 detailed application outcomes SKIPPED, do not impose selection.

## Credit analysis
Only uploaded credit PDF: SmartCredit, IdentityIQ, MyScoreIQ, others, multiple/batch PDFs, single or 3-bureau. Reconcile unique accounts without double count while preserving TransUnion/Experian/Equifax separate info. Capture per-bureau scores AND exact reported models/date; not interchangeable FICO/VantageScore. Analyze derogatories, inquiries, utilization, history, late payments, balances, bankruptcy. Credible PDF extraction must flag errors, enable client/employee replacement and audited employee correction; never fabricate missing. Compare historical snapshots automatically (Phase 2). Phase 2 credit paydown/scenario simulation without score prediction. On missing finance questions, targeted conditional questions only when relevant, EVERY question has "I don't know / Skip for now", missing remains UNKNOWN, not zero or denial. Self-reported data immediately useful but labeled unverified; employees can help add data. Business analysis for startup and established firms, up to multiple separate businesses and funding goals.

## Lender matching
Loan and funding product types: personal cards, personal loans, personal LOCs, business cards, business loans, business LOCs. Seed institution identities of 24: AmeriCU, American Express, Bank of America, Best Egg, Chase, Citizens, DCU, Dollar Bank, Elan, FNBO, Fifth Third, First Citizens, Happy Money, Huntington, KeyBank, M&T, My Apex Card, NIH FCU, Navy Federal, Prosper, SoFi, Truist, Wells Fargo, Zions. Do not invent the exact 35 old products or bank hardcutoffs. Product-level rule data each with verifiable URL, last-verified/effective date, reliability and review deadlines. Source info is unknown when not truly verified. Strict verified-only versus expanded clearly labeled secondary estimates, no estimated automatic disqualification. Scores 0-100 are suitability only NOT probability; categorical Potential Match/Needs Review/Doesn't Meet Published Requirements, detailed pass/fail/unknown criteria and sources, rationale, improvement plan. Confidence and missing model/bureau warnings; product marketing APR not proprietary pricing matrix. User-driven lender research ONLY (no scheduled monitoring), owner approval of ALL rule changes; lender profiles allow unlimited lenders/products. Don't misapply universal OCC rules. Owner policy changes only. Rule history, freshness and disable stale. Employee override AI choice with reasons/warnings and audit, does not alter rule. Saved lender shortlists, filtering and side by side comparison.
Matches balance eligibility/amount/APR/affordability with staff switch of priorities. Show product-published limit and separate estimated applicant funding ranges, conservative/moderate/expanded funding-planner Phase 2, not guarantee. Funding application sequence with official link and soft/hard warnings only if sourced.
Review center allows approve/reject/modify/reorder/notes/individual or entire strategy publishing, draft/schedule/withdraw, no client visibility before staff approval. Export approved strategy PDFs.

## Client workflows
Client focused Funding Dashboard: approved lender comparisons AND guided application cards; published improvement roadmap and individual steps, action status + client self-completion/note/optional supporting upload; employee verification required to confirm changes. Only employees can edit app status, BASIC five: Not Started / Submitted / Pending / Approved / Denied. Status change updates dashboard and audit only, NO notifications, NO auto follow-up tasks. Dashboard notices only where explicitly called for, NOT automatic email/SMS. Employee internal notes private, employee-to-client read-only announcements, NO two-way chat. Document requests via simple announcements and basic uploads, not elaborate request workflow. Manually categorized files: Credit Reports/Identification/Income/Banking/Business Documents/Other. Client directory search, filters, and saved views only (Q85 B+C custom, no full bulk system). Q66 custom smart incomplete information with every question skippable as unknown and recalculation.

## Development
Phase 1 client/employee accounts, PDF ingestion and actual extraction, finance questionnaires, evidence-based matching, review/approval/publishing, PDF export and basic app pipeline, owner security and branded dashboards. Phase 2 report comparisons, utilization simulators, business financial modeling, cross-product funding scenarios. Phase 3 on-demand lender policy research, bureau pull intelligence, observed application outcomes and learning subject to owner review. No automatic lender applications, no integrated credit bureau pulling, no background lender monitoring.
Always show actual implementation vs planned work honestly, and never expose live client data in demo or external research.

## Public lender source notes gathered 2026-11-16 (research candidates ONLY; NOT approved engine rules)
Do NOT automatically add as active rules. Owner must review context/validity and approve. All source references are public lender/SEC documents. Keep product-specific scopes; never use marketing score cutoffs as an undisclosed underwriting scoring model.
- Prosper Personal Loan, *specifically Note Channel*, public 2026-04-30 prospectus PDF https://www.prosper.com/Downloads/Legal/Prosper_Prospectus_2026-04-30.pdf page 51: single-borrower criteria TransUnion FICO 08 >=600; max nine bureau inquiries after duplicates in past 6 months; annual income >0; DTI <=50%; >=2 open trades; no bankruptcy within past 12 months. Joint loans require >=1 trade per applicant, distinct DTI. Current Prosper consumer product page https://www.prosper.com/personal-loans gives marketed $2k-$50k, 8.99-35.99 APR. Note Channel eligibility must NEVER be silently generalized to all Prosper origination channels.
- Wells Fargo Personal Loan, https://www.wellsfargo.com/personal-loans/checklist/ requires existing qualifying Wells Fargo consumer product opened >=12 months; https://www.wellsfargo.com/personal-loans/ marketed amounts $3k-$100k and 12-84 month terms varying by amount. Exact decision FICO minimum NOT disclosed; no invented score/DTI cutoff.
- Happy Money The Payoff Loan, https://happymoney.com/getting-approved states FICO score 620+ without exact FICO version, $5k-$50k and 8.95%-35.99% marketed APR, subject to change. Treat unsupported FICO version as unknown for model-specific engine, not FICO 8 by default.
- AmeriCU Quick Cash, https://www.americu.org/quickcash/ describes 18+, membership >=6 months, monthly direct deposit, $300-$2000, $20 app fee, no credit check, and deposit-history underwriting. Do NOT fabricate FICO. May be limited by geographic membership, and actual availability must be considered.
- Chase My Chase Loan, https://www.chase.com/personal/credit-cards/education/basics/my-chase-loan describes existing eligible Chase card feature using available credit, offers generally unavailable in first 180 days, minimum $500, NO new credit check/application. Not a conventional new unsecured installment loan; cash amount based on existing available card credit.

