import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/use-me";
import { isStale } from "@/lib/match-engine";
import { researchIsStale } from "@/lib/lender-research";
import { RULE_KEYS, SCORE_MODELS, fmtMoney, fmtDate } from "@/lib/labels";
import { PageHeader } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { StatusBadge, FutureBadge } from "@/components/StatusBadge";
import { SourceReviewQueue, CandidateRow, type Candidate } from "@/components/lenders/SourceReview";
import { ProductResearchPanel, ProductResearchQueue, type ProductResearch } from "@/components/lenders/ProductResearch";
import type { Tables } from "@/integrations/supabase/types";
import { IntelligencePanel } from "@/components/lenders/IntelligencePanel";

type Product = Tables<"lender_products">;

function ProductFacts({ p }: { p: Product }) {
  return <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
    {p.channel_scope && <div>Scope: {p.channel_scope}</div>}
    {(p.published_apr_min != null || p.published_apr_max != null) && <div>Marketed APR (product-level, not an offer): {p.published_apr_min ?? "?"}% – {p.published_apr_max ?? "?"}%{p.apr_as_of ? ` · as of ${p.apr_as_of}` : ""}{p.apr_source_url && <> · <a className="underline" href={p.apr_source_url} target="_blank" rel="noreferrer">source</a></>}</div>}
    {(p.published_term_min_months != null || p.published_term_max_months != null) && <div>Marketed term: {p.published_term_min_months ?? "?"}–{p.published_term_max_months ?? "?"} months{p.term_as_of ? ` · as of ${p.term_as_of}` : ""}{p.term_source_url && <> · <a className="underline" href={p.term_source_url} target="_blank" rel="noreferrer">source</a></>}</div>}
    {p.source_verified_on && <div>Public source checked {p.source_verified_on}{researchIsStale(p.source_verified_on) && <span className="ml-1 font-medium">· stale; recheck before relying on it</span>}</div>}
    {p.application_url && <div>Application destination verified {p.application_url_verified_on ?? "date Unknown"} · <a className="underline" href={p.application_url} target="_blank" rel="noreferrer">open lender application / rate check</a>{p.application_url_source_url && <> · <a className="underline" href={p.application_url_source_url} target="_blank" rel="noreferrer">source</a></>}</div>}
    {p.application_pull_risk && <div>Pull risk: {p.application_pull_risk} {p.pull_risk_source_url && <a className="underline" href={p.pull_risk_source_url} target="_blank" rel="noreferrer">source</a>}</div>}
    {p.product_note && <div>{p.product_note}</div>}
  </div>;
}

function ProductCard({ p, lender, rules, pending, onOpen }: { p: Product; lender: string; rules: number; pending: number; onOpen: () => void }) {
  return <Card><CardContent className="space-y-2 p-4 text-sm">
    <div className="label-caps text-muted-foreground">{lender}</div>
    <button onClick={onOpen} className="text-left font-semibold hover:underline">{p.name}</button>
    <div>{p.published_min_amount == null && p.published_max_amount == null ? "Published range: not stated" : `Published range: ${fmtMoney(p.published_min_amount)} – ${fmtMoney(p.published_max_amount)}`} <span className="text-xs text-muted-foreground">({p.amount_kind === "loan_cash" ? "loan cash" : p.amount_kind === "available_credit" ? "available card credit" : p.amount_kind.replace("_", " ")}; not a guaranteed amount)</span></div>
    <ProductFacts p={p} />
    <div className="flex flex-wrap gap-1"><StatusBadge value="unknown" label="published product information; underwriting review pending" />{pending > 0 && <StatusBadge value="pending" label={`${pending} awaiting source review`} />}<StatusBadge value={rules ? "verified" : "draft"} label={`${rules} active rule${rules === 1 ? "" : "s"}`} /></div>
    {p.official_url && <a href={p.official_url} target="_blank" rel="noreferrer" className="text-xs underline">Official page</a>}
  </CardContent></Card>;
}

