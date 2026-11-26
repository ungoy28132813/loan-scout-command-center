import { BUREAUS, type Bureau, type ExtractedField, type ExtractedScore, type ExtractedTradeline, type ParseResult } from "./types";
import { integer, money, type CoordinateReport, type Tradeline } from "./coordinates";
import { last4, maskSensitive } from "./text";

function monthStart(reportDate: string, months: number): string {
  const d = new Date(`${reportDate}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

function parsePercent(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.match(/^(\d+(?:\.\d+)?)\s*%$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 0 && n <= 1000 ? n : null;
}

function mapAccountType(section: string, rawType: string | null): string | null {
  const combined = `${section} ${rawType ?? ""}`;
  if (/mortgage|real estate/i.test(combined)) return "mortgage";
  if (/auto/i.test(combined)) return "auto";
  if (/student|education/i.test(combined)) return "student";
  if (/revolv|credit card|charge card|line of credit/i.test(combined)) return "revolving";
  if (/installment/i.test(combined)) return "installment";
  if (/collection/i.test(combined)) return "other";
  return rawType ? "other" : null;
}

function bureauReportsTradeline(tl: Tradeline, b: Bureau): boolean {
  return Boolean(
    tl.fields["Account Number"]?.[b] ||
    tl.fields["Balance Owed"]?.[b] ||
    tl.fields["High Balance"]?.[b] ||
    tl.fields["Account Status"]?.[b] ||
    tl.fields["Account Rating"]?.[b] ||
    tl.fields["Date Opened"]?.[b] ||
    tl.fields["Credit Limit"]?.[b]
  );
}

/**
 * Adapts a recognized SmartCredit CoordinateReport into Loan Scout's structured ParseResult.
 * Preserves strict safety invariants: models are never inferred, status is never auto-verified,
 * conflicting dates/values stay Unknown or flagged for review, and no raw PII is stored.
 */
export function coordinateToParseResult(
  rep: CoordinateReport,
  opts: { pageCount: number; truncated?: boolean }
): ParseResult {
  const warnings = [...rep.warnings];
  if (opts.truncated) warnings.push("Only the first 80 pages were read. Remaining pages need manual review.");
  const headerOrderIssue = rep.warnings.some((w) => /out of SmartCredit order/i.test(w));
  const summaryConflict = rep.warnings.some((w) => /Repeated summary values disagree/i.test(w));

  const distinctDates = new Set(BUREAUS.map((b) => rep.personal.reportDate[b]).filter((d): d is string => Boolean(d)));
  const reportDate = distinctDates.size === 1 ? [...distinctDates][0] ?? null : null;
  if (distinctDates.size > 1) warnings.push("Printed report dates disagree; the snapshot date and date-based calculations stay Unknown until staff review.");

  const scores: ExtractedScore[] = [];
  for (const b of BUREAUS) {
    const value = rep.scores[b];
    if (value == null) continue;
    const scoreConflict = rep.warnings.some((w) => w.includes(`Conflicting score readings for ${b}`));
    const model = rep.scoreModel;
    const ok = Boolean(model) && !scoreConflict && !headerOrderIssue;
    scores.push({
      bureau: b,
      model,
      value,
      scoreDate: rep.personal.reportDate[b] ?? reportDate,
      page: rep.scorePage,
      confidence: ok ? "high" : "low",
      needsReview: !ok,
      evidence: `Auto: page ${rep.scorePage}, SmartCredit coordinate score grid${model ? "" : " — exact score model not stated"}`,
    });
  }
  if (!scores.length) warnings.push("No credit score with an identifiable bureau was found. Scores stay Unknown.");
  if (scores.some((s) => !s.model)) warnings.push("Some scores did not state their exact model; they are saved for review but not used in matching.");

  const fields: ExtractedField[] = [];
  const pushSummaryInt = (rowName: string, key: string) => {
    const row = rep.summary[rowName];
    if (!row) return;
    const page = rep.summaryPages[rowName] ?? 1;
    for (const b of BUREAUS) {
      const value = integer(row[b]);
      if (value == null || value < 0) continue;
      fields.push({
        bureau: b, key, value, page,
        confidence: summaryConflict || headerOrderIssue ? "low" : "high",
        needsReview: summaryConflict || headerOrderIssue,
        evidence: `Auto: page ${page}, SmartCredit "${rowName}" summary row`,
      });
    }
  };
  pushSummaryInt("Open Accounts", "open_tradelines");
  pushSummaryInt("Delinquent", "delinquent_accounts_count");
  pushSummaryInt("Inquiries (2 Years)", "inquiries_24mo");

  const utilRow = rep.summary["Revolving Utilization"];
  if (utilRow) {
    const page = rep.summaryPages["Revolving Utilization"] ?? 1;
    for (const b of BUREAUS) {
      const value = parsePercent(utilRow[b]);
      if (value == null) continue;
      fields.push({
        bureau: b, key: "utilization_pct", value, page,
        confidence: headerOrderIssue ? "low" : "high",
        needsReview: headerOrderIssue,
        evidence: `Auto: page ${page}, SmartCredit printed revolving utilization`,
      });
    }
  }

  // Dated inquiry lookback windows (30d, 3mo, 6mo, 12mo) + cross-check with printed 24mo total
  if (reportDate && (rep.inquiries.length > 0 || rep.inquiryAudit.pass)) {
    const validInq = rep.inquiries.filter((q) => q.date <= reportDate);
    if (validInq.length < rep.inquiries.length) warnings.push("Inquiry dates after the report date were excluded from lookback counts.");
    if (validInq.length > 0) warnings.push("Dated inquiry entries were counted individually; possible duplicate names or dates were not removed.");
    const windows = [
      { key: "inquiries_30d", start: monthStart(reportDate, 0), days: 30 },
      { key: "inquiries_3mo", start: monthStart(reportDate, 3) },
      { key: "inquiries_6mo", start: monthStart(reportDate, 6) },
      { key: "inquiries_12mo", start: monthStart(reportDate, 12) },
    ];
    const reportMs = new Date(`${reportDate}T00:00:00Z`).getTime();
    const cutoff24 = monthStart(reportDate, 24);
    for (const b of BUREAUS) {
      const own = validInq.filter((q) => q.bureau === b);
      const expected24 = rep.inquiryAudit.expected[b];
      const count24 = own.filter((q) => q.date >= cutoff24).length;
      const zeroGuaranteed = expected24 === 0 && own.length === 0 && rep.inquiryAudit.pass;
      if (!own.length && !zeroGuaranteed) continue;
      const firstPage = own.length ? Math.min(...own.map((q) => q.page)) : rep.summaryPages["Inquiries (2 Years)"] ?? 1;
      const bureauMismatch = rep.inquiryAudit.mismatches.includes(b) || (expected24 != null && expected24 !== count24);
      if (bureauMismatch) {
        const existing24 = fields.find((f) => f.bureau === b && f.key === "inquiries_24mo");
        if (existing24) { existing24.needsReview = true; existing24.confidence = "low"; }
      }
      for (const w of windows) {
        const startMs = w.days ? reportMs - w.days * 86_400_000 : null;
        const value = own.filter((q) => w.days ? new Date(`${q.date}T00:00:00Z`).getTime() >= startMs! : q.date >= w.start).length;
        fields.push({
          bureau: b, key: w.key, value, page: firstPage,
          confidence: zeroGuaranteed ? "high" : bureauMismatch ? "low" : "medium",
          needsReview: !zeroGuaranteed,
          evidence: `Auto: page ${firstPage}, SmartCredit dated inquiry listing (${own.length} entries)`,
        });
      }
    }
  } else if (rep.inquiries.length > 0 && !reportDate) {
    warnings.push("Dated inquiries were found, but the report date is Unknown; lookback counts were not calculated.");
  }

  // Tradelines (each block preserved distinctly; never merged by masked prefix)
  const tradelines: ExtractedTradeline[] = [];
  const accountCountMismatch = new Set<Bureau>();
  for (const b of BUREAUS) {
    const expected = integer(rep.summary["Total Accounts"]?.[b]);
    if (expected == null) continue;
    const actual = rep.tradelines.filter((tl) => bureauReportsTradeline(tl, b)).length;
    if (expected !== actual) accountCountMismatch.add(b);
  }
  if (accountCountMismatch.size) warnings.push("Account blocks do not reconcile with one or more printed Total Accounts rows; affected accounts require review.");
  const paymentCells = rep.tradelines.flatMap((tl) => BUREAUS.flatMap((b) => tl.paymentHistory2Years[b] ?? []));
  const paymentCellsClassified = paymentCells.filter((cell) => cell.status !== null).length;
  let paymentConflict = false;
  for (const [idx, tl] of rep.tradelines.entries()) {
    const creditor = maskSensitive(tl.creditor).slice(0, 80);
    if (!creditor) continue;
    for (const b of BUREAUS) {
      if (!bureauReportsTradeline(tl, b)) continue;
      const statusTxt = tl.fields["Account Status"]?.[b] ?? tl.fields["Account Rating"]?.[b] ?? null;
      const payStatus = tl.fields["Payment Status"]?.[b] ?? null;
      const typeTxt = tl.fields["Account Type"]?.[b] ?? null;
      const late = tl.daysLate[b];
      const lateCount = late && late.d30 != null && late.d60 != null && late.d90 != null ? late.d30 + late.d60 + late.d90 : null;
      const balance = money(tl.fields["Balance Owed"]?.[b]);
      const creditLimit = money(tl.fields["Credit Limit"]?.[b]);
      const isOpen = statusTxt ? (/\bopen\b/i.test(statusTxt) ? true : /\bclosed\b/i.test(statusTxt) ? false : null) : null;
      const isCollection = /^collections?/i.test(tl.section) || /collection/i.test(`${payStatus ?? ""} ${typeTxt ?? ""}`);
      const isChargeoff = /charge.?o(?:ff|!)/i.test(`${payStatus ?? ""} ${statusTxt ?? ""}`);
      const gridLate = (tl.paymentHistory2Years[b] ?? []).some((cell) => cell.status === "30" || cell.status === "60" || cell.status === "90" || cell.status === "CO");
      const gridConflicts = gridLate && (lateCount === null || lateCount === 0);
      paymentConflict ||= gridConflicts;
      tradelines.push({
        bureau: b,
        creditor,
        last4: last4(tl.fields["Account Number"]?.[b]),
        accountType: mapAccountType(tl.section, typeTxt),
        balance,
        creditLimit,
        isOpen,
        lateCount,
        isCollection,
        isChargeoff,
        reconcileKey: `blk:${idx}`,
        page: tl.page,
        needsReview: headerOrderIssue || accountCountMismatch.has(b) || gridConflicts || (balance == null && isOpen == null),
      });
    }
  }

  if (paymentConflict) warnings.push("Payment-grid colors conflict with missing or zero late-count fields; affected accounts require review.");

  const detected = new Set<Bureau>();
  scores.forEach((s) => detected.add(s.bureau));
  fields.forEach((f) => detected.add(f.bureau));
  tradelines.forEach((t) => detected.add(t.bureau));
  const bureausDetected = BUREAUS.filter((b) => detected.has(b));
  const reportType: ParseResult["reportType"] = bureausDetected.length >= 2 ? "tri_merge" : bureausDetected[0] ?? "unknown";
  const anything = scores.length + fields.length + tradelines.length > 0;
  const review = scores.some((s) => s.needsReview) || fields.some((f) => f.needsReview) || tradelines.some((t) => t.needsReview);
  const status: ParseResult["status"] = !anything ? "awaiting_manual_entry" : review || warnings.length > 1 || opts.truncated ? "partial" : "complete_unverified";

  return {
    parserVersion: rep.parserVersion,
    provider: "smartcredit",
    bureausDetected,
    reportType,
    reportDate,
    pageCount: opts.pageCount,
    hasTextLayer: true,
    ocrUsed: false,
    scores,
    fields,
    tradelines,
    warnings: [...new Set(warnings)].map(maskSensitive),
    status,
    diagnostics: {
      layout: rep.variant === "ultra_4k_3b" ? "ultra_4k_3b" : "classic_3b",
      accountBlocks: rep.tradelines.length,
      inquiryEntries: rep.inquiries.length,
      inquiriesReconciled: rep.inquiryAudit.pass,
      paymentCells: paymentCells.length,
      paymentCellsClassified,
    },
  };
}