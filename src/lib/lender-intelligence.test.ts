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
