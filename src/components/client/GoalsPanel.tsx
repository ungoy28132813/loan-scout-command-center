import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fmtMoney } from "@/lib/labels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function GoalsPanel({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(""); const [type, setType] = useState("personal"); const [amt, setAmt] = useState("");
  const [biz, setBiz] = useState("");
  const q = useQuery({ queryKey: ["goals", clientId], queryFn: async () => {
    const [g, b] = await Promise.all([supabase.from("funding_goals").select("*").eq("client_id", clientId).order("created_at"), supabase.from("business_profiles").select("*").eq("client_id", clientId)]);
    return { goals: g.data ?? [], biz: b.data ?? [] };
  } });
  const add = async () => {
    if (!title.trim()) return;
    let business_profile_id: string | null = null;
    if (type === "business" && biz.trim()) {
      const { data } = await supabase.from("business_profiles").insert({ client_id: clientId, name: biz.slice(0, 120) }).select("id").single();
      business_profile_id = data?.id ?? null;
    }
    const { error } = await supabase.from("funding_goals").insert({ client_id: clientId, title: title.slice(0, 120), goal_type: type, target_amount: amt ? Number(amt) : null, business_profile_id });
    if (error) return void toast.error(error.message);
    setTitle(""); setAmt(""); setBiz("");
    qc.invalidateQueries({ queryKey: ["goals", clientId] }); qc.invalidateQueries({ queryKey: ["qa", clientId] });
  };
  return (
    <Card>
      <CardHeader><CardTitle className="label-caps">Funding goals</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {(q.data?.goals ?? []).map((g) => (
          <div key={g.id} className="flex items-center justify-between rounded border p-3 text-sm">
            <div><div className="font-medium">{g.title}</div><div className="text-xs capitalize text-muted-foreground">{g.goal_type}{g.business_profile_id ? ` · ${q.data?.biz.find((b) => b.id === g.business_profile_id)?.name ?? ""}` : ""}</div></div>
            <div className="font-semibold">{g.target_amount ? fmtMoney(g.target_amount) : "Amount not set"}</div>
          </div>
        ))}
        <div className="grid gap-2 sm:grid-cols-4">
          <Input placeholder="Goal (e.g. consolidate debt)" value={title} onChange={(e) => setTitle(e.target.value)} className="sm:col-span-2" />
          <Select value={type} onValueChange={setType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="personal">Personal</SelectItem><SelectItem value="business">Business</SelectItem></SelectContent></Select>
          <Input placeholder="Target $ (optional)" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} />
          {type === "business" && <Input placeholder="Business name (separate profile)" value={biz} onChange={(e) => setBiz(e.target.value)} className="sm:col-span-3" />}
          <Button onClick={add}>Add goal</Button>
        </div>
      </CardContent>
    </Card>
  );
}
