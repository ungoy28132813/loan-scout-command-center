import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Me } from "@/lib/use-me";
import { REPORT_FIELDS, SCORE_MODELS, fmtDate } from "@/lib/labels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { StatusBadge } from "@/components/StatusBadge";
import { extractStoredReport, saveExtraction } from "@/lib/credit-report-parser/save";
import { PdfReadError } from "@/lib/credit-report-parser/pdf";
import { HistoricalComparison, UtilizationSimulator } from "@/components/client/Phase2Analysis";
import type { AnalysisReport } from "@/lib/credit-analysis";
import { recalculateInternalMatches } from "@/lib/internal-matching";

const BUREAUS = ["experian", "equifax", "transunion"] as const;
const STATUSES = ["awaiting_manual_entry", "partial", "unreadable", "clearer_pdf_requested", "complete_unverified", "verified"];

function submissionCounts(payload: unknown) {
  const p = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  return { scores: Array.isArray(p["scores"]) ? p["scores"].length : 0, fields: Array.isArray(p["fields"]) ? p["fields"].length : 0, tradelines: Array.isArray(p["tradelines"]) ? p["tradelines"].length : 0 };
}
function submissionStatus(payload: unknown) {
  return payload && typeof payload === "object" && typeof (payload as Record<string, unknown>)["status"] === "string" ? String((payload as Record<string, unknown>)["status"]) : "unknown";
}

