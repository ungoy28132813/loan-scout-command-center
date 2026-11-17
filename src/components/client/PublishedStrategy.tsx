import { ExternalLink } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MATCH_STATUS_LABEL, fmtMoney } from "@/lib/labels";

export interface SnapshotItem {
  product_id: string; lender: string; product: string; product_type: string; official_url: string | null;
  published_min: number | null; published_max: number | null; amount_kind: string; pull_type: string;
  status: string; score: number | null; sequence: number;
  conditions: { label: string; outcome: string; required: string; observed: string; source_title: string; source_url: string }[];
  checklist: string[]; documents: string[]; client_summary: string;
}
export interface SnapshotContent { items: SnapshotItem[]; disclaimer: string; approved_note?: string }

export const DISCLAIMER = "These are informational recommendations prepared and reviewed by Loan Scout LLC staff. The suitability index (0–100) compares how closely your documented profile matches each product's cited, published requirements — it is not an approval probability. Lenders make all credit decisions. No approval, rate, credit limit or funding amount is guaranteed. A credit limit is not cash funding. Information marked Unknown was not available or not verified.";

const amountKind = (k: string) => k === "credit_limit" ? "credit limit (not cash)" : k === "loan_cash" ? "loan amount" : "amount type unknown";
const pull = (p: string) => p === "soft_prequal" ? "Soft-pull pre-qualification documented" : p === "hard" ? "Hard inquiry documented at application" : "Credit pull type not documented";

export function PublishedStrategy({ content }: { content: SnapshotContent }) {
  const items = [...content.items].sort((a, b) => a.sequence - b.sequence);
  return (
    <div className="space-y-6">
      {items.length > 1 && (
        <Card><CardHeader><CardTitle className="label-caps">Side-by-side comparison</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="text-left"><th className="p-2 label-caps text-muted-foreground">Attribute</th>{items.map((i) => <th key={i.product_id} className="p-2">{i.lender}<div className="text-xs font-normal text-muted-foreground">{i.product}</div></th>)}</tr></thead>
              <tbody className="divide-y">
                <tr><td className="p-2 text-muted-foreground">Order</td>{items.map((i) => <td key={i.product_id} className="p-2">#{i.sequence}</td>)}</tr>
                <tr><td className="p-2 text-muted-foreground">Review result</td>{items.map((i) => <td key={i.product_id} className="p-2"><StatusBadge value={i.status} label={MATCH_STATUS_LABEL[i.status]} /></td>)}</tr>
                <tr><td className="p-2 text-muted-foreground">Suitability index</td>{items.map((i) => <td key={i.product_id} className="p-2">{i.score ?? "—"}</td>)}</tr>
                <tr><td className="p-2 text-muted-foreground">Published range</td>{items.map((i) => <td key={i.product_id} className="p-2">{i.published_min == null && i.published_max == null ? "Unknown" : `${fmtMoney(i.published_min)} – ${fmtMoney(i.published_max)}`}<div className="text-xs text-muted-foreground">{amountKind(i.amount_kind)}</div></td>)}</tr>
                <tr><td className="p-2 text-muted-foreground">Credit pull</td>{items.map((i) => <td key={i.product_id} className="p-2 text-xs">{pull(i.pull_type)}</td>)}</tr>
              </tbody>
            </table>
          </CardContent></Card>
      )}
      {items.map((i) => (
        <Card key={i.product_id}>
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div><div className="label-caps text-primary">Step {i.sequence}</div><CardTitle className="font-display text-3xl">{i.lender} — {i.product}</CardTitle></div>
            <StatusBadge value={i.status} label={MATCH_STATUS_LABEL[i.status]} />
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {i.client_summary && <p>{i.client_summary}</p>}
            <div className="grid gap-4 md:grid-cols-2">
              <div><div className="label-caps mb-2 text-muted-foreground">Application checklist</div>
                {i.checklist.length ? <ul className="list-disc space-y-1 pl-5">{i.checklist.map((c, k) => <li key={k}>{c}</li>)}</ul> : <p className="text-muted-foreground">Your advisor will add steps.</p>}</div>
              <div><div className="label-caps mb-2 text-muted-foreground">Documents to have ready</div>
                {i.documents.length ? <ul className="list-disc space-y-1 pl-5">{i.documents.map((c, k) => <li key={k}>{c}</li>)}</ul> : <p className="text-muted-foreground">None listed.</p>}</div>
            </div>
            <div><div className="label-caps mb-2 text-muted-foreground">How your profile compares to cited requirements</div>
              <ul className="divide-y rounded border">{i.conditions.map((c, k) => (
                <li key={k} className="flex flex-wrap items-center justify-between gap-2 p-2"><span>{c.label}: requires {c.required}, yours {c.observed}</span><span className="flex items-center gap-2"><StatusBadge value={c.outcome} /><a href={c.source_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">source</a></span></li>
              ))}{i.conditions.length === 0 && <li className="p-2 text-muted-foreground">No verified requirements on file for this product.</li>}</ul></div>
            <p className="text-xs text-muted-foreground">{pull(i.pull_type)}.</p>
            {i.official_url && <a href={i.official_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline">Official lender page <ExternalLink className="h-3 w-3" /></a>}
          </CardContent>
        </Card>
      ))}
      <p className="rounded border border-gold bg-card p-4 text-xs text-muted-foreground">{content.disclaimer}</p>
    </div>
  );
}
