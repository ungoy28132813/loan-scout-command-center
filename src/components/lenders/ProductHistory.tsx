import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import { productHistory, type HistoryRule, type HistoryCandidate } from "@/lib/lender-intelligence";

export function ProductHistory({ lenders, products }: { lenders: { id: string; name: string }[]; products: { id: string; lender_id: string; name: string }[] }) {
  const [pid, setPid] = useState("");
  const q = useQuery({ enabled: !!pid, queryKey: ["product-history", pid], queryFn: async () => {
    const [r, c] = await Promise.all([
      supabase.from("lender_rules").select("id,product_id,rule_key,version,supersedes,approval_status,verified_on,stale_after_days,source_url,source_title,effective_date,created_at").eq("product_id", pid),
      supabase.from("source_review_candidates").select("id,product_id,criterion,review_status,verified_on,source_url,source_title,reviewed_at,created_at").eq("product_id", pid),
    ]);
    if (r.error) throw r.error; if (c.error) throw c.error;
    return productHistory(pid, (r.data ?? []) as HistoryRule[], (c.data ?? []) as HistoryCandidate[]);
  } });
  const name = (p: { lender_id: string; name: string }) => `${lenders.find((l) => l.id === p.lender_id)?.name ?? ""} — ${p.name}`;
  return <Card><CardHeader><CardTitle className="label-caps">Source and rule version history</CardTitle>
    <p className="text-sm text-muted-foreground">Read-only. Only the owner can approve changes; pending sources never affect matching.</p></CardHeader>
    <CardContent className="space-y-3">
      <Select value={pid} onValueChange={setPid}><SelectTrigger aria-label="Choose product"><SelectValue placeholder="Choose a product" /></SelectTrigger>
        <SelectContent>{[...products].sort((a, b) => name(a).localeCompare(name(b))).map((p) => <SelectItem key={p.id} value={p.id}>{name(p)}</SelectItem>)}</SelectContent></Select>
      {!pid ? null : q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : q.error ? <p className="text-sm text-destructive">Could not load history.</p>
        : !q.data?.length ? <p className="text-sm text-muted-foreground">No sources or rules recorded for this product yet.</p>
        : <ul className="divide-y text-sm">{q.data.map((e) => <li key={e.id} className="py-2">
            <div className="flex flex-wrap items-center gap-2"><span className="label-caps text-xs">{e.kind === "rule" ? "Rule" : "Source item"}</span><span className="font-medium">{e.title}</span>
              <StatusBadge value={e.status === "active" ? "verified" : "unknown"} label={e.status.replace(/_/g, " ")} />
              {e.freshness !== "not_applicable" && <StatusBadge value={e.freshness === "fresh" ? "verified" : "unknown"} label={e.freshness === "fresh" ? "Fresh" : "Stale — recheck source"} />}</div>
            <div className="text-xs text-muted-foreground">{e.date.slice(0, 10)} · {e.detail} · <a className="underline" href={e.url} target="_blank" rel="noreferrer noopener">Official source</a></div></li>)}</ul>}
    </CardContent></Card>;
}
