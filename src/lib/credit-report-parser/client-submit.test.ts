import { describe, expect, it } from "vitest";
import { buildClientExtractionPayload } from "./client-submit";
import { parseReportText } from "./parse";
import * as F from "./fixtures/synthetic";
import type { ParseResult } from "./types";

describe("client extraction submission boundary", () => {
  it("submits structured values without evidence, warnings, raw text, or reconcile keys", () => {
    const result = parseReportText(F.triMergeIdentityIQ);
    const payload = buildClientExtractionPayload(result);
    expect(payload.scores.length).toBeGreaterThan(0);
    expect(payload.tradelines.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("evidence");
    expect(serialized).not.toContain("warnings");
    expect(serialized).not.toContain("reconcileKey");
    expect(serialized).not.toContain("rawText");
    expect(payload.ocrUsed).toBe(false);
    expect(serialized).not.toContain("123-45-6789");
    expect(serialized).not.toContain("123456789012");
    for (const line of payload.tradelines) expect(Object.keys(line)).not.toContain("reconcileKey");
  });

  it("keeps explicit models separate and unknown models null instead of inventing FICO 8", () => {
    const explicit = buildClientExtractionPayload(parseReportText(F.ficoVsVantage));
    expect(explicit.scores.find((s) => s.bureau === "transunion")?.model).toBe("VantageScore 3.0");
    expect(explicit.scores.find((s) => s.bureau === "equifax" && s.value === 671)?.model).toBe("FICO 9");
    const unknown = buildClientExtractionPayload(parseReportText(F.marketingVantageOnly));
    expect(unknown.scores.length).toBeGreaterThan(0);
    expect(unknown.scores.every((s) => s.model === null && s.needsReview)).toBe(true);
  });

  it("submits an unreadable status with no invented zero scores or accounts", () => {
    const result: ParseResult = { parserVersion: "ls-parse-1.1.0", provider: "unknown", bureausDetected: [], reportType: "unknown", reportDate: null, pageCount: 2, hasTextLayer: false, ocrUsed: true, scores: [], fields: [], tradelines: [], warnings: ["No text layer"], status: "unreadable" };
    const payload = buildClientExtractionPayload(result);
    expect(payload.status).toBe("unreadable");
    expect(payload.scores).toEqual([]);
    expect(payload.fields).toEqual([]);
    expect(payload.tradelines).toEqual([]);
    expect(JSON.stringify(payload)).not.toContain("No text layer");
  });

  it("stages OCR and adverse-account flags as structured unverified values only", () => {
    const result = parseReportText(F.chargeoffEvidence, { originalHasTextLayer: false, ocrPages: [1] });
    const payload = buildClientExtractionPayload(result);
    expect(payload.ocrUsed).toBe(true);
    expect(payload.hasTextLayer).toBe(false);
    expect(payload.tradelines[0]).toMatchObject({ lateCount: 2, isChargeoff: true, isCollection: false, needsReview: true });
    expect(JSON.stringify(payload)).not.toMatch(/evidence|warnings|rawText|Charge-off"\]/);
  });

  it("keeps only four account-ending digits and no free-text evidence", () => {
    const result = parseReportText(F.triMergeIdentityIQ);
    const payload = buildClientExtractionPayload(result);
    for (const account of payload.tradelines) {
      expect(account.last4 === null || /^\d{4}$/.test(account.last4)).toBe(true);
      expect(account.creditor).not.toMatch(/\d{5,}/);
      expect(account.sourcePage).toBeGreaterThan(0);
    }
  });
});
