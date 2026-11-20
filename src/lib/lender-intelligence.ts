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

export type HistoryRule = { id: string; product_id: string; rule_key: string; version: number; supersedes: string | null; approval_status: string; verified_on: string; stale_after_days: number; source_url: string; source_title: string; effective_date: string | null; created_at: string };
export type HistoryCandidate = { id: string; product_id: string; criterion: string; review_status: string; verified_on: string; source_url: string; source_title: string; reviewed_at: string | null; created_at: string };
export type HistoryEvent = { kind: "rule" | "source"; id: string; date: string; title: string; status: string; url: string; freshness: "fresh" | "stale" | "not_applicable"; detail: string };

/** Read-only, chronological (newest first) source and rule version history for one product. Never changes any rule. */
export function productHistory(productId: string, rules: HistoryRule[], candidates: HistoryCandidate[], today = new Date()): HistoryEvent[] {
  const ev: HistoryEvent[] = [];
  for (const r of rules.filter((x) => x.product_id === productId)) {
    ev.push({ kind: "rule", id: r.id, date: r.created_at, title: `${r.rule_key} v${r.version}`, status: r.approval_status, url: r.source_url,
      freshness: r.approval_status === "active" ? (isRuleStale(r.verified_on, r.stale_after_days, today) ? "stale" : "fresh") : "not_applicable",
      detail: `${r.source_title} · verified ${r.verified_on}${r.effective_date ? ` · effective ${r.effective_date}` : ""}${r.supersedes ? " · supersedes earlier version" : ""}` });
  }
  for (const c of candidates.filter((x) => x.product_id === productId)) {
    ev.push({ kind: "source", id: c.id, date: c.reviewed_at ?? c.created_at, title: c.criterion, status: c.review_status, url: c.source_url, freshness: "not_applicable",
      detail: `${c.source_title} · source checked ${c.verified_on}` });
  }
  return ev.sort((a, b) => b.date.localeCompare(a.date));
}
