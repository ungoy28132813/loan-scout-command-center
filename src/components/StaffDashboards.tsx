import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import type { Me } from "@/lib/use-me";
import { PageHeader } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, DemoBadge } from "@/components/StatusBadge";
import { APP_STATUSES, fmtDate } from "@/lib/labels";
import { isStale } from "@/lib/match-engine";
import { monthlyApplicationMetrics, shiftMonth } from "@/lib/application-pipeline";

function Stat({ label, value, to, hint }: { label: string; value: number | string; to?: string; hint?: string }) {
  const body = (
    <Card className="h-full transition-colors hover:border-primary">
      <CardContent className="p-5">
        <div className="label-caps text-muted-foreground">{label}</div>
        <div className="font-display mt-2 text-5xl leading-none text-primary">{value}</div>
        {hint && <div className="mt-2 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

function MonthlyApplicationMetrics({ apps, clients, outcomes }: {
  apps: { id: string; client_id: string; status: string; status_date: string }[];
  clients: { id: string; is_demo: boolean }[];
  outcomes: { application_id: string; verification_status: string }[];
}) {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const rows = apps.map((app) => ({
    id: app.id, status: app.status, statusDate: app.status_date,
    isDemo: clients.find((client) => client.id === app.client_id)?.is_demo ?? true,
    outcomeVerification: outcomes.find((outcome) => outcome.application_id === app.id)?.verification_status ?? null,
  }));
  const months = [monthlyApplicationMetrics(rows, currentMonth), monthlyApplicationMetrics(rows, shiftMonth(currentMonth, -1))];
  return <Card><CardHeader><CardTitle className="label-caps">Monthly application records</CardTitle><p className="text-sm text-muted-foreground">Actual non-demo tracking rows only. Verified counts require staff-checked lender evidence; self-reports and original recommendations are not verified outcomes.</p></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">
    {months.map((metric) => <div key={metric.month} className="rounded border p-4"><div className="font-display text-2xl">{metric.month}</div><div className="mt-1 text-xs text-muted-foreground">{metric.total} recorded · {metric.verifiedTotal} lender-evidence verified</div><div className="mt-3 space-y-1">{APP_STATUSES.map((status) => <div key={status.value} className="flex justify-between text-sm"><span>{status.label}</span><span>{metric.counts[status.value]} recorded · {metric.verifiedCounts[status.value]} verified</span></div>)}</div></div>)}
  </CardContent></Card>;
}

function useStaffData() {
  return useQuery({
    queryKey: ["staff-dashboard"],
    queryFn: async () => {
      const [clients, assignments, results, snaps, apps, outcomes, tasks, reports, rules, products, lenders, sources] = await Promise.all([
        supabase.from("clients").select("id, display_name, stage, is_demo, created_at"),
        supabase.from("client_assignments").select("client_id, employee_id, active, temporary_until").eq("active", true),
        supabase.from("match_results").select("id, client_id, review_status").eq("review_status", "proposed"),
        supabase.from("published_snapshots").select("id, client_id, status, needs_rereview"),
        supabase.from("applications").select("id, client_id, status, lender_label, status_date"),
        supabase.from("application_outcomes").select("application_id, verification_status"),
        supabase.from("readiness_tasks").select("id, client_id, status, title").eq("status", "client_marked_done"),
        supabase.from("credit_reports").select("id, client_id, extraction_status"),
        supabase.from("lender_rules").select("id, approval_status, verified_on, stale_after_days"),
        supabase.from("lender_products").select("id"),
        supabase.from("lenders").select("id, research_status"),
        supabase.from("source_review_candidates").select("id").eq("review_status", "pending"),
      ]);
      return {
        clients: clients.data ?? [], assignments: assignments.data ?? [], proposed: results.data ?? [], snaps: snaps.data ?? [],
        apps: apps.data ?? [], outcomes: outcomes.data ?? [], tasks: tasks.data ?? [], reports: reports.data ?? [], rules: rules.data ?? [],
        products: products.data ?? [], lenders: lenders.data ?? [], pendingSources: sources.data?.length ?? 0,
      };
    },
  });
}

export function OwnerCommandCenter({ me }: { me: Me }) {
  const { data } = useStaffData();
  const audit = useQuery({ queryKey: ["audit-recent"], queryFn: async () => (await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(8)).data ?? [] });
  const team = useQuery({ queryKey: ["team-count"], queryFn: async () => (await supabase.from("user_roles").select("user_id").eq("role", "employee")).data?.length ?? 0 });
  if (!data) return <PageHeader title="Command Center" kicker="Owner" />;
  const assigned = new Set(data.assignments.map((a) => a.client_id));
  const unassigned = data.clients.filter((c) => !assigned.has(c.id));
  const activeRules = data.rules.filter((r) => r.approval_status === "active");
  const staleRules = activeRules.filter((r) => isStale(r.verified_on, r.stale_after_days));
  const proposedRules = data.rules.filter((r) => r.approval_status === "proposed");
  const stages = ["intake", "documents", "analysis", "review", "published", "applying", "closed"];
  return (
    <div>
      <PageHeader title="Owner Command Center" kicker={`Welcome${me.fullName ? `, ${me.fullName}` : ""}`} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Clients" value={data.clients.length} to="/clients" hint={`${unassigned.length} unassigned`} />
        <Stat label="Matches awaiting review" value={data.proposed.length} to="/clients" />
        <Stat label="Published needing re-review" value={data.snaps.filter((s) => s.status === "published" && s.needs_rereview).length} hint="New report uploaded since publish" />
        <Stat label="Employees" value={team.data ?? 0} to="/team" />
        <Stat label="Awaiting source review" value={data.pendingSources} to="/lenders" hint="Lender criteria — owner decides" />
      </div>
      <div className="mt-6"><MonthlyApplicationMetrics apps={data.apps} clients={data.clients} outcomes={data.outcomes} /></div>
      {(data.clients.length === 0 || activeRules.length === 0) && <Card className="mt-6 border-primary">
        <CardHeader><CardTitle className="font-display text-3xl">Set up your workspace</CardTitle><p className="text-sm text-muted-foreground">Start with a client file. Review lender sources separately; nothing becomes an underwriting rule without your decision.</p></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="rounded border p-4"><div className="label-caps text-primary">Step 1 · Client file</div><p className="mt-2 text-sm text-muted-foreground">Add a client, then upload a report, review extracted values, answer only relevant questions and run matching.</p><Link to="/clients" className="mt-3 inline-block text-sm font-medium text-primary underline">{data.clients.length === 0 ? "Add your first client" : "Open client directory"}</Link></div>
          <div className="rounded border p-4"><div className="label-caps text-primary">Step 2 · Lender sources</div><p className="mt-2 text-sm text-muted-foreground">{activeRules.length === 0 ? "No active cited rules yet. Matching will honestly return Needs Review with no score until you approve suitable criteria." : `${activeRules.length} cited rules are active.`} You can keep unsuitable criteria as non-enforced notes.</p><Link to="/lenders" className="mt-3 inline-block text-sm font-medium text-primary underline">Review {data.pendingSources} pending sources</Link></div>
          <div className="rounded border p-4"><div className="label-caps text-primary">Optional · Your team</div><p className="mt-2 text-sm text-muted-foreground">Invite employees, choose feature permissions and assign only the clients they should access.</p><Link to="/team" className="mt-3 inline-block text-sm font-medium text-primary underline">Set up Team & Access</Link></div>
        </CardContent>
      </Card>}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card><CardHeader><CardTitle className="label-caps">Case stages</CardTitle></CardHeader><CardContent className="space-y-2">
          {stages.map((s) => <div key={s} className="flex justify-between text-sm"><span className="capitalize">{s}</span><span className="font-semibold">{data.clients.filter((c) => c.stage === s).length}</span></div>)}
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="label-caps">Application statuses</CardTitle></CardHeader><CardContent className="space-y-2">
          {APP_STATUSES.map((s) => <div key={s.value} className="flex justify-between text-sm"><span>{s.label}</span><span className="font-semibold">{data.apps.filter((a) => a.status === s.value).length}</span></div>)}
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="label-caps">Lender intelligence freshness</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
          <div className="flex justify-between"><span>Lender identities</span><b>{data.lenders.length}</b></div>
          <div className="flex justify-between"><span>Awaiting verified research</span><b>{data.lenders.filter((l) => l.research_status === "awaiting_verified_research").length}</b></div>
          <div className="flex justify-between"><span>Products on file</span><b>{data.products.length}</b></div>
          <div className="flex justify-between"><span>Active cited rules</span><b>{activeRules.length}</b></div>
          <div className="flex justify-between"><span>Stale active rules</span><b className={staleRules.length ? "text-destructive" : ""}>{staleRules.length}</b></div>
          <div className="flex justify-between"><span>Rule changes awaiting your approval</span><b>{proposedRules.length}</b></div>
          <Link to="/lenders" className="text-primary underline">Open lender intelligence</Link>
        </CardContent></Card>
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle className="label-caps">Unassigned clients</CardTitle></CardHeader><CardContent>
          {data.clients.length === 0 ? <p className="text-sm text-muted-foreground">No clients yet. Use “Add your first client” above to begin.</p> : unassigned.length === 0 ? <p className="text-sm text-muted-foreground">Every client has an assigned team member.</p> :
            <ul className="space-y-2">{unassigned.slice(0, 8).map((c) => <li key={c.id} className="flex items-center justify-between text-sm"><Link to="/clients/$clientId" params={{ clientId: c.id }} className="hover:underline">{c.display_name} {c.is_demo && <DemoBadge />}</Link><Link to="/team" className="text-primary">Assign</Link></li>)}</ul>}
          <p className="mt-3 text-xs text-muted-foreground">Unassigned clients receive no published recommendations until you assign them.</p>
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="label-caps">Recent security activity</CardTitle></CardHeader><CardContent>
          <ul className="space-y-1 text-sm">{(audit.data ?? []).map((a) => <li key={a.id} className="flex justify-between gap-2"><span className="truncate">{a.action} · {a.entity}</span><span className="shrink-0 text-xs text-muted-foreground">{fmtDate(a.created_at)}</span></li>)}</ul>
          <Link to="/security" className="mt-3 inline-block text-sm text-primary underline">Security Center</Link>
        </CardContent></Card>
      </div>
    </div>
  );
}

export function EmployeeCommandCenter({ me }: { me: Me }) {
  const { data } = useStaffData();
  if (!data) return <PageHeader title="Command Center" kicker="Team" />;
  const name = (id: string) => data.clients.find((c) => c.id === id)?.display_name ?? "Client";
  return (
    <div>
      <PageHeader title="Command Center" kicker={`Team member · ${me.email}`} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="My clients" value={data.clients.length} to="/clients" />
        <Stat label="Reports awaiting data entry" value={data.reports.filter((r) => ["awaiting_manual_entry", "partial", "unreadable", "clearer_pdf_requested"].includes(r.extraction_status)).length} />
        <Stat label="Matches pending approval" value={data.proposed.length} />
        <Stat label="Tasks to verify" value={data.tasks.length} />
      </div>
      <div className="mt-6"><MonthlyApplicationMetrics apps={data.apps} clients={data.clients} outcomes={data.outcomes} /></div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle className="label-caps">Assigned clients</CardTitle></CardHeader><CardContent>
          {data.clients.length === 0 ? <p className="text-sm text-muted-foreground">The owner hasn't assigned you any clients yet.</p> :
            <ul className="divide-y">{data.clients.map((c) => <li key={c.id} className="flex items-center justify-between py-2 text-sm"><Link to="/clients/$clientId" params={{ clientId: c.id }} className="font-medium hover:underline">{c.display_name} {c.is_demo && <DemoBadge />}</Link><StatusBadge value={c.stage} /></li>)}</ul>}
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="label-caps">Application statuses</CardTitle></CardHeader><CardContent>
          {data.apps.length === 0 ? <p className="text-sm text-muted-foreground">No applications tracked.</p> :
            <ul className="divide-y">{data.apps.slice(0, 10).map((a) => <li key={a.id} className="flex justify-between py-2 text-sm"><span>{name(a.client_id)} · {a.lender_label}</span><StatusBadge value={a.status} /></li>)}</ul>}
        </CardContent></Card>
        <Card className="lg:col-span-2"><CardHeader><CardTitle className="label-caps">Client-completed tasks awaiting verification</CardTitle></CardHeader><CardContent>
          {data.tasks.length === 0 ? <p className="text-sm text-muted-foreground">Nothing to verify.</p> :
            <ul className="divide-y">{data.tasks.map((t) => <li key={t.id} className="py-2 text-sm"><Link to="/clients/$clientId" params={{ clientId: t.client_id }} className="hover:underline">{name(t.client_id)} — {t.title}</Link></li>)}</ul>}
        </CardContent></Card>
      </div>
    </div>
  );
}
