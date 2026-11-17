import { describe, it, expect } from "vitest";
import { parseReportText } from "./parse";
import { maskSensitive } from "./text";
import { toLines } from "./pdf";
import * as F from "./fixtures/synthetic";

describe("credit report parser (synthetic fixtures)", () => {
  it("single bureau: explicit FICO 8 score, date and fields", () => {
    const r = parseReportText(F.singleBureauExperian);
    expect(r.reportType).toBe("experian");
    expect(r.reportDate).toBe("2026-10-02");
    expect(r.scores).toEqual([expect.objectContaining({ bureau: "experian", model: "FICO 8", value: 702, scoreDate: "2026-10-01" })]);
    expect(r.fields.find((f) => f.key === "inquiries_6mo")?.value).toBe(2);
    expect(r.fields.find((f) => f.key === "collections_count")?.value).toBe(0);
    expect(r.status).not.toBe("verified" as never);
  });

  it("multi-bureau: maps columns by printed header order and keeps a blank bureau Unknown", () => {
    const r = parseReportText(F.triMergeIdentityIQ);
    expect(r.provider).toBe("identityiq");
    expect(r.reportType).toBe("tri_merge");
    const s = Object.fromEntries(r.scores.map((x) => [x.bureau, x]));
    expect(s["transunion"]?.value).toBe(690);
    expect(s["experian"]?.value).toBe(701);
    expect(s["equifax"]).toBeUndefined();
    expect(r.scores.every((x) => x.model === "FICO 8")).toBe(true);
    expect(r.fields.find((f) => f.bureau === "equifax" && f.key === "utilization_pct")?.value).toBe(36);
    expect(r.fields.some((f) => f.key === "inquiries_6mo")).toBe(false); // 12-month row never becomes 6-month
  });

  it("FICO 8 vs VantageScore 3: models never substituted", () => {
    const r = parseReportText(F.ficoVsVantage);
    const vs = r.scores.filter((x) => x.model === "VantageScore 3.0");
    expect(vs.map((x) => x.value).sort()).toEqual([649, 655, 662]);
    expect(r.scores.find((x) => x.model === "FICO 9")).toMatchObject({ bureau: "equifax", value: 671 });
    expect(r.scores.some((x) => x.model?.startsWith("FICO") && x.value !== 671)).toBe(false);
  });

  it("unversioned VantageScore stays model-unknown and flagged for review", () => {
    const r = parseReportText(F.marketingVantageOnly);
    expect(r.scores.length).toBe(3);
    expect(r.scores.every((x) => x.model === null && x.needsReview)).toBe(true);
    expect(r.status).toBe("partial");
  });

  it("missing score is Unknown, never 0", () => {
    const r = parseReportText(F.missingScore);
    expect(r.scores).toEqual([]);
    expect(r.scores.some((s) => s.value === 0)).toBe(false);
    expect(r.warnings.join(" ")).toMatch(/Scores stay Unknown/);
  });

  it("scanned/image PDF is flagged, nothing extracted, no false zeros", () => {
    const r = parseReportText(F.scannedNoText);
    expect(r.hasTextLayer).toBe(false);
    expect(r.status).toBe("unreadable");
    expect(r.scores.length + r.fields.length + r.tradelines.length).toBe(0);
    expect(r.warnings.join(" ")).toMatch(/No text layer detected/);
  });

  it("same-name accounts are not merged; unknown last4 never shares a key", () => {
    const r = parseReportText(F.sameNameAccounts);
    expect(r.tradelines.length).toBe(3);
    expect(new Set(r.tradelines.map((t) => t.reconcileKey)).size).toBe(3);
    expect(r.tradelines.map((t) => t.last4)).toEqual(["1111", "2222", null]);
    expect(r.tradelines[2]!.isCollection).toBe(true);
    expect(r.tradelines[1]!.isOpen).toBe(false);
  });

  it("tri-merge account across bureaus reconciles by creditor + last4", () => {
    const r = parseReportText(F.triMergeIdentityIQ);
    expect(r.tradelines.length).toBe(3);
    expect(new Set(r.tradelines.map((t) => t.reconcileKey)).size).toBe(1);
    expect(r.tradelines.find((t) => t.bureau === "equifax")?.balance).toBe(8350);
    expect(r.tradelines.every((t) => t.creditLimit === null)).toBe(true);
  });

  it("never leaks SSN or full account numbers in output", () => {
    for (const fx of Object.values(F)) {
      const out = JSON.stringify(parseReportText(fx));
      expect(out).not.toMatch(/123-45-6789|4111222233334444|55551111XXXX9876|Jane Synthetic/);
    }
    expect(maskSensitive("SSN 123-45-6789 acct 4111222233334444")).toBe("SSN ***-**-**** acct ••••4444");
  });

  it("never invents lender cutoffs or approval language", () => {
    const out = JSON.stringify(parseReportText(F.triMergeIdentityIQ));
    expect(out).not.toMatch(/approv|cutoff|minimum|eligib/i);
  });

  it("counts dated inquiries per bureau and exact lookback without deduplicating similar entries", () => {
    const r = parseReportText(F.datedEvidence);
    const value = (key: string, bureau = "transunion") => r.fields.find((f) => f.key === key && f.bureau === bureau)?.value;
    expect(value("inquiries_30d")).toBe(2);
    expect(value("inquiries_3mo")).toBe(3);
    expect(value("inquiries_6mo")).toBe(4);
    expect(value("inquiries_12mo")).toBe(5);
    expect(value("inquiries_24mo")).toBe(6);
    expect(value("inquiries_6mo", "experian")).toBe(1);
    expect(r.warnings.join(" ")).toMatch(/not removed/);
  });

  it("extracts explicit delinquency, collection, charge-off and bankruptcy evidence with pages", () => {
    const r = parseReportText(F.datedEvidence);
    expect(r.fields.find((f) => f.key === "late_30_count" && f.bureau === "transunion")).toMatchObject({ value: 1, page: 1 });
    expect(r.fields.find((f) => f.key === "chargeoffs_count" && f.bureau === "transunion")?.value).toBe(1);
    expect(r.fields.find((f) => f.key === "bankruptcy_on_file" && f.bureau === "equifax")).toBeUndefined();
    expect(r.fields.find((f) => f.key === "bankruptcy_on_file" && f.bureau === "experian")?.value).toBe(0);
    expect(r.fields.find((f) => f.key === "months_since_bankruptcy" && f.bureau === "transunion")?.value).toBe(33);
    expect(r.tradelines.find((t) => t.bureau === "transunion")?.lateCount).toBe(1);
    expect(r.tradelines.find((t) => t.bureau === "experian")?.lateCount).toBe(0);
    expect(r.tradelines.every((t) => t.page === 2)).toBe(true);
  });

  it("keeps charge-off separate from collection and preserves explicit late count", () => {
    const r = parseReportText(F.chargeoffEvidence);
    expect(r.tradelines[0]).toMatchObject({ isChargeoff: true, isCollection: false, lateCount: 2, balance: 450 });
  });

  it("does not assume a repeated same-bureau account is a duplicate", () => {
    const r = parseReportText(F.duplicateBureauAccount);
    expect(r.tradelines).toHaveLength(2);
    expect(new Set(r.tradelines.map((t) => t.reconcileKey)).size).toBe(2);
    expect(r.tradelines[1]?.needsReview).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/duplicate review/);
  });

  it("marks OCR provenance, low confidence and mandatory review without claiming a text layer", () => {
    const r = parseReportText(F.singleBureauExperian, { originalHasTextLayer: false, ocrPages: [1, 2] });
    expect(r.hasTextLayer).toBe(false);
    expect(r.ocrUsed).toBe(true);
    expect(r.status).toBe("partial");
    expect(r.scores.every((s) => s.confidence === "low" && s.needsReview && s.evidence.startsWith("OCR:"))).toBe(true);
    expect(r.tradelines.every((t) => t.needsReview)).toBe(true);
  });

  it("failed OCR remains unreadable with strict Unknown and no false zeros", () => {
    const r = parseReportText(F.unreadableOcr, { originalHasTextLayer: false, ocrPages: [1] });
    expect(r.status).toBe("unreadable");
    expect(r.scores.length + r.fields.length + r.tradelines.length).toBe(0);
    expect(r.warnings.join(" ")).toMatch(/clearer upright scan|unsupported languages/i);
  });

  it("rejects impossible dates instead of creating evidence", () => {
    const r = parseReportText([{ page: 1, lines: ["Experian Credit Report", "Report Date: 02/31/2026", "FICO Score 8: 700"] }]);
    expect(r.reportDate).toBeNull();
  });

  it("reconstructs lines from positioned PDF text items", () => {
    const it = (str: string, x: number, y: number) => ({ str, transform: [1, 0, 0, 1, x, y], width: str.length * 5 });
    expect(toLines([it("Credit Score:", 10, 700), it("690", 200, 700), it("701", 300, 701), it("Header", 10, 760)])).toEqual(["Header", "Credit Score:   690   701"]);
  });
});
