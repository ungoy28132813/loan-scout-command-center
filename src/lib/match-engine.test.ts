import { describe, it, expect } from "vitest";
import { evaluateProduct, evaluateRule, PRICING_ASSUMPTION, type Facts, type Rule } from "./match-engine";

const now = new Date("2026-11-17T00:00:00Z");
const rule = (o: Partial<Rule>): Rule => ({
  id: "r", rule_key: "min_score", bureau: "transunion", score_model: "FICO 8", lookback_months: null, threshold: 600,
  source_tier: "verified_primary", source_title: "Doc", source_url: "https://x", verified_on: "2026-10-01", stale_after_days: 180, ...o,
});
const empty: Facts = { scores: [], bureau: {}, answers: {}, answerTexts: {}, answerMeta: {}, applicationMode: "individual", criticalWarnings: [] };
const selfReported = { status: "answered", verified: false, financial_source: "self_reported" };
const verified = { status: "answered", verified: true, financial_source: "document_backed" };

describe("score, source and suitability safeguards", () => {
  it("missing score is unknown, never a fail", () => {
    expect(evaluateRule(rule({}), empty, now).outcome).toBe("unknown");
  });
  it("does not substitute a different score model", () => {
    const f = { ...empty, scores: [{ bureau: "transunion" as const, model: "VantageScore 3.0", value: 800 }] };
    expect(evaluateRule(rule({}), f, now).outcome).toBe("unknown");
  });
  it("does not substitute the same model from another bureau", () => {
    const f = { ...empty, scores: [{ bureau: "experian" as const, model: "FICO 8", value: 800 }] };
    expect(evaluateRule(rule({}), f, now).outcome).toBe("unknown");
  });
  it("recognizes FICO 08 as the same named version as FICO 8 without swapping versions", () => {
    const f = { ...empty, scores: [{ bureau: "transunion" as const, model: "FICO 08", value: 700 }] };
    expect(evaluateRule(rule({}), f, now).outcome).toBe("pass");
    expect(evaluateRule(rule({ score_model: "FICO 9" }), f, now).outcome).toBe("unknown");
  });
  it("verified rule below threshold fails", () => {
    const f = { ...empty, scores: [{ bureau: "transunion" as const, model: "FICO 8", value: 580 }] };
    expect(evaluateProduct([rule({})], f, "strict", now).status).toBe("does_not_meet_published");
  });
  it("secondary estimates never disqualify", () => {
    const f = { ...empty, scores: [{ bureau: "transunion" as const, model: "FICO 8", value: 580 }] };
    const r = evaluateProduct([rule({ source_tier: "secondary_source" })], f, "expanded", now);
    expect(r.status).toBe("needs_review");
  });
  it("strict mode ignores secondary rules", () => {
    expect(evaluateProduct([rule({ source_tier: "observational" })], empty, "strict", now).conditions).toHaveLength(0);
  });
  it("no rules -> needs review with null score", () => {
    const r = evaluateProduct([], empty, "strict", now);
    expect(r.status).toBe("needs_review"); expect(r.score).toBeNull();
  });
  it("all pass -> potential match with suitability 100, not approval probability", () => {
    const f = { ...empty, scores: [{ bureau: "transunion" as const, model: "FICO 8", value: 700 }] };
    const r = evaluateProduct([rule({})], f, "strict", now);
    expect(r.status).toBe("potential_match"); expect(r.score).toBe(100); expect(r.summary).toContain("not approval probability");
    expect(r.pricing_assumption).toBe(PRICING_ASSUMPTION);
  });
  it("stale and future-effective rules force review", () => {
    const f = { ...empty, scores: [{ bureau: "transunion" as const, model: "FICO 8", value: 700 }] };
    expect(evaluateProduct([rule({ verified_on: "2025-01-01" })], f, "strict", now).status).toBe("needs_review");
    expect(evaluateRule(rule({ effective_date: "2027-01-01" }), f, now).outcome).toBe("unknown");
  });
});

