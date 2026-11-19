import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Me } from "@/lib/use-me";
import { PageHeader } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentsPanel } from "@/components/client/DocumentsPanel";
import { GoalsPanel } from "@/components/client/GoalsPanel";
import { QuestionnairePanel } from "@/components/client/QuestionnairePanel";
import { PublishedStrategy, type SnapshotContent } from "@/components/client/PublishedStrategy";
import { APP_STATUSES, fmtDate } from "@/lib/labels";
import { StrategyPdfDownload } from "@/components/client/StrategyPdfDownload";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CONSENT_VERSION = "2026-11-v1";

export function ClientDashboard({ me }: { me: Me }) {
  const clientId = me.clientId!;
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["client-portal", clientId],
    queryFn: async () => {
      const [consents, snap, apps, tasks, ann, docs] = await Promise.all([
        supabase.from("consents").select("kind, version").eq("user_id", me.id),
        supabase.from("published_snapshots").select("*").eq("client_id", clientId).eq("status", "published").order("published_at", { ascending: false }).limit(1),
        supabase.from("applications").select("id, lender_label, status, status_date").eq("client_id", clientId).order("status_date", { ascending: false }),
        supabase.from("readiness_tasks").select("id, title, description, status, client_note, evidence_document_id").eq("client_id", clientId).eq("published", true).order("position").order("created_at"),
        supabase.from("announcements").select("id, title, body, kind, created_at").eq("client_id", clientId).order("created_at", { ascending: false }),
        supabase.from("documents").select("id, file_name, category").eq("client_id", clientId).eq("uploaded_by", me.id).order("created_at", { ascending: false }),
      ]);
      const kinds = new Set((consents.data ?? []).filter((c) => c.version === CONSENT_VERSION).map((c) => c.kind));
      return { consentOk: kinds.has("privacy_notice") && kinds.has("report_analysis_authorization"), snap: snap.data?.[0] ?? null, apps: apps.data ?? [], tasks: tasks.data ?? [], ann: ann.data ?? [], docs: docs.data ?? [] };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["client-portal", clientId] });
  if (!q.data) return <PageHeader title="My Funding" kicker="Client portal" />;
  const d = q.data;

  return (
    <div>
      <PageHeader title="My Funding Dashboard" kicker="Loan Scout client portal" />
      {!d.consentOk && <ConsentCard me={me} clientId={clientId} onDone={refresh} />}
      <Tabs defaultValue="plan">
        <TabsList className="mb-4 flex h-auto flex-wrap">
          <TabsTrigger value="plan">Recommendations</TabsTrigger>
          <TabsTrigger value="apps">Applications</TabsTrigger>
          <TabsTrigger value="tasks">Readiness tasks</TabsTrigger>
          <TabsTrigger value="ann">Announcements {d.ann.length ? `(${d.ann.length})` : ""}</TabsTrigger>
          <TabsTrigger value="goals">Goals & questions</TabsTrigger>
          <TabsTrigger value="docs">My documents</TabsTrigger>
        </TabsList>
        <TabsContent value="plan">
          {d.snap ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">Published {fmtDate(d.snap.published_at)} · version {d.snap.version}
                {d.snap.needs_rereview && <StatusBadge value="needs_review" label="Your advisor is reviewing new information" />}
              </div>
              <StrategyPdfDownload snapshotId={d.snap.id} version={d.snap.version} />
              <PublishedStrategy content={d.snap.content as unknown as SnapshotContent} />
            </div>
          ) : <Card><CardContent className="p-6 text-sm text-muted-foreground">Your advisor hasn't published recommendations yet. Every recommendation is reviewed by a Loan Scout team member before it appears here.</CardContent></Card>}
        </TabsContent>
        <TabsContent value="apps">
          <Card><CardHeader><CardTitle className="label-caps">Application statuses</CardTitle><p className="text-sm text-muted-foreground">Updated by your Loan Scout team. Read-only.</p></CardHeader><CardContent>
            {d.apps.length === 0 ? <p className="text-sm text-muted-foreground">No applications tracked yet.</p> :
              <ul className="divide-y">{d.apps.map((a) => <li key={a.id} className="flex items-center justify-between py-3 text-sm"><span className="font-medium">{a.lender_label}</span><span className="flex items-center gap-3"><span className="text-xs text-muted-foreground">{fmtDate(a.status_date)}</span><StatusBadge value={a.status} label={APP_STATUSES.find((s) => s.value === a.status)?.label} /></span></li>)}</ul>}
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="tasks">
          <div className="space-y-3">{d.tasks.length === 0 && <Card><CardContent className="p-6 text-sm text-muted-foreground">No readiness tasks yet.</CardContent></Card>}
            {d.tasks.map((t) => <TaskCard key={t.id} t={t} docs={d.docs} onDone={refresh} />)}</div>
        </TabsContent>
        <TabsContent value="ann">
          <div className="space-y-3">{d.ann.length === 0 && <Card><CardContent className="p-6 text-sm text-muted-foreground">No announcements.</CardContent></Card>}
            {d.ann.map((a) => <Card key={a.id}><CardContent className="p-5"><div className="flex justify-between"><div className="font-medium">{a.title}</div><span className="text-xs text-muted-foreground">{fmtDate(a.created_at)}</span></div>{a.kind === "document_request" && <div className="label-caps mt-1 text-primary">Document request</div>}<p className="mt-2 whitespace-pre-wrap text-sm">{a.body}</p></CardContent></Card>)}
            <p className="text-xs text-muted-foreground">Announcements are one-way; replies aren't supported in the portal.</p></div>
        </TabsContent>
        <TabsContent value="goals"><div className="space-y-4"><GoalsPanel clientId={clientId} staff={false} /><QuestionnairePanel clientId={clientId} ruleKeys={[]} staff={false} /></div></TabsContent>
        <TabsContent value="docs"><DocumentsPanel clientId={clientId} me={me} canUpload consentOk={d.consentOk} /></TabsContent>
      </Tabs>
    </div>
  );
}