export function ReportsPanel({ clientId, me, activeRuleCount, onChanged }: { clientId: string; me: Me; activeRuleCount: number; onChanged: () => void }) {
  const qc = useQueryClient();
  const canEdit = me.perms.can_edit_extractions;
  const q = useQuery({ queryKey: ["reports", clientId], queryFn: async () => {
    const [r, f, c, t, tc] = await Promise.all([
      supabase.from("credit_reports").select("*, documents(file_name, storage_path)").eq("client_id", clientId).order("created_at", { ascending: false }),
      supabase.from("report_fields").select("*").eq("client_id", clientId),
      supabase.from("field_corrections").select("*").eq("client_id", clientId).order("created_at", { ascending: false }),
      supabase.from("tradelines").select("*").eq("client_id", clientId),
      supabase.from("tradeline_corrections").select("*").eq("client_id", clientId).order("created_at", { ascending: false }),
    ]);
    return { reports: r.data ?? [], fields: f.data ?? [], corrections: c.data ?? [], tradelines: t.data ?? [], tradelineCorrections: tc.data ?? [] };
  } });
  const submissions = useQuery({
    queryKey: ["client-extraction-submissions", clientId],
    queryFn: async () => (await supabase.from("client_extraction_submissions").select("id, report_id, review_status, reviewed_by, payload, created_at").eq("client_id", clientId).order("created_at", { ascending: false })).data ?? [],
  });
  const [sel, setSel] = useState<string | null>(null);
  const [submissionBusy, setSubmissionBusy] = useState<string | null>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["reports", clientId] });
    qc.invalidateQueries({ queryKey: ["client-extraction-submissions", clientId] });
    onChanged();
  };
  const importSubmission = async (id: string) => {
    setSubmissionBusy(id);
    const { error } = await supabase.rpc("import_client_extraction", { _submission_id: id });
    if (error) toast.error(error.message); else toast.success("Imported once; readable values follow the owner's automatic-confirmation policy. Nothing was published.");
    setSubmissionBusy(null); refresh();
  };
  const afterValidatedUpdate = async () => {
    refresh();
    qc.invalidateQueries({ queryKey: ["matching", clientId] });
    if (!me.perms.can_run_matching) {
      toast.info("Evidence saved. A teammate with Run matching permission can recalculate internal matches.");
      return;
    }
    try {
      const result = await recalculateInternalMatches(clientId);
      if (result.runs) toast.success(`Recalculated ${result.runs} internal match run(s); nothing was published.`);
      qc.invalidateQueries({ queryKey: ["matching", clientId] });
    } catch (error) {
      toast.error(`Evidence saved, but internal recalculation needs attention: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  };
  const acceptSubmission = async (id: string) => {
    if (!window.confirm("Accept this whole automatic read? Staff acceptance allows these values to feed matching. Client recommendations still require separate review and publication.")) return;
    setSubmissionBusy(id);
    const { error } = await supabase.rpc("accept_client_extraction", { _submission_id: id });
    if (error) toast.error(error.message); else { toast.success("Automatic read accepted for internal matching."); await afterValidatedUpdate(); }
    setSubmissionBusy(null); refresh();
  };
  const acceptStaffRead = async (reportId: string) => {
    if (!window.confirm("Confirm that you reviewed this whole automatic read against the PDF? This confirms all values for internal matching, but publishes nothing.")) return;
    const { error } = await supabase.rpc("accept_staff_extraction", { _report_id: reportId });
    if (error) toast.error(error.message); else { toast.success("Whole report accepted for internal matching."); await afterValidatedUpdate(); }
  };
  if (!q.data) return null;
  const report = q.data.reports.find((r) => r.id === (sel ?? q.data.reports[0]?.id));
  const analysisReports: AnalysisReport[] = q.data.reports.map((r) => ({ id: r.id, report_date: r.report_date, created_at: r.created_at, extraction_status: r.extraction_status, file_name: (r.documents as { file_name?: string } | null)?.file_name ?? null }));

  const setStatus = async (s: string) => {
    if (!report) return;
    const { error } = await supabase.from("credit_reports").update({ extraction_status: s }).eq("id", report.id);
    if (error) return void toast.error(error.message);
    if (s === "clearer_pdf_requested") {
      await supabase.from("announcements").insert({ client_id: clientId, title: "Clearer credit report needed", body: "We couldn't reliably read one of your uploaded credit reports. Please upload a clearer, complete PDF (all pages, text not image-scanned if possible) under My documents → Credit Reports.", kind: "document_request" });
    }
    refresh();
  };

  return (
    <div className="space-y-4">
      <Alert><AlertDescription>Text extraction and English-language OCR run <b>inside your browser</b>; report images and text are never sent to an AI or cloud OCR service. OCR is limited to 20 scanned pages. Read values are received automatically, but <b>staff verification is required before matching</b>. Low-confidence or conflicting fields stay <b>Unknown</b>. Check source pages and confidence before relying on a value. Corrections need a reason and are audited. Missing or unreadable values remain <b>Unknown</b>; recommendations are never published automatically.</AlertDescription></Alert>
      {!!submissions.data?.length && <Card>
        <CardHeader><CardTitle className="label-caps">Client automatic reads</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">Clients can parse only their own consented PDFs locally. Successful reads are imported automatically as unverified evidence. Staff must check and accept them before matching. Publication remains a separate staff decision.</p>
          {submissions.data.map((s) => {
            const counts = submissionCounts(s.payload);
            const linked = q.data.reports.find((r) => r.id === s.report_id);
            const name = (linked?.documents as { file_name?: string } | null)?.file_name ?? "Credit report";
            const unreadable = submissionStatus(s.payload) === "unreadable";
            return <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded border p-3 text-sm">
              <div><div className="font-medium">{name}</div><div className="text-xs text-muted-foreground">{counts.scores} scores · {counts.fields} fields · {counts.tradelines} accounts · {s.review_status.replace(/_/g, " ")} · {fmtDate(s.created_at)}</div></div>
              <div className="flex items-center gap-2">
                <StatusBadge value={s.review_status === "accepted" && s.reviewed_by ? "verified" : "pending"} label={s.review_status === "accepted" && s.reviewed_by ? "staff verified" : "awaiting staff verification"} />
                {s.review_status === "pending_review" && <Button size="sm" variant="secondary" disabled={!canEdit || submissionBusy === s.id} onClick={() => importSubmission(s.id)}>Import for review</Button>}
                {s.review_status === "imported" && !unreadable && <Button size="sm" disabled={!canEdit || submissionBusy === s.id} onClick={() => acceptSubmission(s.id)}>Accept all & use in matching</Button>}
                {s.review_status === "imported" && unreadable && <span className="text-xs text-warning">Unreadable — request a searchable PDF</span>}
              </div>
            </div>;
          })}
        </CardContent>
      </Card>}
      {q.data.reports.length === 0 ? <Card><CardContent className="p-6 text-sm text-muted-foreground">No credit reports uploaded. Upload a PDF under Documents → Credit Reports.</CardContent></Card> : <>
        <div className="flex flex-wrap gap-2">{q.data.reports.map((r) => (
          <Button key={r.id} size="sm" variant={r.id === report?.id ? "default" : "outline"} onClick={() => setSel(r.id)}>
            {(r.documents as { file_name: string } | null)?.file_name?.slice(0, 28) ?? "Report"} · {r.report_type}
          </Button>))}</div>
        {report && (
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
              <div><CardTitle className="label-caps">Report snapshot</CardTitle><div className="text-xs text-muted-foreground">Uploaded {fmtDate(report.created_at)} · method: {report.extraction_method}</div></div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge value={report.extraction_status === "verified" ? "verified" : ["unreadable", "clearer_pdf_requested"].includes(report.extraction_status) ? "fail" : "pending"} label={report.extraction_status.replace(/_/g, " ")} />
                {canEdit && <Select value={report.extraction_status} onValueChange={setStatus}><SelectTrigger className="w-56"><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}</SelectContent></Select>}
                {canEdit && <ReportMeta report={report} onSaved={refresh} />}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <AutoExtract report={report} clientId={clientId} canEdit={canEdit} hasData={q.data.fields.some((f) => f.report_id === report.id) || q.data.tradelines.some((t) => t.report_id === report.id)} currentNeedsReview={q.data.fields.filter((f) => f.report_id === report.id && f.needs_review).length + q.data.tradelines.filter((t) => t.report_id === report.id && t.needs_review).length} onDone={refresh} onAccepted={() => acceptStaffRead(report.id)} />
              <FieldGrid report={report} fields={q.data.fields.filter((f) => f.report_id === report.id)} canEdit={canEdit} clientId={clientId} onSaved={afterValidatedUpdate} />
              <Tradelines report={report} all={q.data.tradelines.filter((t) => t.report_id === report.id)} canEdit={canEdit} clientId={clientId} onSaved={afterValidatedUpdate} />
            </CardContent>
          </Card>
        )}
        {report && <UtilizationSimulator report={analysisReports.find((r) => r.id === report.id)!} tradelines={q.data.tradelines} activeRuleCount={activeRuleCount} />}
        <HistoricalComparison reports={analysisReports} fields={q.data.fields} tradelines={q.data.tradelines} />
        <Card><CardHeader><CardTitle className="label-caps">Correction history</CardTitle></CardHeader><CardContent>
          {q.data.corrections.length === 0 && q.data.tradelineCorrections.length === 0 ? <p className="text-sm text-muted-foreground">No corrections.</p> : <>
            <ul className="divide-y text-sm">{q.data.corrections.map((c) => <li key={c.id} className="py-2">{fmtDate(c.created_at)} · score/field: {String(c.old_value ?? "Unknown")} → {String(c.new_value ?? "Unknown")} · <span className="text-muted-foreground">{c.reason}{c.source_ref ? ` (source: ${c.source_ref})` : ""}</span></li>)}</ul>
            <ul className="divide-y text-sm">{q.data.tradelineCorrections.map((c) => <li key={c.id} className="py-2">{fmtDate(c.created_at)} · account fields: {c.changed_fields.length ? c.changed_fields.join(", ") : "confirmation only"} · <span className="text-muted-foreground">{c.reason}{c.source_ref ? ` (source: ${c.source_ref})` : ""}</span></li>)}</ul>
          </>}
        </CardContent></Card>
      </>}
    </div>
  );
}

function ReportMeta({ report, onSaved }: { report: { id: string; report_type: string; report_date: string | null }; onSaved: () => void }) {
  const [type, setType] = useState(report.report_type); const [date, setDate] = useState(report.report_date ?? "");
  const save = async () => { const { error } = await supabase.from("credit_reports").update({ report_type: type, report_date: date || null }).eq("id", report.id); if (error) toast.error(error.message); else onSaved(); };
  return <div className="flex gap-2">
    <Select value={type} onValueChange={setType}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent>{["tri_merge", "experian", "equifax", "transunion", "unknown"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" aria-label="Report date" />
    <Button size="sm" variant="secondary" onClick={save}>Save</Button>
  </div>;
}

type Field = { id: string; bureau: string; field_key: string; score_model: string | null; value: number | null; status: string; source_ref: string | null; needs_review?: boolean; confidence?: string | null; source_page?: number | null; score_date?: string | null };

function Flags({ f }: { f?: Field | undefined }) {
  if (!f) return null;
  return <>
    {f.status === "extracted" && <span className="ml-1 text-[0.6rem] text-muted-foreground" title={f.source_ref ?? ""}>auto{f.source_page ? ` p${f.source_page}` : ""}{f.confidence ? ` · ${f.confidence}` : ""}</span>}
    {f.needs_review && <span className="ml-1 text-[0.6rem] font-semibold text-warning">review</span>}
  </>;
}

function AutoExtract({ report, clientId, canEdit, hasData, currentNeedsReview, onDone, onAccepted }: { report: { id: string; extraction_method: string; extraction_status: string; extraction_summary: unknown; documents: unknown }; clientId: string; canEdit: boolean; hasData: boolean; currentNeedsReview: number; onDone: () => void; onAccepted: () => Promise<void> }) {
  const [state, setState] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const summary = report.extraction_summary as { pages?: number; bureaus?: string[]; scores?: number; fields?: number; tradelines?: number; needs_review?: number; ocr_used?: boolean; warnings?: string[] } | null;
  const run = async () => {
    const path = (report.documents as { storage_path?: string } | null)?.storage_path;
    if (!path) return void toast.error("Stored file not found");
    setState("Opening private file…");
    try {
      const r = await extractStoredReport(path, (d, t, stage) => setState(stage === "ocr" ? `Local OCR: page ${d} of ${t}…` : `Reading page ${d} of ${t}…`));
      const saved = await saveExtraction(report.id, clientId, r);
      if (!saved.ok) toast.error(saved.error); else toast.success("Report read — check values flagged for review, then re-run matching");
    } catch (e) { toast.error(e instanceof PdfReadError ? e.message : "The PDF could not be read"); }
    setState(null); onDone();
  };
  return <div className="space-y-2">
    {summary && <div className="rounded border p-3 text-sm">
      <div className="label-caps mb-1 text-muted-foreground">Automatic read summary</div>
      <div>{summary.pages ?? "?"} page(s) · bureaus found: {summary.bureaus?.length ? summary.bureaus.join(", ") : "none"} · {summary.scores ?? 0} score(s), {summary.fields ?? 0} field(s), {summary.tradelines ?? 0} account entr{summary.tradelines === 1 ? "y" : "ies"} · <span className={currentNeedsReview ? "font-semibold text-warning" : ""}>{currentNeedsReview} currently need review</span>{summary.ocr_used ? " · local OCR used" : ""}</div>
      {!!summary.warnings?.length && <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">{summary.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
    </div>}
    {canEdit && report.extraction_method !== "automated" && !hasData && <div className="flex flex-wrap items-center gap-3">
      <Button size="sm" variant="secondary" onClick={run} disabled={!!state}>{state ?? "Read this PDF automatically"}</Button>
      <span className="text-xs text-muted-foreground">SmartCredit, IdentityIQ, MyScoreIQ and similar, best effort. Text and English OCR stay in this browser.</span>
    </div>}
    {canEdit && hasData && report.extraction_status !== "verified" && !["unreadable", "awaiting_manual_entry", "clearer_pdf_requested"].includes(report.extraction_status) && <div className="flex flex-wrap items-center gap-3 rounded border border-primary p-3">
      <Button size="sm" disabled={accepting} onClick={async () => { setAccepting(true); await onAccepted(); setAccepting(false); }}>{accepting ? "Accepting…" : "Accept whole read & recalculate"}</Button>
      <span className="text-xs text-muted-foreground">Review against the PDF first. This confirms every value for internal matching; it never publishes recommendations.</span>
    </div>}
  </div>;
}

function FieldGrid({ report, fields, canEdit, clientId, onSaved }: { report: { id: string; report_type: string }; fields: Field[]; canEdit: boolean; clientId: string; onSaved: () => void }) {
  const bureaus = report.report_type === "tri_merge" || report.report_type === "unknown" ? BUREAUS : [report.report_type as (typeof BUREAUS)[number]];
  const [edit, setEdit] = useState<{ bureau: string; key: string; model: string | null; existing?: Field | undefined } | null>(null);
  const [scoreB, setScoreB] = useState<string>(bureaus[0]); const [scoreM, setScoreM] = useState(SCORE_MODELS[0]!);
  const get = (b: string, k: string, m: string | null = null) => fields.find((f) => f.bureau === b && f.field_key === k && (f.score_model ?? null) === m);
  const cell = (b: string, k: string, m: string | null = null) => {
    const f = get(b, k, m);
    return <button disabled={!canEdit} onClick={() => setEdit({ bureau: b, key: k, model: m, existing: f })} className="w-full rounded px-2 py-1 text-left hover:bg-muted disabled:hover:bg-transparent">
      {f?.value != null ? <span className="font-medium">{f.value}</span> : <span className="text-muted-foreground">Unknown</span>}
      {f?.status === "corrected" && <span className="ml-1 text-[0.6rem] text-warning">corrected</span>}
      <Flags f={f} />
    </button>;
  };
  const scores = fields.filter((f) => f.field_key === "score");
  return (
    <div className="space-y-4">
      <div>
        <div className="label-caps mb-2 text-muted-foreground">Scores (bureau + model kept separate — never interchangeable)</div>
        <div className="flex flex-wrap gap-2">{scores.length === 0 && <span className="text-sm text-muted-foreground">No scores entered.</span>}
          {scores.map((s) => <button key={s.id} disabled={!canEdit} onClick={() => setEdit({ bureau: s.bureau, key: "score", model: s.score_model, existing: s })} className="rounded border px-3 py-2 text-left text-sm"><div className="label-caps text-[0.6rem] text-muted-foreground">{s.bureau} · {s.score_model ?? "Model not stated"}</div><div className="font-display text-2xl">{s.value ?? "Unknown"}</div><div>{s.score_date && <span className="text-[0.6rem] text-muted-foreground">as of {fmtDate(s.score_date)}</span>}<Flags f={s} /></div></button>)}</div>
        {canEdit && <div className="mt-2 flex flex-wrap gap-2">
          <Select value={scoreB} onValueChange={setScoreB}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent>{bureaus.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent></Select>
          <Select value={scoreM} onValueChange={setScoreM}><SelectTrigger className="w-52"><SelectValue /></SelectTrigger><SelectContent>{SCORE_MODELS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select>
          <Button size="sm" variant="outline" onClick={() => setEdit({ bureau: scoreB, key: "score", model: scoreM, existing: get(scoreB, "score", scoreM) })}>Add / edit score</Button>
        </div>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead><tr><th className="p-2 text-left label-caps text-muted-foreground">Field</th>{bureaus.map((b) => <th key={b} className="p-2 text-left label-caps">{b}</th>)}</tr></thead>
          <tbody className="divide-y">{REPORT_FIELDS.map(([k, label]) => <tr key={k}><td className="p-2 text-muted-foreground">{label}</td>{bureaus.map((b) => <td key={b} className="p-1">{cell(b, k)}</td>)}</tr>)}</tbody>
        </table>
      </div>
      {edit && <EditField edit={edit} reportId={report.id} clientId={clientId} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); onSaved(); }} />}
    </div>
  );
}

function EditField({ edit, reportId, clientId, onClose, onSaved }: { edit: { bureau: string; key: string; model: string | null; existing?: Field | undefined }; reportId: string; clientId: string; onClose: () => void; onSaved: () => void }) {
  const [val, setVal] = useState(edit.existing?.value != null ? String(edit.existing.value) : "");
  const [reason, setReason] = useState(""); const [src, setSrc] = useState(edit.existing?.source_ref ?? "");
  const isCorrection = edit.existing?.value != null;
  const save = async () => {
    const v = val.trim() === "" ? null : Number(val);
    if (v != null && Number.isNaN(v)) return void toast.error("Enter a number, or leave empty for Unknown");
    if (isCorrection && v !== edit.existing?.value && reason.trim().length < 5) return void toast.error("A reason is required for corrections");
    if (edit.existing) {
      const { error } = await supabase.from("report_fields").update({ value: v, status: isCorrection && v !== edit.existing.value ? "corrected" : v == null ? "unknown" : edit.existing.status === "extracted" ? "extracted" : "entered", needs_review: false, source_ref: src || null, updated_at: new Date().toISOString() }).eq("id", edit.existing.id);
      if (error) return void toast.error(error.message);
      if (isCorrection && v !== edit.existing.value) await supabase.from("field_corrections").insert({ field_id: edit.existing.id, client_id: clientId, old_value: edit.existing.value, new_value: v, reason: reason.slice(0, 500), source_ref: src || null });
    } else {
      const { error } = await supabase.from("report_fields").insert({ report_id: reportId, client_id: clientId, bureau: edit.bureau, field_key: edit.key, score_model: edit.model, value: v, status: v == null ? "unknown" : "entered", source_ref: src || null });
      if (error) return void toast.error(error.message);
    }
    toast.success("Saved — validated facts will refresh internal matches when permitted"); onSaved();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{edit.bureau} · {edit.key === "score" ? (edit.model ?? "score — model not stated") : edit.key.replace(/_/g, " ")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Value (empty = Unknown)" inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} />
          <Input placeholder="Source reference (e.g. PDF page 3)" value={src} onChange={(e) => setSrc(e.target.value)} />
          {edit.existing?.needs_review && <p className="text-xs text-warning">Read automatically and flagged for review{edit.existing.source_page ? ` (page ${edit.existing.source_page})` : ""}. Check it against the PDF; saving an unchanged value confirms it.</p>}
          {isCorrection && <Input placeholder="Reason for correction (required if changed)" value={reason} onChange={(e) => setReason(e.target.value)} />}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type TL = { id: string; report_id: string; bureau: string; creditor: string; account_type: string | null; account_ref_last4: string | null; balance: number | null; credit_limit: number | null; is_open: boolean | null; late_count: number | null; is_collection: boolean; is_chargeoff: boolean; reconcile_key: string | null; source_page: number | null; extracted?: boolean; needs_review?: boolean };

function Tradelines({ report, all, canEdit, clientId, onSaved }: { report: { id: string; report_type: string }; all: TL[]; canEdit: boolean; clientId: string; onSaved: () => void }) {
  const [review, setReview] = useState<TL | null>(null);
  const [f, setF] = useState({ bureau: report.report_type === "tri_merge" || report.report_type === "unknown" ? "experian" : report.report_type, creditor: "", last4: "", type: "revolving", balance: "", limit: "", open: "yes", late: "", collection: "no", chargeoff: "no" });
  const add = async () => {
    if (!f.creditor.trim()) return;
    const key = `${f.creditor.trim().toLowerCase().replace(/\s+/g, " ")}|${f.last4.trim()}`;
    const { error } = await supabase.from("tradelines").insert({ report_id: report.id, client_id: clientId, bureau: f.bureau, creditor: f.creditor.slice(0, 80), account_ref_last4: f.last4.slice(-4) || null, account_type: f.type, balance: f.balance ? Number(f.balance) : null, credit_limit: f.limit ? Number(f.limit) : null, is_open: f.open === "unknown" ? null : f.open === "yes", late_count: f.late ? Number(f.late) : null, is_collection: f.collection === "yes", is_chargeoff: f.chargeoff === "yes", reconcile_key: key });
    if (error) return void toast.error(error.message);
    setF({ ...f, creditor: "", last4: "", balance: "", limit: "", late: "" }); onSaved();
  };
  const groups = new Map<string, TL[]>();
  for (const t of all) { const k = t.reconcile_key ?? t.id; groups.set(k, [...(groups.get(k) ?? []), t]); }
  return (
    <div>
      <div className="label-caps mb-2 text-muted-foreground">Accounts — conservative bureau reconciliation ({groups.size} groups, {all.length} bureau entries)</div>
      <p className="mb-2 text-xs text-muted-foreground">Repeated identities remain separate for duplicate review. A missing account on another report is never treated as a confirmed removal.</p>
      <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm">
        <thead><tr className="text-left text-muted-foreground"><th className="p-2">Account</th><th className="p-2">Bureaus reporting</th><th className="p-2">Balance / limit / utilization</th><th className="p-2">Lates</th><th className="p-2">Flags and review</th></tr></thead>
        <tbody className="divide-y">{[...groups.values()].map((g) => <tr key={g[0]!.id}>
          <td className="p-2 font-medium">{g[0]!.creditor}{g[0]!.account_ref_last4 ? ` ··${g[0]!.account_ref_last4}` : ""}<div className="text-xs text-muted-foreground">{g[0]!.account_type ?? "type unknown"}{g.some((t) => t.extracted) && " · auto"}{g.some((t) => t.needs_review) && <span className="font-semibold text-warning"> · review</span>}</div></td>
          <td className="p-2">{g.map((t) => t.bureau).join(", ")}</td>
          <td className="p-2 text-xs">{g.map((t) => { const util = t.balance != null && t.credit_limit != null && t.credit_limit > 0 ? `${Math.round(t.balance / t.credit_limit * 1000) / 10}%` : "Unknown"; return <div key={t.id}>{t.bureau}: {t.balance ?? "?"} / {t.credit_limit ?? "?"} / {util}{t.source_page ? ` · p${t.source_page}` : ""}</div>; })}</td>
          <td className="p-2 text-xs">{g.map((t) => <div key={t.id}>{t.bureau}: {t.late_count ?? "Unknown"}</div>)}</td>
          <td className="p-2"><div className="flex flex-wrap gap-1">{g.some((t) => t.is_collection) && <StatusBadge value="fail" label="collection" />}{g.some((t) => t.is_chargeoff) && <StatusBadge value="fail" label="charge-off" />}{g.some((t) => t.is_open === false) && <StatusBadge value="draft" label="closed" />}{canEdit && g.map((t) => <Button key={t.id} size="sm" variant="ghost" onClick={() => setReview(t)}>Review {t.bureau}</Button>)}</div></td>
        </tr>)}</tbody></table></div>
      {canEdit && <div className="mt-3 grid gap-2 sm:grid-cols-5">
        <Select value={f.bureau} onValueChange={(v) => setF({ ...f, bureau: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{BUREAUS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent></Select>
        <Input placeholder="Creditor" value={f.creditor} onChange={(e) => setF({ ...f, creditor: e.target.value })} />
        <Input placeholder="Last 4 (for reconciliation)" value={f.last4} onChange={(e) => setF({ ...f, last4: e.target.value })} />
        <Select value={f.type} onValueChange={(v) => setF({ ...f, type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["revolving", "installment", "mortgage", "auto", "student", "other"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
        <Input placeholder="Balance" inputMode="decimal" value={f.balance} onChange={(e) => setF({ ...f, balance: e.target.value })} />
        <Input placeholder="Limit / original" inputMode="decimal" value={f.limit} onChange={(e) => setF({ ...f, limit: e.target.value })} />
        <Input placeholder="Late count" inputMode="numeric" value={f.late} onChange={(e) => setF({ ...f, late: e.target.value })} />
        <Select value={f.open} onValueChange={(v) => setF({ ...f, open: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="yes">Open</SelectItem><SelectItem value="no">Closed</SelectItem><SelectItem value="unknown">Unknown</SelectItem></SelectContent></Select>
        <Select value={f.collection} onValueChange={(v) => setF({ ...f, collection: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="no">Not collection</SelectItem><SelectItem value="yes">Collection</SelectItem></SelectContent></Select>
        <Select value={f.chargeoff} onValueChange={(v) => setF({ ...f, chargeoff: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="no">Not charge-off</SelectItem><SelectItem value="yes">Charge-off</SelectItem></SelectContent></Select>
        <Button onClick={add}>Add account entry</Button>
      </div>}
      {review && <TradelineReview tradeline={review} onClose={() => setReview(null)} onSaved={() => { setReview(null); onSaved(); }} />}
    </div>
  );
}

function TradelineReview({ tradeline, onClose, onSaved }: { tradeline: TL; onClose: () => void; onSaved: () => void }) {
  const [balance, setBalance] = useState(tradeline.balance == null ? "" : String(tradeline.balance));
  const [limit, setLimit] = useState(tradeline.credit_limit == null ? "" : String(tradeline.credit_limit));
  const [late, setLate] = useState(tradeline.late_count == null ? "" : String(tradeline.late_count));
  const [open, setOpen] = useState(tradeline.is_open == null ? "unknown" : tradeline.is_open ? "yes" : "no");
  const [collection, setCollection] = useState(tradeline.is_collection ? "yes" : "no");
  const [chargeoff, setChargeoff] = useState(tradeline.is_chargeoff ? "yes" : "no");
  const [page, setPage] = useState(tradeline.source_page == null ? "" : String(tradeline.source_page));
  const [reason, setReason] = useState("");
  const [sourceRef, setSourceRef] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const number = (value: string) => value.trim() ? Number(value) : null;
    const b = number(balance), l = number(limit), lateCount = number(late), sourcePage = number(page);
    if ([b, l, lateCount, sourcePage].some((value) => value != null && (!Number.isFinite(value) || value < 0)) || (lateCount != null && !Number.isInteger(lateCount)) || (sourcePage != null && (!Number.isInteger(sourcePage) || sourcePage > 80))) return void toast.error("Use valid non-negative values; pages are whole numbers from 1 to 80");
    if (reason.trim().length < 5) return void toast.error("Give a reason of at least 5 characters, including for confirmation");
    setBusy(true);
    const { error } = await supabase.rpc("correct_tradeline", {
      _tradeline_id: tradeline.id, _balance: b, _credit_limit: l, _late_count: lateCount,
      _is_open: open === "unknown" ? null : open === "yes", _is_collection: collection === "yes", _is_chargeoff: chargeoff === "yes",
      _source_page: sourcePage, _reason: reason.trim(), _source_ref: sourceRef.trim() || null,
    } as never);
    setBusy(false);
    if (error) return void toast.error(error.message);
    toast.success("Account confirmed and correction reason audited"); onSaved();
  };
  return <Dialog open onOpenChange={(value) => !value && onClose()}><DialogContent>
    <DialogHeader><DialogTitle>Review {tradeline.creditor} · {tradeline.bureau}{tradeline.account_ref_last4 ? ` ··${tradeline.account_ref_last4}` : ""}</DialogTitle></DialogHeader>
    <div className="grid gap-3 sm:grid-cols-2">
      <Input aria-label="Account balance" placeholder="Balance (empty = Unknown)" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} />
      <Input aria-label="Account credit limit" placeholder="Credit limit (empty = Unknown)" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} />
      <Input aria-label="Account late count" placeholder="Late count (empty = Unknown)" inputMode="numeric" value={late} onChange={(e) => setLate(e.target.value)} />
      <Input aria-label="Account source page" placeholder="PDF page" inputMode="numeric" value={page} onChange={(e) => setPage(e.target.value)} />
      <Select value={open} onValueChange={setOpen}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="yes">Open</SelectItem><SelectItem value="no">Closed</SelectItem><SelectItem value="unknown">Open status Unknown</SelectItem></SelectContent></Select>
      <Select value={collection} onValueChange={setCollection}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="no">Not collection</SelectItem><SelectItem value="yes">Collection</SelectItem></SelectContent></Select>
      <Select value={chargeoff} onValueChange={setChargeoff}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="no">Not charge-off</SelectItem><SelectItem value="yes">Charge-off</SelectItem></SelectContent></Select>
      <Input aria-label="Account correction source" placeholder="Source reference (optional)" value={sourceRef} onChange={(e) => setSourceRef(e.target.value)} />
    </div>
    <Textarea aria-label="Account correction reason" placeholder="Reason for correction or confirmation (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
    <p className="text-xs text-muted-foreground">Only changed field names and your reason are added to the correction audit; old and new account values are not copied into that audit.</p>
    <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={busy} onClick={save}>{busy ? "Saving…" : "Confirm account"}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