describe("goal and business financial inputs", () => {
  it("DTI unknown when income skipped or zero", () => {
    const r = rule({ rule_key: "max_dti_pct", bureau: null, score_model: null, threshold: 50 });
    expect(evaluateRule(r, { ...empty, answers: { monthly_debt_payments: 500, monthly_gross_income: null } }, now).outcome).toBe("unknown");
    expect(evaluateRule(r, { ...empty, answers: { monthly_debt_payments: 500, monthly_gross_income: 0 } }, now).outcome).toBe("unknown");
  });
  it("DTI uses the stated goal inputs and documents its math", () => {
    const c = evaluateRule(rule({ rule_key: "max_dti_pct", bureau: null, score_model: null, threshold: 50 }), { ...empty, answers: { monthly_debt_payments: 500, monthly_gross_income: 2000 }, answerMeta: { monthly_debt_payments: selfReported, monthly_gross_income: selfReported } }, now);
    expect(c.outcome).toBe("pass"); expect(c.observed).toContain("25.0%"); expect(c.explanation).toContain("monthly debt payments ÷ monthly gross income");
  });
  it("verified-only conditions remain Unknown for self-reported inputs", () => {
    const r = rule({ rule_key: "min_annual_income", bureau: null, score_model: null, threshold: 50000, requires_verified_facts: true });
    const c = evaluateRule(r, { ...empty, answers: { annual_income: 80000 }, answerMeta: { annual_income: selfReported } }, now);
    expect(c.outcome).toBe("unknown"); expect(c.explanation).toContain("requires staff-verified");
  });
  it("verified-only conditions can pass or fail after verification", () => {
    const r = rule({ rule_key: "min_annual_income", bureau: null, score_model: null, threshold: 50000, requires_verified_facts: true });
    expect(evaluateRule(r, { ...empty, answers: { annual_income: 80000 }, answerMeta: { annual_income: verified } }, now).outcome).toBe("pass");
    expect(evaluateRule(r, { ...empty, answers: { annual_income: 40000 }, answerMeta: { annual_income: verified } }, now).outcome).toBe("fail");
  });
  it("product-specific input keys never fall back to another relationship value", () => {
    const r = rule({ rule_key: "min_existing_product_months", bureau: null, score_model: null, threshold: 12, input_key: "lender_a_product_months" });
    expect(evaluateRule(r, { ...empty, answers: { existing_product_months: 24 } }, now).outcome).toBe("unknown");
    expect(evaluateRule(r, { ...empty, answers: { lender_a_product_months: 12 } }, now).outcome).toBe("pass");
  });
  it("membership age and business revenue preserve explicit zero and unknown", () => {
    const membership = rule({ rule_key: "min_membership_months", bureau: null, score_model: null, threshold: 6 });
    expect(evaluateRule(membership, { ...empty, answers: { membership_months: 0 } }, now).outcome).toBe("fail");
    expect(evaluateRule(membership, { ...empty, answers: { membership_months: null } }, now).outcome).toBe("unknown");
    const revenue = rule({ rule_key: "min_annual_revenue", bureau: null, score_model: null, threshold: 100000 });
    expect(evaluateRule(revenue, { ...empty, answers: { annual_business_revenue: 0 } }, now).outcome).toBe("fail");
    expect(evaluateRule(revenue, { ...empty, answers: { annual_business_revenue: 200000 } }, now).outcome).toBe("pass");
  });
  it("direct deposit supports only explicit yes/no and honors verification", () => {
    const r = rule({ rule_key: "requires_direct_deposit", bureau: null, score_model: null, threshold: 1, requires_verified_facts: true });
    expect(evaluateRule(r, { ...empty, answerTexts: { direct_deposit: "yes" }, answerMeta: { direct_deposit: selfReported } }, now).outcome).toBe("unknown");
    expect(evaluateRule(r, { ...empty, answerTexts: { direct_deposit: "yes" }, answerMeta: { direct_deposit: verified } }, now).outcome).toBe("pass");
    expect(evaluateRule(r, { ...empty, answerTexts: { direct_deposit: "no" }, answerMeta: { direct_deposit: verified } }, now).outcome).toBe("fail");
  });
});

