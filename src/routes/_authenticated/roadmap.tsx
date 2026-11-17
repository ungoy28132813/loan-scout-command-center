import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/roadmap")({
  head: () => ({ meta: [{ title: "Roadmap — Loan Scout Matching Tool" }, { name: "description", content: "Built vs planned features." }, { property: "og:title", content: "Roadmap — Loan Scout" }, { property: "og:description", content: "Built vs planned features." }] }),
  component: Roadmap,
});

const sections: [string, string[]][] = [
  ["Phase 1 — not yet built", ["OCR for scanned/image-only credit reports (text-based PDFs are read automatically, best effort)", "Confirm/clear review flags on automatically read accounts (scores and summary values can be confirmed)", "Passkey sign-in (real WebAuthn integration is present, but the live authentication service has passkeys disabled)", "Forced remote sign-out of deactivated users (data access is revoked immediately; owner-targeted token revocation is unavailable)", "Automatic release of scheduled publications (manual release is live)", "Email delivery of invitations (invites are recorded; users sign in themselves)"]],
  ["Phase 2 — built", ["Historical credit-report comparison by bureau, exact score model, confirmed summaries and conservatively matched accounts", "In-memory revolving utilization and paydown simulator with duplicate-account safeguards, exact arithmetic and no score prediction", "Multiple reusable business profiles with optional self-reported financials, provenance, verification controls and comparable-period cash-flow math", "Independent personal/business goals and goal-specific matching facts and product scope"]],
  ["Phase 2 — planned", ["Lender-specific simulation from hypothetical utilization (utilization math is built; criteria simulation is not)", "Advanced business financial modeling and conservative / moderate / expanded affordability scenarios", "Guided application sequence planner"]],
  ["Phase 3 — planned", ["On-demand (never scheduled) lender underwriting research with owner-approved rule versions", "Bureau-pull historical intelligence by state/product/date with uncertainty labels", "Recorded lender outcomes and observations — never promoted to policy automatically"]],
  ["Will not be built", ["Automatic lender applications or lender API submissions", "Credit bureau pulls", "Email/SMS alerts or scheduled research", "Two-way client messaging"]],
];

function Roadmap() {
  return <div><PageHeader title="Roadmap" kicker="Honest status" />
    <div className="grid gap-4 md:grid-cols-2">{sections.map(([t, items]) => <Card key={t}><CardHeader><CardTitle className="label-caps">{t}</CardTitle></CardHeader><CardContent><ul className="list-disc space-y-1 pl-5 text-sm">{items.map((i) => <li key={i}>{i}</li>)}</ul></CardContent></Card>)}</div>
  </div>;
}
