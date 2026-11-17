import { describe, it, expect } from "vitest";
import { evaluateProduct, evaluateRule, type Facts, type Rule } from "./match-engine";

const now = new Date("2026-11-17T00:00:00Z");
const rule = (o: Partial<Rule>): Rule => ({
  id: "r", rule_key: "min_score", bureau: "transunion", score_model: "FICO 8", lookback_months: null, threshold: 600,
  source_tier: "verified_primary", source_title: "Doc", source_url: "https://x", verified_on: "2026-10-01", stale_after_days: 180, ...o,
});
const empty: Facts = { scores: [], bureau: {}, answers: {}, criticalWarnings: [] };

describe("match engine", () => {
  it("missing score is unknown, never a fail", () => {
    expect(evaluateRule(rule({}), empty, now).outcome).toBe("unknown");
  });
  it("does not substitute a different score model", () => {
    const f = { ...empty, scores: [{ bureau: "transunion" as const, model: "VantageScore 3.0", value: 800 }] };
    expect(evaluateRule(rule({}), f, now).outcome).toBe("unknown");
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
  it("DTI unknown when income skipped", () => {
    const c = evaluateRule(rule({ rule_key: "max_dti_pct", threshold: 50 }), { ...empty, answers: { monthly_debt_payments: 500, monthly_gross_income: null } }, now);
    expect(c.outcome).toBe("unknown");
  });
  it("all pass -> potential match with score 100", () => {
    const f = { ...empty, scores: [{ bureau: "transunion" as const, model: "FICO 8", value: 700 }] };
    const r = evaluateProduct([rule({})], f, "strict", now);
    expect(r.status).toBe("potential_match"); expect(r.score).toBe(100);
  });
  it("stale rule forces review", () => {
    const f = { ...empty, scores: [{ bureau: "transunion" as const, model: "FICO 8", value: 700 }] };
    expect(evaluateProduct([rule({ verified_on: "2025-01-01" })], f, "strict", now).status).toBe("needs_review");
  });
});
