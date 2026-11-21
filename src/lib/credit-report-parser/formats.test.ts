import { describe, expect, it } from "vitest";
import { parseReportText } from "./parse";
import { parseDate, rowValues } from "./text";
import type { PageText } from "./types";

const pg = (page: number, lines: string[]): PageText => ({ page, lines });
const smart = (row = "718   726   731", model = ""): PageText[] => [pg(1, [
  "SmartCredit SYNTHETIC report", "Report Date: 11/01/2026", "Credit Scores", model,
  "TransUnion   Experian   Equifax", row, "Personal Information", "Summary",
  "TransUnion   Experian   Equifax", "Open Accounts   5   6   7", "Delinquent   0   --   1",
  "Inquiries (2 Years)   4   0   3", "Credit Utilization", "TOTAL USED   AVAILABLE   UTILIZATION",
  "TransUnion   $1,200   $3,800   24%", "Experian   $800   $7,200   10%", "Equifax   --   --   --",
])];
const tableHeader = "Account Type   Open   With Balance   Total Balance   Available   Credit Limit   Debt-To-Credit   Payment";
const iq: PageText[] = [pg(3, ["Three Bureau Credit Report powered by Equifax — SYNTHETIC", "1. Report Summary",
  "Report Date   July 12, 2026   July 12, 2026   July 12, 2026", "Credit Score and Rating",
  "1   2   3", "Equifax   Experian   TransUnion", "735   712   728", "Very Good   Good   Very Good",
  "Factors affecting your credit score", "FICO 8 is a different model used by some lenders", "Equifax Accounts Summary",
]), pg(4, [tableHeader, "Revolving   3   2   $1,200   $3,800   $5,000   24%   $80",
  "Mortgage   1   1   $180,000   $20,000   $200,000   90%   $1,500", "Total   4   3   $181,200   $23,800   $205,000   88%   $1,580",
  "Experian Accounts Summary", tableHeader, "Revolving   4   2   $800   $7,200   $8,000   10%   $50", "Total   5   3   $20,000   $9,000   $29,000   69%   $200",
  "TransUnion Accounts Summary", tableHeader, "Revolving   2   1   N/A   N/A   N/A   N/A   N/A", "Total   2   1   N/A   N/A   N/A   N/A   N/A",
  "Other Credit Items", "Equifax   Experian   TransUnion", "Inquiries   3   2   4", "Public Records   0   0   0", "Collections   0   --   1",
  "1 The credit score provided here uses a proprietary credit model designed by VantageScore. The Equifax Credit Score is educational.",
  "2 The credit score provided here uses a proprietary credit model designed by VantageScore. The Experian Credit Score is educational.",
  "3 The credit score provided here uses a proprietary credit model designed by VantageScore. The TransUnion Credit Score is educational.",
])];