function ConsentCard({ me, clientId, onDone }: { me: Me; clientId: string; onDone: () => void }) {
  const [a, setA] = useState(false); const [b, setB] = useState(false);
  const accept = async () => {
    const { error } = await supabase.from("consents").insert([
      { user_id: me.id, client_id: clientId, kind: "privacy_notice", version: CONSENT_VERSION },
      { user_id: me.id, client_id: clientId, kind: "report_analysis_authorization", version: CONSENT_VERSION },
    ]);
    if (error) return void toast.error(error.message);
    toast.success("Thank you — authorization recorded"); onDone();
  };
  return (
    <Card className="mb-6 border-primary">
      <CardHeader><CardTitle className="label-caps">Authorization required</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <label className="flex gap-2"><Checkbox checked={a} onCheckedChange={(v) => setA(Boolean(v))} /> <span>I have read the Loan Scout LLC privacy notice: my documents are stored privately, accessed only by me and assigned staff, document views, exports and changes are logged, and records are retained until deleted by the Loan Scout owner subject to law.</span></label>
        <label className="flex gap-2"><Checkbox checked={b} onCheckedChange={(v) => setB(Boolean(v))} /> <span>I authorize Loan Scout LLC to review and analyze the credit reports and financial documents I provide, for the purpose of identifying potential funding options. I understand this tool does not pull my credit or submit applications.</span></label>
        <Button disabled={!a || !b} onClick={accept}>I agree</Button>
      </CardContent>
    </Card>
  );
}

type OwnDoc = { id: string; file_name: string; category: string };
function TaskCard({ t, docs, onDone }: { t: { id: string; title: string; description: string | null; status: string; client_note: string | null; evidence_document_id: string | null }; docs: OwnDoc[]; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState("none");
  const attached = docs.find((x) => x.id === t.evidence_document_id);
  const mark = async () => {
    const { error } = await supabase.rpc("client_mark_task", { _task: t.id, _note: note, _evidence_document_id: evidence === "none" ? undefined : evidence } as never);
    if (error) return void toast.error("Could not update task");
    toast.success("Marked complete — your advisor will verify it"); onDone();
  };
  return (
    <Card><CardContent className="space-y-2 p-5">
      <div className="flex items-center justify-between"><div className="font-medium">{t.title}</div><StatusBadge value={t.status === "verified" ? "verified" : t.status === "client_marked_done" ? "pending" : "draft"} label={t.status === "verified" ? "Verified by advisor" : t.status === "client_marked_done" ? "Awaiting verification" : "To do"} /></div>
      {t.description && <p className="text-sm text-muted-foreground">{t.description}</p>}
      {t.status === "open" && <div className="space-y-2"><Textarea aria-label="Optional note" placeholder="Optional note" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="flex flex-col gap-2 sm:flex-row"><Select value={evidence} onValueChange={setEvidence}><SelectTrigger aria-label="Optional supporting document" className="sm:w-80"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No supporting document</SelectItem>{docs.map((x) => <SelectItem key={x.id} value={x.id}>{x.file_name}</SelectItem>)}</SelectContent></Select><Button onClick={mark}>Mark complete</Button></div>
        <p className="text-xs text-muted-foreground">To attach a file, first upload it under My documents. Only your own uploads can be attached.</p></div>}
      {attached && <p className="text-xs text-muted-foreground">Supporting document: {attached.file_name}</p>}
      {t.client_note && <p className="text-xs text-muted-foreground">Your note: {t.client_note}</p>}
    </CardContent></Card>
  );
}
