import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { Me } from "@/lib/use-me";
import { APP_STATUSES, fmtDate, fmtMoney } from "@/lib/labels";
import { guidanceItems, hasVerifiedApplicationUrl } from "@/lib/application-pipeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";

type Application = Tables<"applications">;
type Product = Tables<"lender_products">;
type Outcome = Tables<"application_outcomes">;
type Goal = Pick<Tables<"funding_goals">, "id" | "title" | "goal_type">;
type Match = Pick<Tables<"match_results">, "id" | "product_id" | "status" | "suitability_score" | "review_status">;
type Document = Pick<Tables<"documents">, "id" | "file_name" | "category">;

const OUTCOME_SOURCES = [
  ["unknown", "Source Unknown"],
  ["client_self_report", "Client self-report — unverified"],
  ["staff_observed", "Staff observation — unverified"],
  ["lender_document", "Lender document"],
  ["lender_portal", "Lender portal"],
  ["lender_direct_confirmation", "Direct lender confirmation"],
] as const;

export function ApplicationsPanel({ clientId, me }: { clientId: string; me: Me }) {
  const qc = useQueryClient();
  const can = me.perms.can_update_applications;
  const q = useQuery({
    queryKey: ["guided-applications", clientId],
    queryFn: async () => {
      const [apps, products, lenders, goals, matches, outcomes, documents] = await Promise.all([
        supabase.from("applications").select("*").eq("client_id", clientId).order("status_date", { ascending: false }),
        supabase.from("lender_products").select("*").order("name"),
        supabase.from("lenders").select("id, name").order("name"),
        supabase.from("funding_goals").select("id, title, goal_type").eq("client_id", clientId).order("created_at"),
        supabase.from("match_results").select("id, product_id, status, suitability_score, review_status").eq("client_id", clientId),
        supabase.from("application_outcomes").select("*").eq("client_id", clientId),
        supabase.from("documents").select("id, file_name, category").eq("client_id", clientId).order("created_at", { ascending: false }),
      ]);
      const firstError = [apps, products, lenders, goals, matches, outcomes, documents].find((result) => result.error)?.error;
      if (firstError) throw firstError;
      return {
        apps: apps.data ?? [], products: products.data ?? [], lenders: lenders.data ?? [], goals: goals.data ?? [],
        matches: matches.data ?? [], outcomes: outcomes.data ?? [], documents: documents.data ?? [],
      };
    },
  });
  const [productId, setProductId] = useState("other");
  const [goalId, setGoalId] = useState("none");
  const [matchId, setMatchId] = useState("none");
  const [label, setLabel] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["guided-applications", clientId] });
  const lenderName = (id: string) => q.data?.lenders.find((lender) => lender.id === id)?.name ?? "Lender";
  const chooseProduct = (id: string) => {
    setProductId(id); setMatchId("none");
    const product = q.data?.products.find((item) => item.id === id);
    setLabel(product ? `${lenderName(product.lender_id)} — ${product.name}` : "");
  };
  const add = async () => {
    if (!label.trim()) return void toast.error("Choose a product or enter an unlisted lender/product label");
    const { error } = await supabase.from("applications").insert({
      client_id: clientId,
      product_id: productId === "other" ? null : productId,
      goal_id: goalId === "none" ? null : goalId,
      match_result_id: matchId === "none" ? null : matchId,
      lender_label: label.trim().slice(0, 160),
      updated_by: me.id,
    });
    if (error) return void toast.error(error.message);
    toast.success("Application tracking created; nothing was submitted");
    setLabel(""); setProductId("other"); setGoalId("none"); setMatchId("none"); refresh();
  };

  return <div className="space-y-4">
    <Card><CardHeader><CardTitle className="label-caps">Guided application pipeline</CardTitle><p className="text-sm text-muted-foreground">Staff open official lender destinations and record actual status. This tool never submits an application. Status changes create no dashboard notice, email, SMS, reminder, or follow-up task.</p></CardHeader>
      <CardContent className="space-y-4">
        {can && <div className="grid gap-2 rounded border border-dashed p-3 md:grid-cols-2">
          <Select value={productId} onValueChange={chooseProduct}><SelectTrigger aria-label="Application product"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="other">Other / unlisted product</SelectItem>{(q.data?.products ?? []).map((product) => <SelectItem key={product.id} value={product.id}>{lenderName(product.lender_id)} — {product.name}</SelectItem>)}</SelectContent></Select>
          <Input aria-label="Application lender label" placeholder="Lender / product applied to" value={label} onChange={(event) => setLabel(event.target.value)} />
          <Select value={goalId} onValueChange={setGoalId}><SelectTrigger aria-label="Application goal"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No goal linked</SelectItem>{(q.data?.goals ?? []).map((goal) => <SelectItem key={goal.id} value={goal.id}>{goal.title} — {goal.goal_type}</SelectItem>)}</SelectContent></Select>
          <Select value={matchId} onValueChange={setMatchId} disabled={productId === "other"}><SelectTrigger aria-label="Original recommendation"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No original recommendation linked</SelectItem>{(q.data?.matches ?? []).filter((match) => match.product_id === productId).map((match) => <SelectItem key={match.id} value={match.id}>{match.status.replace(/_/g, " ")} · suitability {match.suitability_score ?? "—"} · {match.review_status}</SelectItem>)}</SelectContent></Select>
          <Button className="md:col-span-2 justify-self-start" onClick={add}><Plus className="mr-2 h-4 w-4" />Track application — do not submit</Button>
        </div>}
        {q.isLoading && <p className="text-sm text-muted-foreground">Loading applications…</p>}
        {q.error && <p className="text-sm text-destructive">Could not load applications: {q.error.message}</p>}
        {q.data?.apps.length === 0 && <p className="text-sm text-muted-foreground">No applications tracked. Create a staff tracking record when the client is ready; no lender application is created here.</p>}
        {q.data?.apps.map((application) => <ApplicationCard key={application.id} application={application} product={q.data!.products.find((product) => product.id === application.product_id) ?? null} goals={q.data!.goals} matches={q.data!.matches} outcome={q.data!.outcomes.find((outcome) => outcome.application_id === application.id) ?? null} documents={q.data!.documents} can={can} me={me} onDone={refresh} />)}
      </CardContent></Card>
  </div>;
}

