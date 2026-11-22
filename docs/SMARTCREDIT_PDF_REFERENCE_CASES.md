# SmartCredit PDF Reference Corpus: Privacy-Safe Technical Requirements

## Purpose and privacy

User provided **five reference SmartCredit three-bureau PDFs** in the ChatGPT conversation on November 21, 2026. They are real credit reports and contain private financial and identity information.

**Never commit raw reports, extracted identities, names, addresses, account numbers, account details or full report text to GitHub, test fixtures, prompts, MCP tunnels, logs or external AI services.** This document records **only anonymous structural characteristics** to support the accuracy-first Loan Scout backend.

The ChatGPT conversation's actual uploaded files remain the sources of truth; this GitHub document does **not** contain source document bytes or personal information.

## Source set: five PDFs, 73 pages

| Anonymous reference | Page count | Variant | Representative challenge |
| --- | ---: | --- | --- |
| PDF-A | 11 | SmartCredit Ultra 4K 3B | Alternate report design; account tables continuing across pages; separate bureau payment histories |
| PDF-B | 19 | SmartCredit 3B (Classic-like) | **Export contains rendered loading placeholders on some pages**, even though the user confirms they waited until the dashboard finished loading |
| PDF-C | 17 | SmartCredit Classic 3B | Mortgage accounts, long multiline values, page continuation |
| PDF-D | 10 | SmartCredit Classic 3B | Bureau-specific derogatory status and mixed account types |
| PDF-E | 16 | SmartCredit Classic 3B | Bureau-only accounts; explicit blank/none-reported middle and right cells; repeated creditors |

**Observed directly:** PDF-B page 7 and page 11 render as blue loading graphics on otherwise blank pages; page 17 contains loading graphics with partial section headings. These findings describe the **exported file**, not the timing of the user's download. The user explicitly says the report had finished loading before downloading it. Do not tell the user that they downloaded too early.

These observations are technical examples, not a completed golden-label benchmark.

## Required ingestion rules

1. **Document integrity before extraction:** inspect every page for native text, raster content, blank pages, repeat loading-placeholder graphics, missing labeled sections, and page continuity. Distinguish (a) fully readable page, (b) scanned page with recoverable content, (c) page with unrendered source/empty placeholder, (d) intentional blank page, and (e) corrupted page. Do not assume low text density equals a scan or means that no account exists.
2. **No hallucination:** on a page showing a loading-placeholder graphic rather than report content, OCR or Gemini cannot recover unseen accounts. Flag the source as incomplete and request a repaired export; never interpret absence as a deletion, zero, or missing bureau record.
3. **3-bureau geometry:** track explicit TransUnion, Experian, Equifax headers and column locations. Blank middle column must never shift Equifax into Experian. Repeated headers and page breaks do not create extra accounts.
4. **Accounts:** capture each account block separately, including creditor aliases, masked account identifier (only in device-local working memory), type, opened/reported/closed dates, balances, limits, current/late status, disputes and relevant remarks; preserve each bureau's original values.
5. **Payment histories:** source PDFs render colored checkmark/status grids that may not appear in extracted text. Capture grid date/status cells per bureau with page/coordinates and verified meaning. Record "not visible/unknown" rather than equating green checkmarks or empty grids with zeros without validating the legend/source.
6. **Inquiries:** extract individual inquiries separately from summary count windows, including bureau, date, source position and whether inquiry is hard/soft only if explicitly supported.
7. **Score model:** preserve explicit printed score model and score date; never infer model or version from provider, numerical score or a footnote about another model.
8. **Coverage ledger:** per page, account block, bureau, section and field, record extraction method (HTML direct, PDF.js native text, local OCR, independent local Docling), source evidence and confidence. Mismatches must remain unverified.
9. **Before/after comparisons:** absence in a missing/placeholder page is never evidence of an account removal. Only compare complete enough, properly dated and bureaus-resolved source snapshots; flag ambiguity and any incompatible score models.
10. **Privacy:** preserve current browser-local PDF/OCR rule and staff acceptance before making facts trusted. Do not run remote MCP tunnels on financial reports or commit real documents.

## Engineering / acceptance test additions

- Synthetic PDF with intact text and two bureau pages, one missing middle-column cell, repeated header and continuing account.
- Synthetic PDF with one scanned page containing a *real* table requiring OCR, separate from a page showing only a loading placeholder.
- Synthetic payment-history graphics, dates and bureau-specific cells; no guessed statuses.
- Synthetic report with account block on two pages and per-bureau balance/limit values that differ.
- Synthetic duplicate creditor heading for distinct masked accounts; no false deduplication.
- Synthetic omitted inquiry details vs summary count (record inconsistency rather than fabricate inquiries).
- Independent manual golden labels on privately held source PDFs: document page/section coverage, account-block recall, field-by-field exact match by bureau, zero false cross-bureau assignments, late-cell agreement, and precision of deletion claims.

Do **not** increase the reported project completion percentage based on inspecting this source set. The prior 20% overall estimate remains **provisional**, and no actual five-document gold-standard comparison has passed.

## Next action

After Windows Phase 2 synthetic tests, integrate verified HTML extraction, implement PDF page integrity checks, and benchmark PDF.js/Docling/OCR locally. Show test outcomes with full PowerShell stdout/stderr saved to Desktop and auto-copied to clipboard.

Read this document together with \`docs/OBJECTIVE_LOCK.md\`, \`AGENTS.md\`, and \`docs/CREDIT_REPORT_ACCURACY_PHASE1.md\` before any further Loan Scout extractor changes.
