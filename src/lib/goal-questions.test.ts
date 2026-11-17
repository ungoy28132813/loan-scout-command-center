import { describe, expect, it } from "vitest";
import { goalQuestions } from "./goal-questions";

const rule = (rule_key: string, input_key: string | null = null, requires_verified_facts = false) => ({ rule_key, input_key, requires_verified_facts });

describe("goal-specific conditional questions", () => {
  it("always includes application scope and only asks rule-relevant financial questions", () => {
    const questions = goalQuestions("personal", [rule("max_dti_pct"), rule("min_annual_income")]);
    expect(new Set(questions.map((question) => question.key))).toEqual(new Set(["application_mode", "annual_income", "monthly_gross_income", "monthly_debt_payments"]));
  });

  it("keeps product-specific relationship inputs distinct", () => {
    const questions = goalQuestions("personal", [rule("min_existing_product_months", "lender_a_product_months", true)]);
    expect(questions[1]).toMatchObject({ key: "lender_a_product_months", verificationRequired: true });
  });

  it("uses business profile state rather than duplicating it as a goal answer", () => {
    expect(goalQuestions("business", [rule("allowed_states")]).some((question) => question.key === "location_state")).toBe(false);
    expect(goalQuestions("personal", [rule("allowed_states")]).some((question) => question.key === "location_state")).toBe(true);
  });

  it("supports direct deposit yes/no and membership age with verification labels", () => {
    const questions = goalQuestions("business", [rule("requires_direct_deposit", null, true), rule("min_membership_months")]);
    expect(questions.find((question) => question.key === "direct_deposit")).toMatchObject({ kind: "yes_no", verificationRequired: true });
    expect(questions.some((question) => question.key === "membership_months")).toBe(true);
  });
});
