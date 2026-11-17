import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Check, FilePlus2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { Me } from "@/lib/use-me";
import { loadFacts } from "@/lib/facts";
import { evaluateProduct, type Facts, type MatchEvaluation, type Rule } from "@/lib/match-engine";
import { scopeProductsToGoal, type GoalType } from "@/lib/business-funding";
import { PLANNER_DISCLAIMER, SCENARIO_TIERS, calculateTierScenario, documentedPaymentRange, marketingComparison, sequencingNote, type PlannerItemInput, type PlannerProduct, type ScenarioAmounts, type ScenarioTier } from "@/lib/funding-planner";
import { MATCH_STATUS_LABEL, fmtDate, fmtMoney } from "@/lib/labels";
import { DISCLAIMER, type SnapshotItem } from "@/components/client/PublishedStrategy";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import { Alert, AlertDescription } from "@/components/ui/alert";

const TIER_LABELS: Record<ScenarioTier, string> = { conservative: "Conservative request", medium: "Medium request", expanded: "Expanded request" };
const emptyAmounts = (): ScenarioAmounts => ({ conservative: null, medium: null, expanded: null });
const emptyFacts: Facts = { scores: [], bureau: {}, answers: {}, answerTexts: {}, answerMeta: {}, applicationMode: "unknown", criticalWarnings: [] };
const emptyEvaluation: MatchEvaluation = { status: "needs_review", score: null, conditions: [], improvement_steps: [], summary: "Goal facts are still loading; eligibility remains Needs Review.", pricing_assumption: "No pricing inferred" };

type ProductRow = Tables<"lender_products"> & { lenders: { name: string } | null };
type ScenarioRow = Tables<"funding_strategy_scenarios">;
type ReviewStatus = "proposed" | "approved" | "rejected";
type DraftItem = PlannerItemInput & { reviewStatus: ReviewStatus; assumption: string };
type StoredItem = {
  product_id: string;
  position: number;
  review_status: ReviewStatus;
  amounts: ScenarioAmounts;
  term_months: number | null;
  assumption: string;
};

function toPlannerProduct(row: ProductRow): PlannerProduct {
  return {
    id: row.id, name: row.name, lender: row.lenders?.name ?? "Unknown lender", product_type: row.product_type,
    amount_kind: row.amount_kind, published_min_amount: row.published_min_amount, published_max_amount: row.published_max_amount,
    published_apr_min: row.published_apr_min, published_apr_max: row.published_apr_max, apr_source_url: row.apr_source_url, apr_as_of: row.apr_as_of,
    published_term_min_months: row.published_term_min_months, published_term_max_months: row.published_term_max_months,
    term_source_url: row.term_source_url, term_as_of: row.term_as_of, pull_type: row.pull_type, official_url: row.official_url,
  };
}

