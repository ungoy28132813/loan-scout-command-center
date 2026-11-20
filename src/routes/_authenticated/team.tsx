import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/use-me";
import { PERMISSIONS, ROLE_PRESETS, STAFF_ROLES, fmtDate } from "@/lib/labels";
import { PageHeader } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { title: "Team & Access — Loan Scout Matching Tool" }, { name: "description", content: "Employee permissions and assignments." }, { property: "og:title", content: "Team & Access — Loan Scout" }, { property: "og:description", content: "Employee permissions and assignments." }] }),
  component: Team,
});

function Team() {
  const { data: me } = useMe(); const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const q = useQuery({ enabled: me?.primary === "owner", queryKey: ["team"], queryFn: async () => {
    const roles = (await supabase.from("user_roles").select("user_id").eq("role", "employee")).data ?? [];
    const ids = roles.map((r) => r.user_id);
    const [profiles, perms, invites, assigns] = await Promise.all([
      ids.length ? supabase.from("profiles").select("*").in("id", ids) : Promise.resolve({ data: [] as never[] }),
      supabase.from("employee_permissions").select("*"),
      supabase.from("invitations").select("*").order("created_at", { ascending: false }),
      supabase.from("client_assignments").select("*").eq("active", true),
    ]);
    return { profiles: profiles.data ?? [], perms: perms.data ?? [], invites: invites.data ?? [], assigns: assigns.data ?? [] };
  } });
  if (me?.primary !== "owner") return <p>Owner only.</p>;
  if (!q.data) return null;
  const refresh = () => qc.invalidateQueries({ queryKey: ["team"] });
  const invite = async () => { if (!email.includes("@")) return; const { error } = await supabase.from("invitations").insert({ email: email.trim().toLowerCase(), role: "employee" }); if (error) toast.error(error.message); else { toast.success("Invitation recorded. They sign in with this email via the sign-in page."); setEmail(""); refresh(); } };
  const active = q.data.profiles.filter((p) => p.active);

  return (
    <div>
      <PageHeader title="Team & Access" kicker="Owner controls" />
      <Card className="mb-4"><CardHeader><CardTitle className="label-caps">Invite employee</CardTitle><p className="text-sm text-muted-foreground">Record the invitation, then ask the employee to create an account with this exact email on the sign-in page. They can confirm by email link and set their own password. This tool does not send a separate invitation email.</p></CardHeader>
        <CardContent className="flex gap-2"><Input type="email" placeholder="employee@loanscout…" value={email} onChange={(e) => setEmail(e.target.value)} /><Button onClick={invite}>Invite</Button></CardContent></Card>
      <div className="space-y-4">
        {q.data.profiles.length === 0 && <Card><CardContent className="p-6 text-sm text-muted-foreground">No employees yet.</CardContent></Card>}
        {q.data.profiles.map((p) => <EmployeeCard key={p.id} p={p} perm={q.data!.perms.find((x) => x.user_id === p.id)} clients={q.data!.assigns.filter((a) => a.employee_id === p.id).length} others={active.filter((o) => o.id !== p.id)} onDone={refresh} />)}
      </div>
      <Card className="mt-4"><CardHeader><CardTitle className="label-caps">Invitations</CardTitle></CardHeader><CardContent>
        <ul className="divide-y text-sm">{q.data.invites.map((i) => <li key={i.id} className="flex items-center justify-between py-2"><span>{i.email} · {i.role}</span><span className="flex items-center gap-2">{i.accepted_at ? <StatusBadge value="active" label={`accepted ${fmtDate(i.accepted_at)}`} /> : <><StatusBadge value="pending" /><Button size="sm" variant="ghost" onClick={async () => { const { error } = await supabase.from("invitations").delete().eq("id", i.id); if (error) toast.error(error.message); else { toast.success("Invitation revoked"); refresh(); } }}>Revoke</Button></>}</span></li>)}</ul>
      </CardContent></Card>
    </div>
  );
}

type Perm = Record<string, unknown> & { user_id: string; staff_role: string; custom_title: string | null };

function EmployeeCard({ p, perm, clients, others, onDone }: { p: { id: string; email: string; active: boolean; full_name: string | null }; perm?: Perm | undefined; clients: number; others: { id: string; email: string }[]; onDone: () => void }) {
  const [target, setTarget] = useState("");
  const ensure = async (patch: Record<string, unknown>) => {
    const { error } = perm ? await supabase.from("employee_permissions").update({ ...patch, updated_at: new Date().toISOString() }).eq("user_id", p.id) : await supabase.from("employee_permissions").insert({ user_id: p.id, ...patch });
    if (error) toast.error(error.message); else onDone();
  };
  const applyPreset = (role: string) => {
    const on = ROLE_PRESETS[role];
    const patch: Record<string, unknown> = { staff_role: role };
    if (on) for (const [k] of PERMISSIONS) patch[k] = on.includes(k);
    ensure(patch);
  };
  const deactivate = async () => {
    const { error } = await supabase.rpc("deactivate_employee", { _employee_id: p.id, ...(target ? { _transfer_to: target } : {}) });
    if (error) return void toast.error(error.message);
    toast.success(`Access revoked${target ? " and clients transferred" : ""}.`); onDone();
  };
  return <Card className={p.active ? "" : "opacity-60"}>
    <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
      <div><CardTitle className="text-base">{p.full_name ?? p.email}</CardTitle><div className="text-xs text-muted-foreground">{p.email} · {clients} assigned clients</div></div>
      {p.active ? <StatusBadge value="active" /> : <><StatusBadge value="denied" label="deactivated" /><Button size="sm" variant="outline" onClick={async () => { const { error } = await supabase.from("profiles").update({ active: true }).eq("id", p.id); if (error) toast.error(error.message); else { toast.success("Access reactivated"); onDone(); } }}>Reactivate</Button></>}
    </CardHeader>
    {p.active && <CardContent className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={perm?.staff_role ?? "client_manager"} onValueChange={applyPreset}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger><SelectContent>{STAFF_ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent></Select>
        {perm?.staff_role === "custom" && <Input className="w-48" placeholder="Custom title / department" defaultValue={perm.custom_title ?? ""} onBlur={(e) => ensure({ custom_title: e.target.value.slice(0, 60) })} />}
        <span className="text-xs text-muted-foreground">Choosing a role applies its preset; then fine-tune below.</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{PERMISSIONS.map(([k, l]) => <label key={k} className="flex items-center justify-between gap-2 rounded border p-2 text-sm">{l}<Switch checked={Boolean(perm?.[k])} onCheckedChange={(v) => ensure({ [k]: v })} /></label>)}</div>
      <div className="flex flex-wrap items-center gap-2 rounded border border-destructive/40 p-3">
        <span className="text-sm">Employee departure:</span>
        <Select value={target} onValueChange={setTarget}><SelectTrigger className="w-60"><SelectValue placeholder="Transfer clients to… (optional)" /></SelectTrigger><SelectContent>{others.map((o) => <SelectItem key={o.id} value={o.id}>{o.email}</SelectItem>)}</SelectContent></Select>
        <Button size="sm" variant="destructive" onClick={deactivate}>Revoke access</Button>
        <p className="w-full text-xs text-muted-foreground">Client data and assignment access are blocked immediately by server permission checks. Existing auth tokens may remain valid until expiry; owner-targeted remote sign-out is unavailable.</p>
      </div>
    </CardContent>}
  </Card>;
}
