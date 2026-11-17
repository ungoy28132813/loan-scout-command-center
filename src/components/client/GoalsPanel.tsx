import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { fmtMoney } from "@/lib/labels";
import { BusinessProfilesPanel } from "@/components/client/BusinessProfilesPanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Goal = Tables<"funding_goals">;
type Business = Tables<"business_profiles">;

export function GoalsPanel({ clientId, staff }: { clientId: string; staff: boolean }) {
  const qc = useQueryClient();
  const [typeFilter, setTypeFilter] = useState("all");
  const [businessFilter, setBusinessFilter] = useState("all");
  const [editingId, setEditingId] = useState("");
  const query = useQuery({ queryKey: ["goals", clientId], queryFn: async () => {
    const [goals, businesses] = await Promise.all([supabase.from("funding_goals").select("*").eq("client_id", clientId).order("created_at"), supabase.from("business_profiles").select("*").eq("client_id", clientId).order("name")]);
    return { goals: goals.data ?? [], businesses: businesses.data ?? [] };
  } });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["goals", clientId] }); qc.invalidateQueries({ queryKey: ["matching", clientId] }); qc.invalidateQueries({ queryKey: ["business-followups"] }); };
  const goals = query.data?.goals ?? [];
  const businesses = query.data?.businesses ?? [];
  const visible = goals.filter((goal) => (typeFilter === "all" || goal.goal_type === typeFilter) && (businessFilter === "all" || goal.business_profile_id === businessFilter));
  const businessName = (id: string | null) => businesses.find((business) => business.id === id)?.name ?? "Unknown business";

  return <div className="space-y-4">
    <BusinessProfilesPanel clientId={clientId} staff={staff} onChanged={refresh} />
    <Card><CardHeader><CardTitle className="label-caps">Funding goals</CardTitle><p className="text-sm text-muted-foreground">Personal goals stay separate. Every business goal explicitly reuses a chosen business profile; one business can have many independent goals.</p></CardHeader><CardContent className="space-y-4">
      <div className="flex flex-wrap gap-2"><Select value={typeFilter} onValueChange={setTypeFilter}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All goal types</SelectItem><SelectItem value="personal">Personal goals</SelectItem><SelectItem value="business">Business goals</SelectItem></SelectContent></Select><Select value={businessFilter} onValueChange={setBusinessFilter}><SelectTrigger className="w-56"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All businesses</SelectItem>{businesses.map((business) => <SelectItem key={business.id} value={business.id}>{business.name}</SelectItem>)}</SelectContent></Select></div>
      {visible.length === 0 && <p className="rounded border border-dashed p-4 text-sm text-muted-foreground">No goals match this view.</p>}
      <div className="space-y-2">{visible.map((goal) => editingId === goal.id ? <GoalForm key={goal.id} clientId={clientId} businesses={businesses} existing={goal} onDone={() => { setEditingId(""); refresh(); }} onCancel={() => setEditingId("")} /> : <div key={goal.id} className="flex flex-wrap items-center justify-between gap-3 rounded border p-3 text-sm"><div><div className="font-medium">{goal.title}</div><div className="text-xs capitalize text-muted-foreground">{goal.goal_type}{goal.business_profile_id ? ` · ${businessName(goal.business_profile_id)}` : ""}</div></div><div className="flex items-center gap-3"><div className="font-semibold">{goal.target_amount == null ? "Amount unknown" : fmtMoney(goal.target_amount)}</div><Button size="sm" variant="ghost" onClick={() => setEditingId(goal.id)}><Pencil className="mr-1 h-4 w-4" />Edit</Button></div></div>)}</div>
      <div className="border-t pt-4"><GoalForm clientId={clientId} businesses={businesses} onDone={refresh} /></div>
    </CardContent></Card>
  </div>;
}

function GoalForm({ clientId, businesses, existing, onDone, onCancel }: { clientId: string; businesses: Business[]; existing?: Goal; onDone: () => void; onCancel?: () => void }) {
  const [title, setTitle] = useState(existing?.title ?? "");
  const [type, setType] = useState<"personal" | "business">((existing?.goal_type as "personal" | "business") ?? "personal");
  const [amount, setAmount] = useState(existing?.target_amount == null ? "" : String(existing.target_amount));
  const [businessId, setBusinessId] = useState(existing?.business_profile_id ?? "");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!title.trim()) return void toast.error("Enter a goal name");
    if (type === "business" && !businessId) return void toast.error("Choose the exact business for this goal, or create a business above first");
    if (amount && (!Number.isFinite(Number(amount)) || Number(amount) < 0)) return void toast.error("Enter a valid target amount or mark it unknown");
    setBusy(true);
    const payload = { client_id: clientId, title: title.trim().slice(0, 120), goal_type: type, target_amount: amount === "" ? null : Number(amount), business_profile_id: type === "business" ? businessId : null };
    const result = existing ? await supabase.from("funding_goals").update(payload).eq("id", existing.id) : await supabase.from("funding_goals").insert(payload);
    setBusy(false);
    if (result.error) return void toast.error(result.error.message);
    toast.success(existing ? "Goal updated; no recommendation was published" : "Goal created with its own financial scope");
    if (!existing) { setTitle(""); setAmount(""); setBusinessId(""); }
    onDone();
  };
  return <div className="space-y-3 rounded border p-3"><div className="label-caps text-muted-foreground">{existing ? "Edit goal" : "Create an independent goal"}</div><div className="grid gap-2 md:grid-cols-2"><div><label className="text-sm font-medium" htmlFor={existing ? `goal-title-${existing.id}` : "goal-title"}>Goal name</label><Input id={existing ? `goal-title-${existing.id}` : "goal-title"} placeholder="e.g. purchase equipment" value={title} onChange={(event) => setTitle(event.target.value)} /></div><div><label className="text-sm font-medium">Goal type</label><Select value={type} onValueChange={(value) => { setType(value as "personal" | "business"); setBusinessId(""); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="personal">Personal</SelectItem><SelectItem value="business">Business</SelectItem></SelectContent></Select></div></div>
    {type === "business" && <div><label className="text-sm font-medium">Business profile (required)</label><Select value={businessId} onValueChange={setBusinessId}><SelectTrigger><SelectValue placeholder="Choose the exact business — no default selected" /></SelectTrigger><SelectContent>{businesses.map((business) => <SelectItem key={business.id} value={business.id}>{business.name}</SelectItem>)}</SelectContent></Select>{businesses.length === 0 && <p className="mt-1 text-xs text-muted-foreground">Create a business above before creating its first goal.</p>}</div>}
    <div><div className="flex items-center justify-between"><label className="text-sm font-medium" htmlFor={existing ? `goal-amount-${existing.id}` : "goal-amount"}>Target amount (optional)</label><button type="button" className="text-xs text-primary underline" onClick={() => setAmount("")}>I don’t know / Skip for now</button></div><Input id={existing ? `goal-amount-${existing.id}` : "goal-amount"} type="number" min={0} placeholder="Unknown" value={amount} onChange={(event) => setAmount(event.target.value)} /></div>
    <div className="flex gap-2"><Button disabled={busy} onClick={save}>{busy ? "Saving…" : existing ? "Save goal" : "Add goal"}</Button>{onCancel && <Button variant="outline" onClick={onCancel}>Cancel</Button>}</div>
  </div>;
}
