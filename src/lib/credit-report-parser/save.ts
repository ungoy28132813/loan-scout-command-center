/**
 * Persists a ParseResult for staff with can_edit_extractions (RLS-enforced). Saves only structured values with
 * page/confidence/review flags plus a counts-only summary. Never stores report text or full account numbers.
 */
import { supabase } from "@/integrations/supabase/client";
import type { ParseResult } from "./types";
import { evaluateCrossFoot, extractSuggestedName, type IntakeExtraction } from "./intake";

export type ReadProgress = (done: number, total: number, stage?: "text" | "ocr") => void;

export async function saveExtraction(reportId: string, clientId: string, r: ParseResult): Promise<{ ok: true } | { ok: false; error: string }> {
  const [f, t, rep] = await Promise.all([
    supabase.from("report_fields").select("id", { count: "exact", head: true }).eq("report_id", reportId),
    supabase.from("tradelines").select("id", { count: "exact", head: true }).eq("report_id", reportId),
    supabase.from("credit_reports").select("report_type, report_date, extraction_method").eq("id", reportId).single(),
  ]);
  if (rep.error || !rep.data) return { ok: false, error: "Report not accessible." };
  if (rep.data.extraction_method === "automated" || (f.count ?? 0) > 0 || (t.count ?? 0) > 0)
    return { ok: false, error: "This report already has data. Review and correct it manually instead." };

  const fieldRows = [
    ...r.scores.map((s) => ({ report_id: reportId, client_id: clientId, bureau: s.bureau, field_key: "score", score_model: s.model, value: s.value, status: "extracted", source_ref: s.evidence, source_page: s.page, confidence: s.confidence, needs_review: s.needsReview, score_date: s.scoreDate })),
    ...r.fields.map((x) => ({ report_id: reportId, client_id: clientId, bureau: x.bureau, field_key: x.key, score_model: null, value: x.value, status: "extracted", source_ref: x.evidence, source_page: x.page, confidence: x.confidence, needs_review: x.needsReview, score_date: null })),
  ];
  if (fieldRows.length) { const e = await supabase.from("report_fields").insert(fieldRows); if (e.error) return { ok: false, error: e.error.message }; }
  const tlRows = r.tradelines.map((x) => ({ report_id: reportId, client_id: clientId, bureau: x.bureau, creditor: x.creditor.slice(0, 80), account_type: x.accountType, account_ref_last4: x.last4, balance: x.balance, credit_limit: x.creditLimit, is_open: x.isOpen, late_count: x.lateCount, is_collection: x.isCollection, is_chargeoff: x.isChargeoff, reconcile_key: x.reconcileKey.startsWith("blk:") ? `${reportId}:${x.reconcileKey}` : x.reconcileKey, source_page: x.page, needs_review: x.needsReview, extracted: true }));
  if (tlRows.length) { const e = await supabase.from("tradelines").insert(tlRows); if (e.error) return { ok: false, error: e.error.message }; }

  const summary = {
    parser_version: r.parserVersion, pages: r.pageCount, text_layer: r.hasTextLayer, ocr_used: r.ocrUsed, bureaus: r.bureausDetected,
    scores: r.scores.length, fields: r.fields.length, tradelines: r.tradelines.length,
    needs_review: r.scores.filter((s) => s.needsReview).length + r.fields.filter((s) => s.needsReview).length + r.tradelines.filter((s) => s.needsReview).length,
    warnings: r.warnings.slice(0, 20),
    coordinate_audit: r.diagnostics ? {
      layout: r.diagnostics.layout,
      account_blocks: r.diagnostics.accountBlocks,
      inquiry_entries: r.diagnostics.inquiryEntries,
      inquiries_reconciled: r.diagnostics.inquiriesReconciled,
      payment_cells: r.diagnostics.paymentCells,
      payment_cells_classified: r.diagnostics.paymentCellsClassified,
    } : null,
  };
  const u = await supabase.from("credit_reports").update({
    extraction_method: "automated", extraction_status: r.status, extraction_summary: summary, extracted_at: new Date().toISOString(), detected_provider: r.provider,
    report_type: rep.data.report_type === "unknown" ? r.reportType : rep.data.report_type, report_date: rep.data.report_date ?? r.reportDate,
  }).eq("id", reportId);
  if (u.error) return { ok: false, error: u.error.message };
  return { ok: true };
}

