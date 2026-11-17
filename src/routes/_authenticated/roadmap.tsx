import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/roadmap")({
  head: () => ({ meta: [{ title: "Roadmap — Loan Scout Matching Tool" }, { name: "description", content: "Built vs planned features." }, { property: "og:title", content: "Roadmap — Loan Scout" }, { property: "og:description", content: "Built vs planned features." }] }),
  component: Roadmap,
});

const sections: [string, string[]][] = [
  ["Phase 1 — not yet built", ["Automated credit-report PDF extraction (manual staff entry is live)", "Passkey sign-in", "Forced remote sign-out of deactivated users", "Automatic release of scheduled publications (manual release is live)", "Email delivery of invitations (invites are recorded; users sign in themselves)"]],
  ["Phase 2 — planned", ["Longitudinal credit report comparison and progress visuals", "Utilization and paydown simulator (no exact score prediction)", "Business funding, income and debt analysis", "Conservative / moderate / expanded funding scenarios with affordability", "Multiple business-specific goal planning and guided application sequence planner"]],
  ["Phase 3 — planned", ["On-demand (never scheduled) lender underwriting research with owner-approved rule versions", "Bureau-pull historical intelligence by state/product/date with uncertainty labels", "Recorded lender outcomes and observations — never promoted to policy automatically"]],
  ["Will not be built", ["Automatic lender applications or lender API submissions", "Credit bureau pulls", "Email/SMS alerts or scheduled research", "Two-way client messaging"]],
];

function Roadmap() {
  return <div><PageHeader title="Roadmap" kicker="Honest status" />
    <div className="grid gap-4 md:grid-cols-2">{sections.map(([t, items]) => <Card key={t}><CardHeader><CardTitle className="label-caps">{t}</CardTitle></CardHeader><CardContent><ul className="list-disc space-y-1 pl-5 text-sm">{items.map((i) => <li key={i}>{i}</li>)}</ul></CardContent></Card>)}</div>
  </div>;
}
