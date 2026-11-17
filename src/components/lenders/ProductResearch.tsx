import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { fetchLenderSource } from "@/lib/lender-research.functions";
import { researchIsStale } from "@/lib/lender-research";
import { fmtMoney } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";

export type ProductResearch = Tables<"product_research_sources">;
type Product = Tables<"lender_products">;

type FormState = {
  url: string; title: string; tier: string; excerpt: string; locator: string; scope: string;
  version: string; effective: string; checked: string; min: string; max: string;
  aprMin: string; aprMax: string; aprAsOf: string; termMin: string; termMax: string; termAsOf: string; note: string; amountKind: string;
  applicationUrl: string; checklist: string; documents: string; pullRisk: string;
};

const CHANGE_LABELS: Record<string, string> = {
  official_url: "Official URL", published_min_amount: "Minimum amount", published_max_amount: "Maximum amount",
  published_apr_min: "Minimum marketed APR", published_apr_max: "Maximum marketed APR", product_note: "Product note",
  channel_scope: "Channel scope", amount_kind: "Amount kind", apr_as_of: "APR as-of date",
  published_term_min_months: "Minimum term (months)", published_term_max_months: "Maximum term (months)", term_as_of: "Term as-of date",
  application_url: "Verified application destination", application_checklist: "Application checklist", required_documents: "Required documents", application_pull_risk: "Documented pull risk",
};

function initialForm(product: Product): FormState {
  return {
    url: product.official_url ?? "", title: `${product.name} — official source`, tier: "official_primary",
    excerpt: "", locator: "", scope: product.channel_scope ?? product.product_type.replace(/_/g, " "),
    version: "", effective: "", checked: "", min: "", max: "", aprMin: "", aprMax: "", aprAsOf: "",
    termMin: "", termMax: "", termAsOf: "", note: "", amountKind: "no_change",
    applicationUrl: "", checklist: "", documents: "", pullRisk: "",
  };
}

function ChangeList({ changes }: { changes: ProductResearch["proposed_changes"] }) {
  if (!changes || typeof changes !== "object" || Array.isArray(changes) || !Object.keys(changes).length) return null;
  return <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-2">{Object.entries(changes).map(([key, value]) => <div key={key}><dt className="inline font-medium">{CHANGE_LABELS[key] ?? key}: </dt><dd className="inline">{typeof value === "number" && key.includes("amount") ? fmtMoney(value) : Array.isArray(value) ? value.join("; ") : String(value)}{key.includes("apr_") && key !== "apr_as_of" ? "%" : ""}</dd></div>)}</dl>;
}

export function ProductResearchRow({ item, productLabel, isOwner, onDone }: { item: ProductResearch; productLabel?: string; isOwner: boolean; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const decide = async (decision: "approve" | "reject") => {
    setBusy(true);
    const { error } = await supabase.rpc("review_product_research", { _id: item.id, _decision: decision });
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success(decision === "reject" ? "Research rejected" : item.source_tier === "official_primary" ? "Official product information updated; no rules changed" : "Secondary source kept as a note; verified fields unchanged"); onDone(); }
  };
  const stale = researchIsStale(item.source_checked_on);
  return <div className="rounded border p-3 text-sm">
    {productLabel && <div className="mb-1 text-xs text-muted-foreground">{productLabel}</div>}
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><b>{item.source_title}</b><div className="text-xs text-muted-foreground">Scope: {item.channel_scope}</div></div>
      <div className="flex flex-wrap gap-1"><StatusBadge value={item.review_status === "rejected" ? "fail" : item.review_status === "pending" ? "pending" : "verified"} label={item.review_status.replace(/_/g, " ")} /><StatusBadge value={item.source_tier === "official_primary" ? "verified" : "estimate_concern"} label={item.source_tier === "official_primary" ? "official primary" : "secondary · not verified"} />{stale && <StatusBadge value="fail" label="stale · recheck source" />}</div>
    </div>
    <div className="mt-1 text-xs text-muted-foreground"><a className="inline-flex items-center gap-1 underline" href={item.source_url} target="_blank" rel="noreferrer">Source link<ExternalLink className="h-3 w-3" /></a> · checked {item.source_checked_on}{item.effective_date ? ` · effective ${item.effective_date}` : ""}{item.version_label ? ` · version ${item.version_label}` : ""} · {item.retrieval_method === "server_fetch" ? "on-demand retrieval" : "manual submission"}</div>
    {item.source_locator && <div className="mt-1 text-xs text-muted-foreground">Locator: {item.source_locator}</div>}
    {item.source_excerpt && <details className="mt-2"><summary className="cursor-pointer text-xs font-medium">Source excerpt ({item.source_excerpt.length} characters)</summary><div className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">{item.source_excerpt}</div></details>}
    <ChangeList changes={item.proposed_changes} />
    {isOwner && item.review_status === "pending" && <div className="mt-2 flex flex-wrap gap-2"><Button size="sm" disabled={busy} onClick={() => decide("approve")}>{item.source_tier === "official_primary" ? "Approve & apply product info" : "Approve as secondary note"}</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => decide("reject")}>Reject</Button></div>}
  </div>;
}

