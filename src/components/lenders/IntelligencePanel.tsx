import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import { gatedPct, ruleCoverage, MIN_SAMPLE } from "@/lib/lender-intelligence";

type L = { id: string; name: string }; type P = { id: string; lender_id: string; name: string };
type R = { product_id: string; approval_status: string; verified_on: string; stale_after_days: number };
type C = { product_id: string; review_status: string };

export function IntelligencePanel({ lenders, products, rules, candidates, isOwner, meId }: { lenders: L[]; products: P[]; rules: R[]; candidates: C[]; isOwner: boolean; meId: string }) {
  const qc = useQueryClient();
  const cov = ruleCoverage(lenders, products, rules, candidates);
  const label = (pid: string) => { const p = products.find((x) => x.id === pid); return `${lenders.find((l) => l.id === p?.lender_id)?.name ?? ""} — ${p?.name ?? ""}`; };
  const obs = useQuery({ queryKey: ["bureau-obs"], queryFn: async () => (await supabase.from("bureau_pull_observations").select("*").order("observed_on", { ascending: false }).limit(200)).data ?? [] });
  const summary = useQuery({ enabled: isOwner, queryKey: ["intel-summary"], queryFn: async () => { const { data, error } = await supabase.rpc("lender_intelligence_summary", { _min_sample: MIN_SAMPLE }); if (error) throw error; return data ?? []; } });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["bureau-obs"] }); qc.invalidateQueries({ queryKey: ["intel-summary"] }); };
  const [f, setF] = useState({ product_id: "", state: "", observed_on: "", bureau: "unknown", pull_type: "unknown", provenance: "staff_observed", source_url: "", note: "" });
  const add = async () => {
    if (!f.product_id || !f.observed_on) return void toast.error("Product and date are required");
    const { error } = await supabase.from("bureau_pull_observations").insert({
      product_id: f.product_id, observed_on: f.observed_on, location_state: f.state.trim().toUpperCase() || null,
      bureaus: f.bureau === "unknown" ? [] : [f.bureau], pull_type: f.pull_type, provenance: f.provenance,
      source_url: f.source_url.trim() || null, note: f.note.trim() || null,
    });
    if (error) return void toast.error(error.message);
    toast.success("Observation saved as unverified"); setF({ ...f, note: "", source_url: "" }); refresh();
  };
  const setStatus = async (id: string, verification_status: string) => { const { error } = await supabase.from("bureau_pull_observations").update({ verification_status }).eq("id", id); if (error) toast.error(error.message); else refresh(); };
  const shown = (summary.data ?? []).filter((s) => s.verified_pull_observations > 0 || s.verified_outcomes > 0);

  return <div className="space-y-4">
    <Card><CardHeader><CardTitle className="label-caps">Rule coverage by lender</CardTitle><p className="text-sm text-muted-foreground">Lenders without active owner-approved rules are matched only as Needs Review. Pending source items stay inactive until the owner approves them.</p></CardHeader>
      <CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">Lender</th><th>Products</th><th>Active rules</th><th>Pending items</th><th>Stale</th><th>Coverage</th></tr></thead>
        <tbody>{cov.map((c) => <tr key={c.lenderId} className="border-t"><td className="py-1.5">{c.lender}</td><td>{c.products}</td><td>{c.activeRules}</td><td>{c.pendingCandidates}</td><td>{c.staleRules}</td>
          <td><StatusBadge value={c.status === "has_rules" ? "verified" : "unknown"} label={c.status === "has_rules" ? "Has approved rules" : c.status === "no_products" ? "No products documented" : "Missing approved rules"} /></td></tr>)}</tbody></table></div></CardContent></Card>

    <Card><CardHeader><CardTitle className="label-caps">Bureau-pull observations</CardTitle><p className="text-sm text-muted-foreground">Observations by product, state and date. They never change lender rules or eligibility, and one lender's bureau use is never assumed for other products, states or dates.</p></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 md:grid-cols-4">
          <Select value={f.product_id} onValueChange={(v) => setF({ ...f, product_id: v })}><SelectTrigger aria-label="Product"><SelectValue placeholder="Product" /></SelectTrigger><SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{label(p.id)}</SelectItem>)}</SelectContent></Select>
          <Input aria-label="Observed on" type="date" value={f.observed_on} onChange={(e) => setF({ ...f, observed_on: e.target.value })} />
          <Input aria-label="State (2 letters, optional)" placeholder="State, e.g. NY (optional)" maxLength={2} value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} />
          <Select value={f.bureau} onValueChange={(v) => setF({ ...f, bureau: v })}><SelectTrigger aria-label="Bureau"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unknown">Bureau unknown</SelectItem><SelectItem value="transunion">TransUnion</SelectItem><SelectItem value="experian">Experian</SelectItem><SelectItem value="equifax">Equifax</SelectItem></SelectContent></Select>
          <Select value={f.pull_type} onValueChange={(v) => setF({ ...f, pull_type: v })}><SelectTrigger aria-label="Pull type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unknown">Pull type unknown</SelectItem><SelectItem value="hard">Hard</SelectItem><SelectItem value="soft">Soft</SelectItem></SelectContent></Select>
          <Select value={f.provenance} onValueChange={(v) => setF({ ...f, provenance: v })}><SelectTrigger aria-label="Source of information"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="client_reported">Client-reported</SelectItem><SelectItem value="staff_observed">Staff-observed</SelectItem><SelectItem value="officially_documented">Officially documented (link required)</SelectItem></SelectContent></Select>
          <Input aria-label="Source link" placeholder="https:// source link" value={f.source_url} onChange={(e) => setF({ ...f, source_url: e.target.value })} />
          <Input aria-label="Note" placeholder="Note (no personal details)" maxLength={1000} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </div>
        <Button size="sm" onClick={add}>Add observation</Button>
        {(obs.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No observations recorded yet.</p> :
          <ul className="divide-y text-sm">{(obs.data ?? []).map((o) => <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>{label(o.product_id)} · {o.observed_on}{o.location_state ? ` · ${o.location_state}` : ""} · {o.bureaus.length ? o.bureaus.join(", ") : "bureau unknown"} · {o.pull_type} · {o.provenance.replace(/_/g, " ")}</span>
            <span className="flex items-center gap-2"><StatusBadge value={o.verification_status === "verified" ? "verified" : o.verification_status === "rejected" ? "fail" : "pending"} label={o.verification_status} />
              {o.verification_status === "unverified" && (isOwner || o.created_by !== meId) && <><Button size="sm" variant="outline" onClick={() => setStatus(o.id, "verified")}>Verify</Button><Button size="sm" variant="ghost" onClick={() => setStatus(o.id, "rejected")}>Reject</Button></>}</span></li>)}</ul>}
      </CardContent></Card>

    {isOwner && <Card><CardHeader><CardTitle className="label-caps">Owner insights (verified records only)</CardTitle><p className="text-sm text-muted-foreground">Figures appear only with at least {MIN_SAMPLE} verified records per product. These are past observations, not approval probabilities, and are never promoted to lender policy automatically.</p></CardHeader>
      <CardContent>{shown.length === 0 ? <p className="text-sm text-muted-foreground">No verified observations or outcomes yet. Approval rates stay unavailable until enough verified approvals and denials exist.</p> :
        <ul className="divide-y text-sm">{shown.map((s) => <li key={s.product_id} className="py-2"><div className="font-medium">{label(s.product_id)}</div>
          <div className="text-xs text-muted-foreground">Hard pulls: {gatedPct(s.hard_pct, s.verified_pull_observations)} · TransUnion: {gatedPct(s.transunion_pct, s.verified_pull_observations)} · Experian: {gatedPct(s.experian_pct, s.verified_pull_observations)} · Equifax: {gatedPct(s.equifax_pct, s.verified_pull_observations)}</div>
          <div className="text-xs text-muted-foreground">Verified decisions approved: {gatedPct(s.approved_pct, s.verified_outcomes)}</div></li>)}</ul>}</CardContent></Card>}
  </div>;
}
