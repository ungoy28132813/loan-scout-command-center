# Objective Lock: Loan Scout Backend and Credit-Report Extraction

**Canonical mission:** Continue the **existing** private Loan Scout Command Center application, with the most accurate, complete, auditable and privacy-preserving credit-report reader/extractor that can be validated in practice. Never substitute a different product or a separate scaffold. An MCP server, Docling, Gemini or other AI tool is only useful if it measurably improves this mission.

## Non-negotiable priorities, in order

1. **Correctness over apparent completeness.** Never guess bureaus, scores, credit-score model/version, account identity, balances, late-payment histories, inquiry categories, or removals. Unknown and conflicts stay Unknown and require authorized review.
2. **All documents and pages.** SmartCredit Classic 3B saved HTML (first), SmartCredit PDFs, IdentityIQ/MyScoreIQ/other three-bureau reports. Browser-local PDF.js extraction retains coordinates; local Docling/OCR can be a later fallback after benchmarking. Account/section/page/row coverage must be measured.
3. **Three-bureau precision.** Preserve TransUnion, Experian and Equifax separately; never collapse reports into one guessed account, never shift values when a middle column is blank, preserve score model exactly as printed and monthly payment status by bureau.
4. **Before/after verification.** Compare inquiry additions/removals, actual account deletion vs absence/closure/rename, late-payment changes, credit score deltas with score-model/date labels. Every conclusion traces to the source page/HTML row.
5. **Security and privacy.** Raw credit reports stay on the end user's device wherever existing application privacy rules require it; no automatic Gemini, remote MCP, cloud uploads, source-control commits, logging, or training with client report data. Respect consent, RLS, staff acceptance, immutable published snapshots, Lovable-managed database boundaries, and owner-approved lender rules.
6. **Do not derail.** Preserve 24 lender identities, 49 known product records and all existing behavior; do not re-install unneeded AI apps, restructure the marketing funnel, publish, deploy, merge, or alter production data without authorization.

## Project anchors

- Repo: `ungoy28132813/loan-scout-command-center` (private).
- Main remains protected from this work.
- Accuracy branch: `feature/credit-report-accuracy-phase1`.
- GitHub issue #2: SmartCredit Classic 3B HTML extraction.
- Project instructions: `AGENTS.md`, `docs/CODEX_HANDOFF.md`, `docs/BUILD_QUEUE.md`, `roadmap.md`, and `docs/CREDIT_REPORT_ACCURACY_PHASE1.md`.
- Existing app: TanStack Start, React/TypeScript, Supabase, locally bundled PDF.js and browser-local Tesseract OCR.

## Verified checkpoint (2026-11-21, user-supplied Windows audit)

- `bun install --frozen-lockfile` PASS: 392 packages.
- `bunx tsc --noEmit` PASS.
- Vitest PASS: **193 of 193 tests**, across 21 test files; **44 parser synthetic tests** passed.
- ESLint completion and production build not established by that audit.
- Actual document golden benchmark has **not** passed; 193 synthetic passes are not evidence of high real-report accuracy.
- Root `.env` is tracked; only a private secrets audit/possible credential rotation can resolve that warning. Do not print it.

## New Phase 2 source additions

- `src/lib/credit-report-parser/smartcredit-html.ts`: draft inert SmartCredit HTML parser with explicit bureau headers and per-field source references. No uploader integration yet.
- `src/lib/credit-report-parser/smartcredit-html.test.ts`: synthetic regression tests; must be executed locally before claiming PASS.
- `scripts/phase2-smartcredit-html-verify.ps1`: runs frozen dependency install, targeted tests, TypeScript, complete tests, lint, local build and postinstall inventory; writes complete Desktop logs and copies full redacted output to Windows clipboard.

## Ordered roadmap and acceptance weights

| Phase | Weight | Work required to mark VERIFIED |
| --- | ---: | --- |
| Source audit + ground-truth plan | 15% | Code audit, actual baseline, independently hand-labeled expected values |
| SmartCredit HTML extraction | 20% | Accurate bureau-column DOM parsing, accounts, inquiries, scores, monthly history, source evidence, negative tests and goldens |
| PDF layout + OCR fallback | 25% | Complete rows/columns/page coverage, six reference PDFs, scanned-page handling, no false bureau assignments |
| Bureau matching and before/after | 20% | Deterministic source-backed comparisons, unknown/conflict gates |
| Safe backend integration | 10% | Consent, import, review and publication controls preserved |
| Final accuracy / security certification | 10% | Lint/build/tests, sensitive-data privacy, stress test and independently labeled precision/recall |

