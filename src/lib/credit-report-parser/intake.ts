/**
 * Pure browser-local intake helpers for 1-step PDF onboarding.
 * Suggested identity stays in memory for staff confirmation and is never written to logs or diagnostics.
 */
import { BUREAUS, type Bureau, type PageText, type ParseResult } from "./types";
import { integer, money, type CoordinateReport, type Tradeline } from "./coordinates";

export interface CrossFootSummary {
  eligibleForOneClickAccept: boolean;
  reportDateValid: boolean;
  bureausFound: boolean;
  noOcrOrTruncation: boolean;
  accountsReconciled: boolean;
  balancesReconciled: boolean;
  paymentsReconciled: boolean;
  inquiriesReconciled: boolean;
  noStructuralConflicts: boolean;
  missingScoreModels: boolean;
  reasons: string[];
}

export interface IntakeExtraction {
  result: ParseResult;
  suggestedName: string | null;
  nameConflict: boolean;
  crossFoot: CrossFootSummary;
}

const STOP_NAME = /^(?:credit|report|summary|personal|information|transunion|experian|equifax|smartcredit|identityiq|myscoreiq|none|n\/a|unknown|date|address|ssn)$/i;

export function formatPersonName(raw: string): string | null {
  const cleaned = raw.replace(/[^A-Za-z'\-.\s]/g, " ").replace(/\s+/g, " ").trim();
  const parts = cleaned.split(" ").filter(Boolean);
  if (parts.length < 2 || parts.length > 5) return null;
  if (parts.some((p) => STOP_NAME.test(p) || p.length > 28)) return null;
  return parts
    .map((p) => p.split("-").map((seg) => seg ? seg[0]!.toUpperCase() + seg.slice(1).toLowerCase() : "").join("-"))
    .join(" ")
    .slice(0, 120);
}

function nameSignature(name: string): string {
  const parts = name.toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return parts.join(" ");
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

export function extractSuggestedName(
  coordinate: CoordinateReport | null,
  pages?: PageText[]
): { suggestedName: string | null; nameConflict: boolean } {
  if (coordinate?.recognized) {
    const candidates = BUREAUS
      .map((b) => coordinate.personal.name[b])
      .map((raw) => (raw ? formatPersonName(raw) : null))
      .filter((v): v is string => Boolean(v));
    if (candidates.length) {
      const signatures = new Set(candidates.map(nameSignature));
      if (signatures.size === 1) {
        const preferred = [...candidates].sort((a, b) => b.length - a.length)[0] ?? null;
        return { suggestedName: preferred, nameConflict: false };
      }
      return { suggestedName: null, nameConflict: true };
    }
  }
  const firstPage = pages?.[0];
  if (firstPage) {
    for (const line of firstPage.lines.slice(0, 40)) {
      const m = line.match(/^(?:consumer\s+|client\s+|full\s+)?name\s*:\s*(.+)$/i);
      if (!m?.[1]) continue;
      const firstChunk = m[1].split(/\s{3,}|\s*\|\s*/)[0] ?? "";
      const formatted = formatPersonName(firstChunk);
      if (formatted) return { suggestedName: formatted, nameConflict: false };
    }
  }
  return { suggestedName: null, nameConflict: false };
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

function sumMoneyMatch(
  rep: CoordinateReport,
  summaryKey: string,
  fieldKey: string
): boolean {
  const row = rep.summary[summaryKey];
  if (!row) return true;
  let checked = 0;
  for (const b of BUREAUS) {
    const expected = money(row[b]);
    if (expected == null) continue;
    checked++;
    let sum = 0;
    for (const tl of rep.tradelines) {
      if (!bureauReportsTradeline(tl, b)) continue;
      sum += money(tl.fields[fieldKey]?.[b]) ?? 0;
    }
    if (Math.abs(sum - expected) > 1) return false;
  }
  return checked > 0;
}

export function evaluateCrossFoot(
  result: ParseResult,
  coordinate: CoordinateReport | null,
  truncated = false
): CrossFootSummary {
  const reasons: string[] = [];
  const reportDateValid = Boolean(result.reportDate && Number.isFinite(Date.parse(result.reportDate)));
  if (!reportDateValid) reasons.push("Printed report date is missing or bureaus disagree.");

  const bureausFound = result.bureausDetected.length > 0;
  if (!bureausFound) reasons.push("No credit bureau columns were identified.");

  const noOcrOrTruncation = !result.ocrUsed && !truncated;
  if (result.ocrUsed) reasons.push("Local OCR was used; scanned pages require manual staff review.");
  if (truncated) reasons.push("PDF exceeded 80 pages and was truncated; manual review required.");

  const unreadable = result.status === "unreadable" || result.status === "awaiting_manual_entry";
  if (unreadable) reasons.push("Report could not be read reliably.");

  const structuralWarning = result.warnings.some((w) =>
    /out of SmartCredit order|Repeated summary values disagree|Conflicting score readings|Payment-grid colors conflict|Account blocks do not reconcile/i.test(w)
  );
  const noStructuralConflicts = !unreadable && !structuralWarning;
  if (structuralWarning) reasons.push("Layout, summary, score, or payment-grid conflict detected.");

  let accountsReconciled = false;
  let balancesReconciled = false;
  let paymentsReconciled = false;
  let inquiriesReconciled = false;

  if (coordinate?.recognized) {
    let checkedAccounts = 0;
    let allAccountsMatch = true;
    for (const b of BUREAUS) {
      const expected = integer(coordinate.summary["Total Accounts"]?.[b]);
      if (expected == null) continue;
      checkedAccounts++;
      const actual = coordinate.tradelines.filter((tl) => bureauReportsTradeline(tl, b)).length;
      if (expected !== actual) allAccountsMatch = false;
    }
    accountsReconciled = checkedAccounts > 0 && allAccountsMatch;
    if (!accountsReconciled) reasons.push("Parsed account blocks did not match the printed Total Accounts summary.");

    balancesReconciled = sumMoneyMatch(coordinate, "Balances", "Balance Owed");
    if (!balancesReconciled) reasons.push("Summed account balances did not match the printed Balances summary.");

    paymentsReconciled = sumMoneyMatch(coordinate, "Payments", "Payment Amount");
    if (!paymentsReconciled) reasons.push("Summed monthly payments did not match the printed Payments summary.");

    inquiriesReconciled = coordinate.inquiryAudit.pass;
    if (!inquiriesReconciled) reasons.push("Dated inquiry entries did not reconcile with printed inquiry totals.");
  } else {
    const anyFieldNeedsReview =
      result.fields.some((f) => f.needsReview) ||
      result.tradelines.some((t) => t.needsReview);
    const hasStructured = result.fields.length + result.tradelines.length > 0;
    accountsReconciled = hasStructured && !anyFieldNeedsReview;
    balancesReconciled = hasStructured && !anyFieldNeedsReview;
    paymentsReconciled = hasStructured && !anyFieldNeedsReview;
    inquiriesReconciled = hasStructured && !anyFieldNeedsReview;
    if (!accountsReconciled) reasons.push("Non-SmartCredit layout has fields flagged for manual review.");
  }

  const missingScoreModels = result.scores.some((s) => !s.model);
  const eligibleForOneClickAccept =
    reportDateValid &&
    bureausFound &&
    noOcrOrTruncation &&
    accountsReconciled &&
    balancesReconciled &&
    paymentsReconciled &&
    inquiriesReconciled &&
    noStructuralConflicts;

  return {
    eligibleForOneClickAccept,
    reportDateValid,
    bureausFound,
    noOcrOrTruncation,
    accountsReconciled,
    balancesReconciled,
    paymentsReconciled,
    inquiriesReconciled,
    noStructuralConflicts,
    missingScoreModels,
    reasons,
  };
}