export function FundingPlannerPanel({ clientId, me }: { clientId: string; me: Me }) {
  const qc = useQueryClient();
  const [goalId, setGoalId] = useState("");
  const [productId, setProductId] = useState("none");
  const [items, setItems] = useState<DraftItem[]>([]);
  const [name, setName] = useState("Proposed funding strategy");
  const [assumptions, setAssumptions] = useState(PLANNER_DISCLAIMER);
  const [affordabilityNotes, setAffordabilityNotes] = useState("");
  const [sequencingNotes, setSequencingNotes] = useState("");
  const [scenarioId, setScenarioId] = useState("");
  const [busy, setBusy] = useState("");

  const q = useQuery({ queryKey: ["funding-planner", clientId], queryFn: async () => {
    const [goals, businesses, products, rules, scenarios, snapshots] = await Promise.all([
      supabase.from("funding_goals").select("*").eq("client_id", clientId).order("created_at"),
      supabase.from("business_profiles").select("*").eq("client_id", clientId),
      supabase.from("lender_products").select("*, lenders(name)").order("name"),
      supabase.from("lender_rules").select("*").eq("approval_status", "active"),
      supabase.from("funding_strategy_scenarios").select("*").eq("client_id", clientId).order("updated_at", { ascending: false }),
      supabase.from("published_snapshots").select("id, status, version, source_scenario_id, created_at").eq("client_id", clientId),
    ]);
    return { goals: goals.data ?? [], businesses: businesses.data ?? [], products: (products.data ?? []) as ProductRow[], rules: rules.data ?? [], scenarios: scenarios.data ?? [], snapshots: snapshots.data ?? [] };
  } });
  const factsQuery = useQuery({ queryKey: ["planner-facts", clientId, goalId], queryFn: () => loadFacts(clientId, goalId), enabled: Boolean(goalId) });

  const selectedGoal = q.data?.goals.find((goal) => goal.id === goalId);
  const selectedBusiness = q.data?.businesses.find((business) => business.id === selectedGoal?.business_profile_id);
  const products = useMemo(() => scopeProductsToGoal((q.data?.products ?? []).map(toPlannerProduct), (selectedGoal?.goal_type ?? "personal") as GoalType), [q.data?.products, selectedGoal?.goal_type]);
  const evaluations = useMemo(() => {
    const facts = factsQuery.data ?? emptyFacts;
    return new Map(products.map((product) => [product.id, evaluateProduct((q.data?.rules ?? []).filter((rule) => rule.product_id === product.id) as unknown as Rule[], facts, "strict")]));
  }, [products, q.data?.rules, factsQuery.data]);
  const selectedScenario = q.data?.scenarios.find((scenario) => scenario.id === scenarioId);
  const locked = selectedScenario?.status === "approved" || selectedScenario?.status === "archived";
  const includedItems = items.filter((item) => item.reviewStatus !== "rejected");
  const businessRevenue = factsQuery.data?.answers["monthly_business_revenue"];
  const businessExpenses = factsQuery.data?.answers["monthly_business_expenses"];
  const monthlyNetCashFlow = businessRevenue != null && businessExpenses != null ? businessRevenue - businessExpenses : factsQuery.data?.answers["monthly_net_cash_flow"] ?? null;
  const affordabilityInput = {
    goalType: (selectedGoal?.goal_type ?? "personal") as GoalType,
    monthlyGrossIncome: factsQuery.data?.answers["monthly_gross_income"] ?? null,
    existingMonthlyDebtPayments: factsQuery.data?.answers["monthly_debt_payments"] ?? null,
    monthlyNetCashFlow,
    provenance: selectedGoal?.goal_type === "business" ? `${selectedBusiness?.name ?? "Selected business"} · ${selectedBusiness?.verification_status ?? "Unknown"} · ${selectedBusiness?.financial_source ?? "Unknown"}` : "Exact goal answers · " + (factsQuery.data?.answerMeta?.["monthly_gross_income"]?.verified ? "staff verified" : "self-reported/unverified"),
  };
  const tierScenarios = SCENARIO_TIERS.map((tier) => calculateTierScenario(includedItems, tier, affordabilityInput));
  const generatedAffordability = tierScenarios.map((scenario) => `${TIER_LABELS[scenario.tier]}: ${scenario.affordabilityNote}`).join("\n");
  const generatedSequencing = includedItems.map((item, index) => `${index + 1}. ${item.product.lender} — ${item.product.name}: ${sequencingNote(item.product, evaluations.get(item.product.id) ?? emptyEvaluation)}`).join("\n");

  const reset = () => { setItems([]); setScenarioId(""); setName("Proposed funding strategy"); setAssumptions(PLANNER_DISCLAIMER); setAffordabilityNotes(""); setSequencingNotes(""); };
  const chooseGoal = (value: string) => { setGoalId(value); setProductId("none"); reset(); };
  const patchItem = (productKey: string, patch: Partial<DraftItem>) => setItems((current) => current.map((item) => item.product.id === productKey ? { ...item, ...patch } : item));
  const move = (index: number, direction: -1 | 1) => setItems((current) => {
    const target = index + direction;
    if (target < 0 || target >= current.length) return current;
    const next = [...current]; [next[index], next[target]] = [next[target]!, next[index]!]; return next;
  });
  const addProduct = () => {
    const product = products.find((row) => row.id === productId);
    if (!product) return void toast.error("Choose a product in this goal's scope");
    if (items.some((item) => item.product.id === product.id)) return void toast.error("This product is already in the scenario");
    const term = product.published_term_min_months != null && product.published_term_min_months === product.published_term_max_months ? product.published_term_min_months : null;
    setItems([...items, { product, amounts: emptyAmounts(), termMonths: term, reviewStatus: "proposed", assumption: "Staff-selected hypothetical request amounts; no applicant-specific lender estimate or approval is assumed." }]);
    setProductId("none");
  };

  const snapshotFor = (item: DraftItem, index: number): SnapshotItem & { scenario_amounts: ScenarioAmounts; payment_scenarios: unknown; planner_note: string } => {
    const evaluation = evaluations.get(item.product.id) ?? emptyEvaluation;
    const payments = Object.fromEntries(SCENARIO_TIERS.map((tier) => [tier, documentedPaymentRange(item.product, item.amounts[tier], item.termMonths)]));
    return {
      product_id: item.product.id, lender: item.product.lender, product: item.product.name, product_type: item.product.product_type,
      official_url: item.product.official_url, published_min: item.product.published_min_amount, published_max: item.product.published_max_amount,
      amount_kind: item.product.amount_kind, pull_type: item.product.pull_type, status: evaluation.status, score: evaluation.score, sequence: index + 1,
      conditions: evaluation.conditions.map((condition) => ({ label: condition.label, outcome: condition.outcome, required: condition.required, observed: condition.observed, source_title: condition.source_title, source_url: condition.source_url })),
      checklist: [sequencingNote(item.product, evaluation), item.assumption].filter(Boolean), documents: [],
      client_summary: `Hypothetical request amounts: conservative ${fmtMoney(item.amounts.conservative)}, medium ${fmtMoney(item.amounts.medium)}, expanded ${fmtMoney(item.amounts.expanded)}. These are planning inputs, not expected approvals.`,
      scenario_amounts: item.amounts, payment_scenarios: payments, planner_note: item.assumption,
    };
  };

  const payloadItems = () => includedItems.map((item, index) => ({
    product_id: item.product.id, position: index + 1, review_status: item.reviewStatus, amounts: item.amounts,
    term_months: item.termMonths, assumption: item.assumption,
    evaluation: evaluations.get(item.product.id) ?? emptyEvaluation,
    sequencing_note: sequencingNote(item.product, evaluations.get(item.product.id) ?? emptyEvaluation),
    calculations: Object.fromEntries(SCENARIO_TIERS.map((tier) => [tier, calculateTierScenario([item], tier, affordabilityInput)])),
    snapshot: snapshotFor(item, index),
  }));

  const saveScenario = async (approve: boolean): Promise<string | null> => {
    if (!selectedGoal) return void toast.error("Choose the exact personal or business goal first"), null;
    if (!name.trim()) return void toast.error("Name this strategy"), null;
    if (!includedItems.length) return void toast.error("Add at least one included product"), null;
    if (items.some((item) => SCENARIO_TIERS.some((tier) => item.amounts[tier] != null && (!Number.isFinite(item.amounts[tier]) || item.amounts[tier]! <= 0)))) return void toast.error("Use a positive scenario amount or leave it blank for Unknown"), null;
    if (approve && !me.perms.can_approve_publish) return void toast.error("You do not have strategy approval permission"), null;
    if (approve && includedItems.some((item) => item.reviewStatus !== "approved")) return void toast.error("Approve every included item individually before approving the strategy"), null;
    setBusy(approve ? "approve" : "save");
    const payload = {
      client_id: clientId, goal_id: goalId, name: name.trim().slice(0, 160), items: payloadItems(),
      assumptions: assumptions.trim().slice(0, 12000), affordability_notes: (affordabilityNotes.trim() || generatedAffordability).slice(0, 12000),
      sequencing_notes: (sequencingNotes.trim() || generatedSequencing).slice(0, 12000), status: approve ? "approved" : "draft",
    };
    const result = scenarioId
      ? await supabase.from("funding_strategy_scenarios").update(payload as never).eq("id", scenarioId).select("id").single()
      : await supabase.from("funding_strategy_scenarios").insert(payload as never).select("id").single();
    setBusy("");
    if (result.error || !result.data) { toast.error(result.error?.message ?? "Scenario could not be saved"); return null; }
    setScenarioId(result.data.id);
    qc.invalidateQueries({ queryKey: ["funding-planner", clientId] });
    qc.invalidateQueries({ queryKey: ["matching", clientId] });
    toast.success(approve ? "Complete strategy approved internally; nothing was published" : "Internal scenario saved; no match run or publication created");
    return result.data.id;
  };

  const createDraft = async (id: string) => {
    setBusy(`draft-${id}`);
    const { data, error } = await supabase.rpc("create_strategy_snapshot_draft", { _scenario_id: id });
    setBusy("");
    if (error) toast.error(error.message);
    else {
      toast.success("Draft recommendation created from the approved scenario. Publish manually in Matches & publishing when ready.");
      qc.invalidateQueries({ queryKey: ["funding-planner", clientId] });
      qc.invalidateQueries({ queryKey: ["matching", clientId] });
    }
    return data;
  };

  const loadScenario = (scenario: ScenarioRow) => {
    const stored = scenario.items as unknown as StoredItem[];
    const loaded = stored.map((item) => {
      const product = products.find((row) => row.id === item.product_id);
      return product ? { product, amounts: item.amounts, termMonths: item.term_months, reviewStatus: item.review_status, assumption: item.assumption } : null;
    }).filter((item): item is DraftItem => Boolean(item));
    if (!loaded.length && stored.length) return void toast.error("Products in this scenario are unavailable");
    setGoalId(scenario.goal_id); setScenarioId(scenario.id); setItems(loaded); setName(scenario.name);
    setAssumptions(scenario.assumptions); setAffordabilityNotes(scenario.affordability_notes); setSequencingNotes(scenario.sequencing_notes);
  };

  if (!q.data) return null;
  const goalScenarios = q.data.scenarios.filter((scenario) => scenario.goal_id === goalId);
  return <div className="space-y-4">
    <Alert><AlertDescription><b>Internal hypothetical planner.</b> {PLANNER_DISCLAIMER} No scenario changes credit reports, actual match runs, lender rules or client visibility.</AlertDescription></Alert>
    <Card><CardHeader><CardTitle className="label-caps">Funding strategy planner</CardTitle></CardHeader><CardContent className="space-y-4 text-sm">
      <div className="grid gap-3 md:grid-cols-2"><div><label className="mb-1 block text-xs font-medium" htmlFor="planner-goal">Exact goal and financial scope</label><Select value={goalId} onValueChange={chooseGoal}><SelectTrigger id="planner-goal"><SelectValue placeholder="Choose a goal — no default" /></SelectTrigger><SelectContent>{q.data.goals.map((goal) => { const business = q.data.businesses.find((row) => row.id === goal.business_profile_id); return <SelectItem key={goal.id} value={goal.id}>{goal.title} — {goal.goal_type === "business" ? business?.name ?? "Business unavailable" : "Personal"}</SelectItem>; })}</SelectContent></Select></div>
        <div><label className="mb-1 block text-xs font-medium" htmlFor="planner-name">Internal strategy name</label><Input id="planner-name" value={name} disabled={locked} onChange={(event) => setName(event.target.value)} /></div></div>
      {selectedGoal && <div className="rounded border p-3 text-xs"><b>Scope:</b> {selectedGoal.title} · {selectedGoal.goal_type === "business" ? selectedBusiness?.name ?? "Business unavailable" : "Personal"}. Only this goal's answers and selected business figures feed affordability. Personal credit evidence remains separate.</div>}
      {factsQuery.error && <Alert variant="destructive"><AlertDescription>{factsQuery.error instanceof Error ? factsQuery.error.message : "Goal facts could not be loaded"}</AlertDescription></Alert>}
      {selectedGoal && <div className="flex flex-wrap items-end gap-2"><div><label className="mb-1 block text-xs font-medium">Add scoped product</label><Select value={productId} onValueChange={setProductId}><SelectTrigger className="w-80" aria-label="Planner product"><SelectValue placeholder="Choose product" /></SelectTrigger><SelectContent><SelectItem value="none">Choose product</SelectItem>{products.map((product) => <SelectItem key={product.id} value={product.id}>{product.lender} — {product.name}</SelectItem>)}</SelectContent></Select></div><Button variant="outline" disabled={locked || productId === "none"} onClick={addProduct}><Plus className="mr-2 h-4 w-4" />Add product</Button><Button variant="ghost" onClick={reset}>New scenario</Button></div>}
    </CardContent></Card>

    {items.map((item, index) => {
      const evaluation = evaluations.get(item.product.id) ?? emptyEvaluation;
      const sequence = sequencingNote(item.product, evaluation);
      return <Card key={item.product.id} className={item.reviewStatus === "rejected" ? "opacity-60" : ""}><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="label-caps text-primary">Position {index + 1}</div><CardTitle className="mt-1 text-lg">{item.product.lender} — {item.product.name}</CardTitle></div><div className="flex flex-wrap gap-2"><StatusBadge value={evaluation.status} label={MATCH_STATUS_LABEL[evaluation.status]} /><StatusBadge value={item.reviewStatus} /></div></div></CardHeader><CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">{evaluation.summary} Suitability {evaluation.score ?? "—"} is not approval probability.</p>
        <div className="text-xs text-muted-foreground">Marketed amount: {fmtMoney(item.product.published_min_amount)} – {fmtMoney(item.product.published_max_amount)} · {item.product.amount_kind === "loan_cash" ? "loan cash" : item.product.amount_kind === "credit_limit" ? "credit limit, not cash" : item.product.amount_kind === "available_credit" ? "available card credit, not cash" : "Unknown amount type"} · APR {item.product.published_apr_min ?? "?"}%–{item.product.published_apr_max ?? "?"}% · term {item.product.published_term_min_months ?? "?"}–{item.product.published_term_max_months ?? "?"} months · pull {item.product.pull_type.replaceAll("_", " ")}</div>
        <div className="grid gap-3 lg:grid-cols-3">{SCENARIO_TIERS.map((tier) => {
          const amount = item.amounts[tier]; const comparison = marketingComparison(amount, item.product); const payment = documentedPaymentRange(item.product, amount, item.termMonths);
          return <div key={tier} className="rounded border p-3"><label className="text-xs font-medium" htmlFor={`${item.product.id}-${tier}`}>{TIER_LABELS[tier]}</label><Input id={`${item.product.id}-${tier}`} className="mt-1" type="number" min={0} step="any" disabled={locked} placeholder="Unknown — no estimate" value={amount ?? ""} onChange={(event) => patchItem(item.product.id, { amounts: { ...item.amounts, [tier]: event.target.value === "" ? null : Number(event.target.value) } })} />
            <div className="mt-2 text-xs capitalize text-muted-foreground">Marketing comparison: {comparison} · payment: {payment.low == null ? "Unknown" : `${fmtMoney(payment.low)} – ${fmtMoney(payment.high)}`}</div><p className="mt-1 text-xs text-muted-foreground">{payment.reason}</p></div>;
        })}</div>
        <div className="grid gap-3 md:grid-cols-2"><div><label className="text-xs font-medium" htmlFor={`${item.product.id}-term`}>Hypothetical documented term (months)</label><Input id={`${item.product.id}-term`} type="number" step={1} disabled={locked || (item.product.published_term_min_months == null && item.product.published_term_max_months == null)} placeholder="Unknown term" value={item.termMonths ?? ""} onChange={(event) => patchItem(item.product.id, { termMonths: event.target.value === "" ? null : Number(event.target.value) })} /><p className="mt-1 text-xs text-muted-foreground">Allowed only within the owner-reviewed marketed term range. Exact availability remains unconfirmed.</p></div><div><label className="text-xs font-medium" htmlFor={`${item.product.id}-assumption`}>Item assumptions / affordability note</label><Textarea id={`${item.product.id}-assumption`} disabled={locked} value={item.assumption} onChange={(event) => patchItem(item.product.id, { assumption: event.target.value })} /></div></div>
        <div className="rounded bg-muted/40 p-3 text-xs"><b>Sequencing note:</b> {sequence}</div>
        <details><summary className="cursor-pointer text-xs font-medium">Cited eligibility conditions and sources</summary>{evaluation.conditions.length ? <ul className="mt-2 divide-y rounded border">{evaluation.conditions.map((condition) => <li key={condition.rule_id} className="p-2 text-xs"><div className="flex flex-wrap justify-between gap-2"><span><b>{condition.label}</b>: required {condition.required}; observed {condition.observed}</span><StatusBadge value={condition.outcome} /></div><a className="text-primary underline" href={condition.source_url} target="_blank" rel="noreferrer">{condition.source_title}</a> · verified {condition.verified_on}</li>)}</ul> : <p className="mt-2 text-xs text-muted-foreground">No active cited rules. Eligibility remains Needs Review.</p>}</details>
        {!locked && <div className="flex flex-wrap gap-2"><Button size="icon" variant="ghost" aria-label={`Move ${item.product.name} up`} onClick={() => move(index, -1)}><ArrowUp className="h-4 w-4" /></Button><Button size="icon" variant="ghost" aria-label={`Move ${item.product.name} down`} onClick={() => move(index, 1)}><ArrowDown className="h-4 w-4" /></Button>{me.perms.can_approve_publish && <Button size="sm" variant={item.reviewStatus === "approved" ? "default" : "outline"} onClick={() => patchItem(item.product.id, { reviewStatus: item.reviewStatus === "approved" ? "proposed" : "approved" })}><Check className="mr-1 h-4 w-4" />{item.reviewStatus === "approved" ? "Item approved" : "Approve item"}</Button>}<Button size="sm" variant="ghost" onClick={() => patchItem(item.product.id, { reviewStatus: item.reviewStatus === "rejected" ? "proposed" : "rejected" })}>{item.reviewStatus === "rejected" ? "Include again" : "Exclude"}</Button><Button size="sm" variant="ghost" aria-label={`Remove ${item.product.name}`} onClick={() => setItems(items.filter((row) => row.product.id !== item.product.id))}><Trash2 className="h-4 w-4" /></Button></div>}
      </CardContent></Card>;
    })}

    {includedItems.length > 0 && <Card><CardHeader><CardTitle className="label-caps">Cross-product scenario comparison</CardTitle></CardHeader><CardContent className="grid gap-3 lg:grid-cols-3">{tierScenarios.map((scenario) => <div key={scenario.tier} className="rounded border p-4 text-sm"><div className="label-caps text-primary">{TIER_LABELS[scenario.tier]}</div><dl className="mt-3 space-y-2"><div><dt className="text-xs text-muted-foreground">Hypothetical loan cash</dt><dd className="font-semibold">{scenario.cashTotal == null ? `Unknown · known subtotal ${fmtMoney(scenario.knownCashSubtotal)}` : fmtMoney(scenario.cashTotal)}</dd></div><div><dt className="text-xs text-muted-foreground">Revolving limits / available credit — not cash</dt><dd className="font-semibold">{scenario.revolvingLimitTotal == null ? `Unknown · known subtotal ${fmtMoney(scenario.knownRevolvingSubtotal)}` : fmtMoney(scenario.revolvingLimitTotal)}</dd></div><div><dt className="text-xs text-muted-foreground">Monthly loan payment range</dt><dd>{scenario.paymentLow == null ? "Unknown" : `${fmtMoney(scenario.paymentLow)} – ${fmtMoney(scenario.paymentHigh)}`}</dd></div><div><dt className="text-xs text-muted-foreground">Scenario DTI (personal goals)</dt><dd>{scenario.scenarioDtiLow == null ? "Unknown" : `${scenario.scenarioDtiLow}% – ${scenario.scenarioDtiHigh}%`}</dd></div><div><dt className="text-xs text-muted-foreground">Remaining business cash flow</dt><dd>{scenario.remainingBusinessCashFlowLow == null ? "Unknown" : `${fmtMoney(scenario.remainingBusinessCashFlowLow)} – ${fmtMoney(scenario.remainingBusinessCashFlowHigh)}`}</dd></div></dl><p className="mt-3 text-xs text-muted-foreground">{scenario.affordabilityNote}</p></div>)}</CardContent></Card>}

    {includedItems.length > 0 && <Card><CardHeader><CardTitle className="label-caps">Strategy assumptions and approval</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
      <div><label className="text-xs font-medium" htmlFor="planner-assumptions">Complete scenario assumptions</label><Textarea id="planner-assumptions" className="min-h-24" disabled={locked} value={assumptions} onChange={(event) => setAssumptions(event.target.value)} /></div>
      <div className="grid gap-3 md:grid-cols-2"><div><label className="text-xs font-medium" htmlFor="planner-affordability">Affordability notes</label><Textarea id="planner-affordability" className="min-h-32" disabled={locked} placeholder={generatedAffordability} value={affordabilityNotes} onChange={(event) => setAffordabilityNotes(event.target.value)} /></div><div><label className="text-xs font-medium" htmlFor="planner-sequencing">Editorial ordering / sequencing notes</label><Textarea id="planner-sequencing" className="min-h-32" disabled={locked} placeholder={generatedSequencing} value={sequencingNotes} onChange={(event) => setSequencingNotes(event.target.value)} /></div></div>
      <p className="text-xs text-muted-foreground">Blank notes use the generated math and sequencing notes above. Approval locks this scenario; publication remains a separate manual action.</p>
      {!locked && <div className="flex flex-wrap gap-2"><Button disabled={Boolean(busy)} onClick={() => saveScenario(false)}>{busy === "save" ? "Saving…" : "Save internal draft"}</Button>{me.perms.can_approve_publish && <Button variant="secondary" disabled={Boolean(busy)} onClick={() => saveScenario(true)}>{busy === "approve" ? "Approving…" : "Approve complete strategy"}</Button>}</div>}
      {selectedScenario?.status === "approved" && <Button disabled={Boolean(busy)} onClick={() => createDraft(selectedScenario.id)}><FilePlus2 className="mr-2 h-4 w-4" />{busy ? "Creating…" : "Create unpublished recommendation draft"}</Button>}
    </CardContent></Card>}

    {goalId && <Card><CardHeader><CardTitle className="label-caps">Scenario history and draft provenance</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">{goalScenarios.length === 0 ? <p className="text-muted-foreground">No saved scenarios for this goal.</p> : goalScenarios.map((scenario) => { const snapshot = q.data.snapshots.find((row) => row.source_scenario_id === scenario.id); return <div key={scenario.id} className="flex flex-wrap items-center justify-between gap-3 rounded border p-3"><div><button className="font-medium text-primary underline" onClick={() => loadScenario(scenario)}>{scenario.name}</button><div className="text-xs text-muted-foreground">Updated {fmtDate(scenario.updated_at)} · {(scenario.items as unknown[]).length} items {snapshot ? `· draft v${snapshot.version} · ${snapshot.status}` : ""}</div></div><div className="flex flex-wrap gap-2"><StatusBadge value={scenario.status} />{scenario.status === "approved" && !snapshot && <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => createDraft(scenario.id)}>Create draft</Button>}</div></div>; })}</CardContent></Card>}
    <p className="text-xs text-muted-foreground">{DISCLAIMER}</p>
  </div>;
}
