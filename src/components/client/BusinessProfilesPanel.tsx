import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { businessAnalysis } from "@/lib/business-funding";
import { fmtDate, fmtMoney } from "@/lib/labels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";

type BusinessProfile = Tables<"business_profiles">;
const formKeys = ["name", "industry", "location_state", "formation_date", "lifecycle_status", "months_in_business", "annual_revenue", "monthly_revenue", "monthly_net_cash_flow", "monthly_expenses", "existing_monthly_debt_payments", "banking_history_months", "average_monthly_deposits", "owner_share_pct", "business_credit_score", "business_credit_model", "business_credit_source_url", "business_credit_verified_on", "source_note", "financial_source", "verification_status"] as const;
type FormKey = typeof formKeys[number];
type FormState = Record<FormKey, string>;

const numberFields = ["annual_revenue", "monthly_revenue", "monthly_net_cash_flow", "monthly_expenses", "existing_monthly_debt_payments", "banking_history_months", "average_monthly_deposits", "owner_share_pct", "months_in_business", "business_credit_score"] as const;

function blankForm(staff: boolean): FormState {
  return { name: "", industry: "", location_state: "", formation_date: "", lifecycle_status: "unknown", months_in_business: "", annual_revenue: "", monthly_revenue: "", monthly_net_cash_flow: "", monthly_expenses: "", existing_monthly_debt_payments: "", banking_history_months: "", average_monthly_deposits: "", owner_share_pct: "", business_credit_score: "", business_credit_model: "", business_credit_source_url: "", business_credit_verified_on: "", source_note: "", financial_source: staff ? "staff_entered" : "self_reported", verification_status: "self_reported" };
}

function toForm(profile: BusinessProfile): FormState {
  const form = blankForm(false);
  for (const [key, value] of Object.entries(profile)) if (formKeys.includes(key as FormKey)) form[key as FormKey] = value == null ? "" : String(value);
  return form;
}

export function BusinessProfilesPanel({ clientId, staff, onChanged }: { clientId: string; staff: boolean; onChanged?: () => void }) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState("");
  const [editing, setEditing] = useState(false);
  const query = useQuery({
    queryKey: ["business-profiles", clientId],
    queryFn: async () => (await supabase.from("business_profiles").select("*").eq("client_id", clientId).order("created_at")).data ?? [],
  });
  const profiles = query.data ?? [];
  const creating = selectedId === "new";
  const selected = creating ? null : profiles.find((profile) => profile.id === selectedId) ?? profiles[0] ?? null;
  const refresh = () => { qc.invalidateQueries({ queryKey: ["business-profiles", clientId] }); qc.invalidateQueries({ queryKey: ["goals", clientId] }); onChanged?.(); };

  return <Card>
    <CardHeader>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><CardTitle className="label-caps">Business profiles</CardTitle><p className="mt-1 text-sm text-muted-foreground">Separate financial identity for each business. Reuse one profile across any number of goals.</p></div>
        <Button variant="outline" onClick={() => { setSelectedId("new"); setEditing(true); }}><Plus className="mr-2 h-4 w-4" />Add a business</Button>
      </div>
    </CardHeader>
    <CardContent className="space-y-4">
      <p className="rounded border border-gold bg-muted/40 p-3 text-xs text-muted-foreground">Financial fields are optional and labeled self-reported until staff review. Leave a value unknown; it is never converted to zero. Lender age, ownership and financial requirements remain unknown unless documented and owner-approved.</p>
      {profiles.length === 0 && !creating && <div className="rounded border border-dashed p-5 text-sm"><div className="font-medium">No business profiles yet.</div><p className="mt-1 text-muted-foreground">Create a business here once, then link it to one or more business funding goals.</p></div>}
      {profiles.length > 0 && <div className="grid gap-3 lg:grid-cols-2">{profiles.map((profile) => <BusinessSummary key={profile.id} profile={profile} selected={selected?.id === profile.id && !creating} onSelect={() => { setSelectedId(profile.id); setEditing(false); }} />)}</div>}
      {creating || (selected && editing) ? <BusinessForm key={creating ? "new" : selected!.id} clientId={clientId} staff={staff} profile={selected} onCancel={() => { setEditing(false); setSelectedId(selected?.id ?? ""); }} onSaved={(id) => { setSelectedId(id); setEditing(false); refresh(); }} /> : selected ? <BusinessDetail clientId={clientId} profile={selected} staff={staff} onEdit={() => setEditing(true)} /> : null}
    </CardContent>
  </Card>;
}

