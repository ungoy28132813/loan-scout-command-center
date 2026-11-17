import { describe, expect, it } from "vitest";
import { buildUtilizationAccounts, bureauUtilizationScenario, clampPaydown, compareSnapshots, simulateUtilization, type AnalysisField, type AnalysisReport, type AnalysisTradeline } from "./credit-analysis";

const reports: AnalysisReport[] = [
  { id: "old", report_date: "2026-09-01", created_at: "2026-09-02T00:00:00Z", extraction_status: "verified", file_name: "old.pdf" },
  { id: "new", report_date: "2026-11-01", created_at: "2026-11-02T00:00:00Z", extraction_status: "verified", file_name: "new.pdf" },
];
let seq = 0;
const field = (report_id: string, bureau: string, key: string, value: number | null, model: string | null = null, needs_review = false): AnalysisField => ({ id: `f${++seq}`, report_id, bureau, field_key: key, score_model: model, value, status: "verified", needs_review, source_page: 1, score_date: "2026-11-01", confidence: "high" });
const account = (report_id: string, bureau: string, creditor: string, last4: string | null, balance: number | null, limit: number | null, needs_review = false): AnalysisTradeline => ({ id: `t${++seq}`, report_id, bureau, creditor, account_ref_last4: last4, account_type: "revolving", balance, credit_limit: limit, needs_review, reconcile_key: last4 ? `${creditor.toLowerCase()}|${last4}` : null, source_page: 2 });

describe("historical credit snapshot comparison", () => {
  it("compares the same model within each bureau and never across models or bureaus", () => {
    const fields = [
      field("old", "transunion", "score", 690, "FICO 8"), field("new", "transunion", "score", 704, "FICO 8"),
      field("old", "experian", "score", 670, "FICO 9"), field("new", "experian", "score", 680, "FICO 9"),
      field("new", "transunion", "score", 710, "VantageScore 3.0"),
    ];
    const result = compareSnapshots(reports[0]!, reports[1]!, fields, []);
    expect(result.scores).toHaveLength(3);
    expect(result.scores.find((s) => s.bureau === "transunion" && s.model === "FICO 8")).toMatchObject({ earlier: 690, later: 704, delta: 14, status: "changed" });
    expect(result.scores.find((s) => s.bureau === "experian" && s.model === "FICO 9")?.delta).toBe(10);
    expect(result.scores.find((s) => s.model === "VantageScore 3.0")).toMatchObject({ earlier: null, later: 710, delta: null, status: "unknown" });
  });

  it("keeps an unknown summary value unknown and excludes unverified rows", () => {
    const fields = [field("old", "equifax", "inquiries_6mo", 3), field("new", "equifax", "late_payments_24mo", 1), field("old", "equifax", "collections_count", 2, null, true)];
    const result = compareSnapshots(reports[0]!, reports[1]!, fields, []);
    expect(result.summaries.find((s) => s.fieldKey === "inquiries_6mo")).toMatchObject({ earlier: 3, later: null, delta: null, status: "unknown" });
    expect(result.summaries.some((s) => s.fieldKey === "collections_count")).toBe(false);
    expect(result.excludedUnverified).toBe(1);
  });

  it("does not treat a missing old account as zero or a missing later account as deletion", () => {
    const tradelines = [account("new", "experian", "DEMO NEW", "1111", 200, 1000), account("old", "experian", "DEMO OLD", "2222", 500, 2000)];
    const result = compareSnapshots(reports[0]!, reports[1]!, [], tradelines);
    expect(result.accounts.find((a) => a.creditor === "DEMO NEW")?.balance).toMatchObject({ earlier: null, later: 200, delta: null, status: "unknown" });
    expect(result.accounts.find((a) => a.creditor === "DEMO OLD")?.note).toContain("not treated as a deletion");
  });

  it("excludes duplicate account identities as ambiguous instead of choosing one", () => {
    const tradelines = [account("old", "experian", "DEMO DUP", "3333", 500, 2000), account("old", "experian", "DEMO DUP", "3333", 700, 2000), account("new", "experian", "DEMO DUP", "3333", 400, 2000)];
    const result = compareSnapshots(reports[0]!, reports[1]!, [], tradelines);
    expect(result.accounts).toEqual([]);
    expect(result.warnings.join(" ")).toContain("duplicate account/bureau");
  });
});