**Current stated overall completion: 20% PROVISIONAL.** Do not raise it merely because code is committed. Report the percentage at the beginning or end of every future Loan Scout build response. Be explicit about newly verified test results and what remains unverified.

## User's Windows execution preference

For each action: one complete copy/paste PowerShell script or one-liner, minimum questions and manual steps. It must automatically log **ALL stdout, stderr and relevant results**, save a combined file on the real Windows Desktop, copy the complete sanitized results to the Windows clipboard and open File Explorer with the output selected. Never ask the user to paste *script commands* into ChatGPT as though they were execution results. Never silently erase or reset work.

## Latest user-provided audit and real-source structural findings (Nov 21, 2026)

- Windows Phase 2 audit at commit `2321dad`: **202/202 tests passed** across 22 files, including 9 initial SmartCredit HTML tests, `bun install --frozen-lockfile` passed and local production build passed.
- That same run failed TypeScript due to one `TS4111` bracket-access error in `smartcredit-html.test.ts`, and ESLint failed with `RangeError: Invalid string length` while formatting lint results. Both have corrective commits on the accuracy branch. **Do not describe those corrections as verified until a new Windows run passes.**
- The saved SmartCredit HTML structural inspection found **27 account blocks** distributed among five categories (11 revolving, 10 installment, 4 other, 1 line of credit, 1 collection), plus **1,464** `data-test="payment-status-cell"` markers using raw `data-status` attributes and month/year labels. Those counts describe the **supplied source**, not the production parser's measured accuracy. The account-group selection bug was corrected to prevent cross-section duplication.
- The **five private SmartCredit PDFs** total 73 pages, include Classic and Ultra 4K 3B variants and include a PDF containing visible export placeholders on some pages. The user confirms the dashboard was fully loaded before PDF download. Refer to `docs/SMARTCREDIT_PDF_REFERENCE_CASES.md`; do not falsely blame user timing.
- New synthetic tests cover 27-account group isolation, mortgage account section, and raw status-cell provenance without inferring payment meaning. These newer tests are committed but **not yet verified** on Windows.
- Do not treat a blank page with a loader graphic as a scanned page. Missing source remains unknown, not a confirmed deletion.

## Latest Phase 2 rerun and local-change preservation (Nov 21, 2026)

- User's most recent Phase 2 run stopped **before any tests** because their original Windows verification clone had uncommitted changes. That is a safeguard, not a parser defect. Do not ask for manual resets, stashes, or cleanups.
- `scripts/phase2-smartcredit-html-verify.ps1` was updated to **preserve every original working-tree file**. It reads the status without listing content, fetches the branch into Git metadata, then creates or reuses a separate clean **detached verification Git worktree** under `%LOCALAPPDATA%\LoanScout\AccuracyPhase2`. A dirty preexisting verifier gets a fresh alternate path, never a destructive reset or overwrite.
- **This fix is committed but not yet executed on the user's Windows machine.** Prior verified results remain 202/202 tests, with TypeScript and ESLint failures from the earlier commit; newer fixes remain unverified.
- Every future PowerShell script must copy complete sanitized stdout/stderr and machine-readable results to the clipboard and store on Desktop. Keep using one copy-paste command, automatic Explorer selection and a project-completion percentage. Do not replace clipboard results with a generic process exit message after the report was generated.
- Source validation must preserve the five private SmartCredit PDFs and saved HTML in conversation context, use synthetic non-PII fixtures in GitHub, and flag rendered loading-placeholder source pages even though the user waited for the dashboard to load.

## Immediate next action

Run the latest `scripts/phase2-smartcredit-html-verify.ps1` from the private branch on Windows and inspect its **automatically copied full stdout/stderr output**. Require the targeted parser tests,  `tsc --noEmit`, all tests, targeted ESLint, full ESLint and local build to pass before calling the current fixes verified. Then validate the SmartCredit HTML reader with locally held real-source golden labels. Only after that integrate it into the upload flow. Continue with PDF geometry and multi-engine validation afterward.

This file is a durable project continuity note. It supplements rather than overrides the repository's security/role rules and owner approvals.
