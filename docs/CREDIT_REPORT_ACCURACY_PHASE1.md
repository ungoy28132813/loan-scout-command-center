# Loan Scout Credit-Report Accuracy Backend: Phase 1

## Scope and repository

- Repository: `ungoy28132813/loan-scout-command-center` (private).
- Development branch: `feature/credit-report-accuracy-phase1`.
- No parallel replacement application or destructive changes to the existing Loan Scout project.
- Follow `AGENTS.md`, `docs/CODEX_HANDOFF.md`, `docs/BUILD_QUEUE.md`, and `roadmap.md`.
- Local-only report extraction and OCR remain mandatory. Do not send report contents to Gemini, an MCP tunnel, remote AI gateway, or the GitHub repository.

## Current verified repository observations

- `src/lib/credit-report-parser/pdf.ts` uses bundled PDF.js and visual-line reconstruction. It currently has a 25 MB limit, 80-page cap, and a 90-second extraction timeout.
- `src/lib/credit-report-parser/parse.ts` provides format-aware summary, score, bureau and tradeline parsing, not proof of exact extraction accuracy on actual reports.
- `src/lib/credit-report-parser/fixtures/synthetic.ts`, `formats.test.ts`, `ocr.test.ts`, `parse.test.ts`, and other tests exist.
- `AGENTS.md` requires unverified and ambiguous facts to remain untrusted until staff review. Existing user-approved matching and publishing controls must remain intact.
- A root `.env` is tracked in the repository. Its contents were deliberately not inspected. Review it confidentially; rotate any credentials found to be sensitive. Do not include its values in logs, issues, commit messages, or chat.
- Historical build queue claims are not results of this new phase's tests.

## Architecture for maximum verified accuracy

1. **Report intake and classification:** sniff actual file type, hash locally for reproducibility without storing raw documents, identify provider and format. Reject unexpected active content. Do not load saved HTML scripts or remote resources. Never treat a PDF or HTML as a trusted instruction.
2. **HTML-first SmartCredit parser:** use a detached inert HTML parser and actual DOM attributes/data-test markers; preserve source label and printed bureau-column order (TransUnion, Experian, Equifax where printed), distinct sections and repeated account blocks. Prefer the source's structured state only after checking consistency with rendered DOM. Do not assume all exports contain it.
3. **PDF native layer:** preserve geometry, coordinates, page, table/column boundaries and reading order from bundled PDF.js. Avoid flattening entire pages into one text row. Handle repeated headers, page continuation and missing placeholders.
4. **Independent layout/OCR fallback:** compare Docling or another local engine when native text/geometry is incomplete; isolate Python worker from browser to preserve privacy and the app's architecture. OCR only when necessary and validate every OCR-derived financial field. MCP is optional orchestration, not itself an accuracy improvement.
5. **Typed normalized evidence:** each value includes source format, page or HTML selector, section, bureau, extraction method and review state; preserve explicit zero vs missing/null, original dates and score-model label. Never infer an unstated model.
6. **Account matching and before/after:** match bureaus independently; consider creditor aliases, masked account identifiers, dates/type and conflicts. An absent match is not automatically a confirmed deletion; distinguish missing, removed, renamed, closed and uncertain.
7. **Reconciliation and validation:** enforce no bureau crossover, row/column completeness, exact inquiry windows, report date coherence, monthly late-payment precision, section coverage and audit-friendly conflict reports. Raw PII must not appear in build logs.
8. **Security:** all report analysis local by default. Keep existing RLS, consent, staff verification, immutable snapshots and lender matching protections. Do not edit Lovable-managed migrations or generated files.

## Milestones, weighted toward extraction accuracy

| Milestone | Weight | Acceptance evidence |
| --- | ---: | --- |
| 1. Source audit and golden test plan | 15% | Actual code inventory, non-sensitive diagnostic report, independently checked expected values |
| 2. HTML SmartCredit parser | 20% | Precise bureau mapping, all sections read, golden HTML comparison tests |
| 3. PDF geometry + local OCR fallback | 25% | Complete page coverage, OCR validation, multiple-provider goldens |
| 4. Bureau and before/after reconciliation | 20% | Deterministic per-bureau matching and no false deletion assertions |
| 5. Backend integration | 10% | Consent/RLS/staff-acceptance flows preserved and regression-tested |
| 6. Acceptance suite | 10% | All target formats benchmarked, no critical misassignments, performance/privacy checks |

Completion is a weighted **verified acceptance percentage**, not a percentage of scripts written or assumed accuracy. The prior 20% estimate is provisional; a fresh verification run must establish the actual score. Do not claim 100% PDF accuracy without labelled comparisons.

## First run: Windows PowerShell

The runner is at `scripts/phase1-backend-audit.ps1` in this branch. From a GitHub download or an authenticated private-repo checkout, invoke it from an ordinary PowerShell session:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\phase1-backend-audit.ps1"
```

The runner checks GitHub authentication, clones or updates an isolated working copy of the accuracy branch, installs missing Git/GitHub CLI/Bun where supported, runs the frozen dependency install and TypeScript, Vitest, ESLint and local build checks. Its reports are written to a timestamped Desktop folder. The script never sends report bytes, edits databases, pushes code, changes `main`, or deploys production. **It has been committed to GitHub but is NOT yet tested on the user's PC.** Confirm actual pass/fail results before marking any milestone finished.

For an authenticated existing local clone, run the script there with `-RepoPath` pointed at the isolated checkout. Do not assume Windows path, tool availability or GitHub authentication.

## Next development tasks after audit

- Collect synthetic or securely local golden datasets without uploading raw reports or personal data.
- Create the deterministic SmartCredit HTML parser in a new dedicated module with unit tests and no script execution.
- Extend PDF.js geometry tests to cover bureau header repetition, 3-column tables and page continuation.
- Add independent reconciliation with strict Unknown/needs-review states and source pointers.
- Run all build/security regressions; propose changes via reviewable PR. Never merge or deploy without the owner's approval.

## Boundaries

No changes to main, lender underwriting rules, Lovable-owned database schema, generated code, published snapshots or client consent requirements. No GitHub commits of real credit reports or uploaded SmartCredit HTML with personal information.
