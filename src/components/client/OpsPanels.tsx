import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Me } from "@/lib/use-me";
import { APP_STATUSES, fmtDate } from "@/lib/labels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";

function useList<T>(key: string, clientId: string, table: string, order = "created_at") {
  return useQuery({ queryKey: [key, clientId], queryFn: async () => ((await supabase.from(table as never).select("*").eq("client_id", clientId).order(order, { ascending: false })).data ?? []) as T[] });
}

export function ApplicationsPanel({ clientId, me }: { clientId: string; me: Me }) {
  const qc = useQueryClient(); const can = me.perms.can_update_applications;
  const q = useList<{ id: string; lender_label: string; status: string; status_date: string }>("apps", clientId, "applications", "status_date");
  const [label, setLabel] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["apps", clientId] });
  const add = async () => { if (!label.trim()) return; const { error } = await supabase.from("applications").insert({ client_id: clientId, lender_label: label.slice(0, 120) }); if (error) toast.error(error.message); else { setLabel(""); refresh(); } };
  const setStatus = async (id: string, status: string) => { const { error } = await supabase.from("applications").update({ status, status_date: new Date().toISOString(), updated_by: me.id }).eq("id", id); if (error) toast.error(error.message); else refresh(); };
  return <Card><CardHeader><CardTitle className="label-caps">Application pipeline</CardTitle><p className="text-sm text-muted-foreground">Status changes update the client dashboard and audit log only — no notifications or tasks are triggered.</p></CardHeader>
    <CardContent className="space-y-3">
      {(q.data ?? []).map((a) => <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-3 text-sm"><span className="font-medium">{a.lender_label}</span><span className="flex items-center gap-2"><span className="text-xs text-muted-foreground">{fmtDate(a.status_date)}</span>
        {can ? <Select value={a.status} onValueChange={(v) => setStatus(a.id, v)}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent>{APP_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select> : <StatusBadge value={a.status} />}</span></div>)}
      {can && <div className="flex gap-2"><Input placeholder="Lender / product applied to" value={label} onChange={(e) => setLabel(e.target.value)} /><Button onClick={add}>Track application</Button></div>}
    </CardContent></Card>;
}

export function ReadinessPanel({ clientId, me }: { clientId: string; me: Me }) {
  const qc = useQueryClient(); const can = me.perms.can_manage_readiness;
  const q = useList<{ id: string; title: string; description: string | null; published: boolean; status: string; client_note: string | null }>("tasks", clientId, "readiness_tasks");
  const [t, setT] = useState(""); const [d, setD] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["tasks", clientId] });
  const upd = async (id: string, patch: Record<string, unknown>) => { const { error } = await supabase.from("readiness_tasks").update(patch as never).eq("id", id); if (error) toast.error(error.message); else refresh(); };
  const add = async () => { if (!t.trim()) return; const { error } = await supabase.from("readiness_tasks").insert({ client_id: clientId, title: t.slice(0, 160), description: d.slice(0, 2000) || null }); if (error) toast.error(error.message); else { setT(""); setD(""); refresh(); } };
  return <Card><CardHeader><CardTitle className="label-caps">Funding readiness roadmap</CardTitle><p className="text-sm text-muted-foreground">Tasks are drafts until approved for the client. Client completions must be verified before being treated as confirmed.</p></CardHeader>
    <CardContent className="space-y-3">
      {(q.data ?? []).map((x) => <div key={x.id} className="rounded border p-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{x.title}</span><span className="flex items-center gap-2"><StatusBadge value={x.status === "verified" ? "verified" : x.status === "client_marked_done" ? "pending" : "draft"} label={x.status.replace(/_/g, " ")} />
          {can && <label className="flex items-center gap-1 text-xs">Client-visible <Switch checked={x.published} onCheckedChange={(v) => upd(x.id, { published: v })} /></label>}
          {can && x.status === "client_marked_done" && <Button size="sm" onClick={() => upd(x.id, { status: "verified", verified_by: me.id })}>Verify</Button>}
          {can && x.status === "client_marked_done" && <Button size="sm" variant="outline" onClick={() => upd(x.id, { status: "open" })}>Reopen</Button>}</span></div>
        {x.description && <p className="mt-1 text-muted-foreground">{x.description}</p>}
        {x.client_note && <p className="mt-1 text-xs">Client note: {x.client_note}</p>}
      </div>)}
      {can && <div className="grid gap-2"><Input placeholder="Action title" value={t} onChange={(e) => setT(e.target.value)} /><Textarea placeholder="Description" value={d} onChange={(e) => setD(e.target.value)} /><Button onClick={add} className="justify-self-start">Add draft task</Button></div>}
    </CardContent></Card>;
}

export function AnnouncementsPanel({ clientId, me }: { clientId: string; me: Me }) {
  const qc = useQueryClient(); const can = me.perms.can_post_announcements;
  const q = useList<{ id: string; title: string; body: string; kind: string; created_at: string }>("ann", clientId, "announcements");
  const [t, setT] = useState(""); const [b, setB] = useState(""); const [kind, setKind] = useState("general");
  const add = async () => { if (!t.trim() || !b.trim()) return; const { error } = await supabase.from("announcements").insert({ client_id: clientId, title: t.slice(0, 160), body: b.slice(0, 4000), kind }); if (error) toast.error(error.message); else { setT(""); setB(""); qc.invalidateQueries({ queryKey: ["ann", clientId] }); } };
  return <Card><CardHeader><CardTitle className="label-caps">Client announcements (read-only for client)</CardTitle></CardHeader><CardContent className="space-y-3">
    {(q.data ?? []).map((a) => <div key={a.id} className="rounded border p-3 text-sm"><div className="flex justify-between"><b>{a.title}</b><span className="text-xs text-muted-foreground">{fmtDate(a.created_at)} · {a.kind.replace("_", " ")}</span></div><p className="mt-1 whitespace-pre-wrap">{a.body}</p></div>)}
    {can && <div className="grid gap-2"><div className="flex gap-2"><Input placeholder="Title" value={t} onChange={(e) => setT(e.target.value)} /><Select value={kind} onValueChange={setKind}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="general">General</SelectItem><SelectItem value="document_request">Document request</SelectItem></SelectContent></Select></div><Textarea placeholder="Message to client" value={b} onChange={(e) => setB(e.target.value)} /><Button onClick={add} className="justify-self-start">Post announcement</Button></div>}
  </CardContent></Card>;
}

export function NotesPanel({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const q = useList<{ id: string; body: string; created_at: string }>("notes", clientId, "internal_notes");
  const [b, setB] = useState("");
  const add = async () => { if (!b.trim()) return; const { error } = await supabase.from("internal_notes").insert({ client_id: clientId, body: b.slice(0, 4000) }); if (error) toast.error(error.message); else { setB(""); qc.invalidateQueries({ queryKey: ["notes", clientId] }); } };
  return <Card><CardHeader><CardTitle className="label-caps">Internal notes (staff only)</CardTitle></CardHeader><CardContent className="space-y-3">
    {(q.data ?? []).map((n) => <div key={n.id} className="rounded border p-3 text-sm"><div className="text-xs text-muted-foreground">{fmtDate(n.created_at)}</div><p className="whitespace-pre-wrap">{n.body}</p></div>)}
    <Textarea placeholder="Private note — never visible to the client" value={b} onChange={(e) => setB(e.target.value)} /><Button onClick={add}>Add note</Button>
  </CardContent></Card>;
}