/** Download from the private bucket (RLS/storage policy enforced) and parse locally in this browser. */
export async function extractStoredReport(storagePath: string, onProgress?: ReadProgress) {
  const dl = await supabase.storage.from("client-documents").download(storagePath);
  if (dl.error || !dl.data) throw new Error("Could not open the stored file.");
  return extractFile(await dl.data.arrayBuffer(), onProgress);
}

export async function extractFile(buf: ArrayBuffer, onProgress?: ReadProgress): Promise<ParseResult> {
  const { result } = await extractFileForIntake(buf, onProgress);
  return result;
}

export async function extractFileForIntake(buf: ArrayBuffer, onProgress?: ReadProgress): Promise<IntakeExtraction> {
  const [{ extractPdfText, samplePaymentGridColors }, { hasTextLayer }, { parseReportText }, { parseCoordinates }, { coordinateToParseResult }] = await Promise.all([
    import("./pdf"), import("./detect"), import("./parse"), import("./coordinates"), import("./smartcredit-adapter"),
  ]);
  // pdf.js transfers each input to its worker, detaching that buffer.
  const ocrBuffer = buf.slice(0);
  const coordinateBuffer = buf.slice(0);
  const text = await extractPdfText(buf, (done, total) => onProgress?.(done, total, "text"));
  const originalHasTextLayer = hasTextLayer(text.pages);
  const needsOcr = text.pages.filter((page) => page.lines.join("").replace(/\s/g, "").length < 10).map((page) => page.page);

  // Text-based SmartCredit layouts use positioned cells, not visual-line whitespace.
  // Mixed/scanned reports retain the existing local-OCR and conservative line-parser path.
  if (originalHasTextLayer && needsOcr.length === 0) {
    const coordinate = parseCoordinates(text.positionedPages);
    if (coordinate.recognized) {
      const cells = coordinate.tradelines.flatMap((tradeline) => Object.values(tradeline.paymentHistory2Years).flatMap((history) => history ?? []));
      try { await samplePaymentGridColors(coordinateBuffer, cells); }
      catch { coordinate.warnings.push("Payment-grid colors could not be sampled; text fields were retained and color-only checks stay Unknown."); }
      const result = coordinateToParseResult(coordinate, { pageCount: text.pages.length, truncated: text.truncated });
      const { suggestedName, nameConflict } = extractSuggestedName(coordinate, text.pages);
      const crossFoot = evaluateCrossFoot(result, coordinate, text.truncated);
      return { result, suggestedName, nameConflict, crossFoot };
    }
  }

  let pages = text.pages;
  let ocrPages: number[] = [];
  let ocrTruncated = false;
  if (needsOcr.length) {
    const { ocrPdfPages } = await import("./ocr");
    const ocr = await ocrPdfPages(ocrBuffer, needsOcr, (done, total) => onProgress?.(done, total, "ocr"));
    const byPage = new Map(ocr.pages.map((page) => [page.page, page]));
    pages = text.pages.map((page) => byPage.get(page.page) ?? page);
    ocrPages = ocr.pages.map((page) => page.page);
    ocrTruncated = ocr.skippedPages > 0;
  }
  const result = parseReportText(pages, { truncated: text.truncated, originalHasTextLayer, ocrPages, ocrTruncated });
  const { suggestedName, nameConflict } = extractSuggestedName(null, pages);
  const crossFoot = evaluateCrossFoot(result, null, text.truncated || ocrTruncated);
  return { result, suggestedName, nameConflict, crossFoot };
}
