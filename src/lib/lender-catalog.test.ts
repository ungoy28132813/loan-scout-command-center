import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { evaluateProduct, evaluateRule, type Facts, type Rule } from "./match-engine";

const seed = readFileSync("supabase/seed/lender_catalog_2026-11-16.sql", "utf8").split("\n").filter((l) => !l.startsWith("--")).join("\n");
const now = new Date("2026-11-17T00:00:00Z");
const base: Rule = { id: "r", rule_key: "min_score", bureau: "transunion", score_model: "FICO 8", lookback_months: null, threshold: 600, source_tier: "verified_primary", source_title: "Prosper Prospectus (2026-04-30) — printed page 51", source_url: "https://www.prosper.com/Downloads/Legal/Prosper_Prospectus_2026-04-30.pdf", verified_on: "2026-11-16", stale_after_days: 180 };
const facts = (o: Partial<Facts>): Facts => ({ scores: [], bureau: {}, answers: {}, criticalWarnings: [], ...o });

describe("lender catalog seed", () => {
  it("is idempotent (every insert skips existing rows)", () => {
    expect(seed.match(/INSERT INTO/g)?.length).toBe(2);
    expect(seed).toContain("ON CONFLICT (lender_id, name) DO NOTHING");
    expect(seed).toContain("ON CONFLICT (seed_key) DO NOTHING");
  });
  it("never creates active rules, hard pulls or approval language", () => {
    expect(seed).not.toMatch(/lender_rules/);
    expect(seed).not.toMatch(/'hard'|'active'|probabilit/i);
    expect(seed).toMatch(/'loan_cash', 'unknown', 'partially_verified'/);
  });
  it("seeds the five requested products plus a scoped Note Channel record", () => {
    for (const n of ["Prosper Personal Loan", "Happy Money The Payoff Loan", "Wells Fargo Personal Loan", "AmeriCU Quick Cash", "AmeriCU Personal Unsecured Loan", "Note Channel (individual borrower)"]) expect(seed).toContain(n);
    expect(seed).not.toMatch(/My Chase Loan/);
  });
  it("attaches prospectus criteria only to the Note Channel record", () => {
    const prosperRows = seed.split("\n").filter((l) => l.includes("Prosper_Prospectus") && l.startsWith("  ('prosper_nc"));
    expect(prosperRows.length).toBe(7);
    expect(prosperRows.every((l) => l.includes("Note Channel (individual borrower)"))).toBe(true);
  });
  it("keeps unsafe criteria as non-enforced notes", () => {
    const row = (k: string) => seed.split("\n").find((l) => l.includes(`('${k}'`))!;
    for (const k of ["prosper_nc_inq", "prosper_nc_income", "prosper_nc_joint", "happymoney_fico620", "wf_relationship", "americu_qc_membership", "americu_qc_deposit", "americu_qc_age", "americu_qc_nocheck"]) expect(row(k)).toMatch(/, false, '/);
    expect(row("happymoney_fico620")).toMatch(/'min_score', NULL, NULL/); // no bureau, no model invented
  });
});

describe("engine handling of source-backed rules", () => {
  it("TransUnion FICO 8 rule is Unknown with only a VantageScore on file (no substitution)", () => {
    const c = evaluateRule(base, facts({ scores: [{ bureau: "transunion", model: "VantageScore 3.0", value: 720 }] }), now);
    expect(c.outcome).toBe("unknown");
  });
  it("TransUnion FICO 8 rule ignores an Experian FICO 8", () => {
    expect(evaluateRule(base, facts({ scores: [{ bureau: "experian", model: "FICO 8", value: 550 }] }), now).outcome).toBe("unknown");
  });
  it("a score rule without a model never fails", () => {
    expect(evaluateRule({ ...base, score_model: null, bureau: null, threshold: 620 }, facts({ scores: [{ bureau: "equifax", model: "FICO 9", value: 500 }] }), now).outcome).toBe("unknown");
  });
  it("missing DTI inputs are Unknown, not zero", () => {
    expect(evaluateRule({ ...base, rule_key: "max_dti_pct", threshold: 50 }, facts({ answers: { monthly_gross_income: null, monthly_debt_payments: 0 } }), now).outcome).toBe("unknown");
  });
  it("a product with no approved rules is Needs Review with no score", () => {
    const e = evaluateProduct([], facts({}), "strict", now);
    expect(e.status).toBe("needs_review");
    expect(e.score).toBeNull();
  });
});
