/**
 * Identifies irreducible non-credit goal inputs missing from a match run.
 * Credit-derived metrics (scores, inquiries, utilization, accounts) are never requested here.
 */
import type { Condition } from "@/lib/match-engine";
import type { GoalQuestionKind } from "@/lib/goal-questions";

export interface MissingGoalInput {
  key: string;
  label: string;
  shortLabel: string;
  help: string;
  kind: GoalQuestionKind;
  requiresVerified: boolean;
  affectedProducts: string[];
}

interface InputSpec {
  key: string;
  label: string;
  shortLabel: string;
  help: string;
  kind: GoalQuestionKind;
}

const RULE_TO_INPUTS: Record<string, InputSpec[]> = {
  min_annual_income: [
    { key: "annual_income", label: "Annual income", shortLabel: "annual income", help: "Gross annual income for this goal. Skip if unknown.", kind: "number" },
  ],
  max_dti_pct: [
    { key: "monthly_gross_income", label: "Monthly gross income", shortLabel: "monthly income", help: "Before taxes. Required alongside debt payments to evaluate DTI.", kind: "number" },
    { key: "monthly_debt_payments", label: "Monthly debt payments", shortLabel: "monthly debt", help: "Total recurring monthly debt obligations for this goal.", kind: "number" },
  ],
  min_existing_product_months: [
    { key: "existing_product_months", label: "Qualifying existing product age (months)", shortLabel: "existing account age", help: "Only for the exact relationship named by the lender.", kind: "number" },
  ],
  min_membership_months: [
    { key: "membership_months", label: "Credit union membership age (months)", shortLabel: "membership age", help: "Months of active membership with the credit union.", kind: "number" },
  ],
  requires_direct_deposit: [
    { key: "direct_deposit", label: "Qualifying direct deposit", shortLabel: "direct deposit", help: "Whether qualifying recurring direct deposit is active.", kind: "yes_no" },
  ],
  allowed_states: [
    { key: "location_state", label: "State of residence", shortLabel: "state", help: "Two-letter US state code (e.g. FL).", kind: "text" },
  ],
};

const APPLICATION_MODE_SPEC: InputSpec = {
  key: "application_mode",
  label: "Application type",
  shortLabel: "application type",
  help: "Individual or joint application for this goal.",
  kind: "application",
};

function specsForUnknownCondition(condition: Condition): InputSpec[] {
  if (condition.outcome !== "unknown") return [];
  if (condition.observed === "Application type unknown") return [APPLICATION_MODE_SPEC];
  if (condition.input_key) {
    const readable = condition.input_key.replaceAll("_", " ");
    return [{
      key: condition.input_key,
      label: readable.charAt(0).toUpperCase() + readable.slice(1),
      shortLabel: readable,
      help: "Product-specific input for this goal.",
      kind: condition.rule_key === "allowed_states" ? "text" : condition.rule_key === "requires_direct_deposit" ? "yes_no" : "number",
    }];
  }
  return RULE_TO_INPUTS[condition.rule_key] ?? [];
}

export function collectMissingGoalInputs(
  results: { productName: string; conditions: Condition[] }[]
): MissingGoalInput[] {
  const map = new Map<string, MissingGoalInput>();
  for (const item of results) {
    for (const condition of item.conditions) {
      const specs = specsForUnknownCondition(condition);
      const requiresVerified = condition.explanation.includes("requires staff-verified");
      for (const spec of specs) {
        const existing = map.get(spec.key);
        if (existing) {
          if (!existing.affectedProducts.includes(item.productName)) existing.affectedProducts.push(item.productName);
          existing.requiresVerified ||= requiresVerified;
        } else {
          map.set(spec.key, { ...spec, requiresVerified, affectedProducts: [item.productName] });
        }
      }
    }
  }
  return [...map.values()];
}

export function missingInputHint(conditions: Condition[]): string | null {
  const labels = new Set<string>();
  let hasDti = false;
  for (const c of conditions) {
    if (c.outcome !== "unknown") continue;
    if (c.rule_key === "max_dti_pct" && c.observed === "Unknown") hasDti = true;
    for (const spec of specsForUnknownCondition(c)) labels.add(spec.shortLabel);
  }
  if (!labels.size) return null;
  const list = [...labels];
  if (hasDti && list.length <= 2) return "Add income & monthly debt to evaluate DTI eligibility";
  if (list.length === 1) return `Add ${list[0]} to evaluate eligibility`;
  return `Add ${list.slice(0, 2).join(" & ")}${list.length > 2 ? ` (+${list.length - 2})` : ""} to evaluate eligibility`;
}