describe("revolving utilization and paydown simulator", () => {
  it("deduplicates matching bureau appearances once when balances and limits agree", () => {
    const accounts = buildUtilizationAccounts("new", [account("new", "experian", "DEMO CARD", "4444", 500, 1000), account("new", "equifax", "DEMO CARD", "4444", 500, 1000)]);
    expect(accounts[0]?.combinedEligible).toBe(true);
    const result = simulateUtilization(accounts, { [accounts[0]!.key]: { selected: true, paydown: 100 } });
    expect(result.combined).toMatchObject({ currentBalance: 500, proposedBalance: 400, currentLimit: 1000, currentUtilization: 50, proposedUtilization: 40, differencePoints: 10 });
    expect(result.totalPaydown).toBe(100);
  });

  it("excludes conflicting duplicate bureau balances from combined totals", () => {
    const accounts = buildUtilizationAccounts("new", [account("new", "experian", "DEMO CONFLICT", "5555", 500, 1000), account("new", "equifax", "DEMO CONFLICT", "5555", 600, 1000)]);
    expect(accounts[0]?.combinedEligible).toBe(false);
    expect(accounts[0]?.reasons.join(" ")).toContain("differ");
    expect(simulateUtilization(accounts, { [accounts[0]!.key]: { selected: true, paydown: 100 } }).combined).toBeNull();
  });

  it("keeps zero-limit and unverified accounts informational only", () => {
    const accounts = buildUtilizationAccounts("new", [account("new", "experian", "ZERO LIMIT", "6666", 100, 0), account("new", "experian", "REVIEW CARD", "7777", 100, 1000, true)]);
    expect(accounts.every((a) => !a.combinedEligible)).toBe(true);
    expect(accounts.find((a) => a.creditor === "ZERO LIMIT")?.members[0]?.currentUtilization).toBeNull();
    expect(accounts.find((a) => a.creditor === "REVIEW CARD")?.members[0]?.currentUtilization).toBe(10);
    expect(simulateUtilization(accounts, {}).combined).toBeNull();
  });

  it("caps paydown at balance, prevents negative values, and shows amount remaining", () => {
    expect(clampPaydown(-50, 500)).toBe(0);
    expect(clampPaydown(999, 500)).toBe(500);
    const accounts = buildUtilizationAccounts("new", [account("new", "experian", "MAX PAYDOWN", "8888", 500, 1000)]);
    const result = simulateUtilization(accounts, { [accounts[0]!.key]: { selected: true, paydown: 900 } });
    expect(result.accounts[0]).toMatchObject({ appliedPaydown: 500, remaining: 0, currentUtilization: 50, proposedUtilization: 0 });
    expect(result.totalPaydown).toBe(500);
  });

  it("allows utilization above 100% without hiding or clamping the actual math", () => {
    const accounts = buildUtilizationAccounts("new", [account("new", "experian", "OVER LIMIT", "9999", 1200, 1000)]);
    const result = simulateUtilization(accounts, { [accounts[0]!.key]: { selected: true, paydown: 200 } });
    expect(result.combined).toMatchObject({ currentUtilization: 120, proposedUtilization: 100, differencePoints: 20 });
  });

  it("provides bureau-specific hypothetical inputs without double-counting another bureau", () => {
    const accounts = buildUtilizationAccounts("new", [account("new", "experian", "DEMO CARD", "4444", 500, 1000), account("new", "equifax", "DEMO CARD", "4444", 500, 1000)]);
    const inputs = { [accounts[0]!.key]: { selected: true, paydown: 100 } };
    expect(bureauUtilizationScenario(accounts, inputs, "experian")).toMatchObject({ accountCount: 1, currentBalance: 500, proposedBalance: 400, currentLimit: 1000, proposedUtilization: 40 });
    expect(bureauUtilizationScenario(accounts, inputs, "transunion")).toBeNull();
  });

  it("keeps ambiguous groups out of bureau-specific rule previews", () => {
    const accounts = buildUtilizationAccounts("new", [account("new", "experian", "DEMO CONFLICT", "5555", 500, 1000), account("new", "equifax", "DEMO CONFLICT", "5555", 600, 1000)]);
    expect(bureauUtilizationScenario(accounts, { [accounts[0]!.key]: { selected: true, paydown: 100 } }, "experian")).toBeNull();
  });
});
