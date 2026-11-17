export type GoalType = "personal" | "business";

export interface BusinessFinancialProfile {
  id: string;
  client_id: string;
  annual_revenue: number | null;
  monthly_revenue: number | null;
  monthly_expenses: number | null;
  monthly_net_cash_flow: number | null;
  existing_monthly_debt_payments: number | null;
  average_monthly_deposits: number | null;
  banking_history_months: number | null;
  owner_share_pct: number | null;
  months_in_business: number | null;
  formation_date: string | null;
  verification_status: string;
}

export function productBelongsToGoal(productType: string, goalType: GoalType): boolean {
  if (goalType === "business") return productType === "business_credit_card" || productType === "business_loan";
  return productType === "personal_loan" || productType === "credit_card";
}

export function scopeProductsToGoal<T extends { product_type: string }>(products: T[], goalType: GoalType, includeOutsideScope = false): T[] {
  return includeOutsideScope ? products : products.filter((product) => productBelongsToGoal(product.product_type, goalType));
}

export function monthsOperating(profile: Pick<BusinessFinancialProfile, "months_in_business" | "formation_date">, asOf = new Date()): number | null {
  if (profile.months_in_business != null) return profile.months_in_business;
  if (!profile.formation_date) return null;
  const start = new Date(`${profile.formation_date}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || start.getTime() > asOf.getTime()) return null;
  let months = (asOf.getUTCFullYear() - start.getUTCFullYear()) * 12 + asOf.getUTCMonth() - start.getUTCMonth();
  if (asOf.getUTCDate() < start.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

export function businessCoreAnswers(profile: BusinessFinancialProfile, asOf = new Date()): Record<string, number | null> {
  return {
    annual_business_revenue: profile.annual_revenue,
    months_in_business: monthsOperating(profile, asOf),
    monthly_business_expenses: profile.monthly_expenses,
    monthly_business_revenue: profile.monthly_revenue,
    monthly_business_debt_payments: profile.existing_monthly_debt_payments,
    average_monthly_deposits: profile.average_monthly_deposits,
    banking_history_months: profile.banking_history_months,
    owner_share_pct: profile.owner_share_pct,
  };
}

/** Business goals never inherit client-global financial answers; personal goals never inherit business values. */
export function scopedGoalAnswers(input: {
  goalType: GoalType;
  personalAnswers: Record<string, number | null>;
  business?: BusinessFinancialProfile | null;
  businessAnswers?: Record<string, number | null>;
  asOf?: Date;
}): Record<string, number | null> {
  if (input.goalType === "personal") return { ...input.personalAnswers };
  if (!input.business) return {};
  return { ...(input.businessAnswers ?? {}), ...businessCoreAnswers(input.business, input.asOf) };
}

export function businessAnalysis(profile: Pick<BusinessFinancialProfile, "monthly_revenue" | "monthly_expenses" | "monthly_net_cash_flow" | "existing_monthly_debt_payments">) {
  const comparableMonthly = profile.monthly_revenue != null && profile.monthly_expenses != null;
  const calculatedNetCashFlow = comparableMonthly ? profile.monthly_revenue! - profile.monthly_expenses! : null;
  const cashFlowForCoverage = calculatedNetCashFlow ?? profile.monthly_net_cash_flow;
  const cashFlowCoverage = cashFlowForCoverage != null && profile.existing_monthly_debt_payments != null && profile.existing_monthly_debt_payments > 0
    ? cashFlowForCoverage / profile.existing_monthly_debt_payments
    : null;
  return { calculatedNetCashFlow, cashFlowCoverage };
}