describe("format-aware summaries (fictional values only)", () => {
  it("reads SmartCredit's unlabeled score row in printed bureau order without inventing models", () => {
    const r = parseReportText(smart());
    expect(r.scores.map((s) => [s.bureau, s.value, s.model])).toEqual([["transunion", 718, null], ["experian", 726, null], ["equifax", 731, null]]);
    expect(r.scores.every((s) => s.needsReview)).toBe(true);
  });
  it("uses an explicitly printed version without confusing it with score numbers", () => {
    expect(parseReportText(smart(undefined, "VantageScore 3.0")).scores.map((s) => s.model)).toEqual(["VantageScore 3.0", "VantageScore 3.0", "VantageScore 3.0"]);
  });
  it("preserves a missing middle score without shifting the next bureau", () => {
    expect(parseReportText(smart("718   ——   731")).scores.map((s) => [s.bureau, s.value])).toEqual([["transunion", 718], ["equifax", 731]]);
  });
  it("does not guess columns when a cell disappears without a placeholder", () => {
    expect(parseReportText(smart("718   731")).scores).toEqual([]);
  });
  it("maps the explicitly stated two-year window only to 24 months, keeping zero", () => {
    const fields = parseReportText(smart()).fields;
    expect(fields.filter((f) => f.key === "inquiries_24mo").map((f) => f.value)).toEqual([4, 0, 3]);
    expect(fields.some((f) => f.key === "inquiries_6mo")).toBe(false);
  });
  it("preserves blank delinquency as Unknown and explicit zero as zero", () => {
    expect(parseReportText(smart()).fields.filter((f) => f.key === "delinquent_accounts_count").map((f) => [f.bureau, f.value])).toEqual([["transunion", 0], ["equifax", 1]]);
  });
  it("reads the printed SmartCredit percentage, not the AVAILABLE column as a limit", () => {
    expect(parseReportText(smart()).fields.filter((f) => f.key === "utilization_pct").map((f) => [f.bureau, f.value])).toEqual([["transunion", 24], ["experian", 10]]);
  });
  it("reads IQ-style cards without footnote markers or guessed VantageScore versions", () => {
    const r = parseReportText(iq);
    expect(r.scores.map((s) => [s.bureau, s.value, s.model])).toEqual([["equifax", 735, null], ["experian", 712, null], ["transunion", 728, null]]);
    expect(r.reportDate).toBe("2026-07-12");
    expect(r.provider).toBe("unknown"); // Layout does not prove the reseller's brand.
  });
  it("uses only an exact model disclosure associated with each bureau", () => {
    const pages = iq.map((p) => ({ ...p, lines: p.lines.map((l) => l.replace("by VantageScore.", "by VantageScore 4.0.")) }));
    expect(parseReportText(pages).scores.map((s) => s.model)).toEqual(["VantageScore 4.0", "VantageScore 4.0", "VantageScore 4.0"]);
  });
  it("reads revolving ratios only, handles a page break, and keeps missing ratios Unknown", () => {
    const r = parseReportText(iq);
    expect(r.fields.filter((f) => f.key === "utilization_pct").map((f) => [f.bureau, f.value, f.page])).toEqual([["equifax", 24, 4], ["experian", 10, 4]]);
    expect(r.fields.filter((f) => f.key === "open_tradelines").map((f) => f.value)).toEqual([4, 5, 2]);
  });
  it("does not invent an inquiry lookback from IQ's unspecified summary count", () => {
    expect(parseReportText(iq).fields.some((f) => f.key.startsWith("inquiries_"))).toBe(false);
    expect(parseReportText(iq).fields.filter((f) => f.key === "collections_count").map((f) => f.value)).toEqual([0, 1]);
  });
  it("flags conflicting scores instead of silently selecting one", () => {
    const r = parseReportText([...smart(), pg(2, ["TransUnion FICO Score 8: 700"])]);
    expect(r.scores.filter((s) => s.bureau === "transunion").every((s) => s.needsReview && s.confidence === "low")).toBe(true);
  });
  it("downgrades format reads on OCR pages and never verifies them", () => {
    const r = parseReportText(smart(), { ocrPages: [1], originalHasTextLayer: false });
    expect(r.scores).toHaveLength(3);
    expect([...r.scores, ...r.fields].every((s) => s.needsReview && s.confidence === "low" && s.evidence.startsWith("OCR:"))).toBe(true);
    expect(r.status).toBe("partial");
  });
  it("normalizes any dash run as one missing cell, not zero or several blanks", () => {
    expect(rowValues("——   0   ----")).toEqual([null, 0, null]);
  });
  it("rejects impossible written dates", () => {
    expect(parseDate("February 31, 2026")).toBeNull();
    expect(parseDate("November 21, 2026")).toBe("2026-11-21");
  });
  it("keeps conflicting per-bureau snapshot dates Unknown instead of choosing the first", () => {
    const pages = iq.map((p) => ({ ...p, lines: p.lines.map((l) => l.startsWith("Report Date") ? "Report Date   July 12, 2026   July 13, 2026   July 12, 2026" : l) }));
    expect(parseReportText(pages).reportDate).toBeNull();
  });
  it("retains low confidence when an exact model disclosure is on a separate OCR page", () => {
    const pages = iq.map((p) => ({ ...p, lines: p.lines.map((l) => l.replace("by VantageScore.", "by VantageScore 3.0.")) }));
    const r = parseReportText(pages, { ocrPages: [4] });
    expect(r.scores).toHaveLength(3);
    expect(r.scores.every((s) => s.model === "VantageScore 3.0" && s.needsReview && s.confidence === "low")).toBe(true);
  });
  it("requires staff review if format and generic utilization readings disagree", () => {
    const pages = smart();
    pages[0]?.lines.push("TransUnion   Experian   Equifax", "Utilization   25%   10%   --");
    const readings = parseReportText(pages).fields.filter((f) => f.bureau === "transunion" && f.key === "utilization_pct");
    expect(readings.map((f) => f.value)).toEqual([24, 25]);
    expect(readings.every((f) => f.needsReview && f.confidence === "low")).toBe(true);
  });
});