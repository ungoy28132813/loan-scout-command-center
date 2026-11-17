import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/use-me";
import { PageHeader } from "@/components/AppShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DemoBadge, StatusBadge } from "@/components/StatusBadge";
import { DocumentsPanel } from "@/components/client/DocumentsPanel";
import { ReportsPanel } from "@/components/client/ReportsPanel";
import { GoalsPanel } from "@/components/client/GoalsPanel";
import { QuestionnairePanel } from "@/components/client/QuestionnairePanel";
import { MatchingPanel } from "@/components/client/MatchingPanel";
import { ApplicationsPanel, ReadinessPanel, AnnouncementsPanel, NotesPanel } from "@/components/client/OpsPanels";

export const Route = createFileRoute("/_authenticated/clients/$clientId")({
  head: () => ({ meta: [{ title: "Client file — Loan Scout Matching Tool" }, { name: "description", content: "Client case file." }, { property: "og:title", content: "Client file — Loan Scout" }, { property: "og:description", content: "Client case file." }, { name: "robots", content: "noindex" }] }),
  component: ClientFile,
});

const STAGES = ["intake", "documents", "analysis", "review", "published", "applying", "closed"];

function ClientFile() {
  const { clientId } = Route.useParams();
  const { data: me } = useMe(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ["client", clientId], queryFn: async () => {
    const [c, rules] = await Promise.all([supabase.from("clients").select("*").eq("id", clientId).maybeSingle(), supabase.from("lender_rules").select("rule_key").eq("approval_status", "active")]);
    return { client: c.data, ruleKeys: [...new Set((rules.data ?? []).map((r) => r.rule_key))] };
  } });
  if (!me || !q.data) return null;
  if (!q.data.client) return <Card><CardContent className="p-6">You don't have access to this client, or it doesn't exist. <Link to="/clients" className="text-primary underline">Back</Link></CardContent></Card>;
  const c = q.data.client;
  const setStage = async (stage: string) => { const { error } = await supabase.from("clients").update({ stage, updated_at: new Date().toISOString() }).eq("id", clientId); if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ["client", clientId] }); };
  return (
    <div>
      <PageHeader title={c.display_name} kicker="Client file">
        <div className="flex items-center gap-2">{c.is_demo && <DemoBadge />}{c.user_id ? <StatusBadge value="active" label="portal active" /> : <StatusBadge value="draft" label="no portal login" />}
          <Select value={c.stage} onValueChange={setStage}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent>{STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
      </PageHeader>
      {me.primary === "owner" && <Assignment clientId={clientId} />}
      <Tabs defaultValue="docs">
        <TabsList className="mb-4 flex h-auto flex-wrap">
          {([["docs", "Documents"], ["reports", "Credit analysis"], ["goals", "Goals & questions"], ["match", "Matches & publishing"], ["apps", "Applications"], ["ready", "Readiness"], ["ann", "Announcements"], ["notes", "Internal notes"]] as [string, string][]).map(([v, l]) => <TabsTrigger key={v} value={v}>{l}</TabsTrigger>)}
        </TabsList>
        <TabsContent value="docs"><DocumentsPanel clientId={clientId} me={me} canUpload={me.perms.can_upload_docs} /></TabsContent>
        <TabsContent value="reports"><ReportsPanel clientId={clientId} me={me} activeRuleCount={q.data.ruleKeys.length} onChanged={() => qc.invalidateQueries({ queryKey: ["matching", clientId] })} /></TabsContent>
        <TabsContent value="goals"><div className="space-y-4"><GoalsPanel clientId={clientId} /><QuestionnairePanel clientId={clientId} ruleKeys={q.data.ruleKeys} staff /></div></TabsContent>
        <TabsContent value="match"><MatchingPanel clientId={clientId} me={me} /></TabsContent>
        <TabsContent value="apps"><ApplicationsPanel clientId={clientId} me={me} /></TabsContent>
        <TabsContent value="ready"><ReadinessPanel clientId={clientId} me={me} /></TabsContent>
        <TabsContent value="ann"><AnnouncementsPanel clientId={clientId} me={me} /></TabsContent>
        <TabsContent value="notes"><NotesPanel clientId={clientId} /></TabsContent>
      </Tabs>
    </div>
  );
}

function Assignment({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["assign", clientId], queryFn: async () => {
    const [a, emps] = await Promise.all([supabase.from("client_assignments").select("*").eq("client_id", clientId).eq("active", true), supabase.from("user_roles").select("user_id").eq("role", "employee")]);
    const ids = (emps.data ?? []).map((e) => e.user_id);
    const profs = ids.length ? (await supabase.from("profiles").select("id, email, active").in("id", ids)).data ?? [] : [];
    return { a: a.data ?? [], emps: profs.filter((p) => p.active) };
  } });
  const [emp, setEmp] = useState(""); const [until, setUntil] = useState("");
  if (!q.data) return null;
  const refresh = () => { qc.invalidateQueries({ queryKey: ["assign", clientId] }); qc.invalidateQueries({ queryKey: ["directory"] }); };
  const assign = async () => { if (!emp) return; const { error } = await supabase.from("client_assignments").insert({ client_id: clientId, employee_id: emp, temporary_until: until ? new Date(until).toISOString() : null }); if (error) toast.error(error.message); else { setEmp(""); setUntil(""); refresh(); } };
  const email = (id: string) => q.data!.emps.find((e) => e.id === id)?.email ?? "former employee";
  return <Card className="mb-4"><CardContent className="flex flex-wrap items-center gap-2 p-4 text-sm">
    <span className="label-caps text-muted-foreground">Assigned team</span>
    {q.data.a.length === 0 && <StatusBadge value="needs_review" label="unassigned — nothing publishes to a client until assigned" />}
    {q.data.a.map((a) => <span key={a.id} className="flex items-center gap-1 rounded border px-2 py-1">{email(a.employee_id)}{a.temporary_until && <span className="text-xs text-muted-foreground"> until {new Date(a.temporary_until).toLocaleDateString()}</span>}<button className="ml-1 text-destructive" aria-label="Revoke" onClick={async () => { await supabase.from("client_assignments").update({ active: false }).eq("id", a.id); refresh(); }}>×</button></span>)}
    <Select value={emp} onValueChange={setEmp}><SelectTrigger className="w-56"><SelectValue placeholder="Employee" /></SelectTrigger><SelectContent>{q.data.emps.map((e) => <SelectItem key={e.id} value={e.id}>{e.email}</SelectItem>)}</SelectContent></Select>
    <Input type="date" className="w-40" value={until} onChange={(e) => setUntil(e.target.value)} aria-label="Temporary access until (optional)" />
    <Button size="sm" onClick={assign}>Assign</Button>
  </CardContent></Card>;
}
