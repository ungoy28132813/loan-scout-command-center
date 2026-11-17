import { describe, expect, it } from "vitest";
import { amortizingPayment, calculateTierScenario, documentedPaymentRange, marketingComparison, sequencingNote, type PlannerItemInput, type PlannerProduct } from "./funding-planner";
import type { MatchEvaluation } from "./match-engine";

const product = (patch: Partial<PlannerProduct> = {}): PlannerProduct => ({
  id: "loan", name: "Synthetic Loan", lender: "Demo Bank", product_type: "personal_loan", amount_kind: "loan_cash",
  published_min_amount: 1000, published_max_amount: 50000, published_apr_min: 8, published_apr_max: 20, apr_source_url: "https://example.com/loan", apr_as_of: "2026-11-01",
  published_term_min_months: 12, published_term_max_months: 60, term_source_url: "https://example.com/loan", term_as_of: "2026-11-01",
  pull_type: "unknown", official_url: "https://example.com/loan", ...patch,
});
const item = (patch: Partial<PlannerItemInput> = {}): PlannerItemInput => ({
  product: product(), amounts: { conservative: 5000, medium: 10000, expanded: 20000 }, termMonths: 12, ...patch,
});
const personal = { goalType: "personal" as const, monthlyGrossIncome: 5000, existingMonthlyDebtPayments: 500, monthlyNetCashFlow: null, provenance: "goal-specific self-reported" };
const emptyEvaluation: MatchEvaluation = { status: "needs_review", score: null, conditions: [], improvement_steps: [], summary: "Unknown", pricing_assumption: "No pricing inferred" };

describe("documented payment math", () => {
  it("calculates amortizing and zero-APR payments", () => {
    expect(amortizingPayment(10000, 10, 12)).toBe(879.16);
    expect(amortizingPayment(10000, 0, 12)).toBe(833.33);
  });
  it("uses marketed APR endpoints and a selected term within the documented range", () => {
    const result = documentedPaymentRange(product(), 10000, 12);
    expect(result.low).toBe(869.88);
    expect(result.high).toBe(926.35);
    expect(result.sourceUrl).toBe("https://example.com/loan");
  });
  it("keeps payment unknown when APR, term or amount is missing", () => {
    expect(documentedPaymentRange(product({ published_apr_min: null, published_apr_max: null }), 10000, 12).low).toBeNull();
    expect(documentedPaymentRange(product({ apr_source_url: null }), 10000, 12).low).toBeNull();
    expect(documentedPaymentRange(product({ term_source_url: null }), 10000, 12).low).toBeNull();
    expect(documentedPaymentRange(product({ published_term_min_months: null, published_term_max_months: null }), 10000, null).low).toBeNull();
    expect(documentedPaymentRange(product(), null, 12).low).toBeNull();
    expect(documentedPaymentRange(product(), 10000, 120).low).toBeNull();
  });
  it("does not infer amortizing payments for cards or credit lines", () => {
    expect(documentedPaymentRange(product({ amount_kind: "credit_limit", product_type: "credit_card" }), 10000, 12).low).toBeNull();
  });
  it("compares requests with marketing ranges without treating them as offers", () => {
    expect(marketingComparison(500, product())).toBe("below");
    expect(marketingComparison(5000, product())).toBe("within");
    expect(marketingComparison(60000, product())).toBe("above");
    expect(marketingComparison(null, product())).toBe("unknown");
  });
});

describe("safe cross-product scenarios and affordability", () => {
  it("sums loan cash separately from card limits and never calls limits cash", () => {
    const card = item({ product: product({ id: "card", name: "Synthetic Card", amount_kind: "credit_limit", product_type: "credit_card" }), amounts: { conservative: 3000, medium: 5000, expanded: 10000 } });
    const result = calculateTierScenario([item(), card], "medium", personal);
    expect(result.cashTotal).toBe(10000);
    expect(result.revolvingLimitTotal).toBe(5000);
    expect(result.paymentLow).toBeNull();
    expect(result.unknownPaymentProducts.join(" ")).toContain("revolving balance/payment unknown");
    expect(result.scenarioDtiHigh).toBeNull();
  });
  it("does not convert unknown product amounts into zero", () => {
    const unknown = item({ amounts: { conservative: null, medium: null, expanded: null } });
    const result = calculateTierScenario([item(), unknown], "medium", personal);
    expect(result.cashTotal).toBeNull();
    expect(result.knownCashSubtotal).toBe(10000);
    expect(result.unknownAmountProducts).toHaveLength(1);
  });
  it("calculates personal DTI only when all payments and goal inputs are known", () => {
    const result = calculateTierScenario([item()], "medium", personal);
    expect(result.paymentLow).toBe(869.88);
    expect(result.scenarioDtiLow).toBe(27.4);
    expect(result.scenarioDtiHigh).toBe(28.5);
    expect(result.remainingMonthlyIncomeLow).toBe(3573.65);
    expect(result.affordabilityNote).toContain("No lender DTI definition");
  });
  it("keeps affordability unknown when a selected loan lacks documented terms", () => {
    const result = calculateTierScenario([item({ termMonths: null })], "medium", personal);
    expect(result.paymentLow).toBeNull();
    expect(result.scenarioDtiLow).toBeNull();
  });
  it("uses only the selected business cash flow and never another business's income", () => {
    const businessA = { goalType: "business" as const, monthlyGrossIncome: null, existingMonthlyDebtPayments: null, monthlyNetCashFlow: 8000, provenance: "Business A self-reported" };
    const businessB = { ...businessA, monthlyNetCashFlow: null, provenance: "Business B unknown" };
    expect(calculateTierScenario([item()], "medium", businessA).remainingBusinessCashFlowHigh).toBe(7130.12);
    const unknown = calculateTierScenario([item()], "medium", businessB);
    expect(unknown.remainingBusinessCashFlowHigh).toBeNull();
    expect(unknown.affordabilityNote).toContain("Business B unknown");
  });
});

describe("sequencing safeguards", () => {
  it("marks pull and relationship sequencing uncertain when evidence is missing", () => {
    const evaluation = { ...emptyEvaluation, conditions: [{ rule_id: "m", rule_key: "min_membership_months", label: "Membership", required: "6", observed: "Unknown", outcome: "unknown" as const, explanation: "Unknown", source_tier: "verified_primary" as const, source_title: "Doc", source_url: "https://example.com", verified_on: "2026-11-01", stale: false }] };
    const note = sequencingNote(product(), evaluation);
    expect(note).toContain("sequencing is uncertain");
    expect(note).toContain("Membership");
  });
  it("does not infer an application timing advantage from a documented hard pull", () => {
    expect(sequencingNote(product({ pull_type: "hard" }), emptyEvaluation)).toContain("does not assume a timing advantage");
  });
});