function BusinessSummary({ profile, selected, onSelect }: { profile: BusinessProfile; selected: boolean; onSelect: () => void }) {
  const analysis = businessAnalysis(profile);
  return <button type="button" onClick={onSelect} className={`rounded border p-4 text-left transition-colors ${selected ? "border-primary bg-accent" : "hover:bg-muted/40"}`}>
    <div className="flex items-start justify-between gap-2"><div className="font-medium">{profile.name}</div><StatusBadge value={profile.verification_status === "verified" ? "verified" : "pending"} label={profile.verification_status === "verified" ? "Verified" : profile.verification_status === "reviewed" ? "Reviewed · unverified" : "Self-reported"} /></div>
    <div className="mt-1 text-xs capitalize text-muted-foreground">{profile.lifecycle_status} · {profile.location_state || "State unknown"} · {profile.industry || "Industry unknown"}</div>
    <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><span>Annual revenue <b>{profile.annual_revenue == null ? "Unknown" : fmtMoney(profile.annual_revenue)}</b></span><span>Monthly revenue <b>{profile.monthly_revenue == null ? "Unknown" : fmtMoney(profile.monthly_revenue)}</b></span><span>Monthly expenses <b>{profile.monthly_expenses == null ? "Unknown" : fmtMoney(profile.monthly_expenses)}</b></span><span>Calculated net cash flow <b>{analysis.calculatedNetCashFlow == null ? "Unknown" : fmtMoney(analysis.calculatedNetCashFlow)}</b></span></div>
  </button>;
}

function BusinessDetail({ clientId, profile, staff, onEdit }: { clientId: string; profile: BusinessProfile; staff: boolean; onEdit: () => void }) {
  const analysis = businessAnalysis(profile);
  const items: [string, string][] = [
    ["Industry", profile.industry ?? "Unknown"], ["State", profile.location_state ?? "Unknown"], ["Formation / start date", profile.formation_date ? fmtDate(profile.formation_date) : "Unknown"],
    ["Months operating", profile.months_in_business == null ? "Unknown" : String(profile.months_in_business)], ["Annual revenue", profile.annual_revenue == null ? "Unknown" : fmtMoney(profile.annual_revenue)],
    ["Monthly revenue", profile.monthly_revenue == null ? "Unknown" : fmtMoney(profile.monthly_revenue)], ["Monthly expenses", profile.monthly_expenses == null ? "Unknown" : fmtMoney(profile.monthly_expenses)],
    ["Reported monthly net cash flow", profile.monthly_net_cash_flow == null ? "Unknown" : fmtMoney(profile.monthly_net_cash_flow)], ["Monthly business debt payments", profile.existing_monthly_debt_payments == null ? "Unknown" : fmtMoney(profile.existing_monthly_debt_payments)],
    ["Banking history", profile.banking_history_months == null ? "Unknown" : `${profile.banking_history_months} months`], ["Average monthly deposits", profile.average_monthly_deposits == null ? "Unknown" : fmtMoney(profile.average_monthly_deposits)],
    ["Owner share", profile.owner_share_pct == null ? "Unknown" : `${profile.owner_share_pct}%`],
  ];
  return <div className="space-y-4 rounded border p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-lg font-semibold"><Building2 className="h-5 w-5 text-primary" />{profile.name}</div><p className="text-xs capitalize text-muted-foreground">{profile.lifecycle_status} · {profile.financial_source.replaceAll("_", " ")} · {profile.verification_status.replaceAll("_", " ")}</p></div><Button variant="outline" onClick={onEdit}><Pencil className="mr-2 h-4 w-4" />Edit business</Button></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{items.map(([label, value]) => <div key={label} className="rounded bg-muted/40 p-3 text-sm"><div className="label-caps text-[0.6rem] text-muted-foreground">{label}</div><div className="mt-1 font-medium">{value}</div></div>)}</div>
    <div className="grid gap-3 md:grid-cols-2"><div className="rounded border p-3 text-sm"><div className="label-caps text-muted-foreground">Calculated monthly net cash flow</div><div className="mt-1 font-display text-3xl">{analysis.calculatedNetCashFlow == null ? "Unknown" : fmtMoney(analysis.calculatedNetCashFlow)}</div><p className="text-xs text-muted-foreground">Monthly revenue minus monthly expenses, only when both are supplied. Annual and monthly periods are not mixed.</p></div><div className="rounded border p-3 text-sm"><div className="label-caps text-muted-foreground">Illustrative cash-flow coverage</div><div className="mt-1 font-display text-3xl">{analysis.cashFlowCoverage == null ? "Unknown" : `${analysis.cashFlowCoverage.toFixed(2)}×`}</div><p className="text-xs text-muted-foreground">Monthly net cash flow ÷ monthly business debt payments. This is simple math, not a lender-specific DSCR or an eligibility threshold.</p></div></div>
    {(profile.business_credit_score != null || profile.business_credit_model) && <div className="rounded border p-3 text-sm"><b>Business credit:</b> {profile.business_credit_model ?? "Model unknown"} · {profile.business_credit_score ?? "Score unknown"} · sourced {profile.business_credit_verified_on} · <a className="text-primary underline" href={profile.business_credit_source_url!} target="_blank" rel="noreferrer">Source</a></div>}
    {profile.source_note && <p className="text-sm text-muted-foreground">Source note: {profile.source_note}</p>}
    <BusinessFollowUps clientId={clientId} businessId={profile.id} staff={staff} />
  </div>;
}

