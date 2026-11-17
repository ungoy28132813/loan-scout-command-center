import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/use-me";
import { PageHeader } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OrphanFileCleanup } from "@/components/security/OrphanFileCleanup";

export const Route = createFileRoute("/_authenticated/security")({
  head: () => ({ meta: [{ title: "Security Center — Loan Scout Matching Tool" }, { name: "description", content: "Audit logs and access settings." }, { property: "og:title", content: "Security Center — Loan Scout" }, { property: "og:description", content: "Audit logs and access settings." }] }),
  component: Security,
});

const POSTURE: [string, string, boolean][] = [
  ["Private document storage", "Files live in a private bucket; viewing uses 60-second signed links after a server-side permission check.", true],
  ["Row-level access rules", "Every table enforces owner / assigned-employee / own-client access in the database.", true],
  ["Encryption", "Data is encrypted in transit (HTTPS) and at rest by Lovable Cloud's managed storage and database.", true],
  ["Append-only audit log", "Database triggers record who changed what (field names only, no sensitive values).", true],
  ["Owner-only permanent deletion", "Only the owner can delete documents and reports.", true],
  ["Sign-in", "Email one-time links, email/password account creation, and email recovery are available. New accounts have no access until invited, unless public client sign-up is explicitly enabled. Password changes require the current password; known leaked passwords are rejected.", true],
  ["Passkeys", "Real WebAuthn registration and sign-in are capability-gated. The live authentication service currently reports passkeys disabled, so no passkey option is offered as working.", false],
  ["Forced remote sign-out of a user", "Owner-targeted token revocation is unavailable through the managed auth API. Deactivation immediately blocks client data and assignment access; existing tokens may remain valid until expiry.", false],
  ["Profile and assignment privacy", "Employees can read only their own profile and profiles for actively assigned clients. Deactivated employees lose assignment visibility. Departure revocation and optional transfer are one owner-only audited action.", true],
  ["Current consent", "Client uploads and structured extraction staging require both current authorizations. Consent kind, version and acceptance time are audited without report contents.", true],
  ["Automated PDF extraction", "Text-layer PDFs are read locally in the authorized client or staff browser. Client reads stay unverified and outside matching until staff import and accept them. Scanned reports still need OCR or manual entry.", true],
];

function Security() {
  const { data: me } = useMe(); const qc = useQueryClient();
  const [filter, setFilter] = useState(""); const [entity, setEntity] = useState("all");
  const settings = useQuery({ queryKey: ["settings"], queryFn: async () => (await supabase.from("app_settings").select("*").eq("id", 1).single()).data });
  const logs = useQuery({ queryKey: ["audit", entity], queryFn: async () => {
    let q = supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(300);
    if (entity !== "all") q = q.eq("entity", entity);
    return (await q).data ?? [];
  } });
  const actors = useQuery({ queryKey: ["actors"], queryFn: async () => (await supabase.from("profiles").select("id, email")).data ?? [] });
  if (me?.primary !== "owner") return <p>Owner only.</p>;
  const set = async (patch: Record<string, unknown>) => { const { error } = await supabase.from("app_settings").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", 1); if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ["settings"] }); };
  const who = (id: string | null) => actors.data?.find((a) => a.id === id)?.email ?? (id ? "unknown user" : "system");
  const rows = (logs.data ?? []).filter((l) => !filter || `${l.action} ${l.entity} ${who(l.actor_id)}`.toLowerCase().includes(filter.toLowerCase()));
  const entities = ["all", "documents", "orphan_storage_object", "clients", "client_extraction_submissions", "client_assignments", "employee_permissions", "report_fields", "field_corrections", "match_results", "published_snapshots", "applications", "lender_rules", "readiness_tasks", "app_settings", "profiles", "consents"];
  return (
    <div>
      <PageHeader title="Security Center" kicker="Owner" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle className="label-caps">Access settings</CardTitle></CardHeader><CardContent className="space-y-4 text-sm">
          <label className="flex items-center justify-between gap-3"><span><b>Public client sign-up</b><div className="text-xs text-muted-foreground">Off: only invited emails get access. On: anyone who signs in becomes an unassigned client — no recommendations are published until you assign them.</div></span><Switch checked={settings.data?.public_signup ?? false} onCheckedChange={(v) => set({ public_signup: v })} /></label>
          <label className="flex items-center justify-between gap-3"><span><b>Default matching mode</b><div className="text-xs text-muted-foreground">Expanded includes clearly marked estimates, which never disqualify.</div></span>
            <Select value={settings.data?.match_mode ?? "strict"} onValueChange={(v) => set({ match_mode: v })}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="strict">Strict</SelectItem><SelectItem value="expanded">Expanded</SelectItem></SelectContent></Select></label>
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="label-caps">Security posture</CardTitle></CardHeader><CardContent><ul className="space-y-2 text-sm">{POSTURE.map(([t, d, ok]) => <li key={t} className="flex gap-2"><span className={ok ? "text-primary" : "text-muted-foreground"}>{ok ? "✓" : "○"}</span><span><b>{t}</b> — <span className="text-muted-foreground">{d}</span></span></li>)}</ul></CardContent></Card>
      </div>
      <div className="mt-4"><OrphanFileCleanup /></div>
      <Card className="mt-4"><CardHeader><CardTitle className="label-caps">Audit log</CardTitle>
        <div className="flex flex-wrap gap-2"><Input placeholder="Filter by action, user…" className="w-64" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <Select value={entity} onValueChange={setEntity}><SelectTrigger className="w-56"><SelectValue /></SelectTrigger><SelectContent>{entities.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent></Select></div></CardHeader>
        <CardContent className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
          <thead><tr className="text-left text-muted-foreground"><th className="p-2">When</th><th className="p-2">Who</th><th className="p-2">Action</th><th className="p-2">Record</th><th className="p-2">Details</th></tr></thead>
          <tbody className="divide-y">{rows.map((l) => <tr key={l.id}><td className="p-2 whitespace-nowrap text-xs">{new Date(l.created_at).toLocaleString()}</td><td className="p-2 text-xs">{who(l.actor_id)}</td><td className="p-2">{l.action}</td><td className="p-2">{l.entity}</td><td className="p-2 font-mono text-[0.7rem] text-muted-foreground">{JSON.stringify(l.metadata)}</td></tr>)}</tbody>
        </table></CardContent></Card>
    </div>
  );
}
