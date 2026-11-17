import { describe, expect, it } from "vitest";
import { businessAnalysis, businessCoreAnswers, monthsOperating, productBelongsToGoal, scopedGoalAnswers, scopeProductsToGoal, type BusinessFinancialProfile } from "./business-funding";

const profile = (id: string, annualRevenue: number | null): BusinessFinancialProfile => ({
  id, client_id: "same-client", annual_revenue: annualRevenue, monthly_revenue: null,
  monthly_expenses: null, monthly_net_cash_flow: null, existing_monthly_debt_payments: null,
  average_monthly_deposits: null, banking_history_months: null, owner_share_pct: null,
  months_in_business: null, formation_date: null, verification_status: "self_reported",
});

describe("goal-scoped business facts", () => {
  it("keeps Business A's $200k revenue out of Business B's explicit $0 and unknown profiles", () => {
    const a = profile("a", 200000);
    const zero = profile("b", 0);
    const unknown = profile("c", null);
    expect(scopedGoalAnswers({ goalType: "business", personalAnswers: {}, business: a })["annual_business_revenue"]).toBe(200000);
    expect(scopedGoalAnswers({ goalType: "business", personalAnswers: {}, business: zero })["annual_business_revenue"]).toBe(0);
    expect(scopedGoalAnswers({ goalType: "business", personalAnswers: {}, business: unknown })["annual_business_revenue"]).toBeNull();
  });

  it("never mixes client-global income or another business's answers into a business goal", () => {
    const answers = scopedGoalAnswers({
      goalType: "business",
      personalAnswers: { annual_business_revenue: 200000, annual_income: 90000, monthly_debt_payments: 500 },
      business: profile("b", null),
      businessAnswers: { business_cash_on_hand: 12000 },
    });
    expect(answers["annual_business_revenue"]).toBeNull();
    expect(answers["annual_income"]).toBeUndefined();
    expect(answers["monthly_debt_payments"]).toBeUndefined();
    expect(answers["business_cash_on_hand"]).toBe(12000);
  });

  it("keeps personal goals separate from business finances", () => {
    const answers = scopedGoalAnswers({ goalType: "personal", personalAnswers: { annual_income: 80000 }, business: profile("a", 200000) });
    expect(answers).toEqual({ annual_income: 80000 });
  });

  it("uses explicit zero and null rather than inventing missing operating history", () => {
    expect(businessCoreAnswers({ ...profile("b", null), months_in_business: 0 })["months_in_business"]).toBe(0);
    expect(businessCoreAnswers(profile("b", null))["months_in_business"]).toBeNull();
    expect(monthsOperating({ months_in_business: null, formation_date: "2025-01-15" }, new Date("2026-11-17T00:00:00Z"))).toBe(22);
  });
});

describe("goal product scope", () => {
  const products = [{ id: "pc", product_type: "credit_card" }, { id: "pl", product_type: "personal_loan" }, { id: "bc", product_type: "business_credit_card" }, { id: "bl", product_type: "business_loan" }, { id: "loc", product_type: "line_of_credit" }];
  it("distinguishes personal and business cards and loans", () => {
    expect(productBelongsToGoal("credit_card", "personal")).toBe(true);
    expect(productBelongsToGoal("business_credit_card", "business")).toBe(true);
    expect(scopeProductsToGoal(products, "business").map((p) => p.id)).toEqual(["bc", "bl"]);
    expect(scopeProductsToGoal(products, "personal").map((p) => p.id)).toEqual(["pc", "pl"]);
  });
  it("allows only an explicit staff override to include out-of-scope or ambiguous products", () => {
    expect(scopeProductsToGoal(products, "business")).toHaveLength(2);
    expect(scopeProductsToGoal(products, "business", true)).toHaveLength(5);
  });
});

describe("business analysis math", () => {
  it("calculates net cash flow only from comparable monthly values", () => {
    expect(businessAnalysis({ ...profile("a", 200000), monthly_revenue: 20000, monthly_expenses: 12000 }).calculatedNetCashFlow).toBe(8000);
    expect(businessAnalysis(profile("a", 200000)).calculatedNetCashFlow).toBeNull();
  });
  it("defines coverage as cash flow divided by debt payments and never divides by zero", () => {
    expect(businessAnalysis({ ...profile("a", null), monthly_revenue: 20000, monthly_expenses: 12000, existing_monthly_debt_payments: 4000 }).cashFlowCoverage).toBe(2);
    expect(businessAnalysis({ ...profile("a", null), monthly_net_cash_flow: 8000, existing_monthly_debt_payments: 0 }).cashFlowCoverage).toBeNull();
  });
});
