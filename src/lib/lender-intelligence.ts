// Pure helpers for Section 08 lender intelligence. Observations never become rules or eligibility.
export const MIN_SAMPLE = 5;

export type Coverage = { lenderId: string; lender: string; products: number; activeRules: number; pendingCandidates: number; staleRules: number; status: "no_products" | "no_active_rules" | "has_rules" };

export function isRuleStale(verifiedOn: string, staleAfterDays: number, today = new Date()): boolean {
  const v = new Date(`${verifiedOn}T00:00:00Z`).getTime();
  return Number.isFinite(v) && today.getTime() - v > staleAfterDays * 86_400_000;
}

export function ruleCoverage(
  lenders: { id: string; name: string }[],
  products: { id: string; lender_id: string }[],
  rules: { product_id: string; approval_status: string; verified_on: string; stale_after_days: number }[],
  candidates: { product_id: string; review_status: string }[],
  today = new Date(),
): Coverage[] {
  return lenders.map((l) => {
    const pids = new Set(products.filter((p) => p.lender_id === l.id).map((p) => p.id));
    const active = rules.filter((r) => pids.has(r.product_id) && r.approval_status === "active");
    const activeRules = active.length;
    return {
      lenderId: l.id, lender: l.name, products: pids.size, activeRules,
      pendingCandidates: candidates.filter((c) => pids.has(c.product_id) && c.review_status === "pending").length,
      staleRules: active.filter((r) => isRuleStale(r.verified_on, r.stale_after_days, today)).length,
      status: pids.size === 0 ? "no_products" : activeRules === 0 ? "no_active_rules" : "has_rules",
    };
  });
}

/** Display a percentage only when the verified sample meets the privacy threshold. */
export function gatedPct(value: number | null, n: number, min = MIN_SAMPLE): string {
  if (n < Math.max(min, MIN_SAMPLE) || value == null) return `Hidden (fewer than ${Math.max(min, MIN_SAMPLE)} verified)`;
  return `${Math.round(value)}% of ${n} verified`;
}