export const Route = createFileRoute("/_authenticated/lenders")({
  head: () => ({ meta: [{ title: "Lender Intelligence — Loan Scout Matching Tool" }, { name: "description", content: "Lender products, cited rules and provenance." }, { property: "og:title", content: "Lender Intelligence — Loan Scout" }, { property: "og:description", content: "Lender products, cited rules and provenance." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Lenders,
});

const PTYPES = ["personal_loan", "credit_card", "personal_line_of_credit", "business_credit_card", "business_loan", "business_line_of_credit", "credit_card_feature", "line_of_credit", "unknown"];

function Lenders() {
  const { data: me } = useMe(); const qc = useQueryClient();
  const [search, setSearch] = useState(""); const [ptype, setPtype] = useState("all"); const [rs, setRs] = useState("all");
  const [selected, setSelected] = useState<string | null>(null); const [compare, setCompare] = useState<string[]>([]);
  const q = useQuery({ queryKey: ["lenders"], queryFn: async () => {
    const [l, p, r, s, c, research] = await Promise.all([supabase.from("lenders").select("*").order("name"), supabase.from("lender_products").select("*").order("name"), supabase.from("lender_rules").select("*").order("created_at", { ascending: false }), supabase.from("shortlists").select("*"), supabase.from("source_review_candidates").select("*").order("seed_key"), supabase.from("product_research_sources").select("*").order("created_at", { ascending: false })]);
    return { lenders: l.data ?? [], products: p.data ?? [], rules: r.data ?? [], shortlists: s.data ?? [], candidates: c.data ?? [], research: research.data ?? [] };
  } });
  const refresh = () => qc.invalidateQueries({ queryKey: ["lenders"] });
  const list = useMemo(() => (q.data?.lenders ?? []).filter((l) => l.name.toLowerCase().includes(search.toLowerCase()) && (rs === "all" || l.research_status === rs) && (ptype === "all" || q.data!.products.some((p) => p.lender_id === l.id && p.product_type === ptype))), [q.data, search, rs, ptype]);
  if (!q.data || !me) return null;
  const isOwner = me.primary === "owner";
  const proposed = q.data.rules.filter((r) => r.approval_status === "proposed");
  const lender = q.data.lenders.find((l) => l.id === selected);

  return (
    <div>
      <PageHeader title="Lender Intelligence" kicker={`${q.data.lenders.length} lender identities · ${q.data.products.length} products`}>
        <Button variant="outline" disabled title="No AI research connector is configured. Official-source retrieval and manual review are available on each product."><Sparkles className="mr-2 h-4 w-4" />AI source analysis pending <span className="ml-2"><FutureBadge phase="Phase 3" /></span></Button>
      </PageHeader>
      <Alert className="mb-4"><AlertDescription>All {q.data.lenders.length} lender identities are listed. {q.data.products.length} products carry <b>published product information</b> from official pages; their underwriting criteria are <b>awaiting owner source review</b> and do not affect matching until approved. Marketed amounts and APRs are product-level ranges, not offers or guaranteed amounts. Nothing here is an approval probability.</AlertDescription></Alert>
      <details className="mb-4 rounded border bg-card p-3"><summary className="label-caps cursor-pointer">Rule coverage, bureau observations and insights</summary><div className="mt-3"><IntelligencePanel lenders={q.data.lenders} products={q.data.products} rules={q.data.rules} candidates={q.data.candidates} isOwner={isOwner} meId={me.id} /></div></details>
      <SourceReviewQueue candidates={q.data.candidates} isOwner={isOwner} onDone={refresh} label={(pid) => { const p = q.data!.products.find((x) => x.id === pid); return `${q.data!.lenders.find((l) => l.id === p?.lender_id)?.name ?? ""} — ${p?.name ?? ""}`; }} />
      <ProductResearchQueue items={q.data.research} isOwner={isOwner} onDone={refresh} label={(pid) => { const p = q.data!.products.find((x) => x.id === pid); return `${q.data!.lenders.find((l) => l.id === p?.lender_id)?.name ?? ""} — ${p?.name ?? ""}`; }} />
      {q.data.products.length > 0 && <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{q.data.products.map((p) => <ProductCard key={p.id} p={p} lender={q.data!.lenders.find((l) => l.id === p.lender_id)?.name ?? ""} rules={q.data!.rules.filter((r) => r.product_id === p.id && r.approval_status === "active").length} pending={q.data!.candidates.filter((c) => c.product_id === p.id && c.review_status === "pending").length + q.data!.research.filter((r) => r.product_id === p.id && r.review_status === "pending").length} onOpen={() => setSelected(p.lender_id)} />)}</div>}
      {isOwner && proposed.length > 0 && <Card className="mb-4 border-gold"><CardHeader><CardTitle className="label-caps">Rule changes awaiting owner approval ({proposed.length})</CardTitle></CardHeader><CardContent className="space-y-2">
        {proposed.map((r) => { const p = q.data!.products.find((x) => x.id === r.product_id); return <RuleRow key={r.id} r={r} label={`${q.data!.lenders.find((l) => l.id === p?.lender_id)?.name} — ${p?.name}`} owner onDone={refresh} me={me.id} allRules={q.data!.rules} />; })}
      </CardContent></Card>}
      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <Card><CardContent className="space-y-3 p-4">
          <Input placeholder="Search lenders" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="flex gap-2">
            <Select value={ptype} onValueChange={setPtype}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All product types</SelectItem>{PTYPES.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}</SelectContent></Select>
            <Select value={rs} onValueChange={setRs}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Any research</SelectItem><SelectItem value="awaiting_verified_research">Awaiting research</SelectItem><SelectItem value="partially_verified">Partially verified</SelectItem><SelectItem value="verified">Verified</SelectItem></SelectContent></Select>
          </div>
          <ul className="max-h-[60vh] divide-y overflow-y-auto">{list.map((l) => <li key={l.id}><button onClick={() => setSelected(l.id)} className={`w-full p-2 text-left text-sm hover:bg-muted ${selected === l.id ? "bg-muted" : ""}`}>
            <div className="font-medium">{l.name}</div><div className="flex items-center gap-2 text-xs text-muted-foreground">{q.data!.products.filter((p) => p.lender_id === l.id).length} products · <StatusBadge value={l.research_status === "verified" ? "verified" : "unknown"} label={l.research_status.replace(/_/g, " ")} /></div></button></li>)}</ul>
        </CardContent></Card>
        <div className="space-y-4">
          {lender ? <LenderDetail lender={lender} products={q.data.products.filter((p) => p.lender_id === lender.id)} rules={q.data.rules} candidates={q.data.candidates} research={q.data.research} isOwner={isOwner} canPropose={me.perms.can_propose_rules} me={me.id} compare={compare} setCompare={setCompare} onDone={refresh} /> : <Card><CardContent className="p-6 text-sm text-muted-foreground">Select a lender to view products, cited rules and provenance.</CardContent></Card>}
          <Compare ids={compare} data={q.data} clear={() => setCompare([])} />
          <Shortlists data={q.data} compare={compare} onLoad={setCompare} onDone={refresh} />
        </div>
      </div>
    </div>
  );
}

type RuleT = { id: string; product_id: string; rule_key: string; bureau: string | null; score_model: string | null; lookback_months: number | null; threshold: number; text_threshold: string | null; input_key: string | null; application_mode: string; requires_verified_facts: boolean; source_tier: string; source_title: string; source_url: string; verified_on: string; effective_date: string | null; stale_after_days: number; approval_status: string; version: number; supersedes: string | null };

function RuleRow({ r, label, owner, onDone, me, allRules }: { r: RuleT; label?: string; owner: boolean; onDone: () => void; me: string; allRules: RuleT[] }) {
  const stale = isStale(r.verified_on, r.stale_after_days);
  const approve = async () => {
    const prev = allRules.filter((x) => x.product_id === r.product_id && x.rule_key === r.rule_key && x.approval_status === "active" && (x.bureau ?? "") === (r.bureau ?? "") && (x.score_model ?? "") === (r.score_model ?? "") && (x.lookback_months ?? 0) === (r.lookback_months ?? 0) && (x.input_key ?? "") === (r.input_key ?? "") && x.application_mode === r.application_mode);
    for (const p of prev) await supabase.from("lender_rules").update({ approval_status: "retired" }).eq("id", p.id);
    const { error } = await supabase.from("lender_rules").update({ approval_status: "active", approved_by: me, approved_at: new Date().toISOString(), version: (prev[0]?.version ?? 0) + 1, supersedes: prev[0]?.id ?? null }).eq("id", r.id);
    if (error) toast.error(error.message); else onDone();
  };
  const set = async (s: string) => { const { error } = await supabase.from("lender_rules").update({ approval_status: s }).eq("id", r.id); if (error) toast.error(error.message); else onDone(); };
  return <div className="rounded border p-3 text-sm">
    {label && <div className="text-xs text-muted-foreground">{label}</div>}
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span><b>{RULE_KEYS.find(([k]) => k === r.rule_key)?.[1] ?? r.rule_key}</b>{r.bureau ? ` · ${r.bureau}` : ""}{r.score_model ? ` · ${r.score_model}` : ""}{r.lookback_months ? ` · ${r.lookback_months} mo` : ""} · {r.rule_key === "allowed_states" ? `states ${r.text_threshold ?? "Unknown"}` : r.rule_key === "requires_direct_deposit" ? "qualifying deposit required" : `threshold ${r.threshold}`}{r.application_mode !== "any" ? ` · ${r.application_mode} applications only` : ""}{r.input_key ? ` · input ${r.input_key}` : ""}{r.requires_verified_facts ? " · verified facts required" : ""}</span>
      <span className="flex items-center gap-1"><StatusBadge value={r.approval_status} /><StatusBadge value={r.source_tier === "verified_primary" ? "verified" : "estimate_concern"} label={r.source_tier.replace(/_/g, " ")} />{stale && <StatusBadge value="fail" label="stale" />}<span className="text-xs text-muted-foreground">v{r.version}</span></span>
    </div>
    <div className="mt-1 text-xs text-muted-foreground">Source: <a href={r.source_url} target="_blank" rel="noreferrer" className="underline">{r.source_title}</a> · verified {r.verified_on}{r.effective_date ? ` · effective ${r.effective_date}` : ""} · review every {r.stale_after_days} days</div>
    {owner && r.approval_status === "proposed" && <div className="mt-2 flex gap-2"><Button size="sm" onClick={approve}>Approve & activate</Button><Button size="sm" variant="outline" onClick={() => set("rejected")}>Reject</Button></div>}
    {owner && r.approval_status === "active" && <Button size="sm" variant="ghost" className="mt-1" onClick={() => set("retired")}>Retire (disable)</Button>}
  </div>;
}

function LenderDetail({ lender, products, rules, candidates, research, isOwner, canPropose, me, compare, setCompare, onDone }: { lender: { id: string; name: string; official_url: string | null; research_status: string }; products: Product[]; rules: RuleT[]; candidates: Candidate[]; research: ProductResearch[]; isOwner: boolean; canPropose: boolean; me: string; compare: string[]; setCompare: (v: string[]) => void; onDone: () => void }) {
  const [np, setNp] = useState({ name: "", type: "unknown", url: "", min: "", max: "", kind: "unknown", pull: "unknown" });
  const [lurl, setLurl] = useState(lender.official_url ?? ""); const [lrs, setLrs] = useState(lender.research_status);
  const addProduct = async () => { if (!np.name.trim()) return; const { error } = await supabase.from("lender_products").insert({ lender_id: lender.id, name: np.name.slice(0, 120), product_type: np.type, official_url: np.url || null, published_min_amount: np.min ? Number(np.min) : null, published_max_amount: np.max ? Number(np.max) : null, amount_kind: np.kind, pull_type: np.pull }); if (error) toast.error(error.message); else { setNp({ name: "", type: "unknown", url: "", min: "", max: "", kind: "unknown", pull: "unknown" }); onDone(); } };
  const saveLender = async () => { const { error } = await supabase.from("lenders").update({ official_url: lurl || null, research_status: lrs }).eq("id", lender.id); if (error) toast.error(error.message); else onDone(); };
  return <Card>
    <CardHeader><CardTitle className="font-display text-3xl">{lender.name}</CardTitle>
      {isOwner && <div className="flex flex-wrap gap-2"><Input placeholder="Official website" className="w-64" value={lurl} onChange={(e) => setLurl(e.target.value)} />
        <Select value={lrs} onValueChange={setLrs}><SelectTrigger className="w-52"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="awaiting_verified_research">Awaiting verified research</SelectItem><SelectItem value="partially_verified">Partially verified</SelectItem><SelectItem value="verified">Verified</SelectItem></SelectContent></Select>
        <Button size="sm" variant="secondary" onClick={saveLender}>Save</Button></div>}
    </CardHeader>
    <CardContent className="space-y-4">
      {products.length === 0 && <p className="text-sm text-muted-foreground">No products recorded. {isOwner ? "Add products below from official lender sources." : "The owner adds products."}</p>}
      {products.map((p) => { const pr = rules.filter((r) => r.product_id === p.id); return <div key={p.id} data-product-name={p.name} className="rounded border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><b>{p.name}</b> <span className="text-xs text-muted-foreground">· {p.product_type.replace(/_/g, " ")}</span></div>
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={compare.includes(p.id)} onChange={(e) => setCompare(e.target.checked ? [...compare, p.id] : compare.filter((x) => x !== p.id))} />Compare</label></div>
        <div className="text-xs text-muted-foreground">Published range: {p.published_min_amount == null && p.published_max_amount == null ? "Unknown" : `${fmtMoney(p.published_min_amount)} – ${fmtMoney(p.published_max_amount)}`} ({p.amount_kind === "credit_limit" ? "credit limit — not cash" : p.amount_kind === "available_credit" ? "existing available card credit — not a standalone loan" : p.amount_kind.replace("_", " ")}) · Pull: {p.pull_type.replace("_", " ")} {p.official_url && <a href={p.official_url} target="_blank" rel="noreferrer" className="underline">official page</a>}</div>
        <ProductFacts p={p} />
        <ProductResearchPanel key={p.id} product={p} items={research.filter((item) => item.product_id === p.id)} isOwner={isOwner} canPropose={canPropose} onDone={onDone} />
        {candidates.filter((c) => c.product_id === p.id).length > 0 && <div className="mt-2 space-y-2"><div className="label-caps text-muted-foreground">Source criteria</div>{candidates.filter((c) => c.product_id === p.id).map((c) => <CandidateRow key={c.id} c={c} isOwner={isOwner} onDone={onDone} />)}</div>}
        <div className="mt-2 space-y-2">{pr.length === 0 ? <StatusBadge value="unknown" label="no active engine rules" /> : pr.filter((r) => r.approval_status !== "rejected").map((r) => <RuleRow key={r.id} r={r} owner={isOwner} onDone={onDone} me={me} allRules={rules} />)}</div>
        {canPropose && <ProposeRule productId={p.id} me={me} onDone={onDone} />}
      </div>; })}
      {isOwner && <div className="rounded border border-dashed p-3"><div className="label-caps mb-2 text-muted-foreground">Add product (from official source)</div>
        <div className="grid gap-2 sm:grid-cols-3">
          <Input placeholder="Product name" value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} />
          <Select value={np.type} onValueChange={(v) => setNp({ ...np, type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PTYPES.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}</SelectContent></Select>
          <Input placeholder="Official product URL" value={np.url} onChange={(e) => setNp({ ...np, url: e.target.value })} />
          <Input placeholder="Published min $ (blank = unknown)" value={np.min} onChange={(e) => setNp({ ...np, min: e.target.value })} />
          <Input placeholder="Published max $ (blank = unknown)" value={np.max} onChange={(e) => setNp({ ...np, max: e.target.value })} />
          <Select value={np.kind} onValueChange={(v) => setNp({ ...np, kind: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unknown">Amount type unknown</SelectItem><SelectItem value="loan_cash">Loan (cash)</SelectItem><SelectItem value="credit_limit">Credit limit (not cash)</SelectItem><SelectItem value="available_credit">Available card credit</SelectItem></SelectContent></Select>
          <Select value={np.pull} onValueChange={(v) => setNp({ ...np, pull: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unknown">Pull type unknown</SelectItem><SelectItem value="soft_prequal">Soft pre-qual (documented)</SelectItem><SelectItem value="hard">Hard pull (documented)</SelectItem></SelectContent></Select>
          <Button onClick={addProduct}>Add product</Button>
        </div></div>}
    </CardContent>
  </Card>;
}

const BUREAU_RULE_KEYS = new Set(["min_score", "max_inquiries", "min_open_tradelines", "min_months_since_bankruptcy", "max_utilization_pct", "max_late_payments", "max_delinquent_accounts", "max_collections", "max_chargeoffs"]);
const ANSWER_RULE_KEYS = new Set(["max_dti_pct", "min_months_in_business", "min_annual_revenue", "min_annual_income", "min_existing_product_months", "min_membership_months", "requires_direct_deposit", "min_banking_history_months", "min_average_monthly_deposits", "min_owner_share_pct", "allowed_states"]);
const CUSTOM_INPUT_RULE_KEYS = new Set([...ANSWER_RULE_KEYS].filter((key) => key !== "max_dti_pct"));

function ProposeRule({ productId, me, onDone }: { productId: string; me: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ key: "min_score", bureau: "transunion", model: "FICO 8", lookback: "", threshold: "", textThreshold: "", inputKey: "", applicationMode: "any", requiresVerified: false, tier: "verified_primary", title: "", url: "", verified: "", effective: "", stale: "180" });
  if (!open) return <Button size="sm" variant="ghost" className="mt-2" onClick={() => setOpen(true)}>+ Propose cited rule</Button>;
  const locationRule = f.key === "allowed_states";
  const depositRule = f.key === "requires_direct_deposit";
  const numericThreshold = !locationRule && !depositRule;
  const submit = async () => {
    if ((numericThreshold && (!f.threshold.trim() || !Number.isFinite(Number(f.threshold)) || Number(f.threshold) < 0)) || !f.title.trim() || !/^https?:\/\//.test(f.url) || !f.verified) return void toast.error("A valid threshold, source title, source URL and verification date are required.");
    if (locationRule && !/^[A-Z]{2}(\s*,\s*[A-Z]{2})*$/i.test(f.textThreshold.trim())) return void toast.error("Enter comma-separated two-letter state codes, for example CA, NY.");
    if (f.inputKey && !/^[a-z][a-z0-9_]{1,119}$/.test(f.inputKey)) return void toast.error("Input key must use lowercase letters, numbers and underscores.");
    if ((f.key === "max_inquiries" || f.key === "max_late_payments") && (!Number.isInteger(Number(f.lookback)) || Number(f.lookback) <= 0)) return void toast.error("Enter a positive whole-month inquiry or late-payment lookback.");
    const { error } = await supabase.from("lender_rules").insert({
      product_id: productId,
      rule_key: f.key,
      bureau: BUREAU_RULE_KEYS.has(f.key) ? f.bureau : null,
      score_model: f.key === "min_score" ? f.model : null,
      lookback_months: f.key === "max_inquiries" || f.key === "max_late_payments" ? Number(f.lookback) : null,
      threshold: locationRule ? 0 : depositRule ? 1 : Number(f.threshold),
      text_threshold: locationRule ? f.textThreshold.trim().toUpperCase() : null,
      input_key: CUSTOM_INPUT_RULE_KEYS.has(f.key) && f.inputKey ? f.inputKey : null,
      application_mode: f.applicationMode,
      requires_verified_facts: ANSWER_RULE_KEYS.has(f.key) && f.requiresVerified,
      source_tier: f.tier,
      source_title: f.title.slice(0, 200),
      source_url: f.url.slice(0, 500),
      verified_on: f.verified,
      effective_date: f.effective || null,
      stale_after_days: Number(f.stale) || 180,
      proposed_by: me,
    });
    if (error) toast.error(error.message); else { toast.success("Proposed — owner approval required before it affects matching"); setOpen(false); onDone(); }
  };
  return <div className="mt-2 grid gap-2 rounded bg-muted p-3 sm:grid-cols-3">
    <Select value={f.key} onValueChange={(v) => setF({ ...f, key: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{RULE_KEYS.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select>
    {BUREAU_RULE_KEYS.has(f.key) && <Select value={f.bureau} onValueChange={(v) => setF({ ...f, bureau: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["experian", "equifax", "transunion"].map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent></Select>}
    {f.key === "min_score" && <Select value={f.model} onValueChange={(v) => setF({ ...f, model: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SCORE_MODELS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select>}
    {(f.key === "max_inquiries" || f.key === "max_late_payments") && <Input placeholder="Lookback months (e.g. 6 or 24)" value={f.lookback} onChange={(e) => setF({ ...f, lookback: e.target.value })} />}
    {numericThreshold && <Input placeholder="Threshold" inputMode="decimal" value={f.threshold} onChange={(e) => setF({ ...f, threshold: e.target.value })} />}
    {locationRule && <Input placeholder="Allowed states, e.g. CA, NY" value={f.textThreshold} onChange={(e) => setF({ ...f, textThreshold: e.target.value })} />}
    {CUSTOM_INPUT_RULE_KEYS.has(f.key) && <Input placeholder="Optional product-specific input key" value={f.inputKey} onChange={(e) => setF({ ...f, inputKey: e.target.value })} />}
    <Select value={f.applicationMode} onValueChange={(v) => setF({ ...f, applicationMode: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="any">Application mode: documented for any</SelectItem><SelectItem value="individual">Individual applications only</SelectItem><SelectItem value="joint">Joint applications only</SelectItem></SelectContent></Select>
    {ANSWER_RULE_KEYS.has(f.key) && <label className="flex items-center gap-2 rounded border bg-background p-2 text-xs"><input type="checkbox" checked={f.requiresVerified} onChange={(event) => setF({ ...f, requiresVerified: event.target.checked })} />Require staff-verified facts (self-reported stays Unknown)</label>}
    <Select value={f.tier} onValueChange={(v) => setF({ ...f, tier: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="verified_primary">Verified primary source</SelectItem><SelectItem value="secondary_source">Secondary source (estimate)</SelectItem><SelectItem value="observational">Observational (estimate)</SelectItem></SelectContent></Select>
    <Input placeholder="Source title (exact document)" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
    <Input placeholder="Source URL" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} />
    <label className="text-xs">Verified on<Input type="date" value={f.verified} onChange={(e) => setF({ ...f, verified: e.target.value })} /></label>
    <label className="text-xs">Effective date<Input type="date" value={f.effective} onChange={(e) => setF({ ...f, effective: e.target.value })} /></label>
    <label className="text-xs">Stale after (days)<Input value={f.stale} onChange={(e) => setF({ ...f, stale: e.target.value })} /></label>
    <p className="text-xs text-muted-foreground sm:col-span-3">Use a custom input key only for a genuinely product-specific question. “Any” application mode must be supported by the cited document; joint support is never inferred from individual criteria.</p>
    <div className="flex gap-2"><Button size="sm" onClick={submit}>Submit for approval</Button><Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></div>
  </div>;
}

type Data = { lenders: { id: string; name: string }[]; products: Product[]; rules: RuleT[]; shortlists: { id: string; name: string; product_ids: string[] }[] };

function Compare({ ids, data, clear }: { ids: string[]; data: Data; clear: () => void }) {
  if (ids.length < 2) return null;
  const ps = ids.map((id) => data.products.find((p) => p.id === id)!).filter(Boolean);
  return <Card><CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle className="label-caps">Side-by-side comparison</CardTitle><Button size="sm" variant="ghost" onClick={clear}>Clear</Button></CardHeader><CardContent className="overflow-x-auto">
    <table className="w-full min-w-[560px] text-sm"><thead><tr><th className="p-2 text-left text-muted-foreground">Attribute</th>{ps.map((p) => <th key={p.id} className="p-2 text-left">{data.lenders.find((l) => l.id === p.lender_id)?.name}<div className="text-xs font-normal">{p.name}</div></th>)}</tr></thead>
      <tbody className="divide-y">
        <tr><td className="p-2 text-muted-foreground">Type</td>{ps.map((p) => <td key={p.id} className="p-2">{p.product_type.replace(/_/g, " ")}</td>)}</tr>
        <tr><td className="p-2 text-muted-foreground">Published range</td>{ps.map((p) => <td key={p.id} className="p-2">{fmtMoney(p.published_min_amount)} – {fmtMoney(p.published_max_amount)} <div className="text-xs text-muted-foreground">{p.amount_kind.replace("_", " ")}</div></td>)}</tr>
        <tr><td className="p-2 text-muted-foreground">Pull</td>{ps.map((p) => <td key={p.id} className="p-2">{p.pull_type.replace("_", " ")}</td>)}</tr>
        {RULE_KEYS.map(([k, l]) => <tr key={k}><td className="p-2 text-muted-foreground">{l}</td>{ps.map((p) => { const r = data.rules.filter((x) => x.product_id === p.id && x.rule_key === k && x.approval_status === "active"); return <td key={p.id} className="p-2 text-xs">{r.length ? r.map((x) => <div key={x.id}>{x.rule_key === "allowed_states" ? x.text_threshold ?? "Unknown" : x.rule_key === "requires_direct_deposit" ? "Required" : x.threshold}{x.score_model ? ` (${x.score_model}, ${x.bureau})` : ""}{x.application_mode !== "any" ? ` · ${x.application_mode} only` : ""} <span className="text-muted-foreground">· {x.source_tier.replace(/_/g, " ")} · {fmtDate(x.verified_on)}</span></div>) : <span className="text-muted-foreground">Unknown</span>}</td>; })}</tr>)}
      </tbody></table>
  </CardContent></Card>;
}

function Shortlists({ data, compare, onLoad, onDone }: { data: Data; compare: string[]; onLoad: (ids: string[]) => void; onDone: () => void }) {
  const [name, setName] = useState("");
  const save = async () => { if (!name.trim() || !compare.length) return void toast.error("Tick products to compare, then name the shortlist"); const { error } = await supabase.from("shortlists").insert({ name: name.slice(0, 60), product_ids: compare }); if (error) toast.error(error.message); else { setName(""); onDone(); } };
  return <Card><CardHeader><CardTitle className="label-caps">Saved shortlists</CardTitle></CardHeader><CardContent className="space-y-2">
    <div className="flex flex-wrap gap-2">{data.shortlists.map((s) => <span key={s.id} className="flex items-center"><Button size="sm" variant="secondary" onClick={() => onLoad(s.product_ids)}>{s.name} ({s.product_ids.length})</Button><Button size="sm" variant="ghost" aria-label="Delete" onClick={async () => { await supabase.from("shortlists").delete().eq("id", s.id); onDone(); }}>×</Button></span>)}</div>
    <div className="flex gap-2"><Input placeholder="Shortlist name" value={name} onChange={(e) => setName(e.target.value)} /><Button variant="outline" onClick={save}>Save {compare.length} selected</Button></div>
  </CardContent></Card>;
}
