import { describe, expect, it } from "vitest";
import { coordinateToParseResult } from "./smartcredit-adapter";
import { triple, type CoordinateReport, type Tradeline } from "./coordinates";

function tradeline(index = 0): Tradeline {
  const values = (value: string) => triple(() => value);
  return {
    section: "Revolving",
    creditor: `SYNTHETIC BANK ${index}`,
    page: 2,
    fields: {
      "Account Number": values("****1111"),
      "Balance Owed": values("$378,038"),
      "Credit Limit": values("$500,000"),
      "Account Status": values("Open"),
      "Account Type": values("Credit Card"),
    },
    originalCreditor: null,
    paymentHistory2Years: triple(() => null),
    daysLate: triple(() => ({ d30: 0, d60: 0, d90: 0 })),
  };
}

function report(): CoordinateReport {
  return {
    parserVersion: "synthetic-coordinate-test",
    recognized: true,
    variant: "classic_3b",
    scores: triple(() => 700),
    scorePage: 1,
    scoreModel: null,
    personal: {
      name: triple(() => "SYNTHETIC PERSON"),
      reportDate: triple(() => "2026-06-15"),
      currentAddresses: triple(() => []),
      previousAddresses: triple(() => []),
      employers: triple(() => []),
      birthYear: triple(() => null),
    },
    summary: {
      "Total Accounts": triple(() => "1"),
      "Open Accounts": triple(() => "1"),
      "Delinquent": triple(() => "0"),
      "Inquiries (2 Years)": triple(() => "0"),
    },
    summaryPages: {},
    tradelines: [tradeline()],
    inquiries: [],
    inquiryAudit: { headerCount: 0, counts: triple(() => 0), expected: triple(() => 0), pass: true, mismatches: [] },
    warnings: [],
  };
}

describe("SmartCredit coordinate adapter", () => {
  it("keeps dollars in dollars and maps the report and score dates", () => {
    const result = coordinateToParseResult(report(), { pageCount: 2 });
    expect(result.reportDate).toBe("2026-06-15");
    expect(result.scores.every((score) => score.scoreDate === "2026-06-15")).toBe(true);
    expect(result.tradelines.every((line) => line.balance === 378038 && line.creditLimit === 500000)).toBe(true);
    expect(result.diagnostics).toMatchObject({ layout: "classic_3b", accountBlocks: 1, inquiriesReconciled: true });
  });

  it("never infers an unstated score model or marks the result verified", () => {
    const result = coordinateToParseResult(report(), { pageCount: 2 });
    expect(result.scores.every((score) => score.model === null && score.needsReview)).toBe(true);
    expect(result.status).not.toBe("verified" as never);
  });

  it("keeps identical masked accounts in separate blocks", () => {
    const input = report();
    input.tradelines = [tradeline(0), tradeline(1)];
    input.summary["Total Accounts"] = triple(() => "2");
    const result = coordinateToParseResult(input, { pageCount: 2 });
    expect(result.tradelines).toHaveLength(6);
    expect(new Set(result.tradelines.map((line) => line.reconcileKey)).size).toBe(2);
  });

  it("keeps late counts Unknown when any printed count is --", () => {
    const input = report();
    input.tradelines[0]!.daysLate = triple(() => ({ d30: 0, d60: null, d90: 0 }));
    const result = coordinateToParseResult(input, { pageCount: 2 });
    expect(result.tradelines.every((line) => line.lateCount === null)).toBe(true);
  });

  it("flags account-count cross-foot failures instead of silently trusting the rows", () => {
    const input = report();
    input.summary["Total Accounts"] = triple(() => "2");
    const result = coordinateToParseResult(input, { pageCount: 2 });
    expect(result.tradelines.every((line) => line.needsReview)).toBe(true);
    expect(result.warnings.join(" ")).toMatch(/do not reconcile/);
  });

  it("uses adverse payment-grid colors only as a review signal, not a guessed late count", () => {
    const input = report();
    input.tradelines[0]!.paymentHistory2Years.transunion = [{ month: "2026-01", page: 2, x: 100, y: 100, w: 10, status: "30" }];
    const result = coordinateToParseResult(input, { pageCount: 2 });
    const transunion = result.tradelines.find((line) => line.bureau === "transunion");
    expect(transunion?.lateCount).toBe(0);
    expect(transunion?.needsReview).toBe(true);
    expect(result.warnings.join(" ")).toMatch(/Payment-grid colors conflict/);
  });
});
