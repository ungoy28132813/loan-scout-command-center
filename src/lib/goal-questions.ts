import type { GoalType } from "@/lib/business-funding";

export type GoalQuestionKind = "number" | "text" | "application" | "yes_no";
export interface GoalRuleDefinition {
  rule_key: string;
  input_key: string | null;
  requires_verified_facts: boolean;
}
export interface GoalQuestion {
  key: string;
  label: string;
  help?: string;
  kind: GoalQuestionKind;
  verificationRequired: boolean;
}

const applicationQuestion: GoalQuestion = {
  key: "application_mode",
  label: "Application type for this goal",
  help: "Joint applications remain Needs Review unless a cited rule explicitly supports that exact joint path.",
  kind: "application",
  verificationRequired: false,
};

const defaultQuestions: Record<string, Omit<GoalQuestion, "verificationRequired">[]> = {
  min_annual_income: [{ key: "annual_income", label: "Annual income for this goal", kind: "number" }],
  max_dti_pct: [
    { key: "monthly_gross_income", label: "Monthly gross income used for this goal", kind: "number", help: "Before taxes. Skip if unknown; missing income is never zero." },
    { key: "monthly_debt_payments", label: "Monthly debt payments used for this goal", kind: "number" },
  ],
  min_existing_product_months: [{ key: "existing_product_months", label: "Qualifying existing product age (months)", kind: "number", help: "Use only the relationship named in the product's cited requirement." }],
  min_membership_months: [{ key: "membership_months", label: "Credit union membership age (months)", kind: "number" }],
  requires_direct_deposit: [{ key: "direct_deposit", label: "Qualifying direct deposit for this goal", kind: "yes_no", help: "Self-reported answers remain unverified until staff review." }],
};

const profileManagedKeys = new Set(["min_annual_revenue", "min_months_in_business", "min_banking_history_months", "min_average_monthly_deposits", "min_owner_share_pct"]);

function humanize(key: string): string {
  return key.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

/** Active cited rules determine conditional questions; every returned row supports Unknown/Skip in the UI. */
export function goalQuestions(goalType: GoalType, rules: GoalRuleDefinition[]): GoalQuestion[] {
  const questions = new Map<string, GoalQuestion>([[applicationQuestion.key, applicationQuestion]]);
  for (const rule of rules) {
    const customKey = rule.input_key;
    const definitions = customKey ? [{
      key: customKey,
      label: `${humanize(customKey)} (product-specific, for this goal)`,
      kind: rule.rule_key === "allowed_states" ? "text" as const : rule.rule_key === "requires_direct_deposit" ? "yes_no" as const : "number" as const,
      help: "Answer only for this goal and the exact product requirement; never copy another business's value.",
    }] : defaultQuestions[rule.rule_key] ?? [];
    for (const definition of definitions) {
      const existing = questions.get(definition.key);
      questions.set(definition.key, { ...definition, verificationRequired: Boolean(existing?.verificationRequired || rule.requires_verified_facts) });
    }
    if (rule.rule_key === "allowed_states" && goalType === "personal" && !customKey) {
      const definition = { key: "location_state", label: "State of residence for this goal", kind: "text" as const, help: "Use the two-letter state code, or Skip." };
      const existing = questions.get(definition.key);
      questions.set(definition.key, { ...definition, verificationRequired: Boolean(existing?.verificationRequired || rule.requires_verified_facts) });
    }
    if (profileManagedKeys.has(rule.rule_key) && !customKey) continue;
  }
  return [...questions.values()];
}
