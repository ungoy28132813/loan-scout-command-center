/** Smart conditional questionnaire: only asks what the active, cited rules / goals need. */
export interface Question { key: string; label: string; help?: string; kind: "number" | "text" }

const ALL: Record<string, Question> = {
  monthly_gross_income: { key: "monthly_gross_income", label: "Monthly gross income (before taxes)", kind: "number" },
  monthly_debt_payments: { key: "monthly_debt_payments", label: "Total monthly debt payments", help: "Loans, minimum card payments, etc.", kind: "number" },
  annual_income: { key: "annual_income", label: "Annual income", kind: "number" },
  employment_status: { key: "employment_status", label: "Employment status", kind: "text" },
  housing_payment: { key: "housing_payment", label: "Monthly housing payment (rent/mortgage)", kind: "number" },
  banking_relationships: { key: "banking_relationships", label: "Banks / credit unions you currently use", kind: "text" },
  months_in_business: { key: "months_in_business", label: "Months your business has operated", kind: "number" },
  annual_business_revenue: { key: "annual_business_revenue", label: "Annual business revenue", kind: "number" },
  monthly_business_expenses: { key: "monthly_business_expenses", label: "Monthly business expenses", kind: "number" },
};

export function neededQuestions(input: { ruleKeys: string[]; hasBusinessGoal: boolean; hasReport: boolean }): Question[] {
  const keys = new Set<string>();
  if (input.ruleKeys.includes("max_dti_pct")) { keys.add("monthly_gross_income"); keys.add("monthly_debt_payments"); keys.add("housing_payment"); }
  if (input.ruleKeys.includes("min_annual_income")) keys.add("annual_income");
  if (input.ruleKeys.includes("min_annual_income") || input.ruleKeys.includes("max_dti_pct")) keys.add("employment_status");
  if (input.hasBusinessGoal || input.ruleKeys.some((k) => k.includes("business") || k === "min_annual_revenue")) {
    keys.add("months_in_business"); keys.add("annual_business_revenue"); keys.add("monthly_business_expenses");
  }
  if (input.hasReport) keys.add("banking_relationships");
  return [...keys].map((k) => ALL[k]!);
}