function ApplicationCard({ application, product, goals, matches, outcome, documents, can, me, onDone }: {
  application: Application; product: Product | null; goals: Goal[]; matches: Match[]; outcome: Outcome | null; documents: Document[]; can: boolean; me: Me; onDone: () => void;
}) {
  const [status, setStatus] = useState(application.status);
  const [statusDate, setStatusDate] = useState(application.status_date.slice(0, 10));
  const [goalId, setGoalId] = useState(application.goal_id ?? "none");
  const [matchId, setMatchId] = useState(application.match_result_id ?? "none");
  const [source, setSource] = useState(outcome?.outcome_source ?? "unknown");
  const [verification, setVerification] = useState(outcome?.verification_status ?? "unverified");
  const [amount, setAmount] = useState(outcome?.approved_amount?.toString() ?? "");
  const [apr, setApr] = useState(outcome?.approved_apr?.toString() ?? "");
  const [term, setTerm] = useState(outcome?.approved_term_months?.toString() ?? "");
  const [denialReason, setDenialReason] = useState(outcome?.denial_reason ?? "");
  const [denialBureau, setDenialBureau] = useState(outcome?.denial_bureau ?? "");
  const [denialModel, setDenialModel] = useState(outcome?.denial_score_model ?? "");
  const [evidence, setEvidence] = useState(outcome?.evidence_document_id ?? "none");
  const [sourceNote, setSourceNote] = useState(outcome?.source_note ?? "");
  const checklist = guidanceItems(product?.application_checklist);
  const requiredDocuments = guidanceItems(product?.required_documents);
  const match = matches.find((item) => item.id === application.match_result_id);

  const saveApplication = async () => {
    const { error } = await supabase.from("applications").update({
      status, status_date: new Date(`${statusDate}T12:00:00`).toISOString(), goal_id: goalId === "none" ? null : goalId,
      match_result_id: matchId === "none" ? null : matchId, updated_by: me.id,
    }).eq("id", application.id);
    if (error) return void toast.error(error.message);
    toast.success("Status saved; no notifications or follow-up tasks created"); onDone();
  };
  const saveOutcome = async () => {
    const { error } = await supabase.from("application_outcomes").upsert({
      application_id: application.id, client_id: application.client_id, outcome_source: source, verification_status: verification,
      approved_amount: amount ? Number(amount) : null, approved_apr: apr ? Number(apr) : null, approved_term_months: term ? Number(term) : null,
      denial_reason: denialReason.trim() || null, denial_bureau: denialBureau.trim() || null, denial_score_model: denialModel.trim() || null,
      evidence_document_id: evidence === "none" ? null : evidence, source_note: sourceNote.trim() || null,
    });
    if (error) return void toast.error(error.message);
    toast.success("Outcome evidence saved separately from the recommendation"); onDone();
  };

  return <article className="space-y-4 rounded-lg border p-4 text-sm">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-base font-semibold">{application.lender_label}</h3><div className="mt-1 flex flex-wrap items-center gap-2"><StatusBadge value={application.status} label={APP_STATUSES.find((item) => item.value === application.status)?.label} /><span className="text-xs text-muted-foreground">Status date {fmtDate(application.status_date)}</span>{outcome && <StatusBadge value={outcome.verification_status === "staff_verified" ? "verified" : "unknown"} label={outcome.verification_status === "staff_verified" ? "lender evidence verified" : "outcome unverified"} />}</div></div>{product?.official_url && <a href={product.official_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary underline">Official product source<ExternalLink className="h-3 w-3" /></a>}</div>
    {match && <div className="rounded bg-muted p-3 text-xs"><b>Original recommendation remains separate:</b> {match.status.replace(/_/g, " ")} · suitability {match.suitability_score ?? "—"} · review {match.review_status}. An actual outcome never rewrites this recommendation.</div>}
    {product && <div className="grid gap-3 lg:grid-cols-2">
      <section className="rounded border p-3"><div className="label-caps text-muted-foreground">Verified application destination</div>
        {hasVerifiedApplicationUrl(product) ? <><a href={product.application_url!} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 font-medium text-primary underline">Open official application / rate-check page<ExternalLink className="h-4 w-4" /></a><p className="mt-1 text-xs text-muted-foreground">Destination verified {product.application_url_verified_on} · <a href={product.application_url_source_url!} target="_blank" rel="noreferrer" className="underline">source</a>. Opens the lender; nothing is submitted by Loan Scout.</p></> : <p className="mt-2 text-xs text-muted-foreground">No verified application destination yet. A lender home page is not substituted.</p>}
        {product.application_pull_risk && <p className="mt-3 text-xs"><b>Documented pull risk:</b> {product.application_pull_risk} <a href={product.pull_risk_source_url!} target="_blank" rel="noreferrer" className="underline">Source</a> · {product.pull_risk_verified_on}</p>}
      </section>
      <section className="rounded border p-3"><div className="label-caps text-muted-foreground">Sourced preparation checklist</div>
        {checklist.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">{checklist.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="mt-2 text-xs text-muted-foreground">No sourced preparation checklist recorded.</p>}
        <div className="label-caps mt-3 text-muted-foreground">Documents stated by the lender</div>
        {requiredDocuments.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">{requiredDocuments.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="mt-2 text-xs text-muted-foreground">Unknown — no sourced document list is recorded; this does not mean no documents are required.</p>}
        {product.application_guidance_source_url && <a href={product.application_guidance_source_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs underline">Checklist source · {product.application_guidance_verified_on}</a>}
      </section>
    </div>}
    {can ? <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-2 rounded bg-muted p-3"><div className="label-caps">Status and recommendation link</div><div className="grid gap-2 sm:grid-cols-2"><Select value={status} onValueChange={setStatus}><SelectTrigger aria-label={`Status for ${application.lender_label}`}><SelectValue /></SelectTrigger><SelectContent>{APP_STATUSES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select><Input aria-label={`Status date for ${application.lender_label}`} type="date" value={statusDate} onChange={(event) => setStatusDate(event.target.value)} /><Select value={goalId} onValueChange={setGoalId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No goal linked</SelectItem>{goals.map((goal) => <SelectItem key={goal.id} value={goal.id}>{goal.title}</SelectItem>)}</SelectContent></Select><Select value={matchId} onValueChange={setMatchId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No original recommendation</SelectItem>{matches.filter((item) => !application.product_id || item.product_id === application.product_id).map((item) => <SelectItem key={item.id} value={item.id}>{item.status.replace(/_/g, " ")} · {item.review_status}</SelectItem>)}</SelectContent></Select></div><Button size="sm" onClick={saveApplication}>Save status / links</Button></section>
      <section className="space-y-2 rounded bg-muted p-3"><div className="label-caps">Optional outcome evidence · Q70 fields undecided</div><p className="text-xs text-muted-foreground">Every amount, APR, term, and denial field is optional. Self-reports remain unverified. Saving evidence does not change status.</p><div className="grid gap-2 sm:grid-cols-2"><Select value={source} onValueChange={setSource}><SelectTrigger aria-label={`Outcome source for ${application.lender_label}`}><SelectValue /></SelectTrigger><SelectContent>{OUTCOME_SOURCES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select><Select value={verification} onValueChange={setVerification}><SelectTrigger aria-label={`Outcome verification for ${application.lender_label}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unverified">Unverified</SelectItem><SelectItem value="staff_verified">Staff verified — lender evidence</SelectItem></SelectContent></Select><Input type="number" min="0" aria-label="Optional approved amount" placeholder="Approved amount $ (optional)" value={amount} onChange={(event) => setAmount(event.target.value)} /><Input type="number" min="0" step="0.01" aria-label="Optional approved APR" placeholder="Approved APR % (optional)" value={apr} onChange={(event) => setApr(event.target.value)} /><Input type="number" min="1" step="1" aria-label="Optional approved term" placeholder="Term months (optional)" value={term} onChange={(event) => setTerm(event.target.value)} /><Select value={evidence} onValueChange={setEvidence}><SelectTrigger aria-label="Outcome evidence document"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No evidence document linked</SelectItem>{documents.map((document) => <SelectItem key={document.id} value={document.id}>{document.file_name} · {document.category}</SelectItem>)}</SelectContent></Select></div><Textarea aria-label="Optional denial reason" placeholder="Denial reason (optional; use lender wording, do not infer)" value={denialReason} onChange={(event) => setDenialReason(event.target.value)} /><div className="grid gap-2 sm:grid-cols-2"><Input aria-label="Optional denial bureau" placeholder="Denial bureau (optional)" value={denialBureau} onChange={(event) => setDenialBureau(event.target.value)} /><Input aria-label="Optional denial score model" placeholder="Exact score model (optional)" value={denialModel} onChange={(event) => setDenialModel(event.target.value)} /></div><Textarea aria-label="Outcome source note" placeholder="Evidence locator / provenance note (required for verification without a document)" value={sourceNote} onChange={(event) => setSourceNote(event.target.value)} /><Button size="sm" variant="secondary" onClick={saveOutcome}>Save outcome evidence only</Button></section>
    </div> : <p className="text-xs text-muted-foreground">You can view application guidance and outcomes, but only staff with application permission can edit them.</p>}
    {outcome && <div className="text-xs text-muted-foreground">Outcome source: {outcome.outcome_source.replace(/_/g, " ")} · recorded {fmtDate(outcome.reported_at)}{outcome.approved_amount != null && <> · amount {fmtMoney(outcome.approved_amount)}</>}{outcome.approved_apr != null && <> · APR {outcome.approved_apr}%</>}{outcome.approved_term_months != null && <> · {outcome.approved_term_months} months</>}</div>}
  </article>;
}
