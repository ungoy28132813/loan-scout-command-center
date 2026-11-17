import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/use-me";
import { PageHeader } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge, DemoBadge } from "@/components/StatusBadge";
import { fmtDate } from "@/lib/labels";

export const Route = createFileRoute("/_authenticated/clients/")({
  head: () => ({ meta: [{ title: "Clients — Loan Scout Matching Tool" }, { name: "description", content: "Client directory." }, { property: "og:title", content: "Clients — Loan Scout" }, { property: "og:description", content: "Client directory." }] }),
  component: Clients,
});

type Filters = { search: string; stage: string; assignment: string; sort: string; demo: string; portal: string };
const DEFAULT: Filters = { search: "", stage: "all", assignment: "all", sort: "newest", demo: "all", portal: "all" };

function Clients() {
  const { data: me } = useMe(); const qc = useQueryClient();
  const [f, setF] = useState<Filters>(DEFAULT);
  const [viewName, setViewName] = useState("");
  const q = useQuery({ queryKey: ["directory"], queryFn: async () => {
    const [c, a, v] = await Promise.all([supabase.from("clients").select("*"), supabase.from("client_assignments").select("client_id").eq("active", true), supabase.from("saved_views").select("*").order("created_at")]);
    return { clients: c.data ?? [], assigned: new Set((a.data ?? []).map((x) => x.client_id)), views: v.data ?? [] };
  } });
  const rows = useMemo(() => {
    if (!q.data) return [];
    let r = q.data.clients.filter((c) => (c.display_name + " " + (c.email ?? "")).toLowerCase().includes(f.search.toLowerCase()));
    if (f.stage !== "all") r = r.filter((c) => c.stage === f.stage);
    if (f.assignment !== "all") r = r.filter((c) => (f.assignment === "assigned") === q.data!.assigned.has(c.id));
    if (f.demo !== "all") r = r.filter((c) => (f.demo === "demo") === c.is_demo);
    if (f.portal !== "all") r = r.filter((c) => (f.portal === "yes") === Boolean(c.user_id));
    return [...r].sort((a, b) => f.sort === "name" ? a.display_name.localeCompare(b.display_name) : f.sort === "oldest" ? a.created_at.localeCompare(b.created_at) : f.sort === "updated" ? b.updated_at.localeCompare(a.updated_at) : b.created_at.localeCompare(a.created_at));
  }, [q.data, f]);
  const saveView = async () => { if (!viewName.trim()) return; const { error } = await supabase.from("saved_views").insert({ name: viewName.slice(0, 60), filters: f }); if (error) toast.error(error.message); else { setViewName(""); qc.invalidateQueries({ queryKey: ["directory"] }); } };
  const sel = (k: keyof Filters, opts: [string, string][], label: string) => <Select value={f[k]} onValueChange={(v) => setF({ ...f, [k]: v })}><SelectTrigger aria-label={label} className="w-40"><SelectValue /></SelectTrigger><SelectContent>{opts.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select>;
  return (
    <div>
      <PageHeader title="Client Directory" kicker={me?.primary === "owner" ? "All clients" : "Your assigned clients"}>{me?.primary === "owner" && <NewClient />}</PageHeader>
      <Card className="mb-4"><CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap gap-2">
          <Input placeholder="Search name or email" className="w-64" value={f.search} onChange={(e) => setF({ ...f, search: e.target.value })} />
          {sel("stage", [["all", "All stages"], ...["intake", "documents", "analysis", "review", "published", "applying", "closed"].map((s) => [s, s] as [string, string])], "Stage")}
          {sel("assignment", [["all", "Any assignment"], ["assigned", "Assigned"], ["unassigned", "Unassigned"]], "Assignment")}
          {sel("portal", [["all", "Any portal"], ["yes", "Has portal login"], ["no", "No portal login"]], "Portal")}
          {sel("demo", [["all", "Demo + real"], ["real", "Real only"], ["demo", "Demo only"]], "Demo")}
          {sel("sort", [["newest", "Newest"], ["oldest", "Oldest"], ["name", "Name A–Z"], ["updated", "Recently updated"]], "Sort")}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="label-caps text-muted-foreground">Saved views</span>
          {(q.data?.views ?? []).map((v) => <span key={v.id} className="flex items-center"><Button size="sm" variant="secondary" onClick={() => setF({ ...DEFAULT, ...(v.filters as Filters) })}>{v.name}</Button><Button size="sm" variant="ghost" aria-label="Delete view" onClick={async () => { await supabase.from("saved_views").delete().eq("id", v.id); qc.invalidateQueries({ queryKey: ["directory"] }); }}>×</Button></span>)}
          <Input placeholder="Name this view" className="w-44" value={viewName} onChange={(e) => setViewName(e.target.value)} /><Button size="sm" variant="outline" onClick={saveView}>Save view</Button>
          <Button size="sm" variant="ghost" onClick={() => setF(DEFAULT)}>Reset</Button>
        </div>
      </CardContent></Card>
      <Card><CardContent className="p-0">
        {rows.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No clients match.</p> :
          <ul className="divide-y">{rows.map((c) => <li key={c.id}><Link to="/clients/$clientId" params={{ clientId: c.id }} className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-muted">
            <span><span className="font-medium">{c.display_name}</span> {c.is_demo && <DemoBadge />}<div className="text-xs text-muted-foreground">{c.email ?? "No email"} · added {fmtDate(c.created_at)}</div></span>
            <span className="flex items-center gap-2">{!q.data!.assigned.has(c.id) && <StatusBadge value="needs_review" label="unassigned" />}<StatusBadge value={c.stage} /></span>
          </Link></li>)}</ul>}
      </CardContent></Card>
    </div>
  );
}

function NewClient() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false); const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [invite, setInvite] = useState(true); const [demo, setDemo] = useState(false);
  const create = async () => {
    if (!name.trim()) return;
    const { data, error } = await supabase.from("clients").insert({ display_name: name.slice(0, 120), email: email.trim().toLowerCase() || null, is_demo: demo }).select("id").single();
    if (error || !data) return void toast.error(error?.message ?? "Failed");
    if (invite && email.trim()) await supabase.from("invitations").insert({ email: email.trim().toLowerCase(), role: "client", client_id: data.id });
    toast.success(invite && email ? "Client created. Invitation recorded — the client signs in with this email at the sign-in page." : "Client created");
    setOpen(false); setName(""); setEmail(""); qc.invalidateQueries({ queryKey: ["directory"] });
  };
  if (!open) return <Button onClick={() => setOpen(true)}>Add client</Button>;
  return <Card className="w-full max-w-md"><CardContent className="space-y-2 p-4">
    <Input placeholder="Client name" value={name} onChange={(e) => setName(e.target.value)} />
    <Input placeholder="Email (for portal access)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
    <label className="flex items-center gap-2 text-sm"><Checkbox checked={invite} onCheckedChange={(v) => setInvite(Boolean(v))} />Invite to client portal</label>
    <label className="flex items-center gap-2 text-sm"><Checkbox checked={demo} onCheckedChange={(v) => setDemo(Boolean(v))} />Mark as DEMO (no real data)</label>
    <div className="flex gap-2"><Button onClick={create}>Create</Button><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></div>
  </CardContent></Card>;
}