export function ProductResearchQueue({ items, isOwner, onDone, label }: { items: ProductResearch[]; isOwner: boolean; onDone: () => void; label: (productId: string) => string }) {
  const pending = items.filter((item) => item.review_status === "pending");
  if (!pending.length) return null;
  return <div className="mb-4 rounded-lg border border-gold bg-card"><div className="border-b p-4"><div className="label-caps">Product research awaiting owner review ({pending.length})</div><p className="mt-1 text-sm text-muted-foreground">Approval can update cited marketing information only. It never activates an underwriting rule or publishes a recommendation.</p></div><div className="space-y-2 p-4">{pending.map((item) => <ProductResearchRow key={item.id} item={item} productLabel={label(item.product_id)} isOwner={isOwner} onDone={onDone} />)}</div></div>;
}

export function ProductResearchPanel({ product, items, isOwner, canPropose, onDone }: { product: Product; items: ProductResearch[]; isOwner: boolean; canPropose: boolean; onDone: () => void }) {
  const retrieveSource = useServerFn(fetchLenderSource);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<FormState>(() => initialForm(product));
  const [retrieval, setRetrieval] = useState<{ method: string; retrievedAt: string; contentSha256: string }>({ method: "manual", retrievedAt: "", contentSha256: "" });
  const set = (patch: Partial<FormState>) => setForm((current) => ({ ...current, ...patch }));

  const retrieve = async () => {
    setBusy(true);
    try {
      const result = await retrieveSource({ data: { productId: product.id, url: form.url } });
      if (!result.ok) toast.error(result.error);
      else {
        set({ url: result.url, excerpt: result.excerpt, checked: result.retrievedAt.slice(0, 10) });
        setRetrieval({ method: "server_fetch", retrievedAt: result.retrievedAt, contentSha256: result.contentSha256 });
        toast.success("Public source text retrieved; review it before submitting");
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : "Source retrieval failed"); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    if (!form.title.trim() || !form.url.trim() || !form.scope.trim() || !form.checked) return void toast.error("Source title, HTTPS URL, channel scope and checked date are required");
    const proposed: Record<string, string | number | string[]> = {};
    if (form.url !== product.official_url) proposed["official_url"] = form.url;
    if (form.min) proposed["published_min_amount"] = Number(form.min);
    if (form.max) proposed["published_max_amount"] = Number(form.max);
    if (form.aprMin) proposed["published_apr_min"] = Number(form.aprMin);
    if (form.aprMax) proposed["published_apr_max"] = Number(form.aprMax);
    if ((form.aprMin || form.aprMax) && form.aprAsOf) proposed["apr_as_of"] = form.aprAsOf;
    if (form.termMin) proposed["published_term_min_months"] = Number(form.termMin);
    if (form.termMax) proposed["published_term_max_months"] = Number(form.termMax);
    if ((form.termMin || form.termMax) && form.termAsOf) proposed["term_as_of"] = form.termAsOf;
    if (form.note.trim()) proposed["product_note"] = form.note.trim();
    if (form.scope.trim() !== (product.channel_scope ?? "")) proposed["channel_scope"] = form.scope.trim();
    if (form.amountKind !== "no_change") proposed["amount_kind"] = form.amountKind;
    if (form.applicationUrl.trim()) proposed["application_url"] = form.applicationUrl.trim();
    if (form.checklist.trim()) proposed["application_checklist"] = form.checklist.split("\n").map((item) => item.trim()).filter(Boolean);
    if (form.documents.trim()) proposed["required_documents"] = form.documents.split("\n").map((item) => item.trim()).filter(Boolean);
    if (form.pullRisk.trim()) proposed["application_pull_risk"] = form.pullRisk.trim();
    setBusy(true);
    const { error } = await supabase.rpc("submit_product_research", { _payload: {
      product_id: product.id, source_url: form.url, source_title: form.title.trim(), source_excerpt: form.excerpt,
      source_locator: form.locator || null, retrieval_method: retrieval.method, source_tier: form.tier,
      channel_scope: form.scope.trim(), version_label: form.version || null, effective_date: form.effective || null,
      source_checked_on: form.checked, retrieved_at: retrieval.retrievedAt || null, content_sha256: retrieval.contentSha256 || null,
      proposed_changes: proposed,
    } });
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Submitted for owner review; matching rules are unchanged"); setOpen(false); setForm(initialForm(product)); setRetrieval({ method: "manual", retrievedAt: "", contentSha256: "" }); onDone(); }
  };

  return <div className="mt-3 rounded border border-dashed p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><div className="label-caps text-muted-foreground">On-demand source research</div><div className="text-xs text-muted-foreground">No AI interpretation, scheduled monitoring, or automatic rule activation.</div></div>{canPropose && <Button size="sm" variant="outline" onClick={() => setOpen(!open)}><Search className="mr-2 h-4 w-4" />{open ? "Close research form" : "Research / add source"}</Button>}</div>
    {open && <div className="mt-3 space-y-3 rounded bg-muted p-3">
      <div className="grid gap-2 sm:grid-cols-2"><Input aria-label="Research source URL" placeholder="https://official-lender.example/product" value={form.url} onChange={(e) => { set({ url: e.target.value }); setRetrieval({ method: "manual", retrievedAt: "", contentSha256: "" }); }} /><Select value={form.tier} onValueChange={(tier) => set({ tier })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="official_primary">Official primary source</SelectItem><SelectItem value="secondary_source">Secondary source (note only)</SelectItem></SelectContent></Select></div>
      {form.tier === "official_primary" && <Button size="sm" variant="secondary" disabled={busy || !form.url} onClick={retrieve}>Retrieve public page text now</Button>}
      <div className="grid gap-2 sm:grid-cols-2"><Input aria-label="Source title" placeholder="Exact page or document title" value={form.title} onChange={(e) => set({ title: e.target.value })} /><Input aria-label="Channel scope" placeholder="Product/channel scope" value={form.scope} onChange={(e) => set({ scope: e.target.value })} /><Input aria-label="Source version" placeholder="Version (optional)" value={form.version} onChange={(e) => set({ version: e.target.value })} /><Input aria-label="Source locator" placeholder="Page / section (optional)" value={form.locator} onChange={(e) => set({ locator: e.target.value })} /><label className="text-xs">Checked on<Input required type="date" value={form.checked} onChange={(e) => set({ checked: e.target.value })} /></label><label className="text-xs">Effective date (optional)<Input type="date" value={form.effective} onChange={(e) => set({ effective: e.target.value })} /></label></div>
      <Textarea aria-label="Source excerpt" className="min-h-32 bg-card" maxLength={12000} placeholder="Paste a short relevant public excerpt, or retrieve it above. Do not paste client data." value={form.excerpt} onChange={(e) => set({ excerpt: e.target.value })} />
      <div><div className="label-caps mb-2 text-muted-foreground">Proposed marketing updates · blank = no change</div><div className="grid gap-2 sm:grid-cols-3"><Input type="number" min="0" aria-label="Proposed minimum amount" placeholder="Min amount" value={form.min} onChange={(e) => set({ min: e.target.value })} /><Input type="number" min="0" aria-label="Proposed maximum amount" placeholder="Max amount" value={form.max} onChange={(e) => set({ max: e.target.value })} /><Select value={form.amountKind} onValueChange={(amountKind) => set({ amountKind })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="no_change">Amount kind unchanged</SelectItem><SelectItem value="loan_cash">Loan cash</SelectItem><SelectItem value="credit_limit">Credit limit</SelectItem><SelectItem value="available_credit">Available card credit</SelectItem><SelectItem value="unknown">Unknown</SelectItem></SelectContent></Select><Input type="number" min="0" max="100" step="0.01" aria-label="Proposed minimum APR" placeholder="Min APR %" value={form.aprMin} onChange={(e) => set({ aprMin: e.target.value })} /><Input type="number" min="0" max="100" step="0.01" aria-label="Proposed maximum APR" placeholder="Max APR %" value={form.aprMax} onChange={(e) => set({ aprMax: e.target.value })} /><label className="text-xs">APR as of<Input type="date" value={form.aprAsOf} onChange={(e) => set({ aprAsOf: e.target.value })} /></label><Input type="number" min="1" max="1200" step="1" aria-label="Proposed minimum term months" placeholder="Min term months" value={form.termMin} onChange={(e) => set({ termMin: e.target.value })} /><Input type="number" min="1" max="1200" step="1" aria-label="Proposed maximum term months" placeholder="Max term months" value={form.termMax} onChange={(e) => set({ termMax: e.target.value })} /><label className="text-xs">Term as of<Input type="date" value={form.termAsOf} onChange={(e) => set({ termAsOf: e.target.value })} /></label></div><Textarea aria-label="Proposed product note" className="mt-2 bg-card" placeholder="Product note / introductory-rate distinction (optional)" value={form.note} onChange={(e) => set({ note: e.target.value })} /></div>
      <div className="space-y-2 rounded border p-3"><div className="label-caps text-muted-foreground">Proposed application guidance · official source required</div><Input aria-label="Proposed application URL" placeholder="Actual application / rate-check URL, not home page" value={form.applicationUrl} onChange={(e) => set({ applicationUrl: e.target.value })} /><Textarea aria-label="Proposed application checklist" placeholder="Checklist items, one per line (optional)" value={form.checklist} onChange={(e) => set({ checklist: e.target.value })} /><Textarea aria-label="Proposed required documents" placeholder="Sourced document requirements, one per line (optional)" value={form.documents} onChange={(e) => set({ documents: e.target.value })} /><Textarea aria-label="Proposed pull risk" placeholder="Exact source-supported soft/hard pull wording (optional)" value={form.pullRisk} onChange={(e) => set({ pullRisk: e.target.value })} /><p className="text-xs text-muted-foreground">Owner approval applies official guidance only. It does not activate rules or submit an application.</p></div>
      <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={submit}>Submit for owner review</Button><Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></div>
    </div>}
    {items.length > 0 && <div className="mt-3 space-y-2">{items.map((item) => <ProductResearchRow key={item.id} item={item} isOwner={isOwner} onDone={onDone} />)}</div>}
  </div>;
}
