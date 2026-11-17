import { useState } from "react";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isStale } from "@/lib/match-engine";
import type { Tables } from "@/integrations/supabase/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";

export type Candidate = Tables<"source_review_candidates">;
const STATUS_LABEL: Record<string, string> = { pending: "awaiting source review", approved_active: "owner approved · active rule", kept_as_note: "source note · not enforced", rejected: "rejected" };

export function CandidateRow({ c, productLabel, isOwner, onDone }: { c: Candidate; productLabel?: string; isOwner: boolean; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const decide = async (d: "approve_active" | "keep_note" | "reject") => {
    setBusy(true);
    const { error } = await supabase.rpc("review_source_candidate", { _id: c.id, _decision: d });
    setBusy(false);
    if (error) toast.error(error.message); else { toast.success(d === "approve_active" ? "Activated — re-run matching to apply" : "Saved"); onDone(); }
  };
  return <div className="rounded border p-3 text-sm">
    {productLabel && <div className="text-xs text-muted-foreground">{productLabel}</div>}
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0"><b>{c.criterion}</b><div className="text-xs text-muted-foreground">Scope: {c.scope}</div></div>
      <span className="flex flex-wrap items-center gap-1">
        <StatusBadge value={c.review_status === "approved_active" ? "verified" : c.review_status === "rejected" ? "fail" : "pending"} label={STATUS_LABEL[c.review_status] ?? c.review_status} />
        <StatusBadge value={c.representable ? "verified" : "unknown"} label={c.representable ? "engine can check" : "note only — not enforced"} />
      </span>
    </div>
    {c.representable && <div className="mt-1 text-xs text-muted-foreground">Engine scope: {c.application_mode} applications{c.input_key ? ` · goal/business input ${c.input_key}` : ""}{c.requires_verified_facts ? " · staff-verified facts required" : ""}{c.rule_key === "allowed_states" ? ` · states ${c.text_threshold ?? "Unknown"}` : ""}</div>}
    {!c.representable && c.not_enforced_reason && <div className="mt-1 text-xs text-muted-foreground">Why not enforced: {c.not_enforced_reason}</div>}
    <div className="mt-1 text-xs text-muted-foreground">Source: <a href={c.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">{c.source_title}<ExternalLink className="h-3 w-3" /></a>{c.source_locator ? ` · ${c.source_locator}` : ""} · public source checked {c.verified_on}{c.effective_date ? ` · effective ${c.effective_date}` : ""}{c.version_label ? ` · version ${c.version_label}` : ""} · {c.evidence_status.replace(/_/g, " ")}{isStale(c.verified_on, c.stale_after_days) && <b> · stale; recheck required</b>}</div>
    {c.source_excerpt && <details className="mt-2"><summary className="cursor-pointer text-xs font-medium">Source excerpt</summary><div className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">{c.source_excerpt}</div></details>}
    {isOwner && c.review_status === "pending" && <div className="mt-2 flex flex-wrap gap-2">
      {c.representable && <Button size="sm" disabled={busy} onClick={() => decide("approve_active")}>Approve & activate rule</Button>}
      <Button size="sm" variant="secondary" disabled={busy} onClick={() => decide("keep_note")}>Keep as source note</Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => decide("reject")}>Reject</Button>
    </div>}
  </div>;
}

export function SourceReviewQueue({ candidates, label, isOwner, onDone }: { candidates: Candidate[]; label: (productId: string) => string; isOwner: boolean; onDone: () => void }) {
  const pending = candidates.filter((c) => c.review_status === "pending");
  if (!pending.length) return null;
  return <Card className="mb-4 border-gold"><CardHeader><CardTitle className="label-caps">Awaiting source review ({pending.length})</CardTitle>
    <p className="text-sm text-muted-foreground">Criteria from public lender documents. None affect matching until the owner approves them, and only ones the engine can check exactly can be activated. {isOwner ? "" : "Only the owner can decide."}</p></CardHeader>
    <CardContent className="space-y-2">{pending.map((c) => <CandidateRow key={c.id} c={c} productLabel={label(c.product_id)} isOwner={isOwner} onDone={onDone} />)}</CardContent></Card>;
}