describe("bureau evidence, derogatories and location", () => {
  it("uses the exact inquiry lookback and does not invent zero", () => {
    const r = rule({ rule_key: "max_inquiries", threshold: 9, lookback_months: 6, score_model: null });
    expect(evaluateRule(r, { ...empty, bureau: { transunion: { inquiries_12mo: 2 } } }, now).outcome).toBe("unknown");
    expect(evaluateRule(r, { ...empty, bureau: { transunion: { inquiries_6mo: 10 } } }, now).outcome).toBe("fail");
  });
  it("checks tradelines, lates, collections, chargeoffs and bankruptcy independently", () => {
    const bureau = { transunion: { open_tradelines: 2, late_payments_24mo: 1, collections_count: 0, chargeoffs_count: 2, months_since_bankruptcy: 8 } };
    expect(evaluateRule(rule({ rule_key: "min_open_tradelines", threshold: 2, score_model: null }), { ...empty, bureau }, now).outcome).toBe("pass");
    expect(evaluateRule(rule({ rule_key: "max_late_payments", threshold: 0, lookback_months: 24, score_model: null }), { ...empty, bureau }, now).outcome).toBe("fail");
    expect(evaluateRule(rule({ rule_key: "max_collections", threshold: 0, score_model: null }), { ...empty, bureau }, now).outcome).toBe("pass");
    expect(evaluateRule(rule({ rule_key: "max_chargeoffs", threshold: 1, score_model: null }), { ...empty, bureau }, now).outcome).toBe("fail");
    expect(evaluateRule(rule({ rule_key: "min_months_since_bankruptcy", threshold: 12, score_model: null }), { ...empty, bureau }, now).outcome).toBe("fail");
  });
  it("missing derogatory evidence is Unknown, not a confirmed zero or removal", () => {
    expect(evaluateRule(rule({ rule_key: "max_collections", threshold: 0, score_model: null }), empty, now).outcome).toBe("unknown");
  });
  it("location uses only the cited state list and preserves provenance", () => {
    const r = rule({ rule_key: "allowed_states", bureau: null, score_model: null, threshold: 0, text_threshold: "CA, NY" });
    expect(evaluateRule(r, empty, now).outcome).toBe("unknown");
    expect(evaluateRule(r, { ...empty, answerTexts: { location_state: "ca" }, answerMeta: { location_state: selfReported } }, now).outcome).toBe("pass");
    expect(evaluateRule(r, { ...empty, answerTexts: { location_state: "TX" }, answerMeta: { location_state: verified } }, now).outcome).toBe("fail");
  });
});

describe("application scope and improvement explanations", () => {
  it("individual-only criteria stay Unknown for joint applications", () => {
    const r = rule({ application_mode: "individual" });
    const f = { ...empty, applicationMode: "joint" as const, scores: [{ bureau: "transunion" as const, model: "FICO 8", value: 700 }] };
    expect(evaluateRule(r, f, now).outcome).toBe("unknown");
  });
  it("joint applications need explicit joint support even when general criteria pass", () => {
    const r = rule({ application_mode: "any" });
    const f = { ...empty, applicationMode: "joint" as const, scores: [{ bureau: "transunion" as const, model: "FICO 8", value: 700 }] };
    const result = evaluateProduct([r], f, "strict", now);
    expect(result.status).toBe("needs_review"); expect(result.score).toBeNull(); expect(result.summary).toContain("joint applicability");
  });
  it("a genuinely joint-scoped rule can pass for a joint application", () => {
    const r = rule({ application_mode: "joint" });
    const f = { ...empty, applicationMode: "joint" as const, scores: [{ bureau: "transunion" as const, model: "FICO 8", value: 700 }] };
    expect(evaluateProduct([r], f, "strict", now).status).toBe("potential_match");
  });
  it("failures and unknowns produce review checklists without guarantees", () => {
    const failResult = evaluateProduct([rule({})], { ...empty, scores: [{ bureau: "transunion" as const, model: "FICO 8", value: 500 }] }, "strict", now);
    expect(failResult.improvement_steps[0]).toContain("No score increase or approval is guaranteed");
    const unknownResult = evaluateProduct([rule({})], empty, "strict", now);
    expect(unknownResult.improvement_steps[0]).toContain("Unknown is not a denial");
  });
});
