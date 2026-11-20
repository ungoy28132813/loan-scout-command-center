import { describe, expect, it } from "vitest";
import { gatedPct, isRuleStale, ruleCoverage, MIN_SAMPLE } from "./lender-intelligence";

describe("lender intelligence", () => {
  it("hides aggregates below the minimum sample of 5", () => {
    expect(MIN_SAMPLE).toBe(5);
    expect(gatedPct(80, 4)).toMatch(/^Hidden/);
    expect(gatedPct(80, 5)).toBe("80% of 5 verified");
  });
  it("cannot lower the threshold below 5", () => {
    expect(gatedPct(50, 2, 1)).toMatch(/^Hidden/);
  });
  it("never shows a value that is unknown", () => {
    expect(gatedPct(null, 50)).toMatch(/^Hidden/);
  });
  it("flags lenders with no active rules even when candidates are pending", () => {
    const c = ruleCoverage([{ id: "L1", name: "A" }, { id: "L2", name: "B" }], [{ id: "P1", lender_id: "L1" }], [],
      [{ product_id: "P1", review_status: "pending" }]);
    expect(c[0]).toMatchObject({ status: "no_active_rules", pendingCandidates: 1, activeRules: 0 });
    expect(c[1]?.status).toBe("no_products");
  });
  it("counts stale active rules", () => {
    const today = new Date("2026-11-20T00:00:00Z");
    expect(isRuleStale("2026-01-01", 90, today)).toBe(true);
    expect(isRuleStale("2026-11-01", 90, today)).toBe(false);
    const c = ruleCoverage([{ id: "L1", name: "A" }], [{ id: "P1", lender_id: "L1" }],
      [{ product_id: "P1", approval_status: "active", verified_on: "2026-01-01", stale_after_days: 90 }], [], today);
    expect(c[0]).toMatchObject({ status: "has_rules", activeRules: 1, staleRules: 1 });
  });
});

import { productHistory } from "./lender-intelligence";
describe("productHistory", () => {
  const today = new Date("2026-11-20");
  const rules = [
    { id: "r1", product_id: "p1", rule_key: "min_score", version: 1, supersedes: null, approval_status: "retired", verified_on: "2025-01-01", stale_after_days: 180, source_url: "https://x", source_title: "A", effective_date: null, created_at: "2025-01-01" },
    { id: "r2", product_id: "p1", rule_key: "min_score", version: 2, supersedes: "r1", approval_status: "active", verified_on: "2026-01-01", stale_after_days: 180, source_url: "https://x", source_title: "A", effective_date: null, created_at: "2026-01-01" },
    { id: "r3", product_id: "p2", rule_key: "max_dti_pct", version: 1, supersedes: null, approval_status: "active", verified_on: "2026-11-01", stale_after_days: 180, source_url: "https://y", source_title: "B", effective_date: null, created_at: "2026-11-01" },
  ];
  const cands = [{ id: "c1", product_id: "p1", criterion: "FICO 08 >= 600", review_status: "pending", verified_on: "2026-11-16", source_url: "https://z", source_title: "C", reviewed_at: null, created_at: "2026-11-16" }];
  it("keeps products isolated and orders newest first", () => {
    const h = productHistory("p1", rules, cands, today);
    expect(h.map((e) => e.id)).toEqual(["c1", "r2", "r1"]);
  });
  it("marks an active rule verified over 180 days ago as stale", () => {
    expect(productHistory("p1", rules, cands, today).find((e) => e.id === "r2")?.freshness).toBe("stale");
    expect(productHistory("p2", rules, [], today)[0]?.freshness).toBe("fresh");
  });
  it("pending source items stay pending and have no freshness", () => {
    const c = productHistory("p1", rules, cands, today).find((e) => e.id === "c1");
    expect(c?.status).toBe("pending"); expect(c?.freshness).toBe("not_applicable");
  });
});