function BusinessForm({ clientId, staff, profile, onSaved, onCancel }: { clientId: string; staff: boolean; profile: BusinessProfile | null; onSaved: (id: string) => void; onCancel: () => void }) {
  const [form, setForm] = useState<FormState>(() => profile ? toForm(profile) : blankForm(staff));
  const [busy, setBusy] = useState(false);
  const set = (key: FormKey, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const save = async () => {
    if (!form.name.trim()) return void toast.error("Enter a legal or operating name to keep this business distinct");
    setBusy(true);
    const payload: Record<string, unknown> = { client_id: clientId, name: form.name.trim().slice(0, 160), industry: form.industry.trim() || null, location_state: form.location_state.trim().toUpperCase() || null, formation_date: form.formation_date || null, lifecycle_status: form.lifecycle_status, business_credit_model: form.business_credit_model.trim() || null, business_credit_source_url: form.business_credit_source_url.trim() || null, business_credit_verified_on: form.business_credit_verified_on || null, source_note: form.source_note.trim().slice(0, 1000) || null, financial_source: staff ? form.financial_source : "self_reported", verification_status: staff ? form.verification_status : profile?.verification_status ?? "self_reported" };
    for (const key of numberFields) payload[key] = form[key].trim() === "" ? null : Number(form[key]);
    if (Object.values(payload).some((value) => typeof value === "number" && !Number.isFinite(value))) { setBusy(false); return void toast.error("Enter valid numbers or choose Unknown / skip"); }
    const result = profile ? await supabase.from("business_profiles").update(payload as never).eq("id", profile.id).select("id").single() : await supabase.from("business_profiles").insert(payload as never).select("id").single();
    setBusy(false);
    if (result.error || !result.data) return void toast.error(result.error?.message ?? "Business could not be saved");
    toast.success(profile ? "Business updated; existing goals still use this profile" : "Business created independently of a goal"); onSaved(result.data.id);
  };
  return <div className="space-y-4 rounded border p-4"><div><div className="label-caps">{profile ? "Edit business" : "New business"}</div><p className="text-sm text-muted-foreground">Only the name is required to distinguish the profile. Every financial field has an explicit Unknown / skip control.</p></div>
    <div className="grid gap-3 md:grid-cols-2"><div><label className="text-sm font-medium" htmlFor="business-name">Legal or operating name</label><Input id="business-name" value={form.name} onChange={(event) => set("name", event.target.value)} /></div><div><label className="text-sm font-medium" htmlFor="business-industry">Industry (optional)</label><Input id="business-industry" value={form.industry} onChange={(event) => set("industry", event.target.value)} /></div><div><label className="text-sm font-medium" htmlFor="business-state">Location / state (optional)</label><Input id="business-state" maxLength={40} value={form.location_state} onChange={(event) => set("location_state", event.target.value)} /></div><div><label className="text-sm font-medium">Business stage</label><Select value={form.lifecycle_status} onValueChange={(value) => set("lifecycle_status", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unknown">Unknown / skip</SelectItem><SelectItem value="startup">Startup</SelectItem><SelectItem value="established">Established</SelectItem></SelectContent></Select></div></div>
    <div className="grid gap-3 md:grid-cols-2"><OptionalField id="formation_date" label="Formation / start date" type="date" value={form.formation_date} onChange={(value) => set("formation_date", value)} /><OptionalNumber id="months_in_business" label="Months operating (if no date)" value={form.months_in_business} onChange={(value) => set("months_in_business", value)} /></div>
    <div className="label-caps text-muted-foreground">Optional financial information</div><div className="grid gap-3 md:grid-cols-2"><OptionalNumber id="annual_revenue" label="Annual revenue" value={form.annual_revenue} onChange={(value) => set("annual_revenue", value)} /><OptionalNumber id="monthly_revenue" label="Monthly revenue" value={form.monthly_revenue} onChange={(value) => set("monthly_revenue", value)} /><OptionalNumber id="monthly_expenses" label="Monthly expenses" value={form.monthly_expenses} onChange={(value) => set("monthly_expenses", value)} /><OptionalNumber id="monthly_net_cash_flow" label="Reported monthly net cash flow" value={form.monthly_net_cash_flow} onChange={(value) => set("monthly_net_cash_flow", value)} /><OptionalNumber id="existing_monthly_debt_payments" label="Existing monthly business debt payments" value={form.existing_monthly_debt_payments} onChange={(value) => set("existing_monthly_debt_payments", value)} /><OptionalNumber id="banking_history_months" label="Banking / deposit history (months)" value={form.banking_history_months} onChange={(value) => set("banking_history_months", value)} /><OptionalNumber id="average_monthly_deposits" label="Average monthly deposits" value={form.average_monthly_deposits} onChange={(value) => set("average_monthly_deposits", value)} /><OptionalNumber id="owner_share_pct" label="Owner share (%)" value={form.owner_share_pct} onChange={(value) => set("owner_share_pct", value)} /></div>
    <div className="label-caps text-muted-foreground">Business credit — only with a source</div><div className="grid gap-3 md:grid-cols-2"><OptionalNumber id="business_credit_score" label="Business credit score" value={form.business_credit_score} onChange={(value) => set("business_credit_score", value)} /><OptionalField id="business_credit_model" label="Exact business credit model" value={form.business_credit_model} onChange={(value) => set("business_credit_model", value)} /><OptionalField id="business_credit_source_url" label="Business credit source URL" type="url" value={form.business_credit_source_url} onChange={(value) => set("business_credit_source_url", value)} /><OptionalField id="business_credit_verified_on" label="Business credit source date" type="date" value={form.business_credit_verified_on} onChange={(value) => set("business_credit_verified_on", value)} /></div>
    <div><label className="text-sm font-medium" htmlFor="source-note">Source / provenance note (optional)</label><Textarea id="source-note" value={form.source_note} onChange={(event) => set("source_note", event.target.value)} placeholder="Where these figures came from; no document proof is required." /></div>
    {staff ? <div className="grid gap-3 md:grid-cols-2"><div><label className="text-sm font-medium">Financial source</label><Select value={form.financial_source} onValueChange={(value) => set("financial_source", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="self_reported">Self-reported</SelectItem><SelectItem value="staff_entered">Staff-entered</SelectItem><SelectItem value="document_backed">Document-backed</SelectItem></SelectContent></Select></div><div><label className="text-sm font-medium">Verification status</label><Select value={form.verification_status} onValueChange={(value) => set("verification_status", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="self_reported">Self-reported / unverified</SelectItem><SelectItem value="reviewed">Reviewed / unverified</SelectItem><SelectItem value="verified">Verified by staff</SelectItem></SelectContent></Select></div></div> : <p className="text-xs text-muted-foreground">Your entries stay self-reported. Editing financial details also returns a previously verified profile to self-reported for staff review.</p>}
    <div className="flex gap-2"><Button disabled={busy} onClick={save}>{busy ? "Saving…" : profile ? "Save business changes" : "Create business"}</Button><Button variant="outline" onClick={onCancel}>Cancel</Button></div>
  </div>;
}

function OptionalNumber({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return <OptionalField id={id} label={label} type="number" value={value} onChange={onChange} />;
}
function OptionalField({ id, label, value, onChange, type = "text" }: { id: string; label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <div><div className="flex items-center justify-between gap-2"><label className="text-sm font-medium" htmlFor={id}>{label}</label><button type="button" className="text-xs text-primary underline" onClick={() => onChange("")}>I don’t know / Skip for now</button></div><Input id={id} type={type} min={type === "number" && id !== "monthly_net_cash_flow" ? 0 : undefined} step={type === "number" ? "any" : undefined} value={value} onChange={(event) => onChange(event.target.value)} placeholder={type === "number" ? "Unknown" : undefined} /></div>;
}

const followUpQuestions = [{ key: "business_cash_on_hand", label: "Business cash on hand" }, { key: "business_collateral_value", label: "Estimated business collateral value" }];
function BusinessFollowUps({ clientId, businessId, staff }: { clientId: string; businessId: string; staff: boolean }) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["business-followups", businessId], queryFn: async () => {
    const [answers, goals] = await Promise.all([supabase.from("business_questionnaire_answers").select("*").eq("business_profile_id", businessId), supabase.from("funding_goals").select("id", { count: "exact", head: true }).eq("business_profile_id", businessId)]);
    return { answers: answers.data ?? [], hasGoal: (goals.count ?? 0) > 0 };
  } });
  if (!query.data?.hasGoal) return <p className="rounded border border-dashed p-3 text-xs text-muted-foreground">Conditional business follow-ups appear after this profile is linked to a funding goal.</p>;
  return <div className="space-y-3 rounded border p-3"><div><div className="label-caps text-muted-foreground">Conditional follow-ups for this business</div><p className="text-xs text-muted-foreground">Answers are tied to this business ID, never shared with another business. Each may remain unknown.</p></div>{followUpQuestions.map((question) => <BusinessAnswerRow key={question.key} clientId={clientId} businessId={businessId} question={question} staff={staff} existing={query.data?.answers.find((answer) => answer.question_key === question.key)} onSaved={() => qc.invalidateQueries({ queryKey: ["business-followups", businessId] })} />)}</div>;
}

function BusinessAnswerRow({ clientId, businessId, question, staff, existing, onSaved }: { clientId: string; businessId: string; question: { key: string; label: string }; staff: boolean; existing?: Tables<"business_questionnaire_answers"> | undefined; onSaved: () => void }) {
  const [value, setValue] = useState(existing?.value_numeric == null ? "" : String(existing.value_numeric));
  const save = async (skip: boolean, verify = false) => {
    if (!skip && (value.trim() === "" || !Number.isFinite(Number(value)) || Number(value) < 0)) return void toast.error("Enter a valid amount or choose Skip");
    const { error } = await supabase.from("business_questionnaire_answers").upsert({ client_id: clientId, business_profile_id: businessId, question_key: question.key, value_numeric: skip ? null : Number(value), status: skip ? "skipped" : "answered", verified: staff && verify && !skip, financial_source: staff ? "staff_entered" : "self_reported" }, { onConflict: "business_profile_id,question_key" });
    if (error) return void toast.error(error.message);
    if (skip) setValue(""); toast.success(skip ? "Marked unknown" : "Business-specific answer saved"); onSaved();
  };
  return <div className="rounded border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><label className="text-sm font-medium" htmlFor={`${businessId}-${question.key}`}>{question.label}</label><StatusBadge value={existing?.verified ? "verified" : "pending"} label={existing?.status === "answered" ? existing.verified ? "Verified" : "Self-reported" : "Unknown"} /></div><div className="mt-2 flex flex-wrap gap-2"><Input id={`${businessId}-${question.key}`} className="max-w-xs" type="number" min={0} value={value} onChange={(event) => setValue(event.target.value)} /><Button size="sm" onClick={() => save(false)}>Save</Button>{staff && <Button size="sm" variant="secondary" onClick={() => save(false, true)}>Save as verified</Button>}<Button size="sm" variant="outline" onClick={() => save(true)}>I don’t know / Skip for now</Button></div></div>;
}
