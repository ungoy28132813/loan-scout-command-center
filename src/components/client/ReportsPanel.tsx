import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Me } from "@/lib/use-me";
import { REPORT_FIELDS, SCORE_MODELS, fmtDate } from "@/lib/labels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { StatusBadge } from "@/components/StatusBadge";

const BUREAUS = ["experian", "equifax", "transunion"] as const;
const STATUSES = ["awaiting_manual_entry", "partial", "unreadable", "clearer_pdf_requested", "complete_unverified", "verified"];

export function ReportsPanel({ clientId, me, onChanged }: { clientId: string; me: Me; onChanged: () => void }) {
  const qc = useQueryClient();
  const canEdit = me.perms.can_edit_extractions;
  const q = useQuery({ queryKey: ["reports", clientId], queryFn: async () => {
    const [r, f, c, t] = await Promise.all([
      supabase.from("credit_reports").select("*, documents(file_name)").eq("client_id", clientId).order("created_at", { ascending: false }),
      supabase.from("report_fields").select("*").eq("client_id", clientId),
      supabase.from("field_corrections").select("*").eq("client_id", clientId).order("created_at", { ascending: false }),
      supabase.from("tradelines").select("*").eq("client_id", clientId),
    ]);
    return { reports: r.data ?? [], fields: f.data ?? [], corrections: c.data ?? [], tradelines: t.data ?? [] };
  } });
  const [sel, setSel] = useState<string | null>(null);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["reports", clientId] }); onChanged(); };
  if (!q.data) return null;
  const report = q.data.reports.find((r) => r.id === (sel ?? q.data.reports[0]?.id));

  const setStatus = async (s: string) => {
    if (!report) return;
    const { error } = await supabase.from("credit_reports").update({ extraction_status: s }).eq("id", report.id);
    if (error) return toast.error(error.message);
    if (s === "clearer_pdf_requested") {
      await supabase.from("announcements").insert({ client_id: clientId, title: "Clearer credit report needed", body: "We couldn't reliably read one of your uploaded credit reports. Please upload a clearer, complete PDF (all pages, text not image-scanned if possible) under My documents → Credit Reports.", kind: "document_request" });
    }
    refresh();
  };

  return (
    <div className="space-y-4">
      <Alert><AlertDescription>Automated PDF extraction is <b>not implemented</b> in Phase 1. Values below are entered by staff from the source PDF; every change after the first entry requires a reason and is audited. Anything not entered stays <b>Unknown</b>.</AlertDescription></Alert>
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
              <FieldGrid report={report} fields={q.data.fields.filter((f) => f.report_id === report.id)} canEdit={canEdit} clientId={clientId} onSaved={refresh} />
              <Tradelines report={report} all={q.data.tradelines} canEdit={canEdit} clientId={clientId} onSaved={refresh} />
            </CardContent>
          </Card>
        )}
        <Card><CardHeader><CardTitle className="label-caps">Correction history</CardTitle></CardHeader><CardContent>
          {q.data.corrections.length === 0 ? <p className="text-sm text-muted-foreground">No corrections.</p> :
            <ul className="divide-y text-sm">{q.data.corrections.map((c) => <li key={c.id} className="py-2">{fmtDate(c.created_at)} · {String(c.old_value ?? "Unknown")} → {String(c.new_value ?? "Unknown")} · <span className="text-muted-foreground">{c.reason}{c.source_ref ? ` (source: ${c.source_ref})` : ""}</span></li>)}</ul>}
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

type Field = { id: string; bureau: string; field_key: string; score_model: string | null; value: number | null; status: string; source_ref: string | null };

function FieldGrid({ report, fields, canEdit, clientId, onSaved }: { report: { id: string; report_type: string }; fields: Field[]; canEdit: boolean; clientId: string; onSaved: () => void }) {
  const bureaus = report.report_type === "tri_merge" || report.report_type === "unknown" ? BUREAUS : [report.report_type as (typeof BUREAUS)[number]];
  const [edit, setEdit] = useState<{ bureau: string; key: string; model: string | null; existing?: Field } | null>(null);
  const [scoreB, setScoreB] = useState<string>(bureaus[0]); const [scoreM, setScoreM] = useState(SCORE_MODELS[0]!);
  const get = (b: string, k: string, m: string | null = null) => fields.find((f) => f.bureau === b && f.field_key === k && (f.score_model ?? null) === m);
  const cell = (b: string, k: string, m: string | null = null) => {
    const f = get(b, k, m);
    return <button disabled={!canEdit} onClick={() => setEdit({ bureau: b, key: k, model: m, existing: f })} className="w-full rounded px-2 py-1 text-left hover:bg-muted disabled:hover:bg-transparent">
      {f?.value != null ? <span className="font-medium">{f.value}</span> : <span className="text-muted-foreground">Unknown</span>}
      {f?.status === "corrected" && <span className="ml-1 text-[0.6rem] text-warning">corrected</span>}
    </button>;
  };
  const scores = fields.filter((f) => f.field_key === "score");
  return (
    <div className="space-y-4">
      <div>
        <div className="label-caps mb-2 text-muted-foreground">Scores (bureau + model kept separate — never interchangeable)</div>
        <div className="flex flex-wrap gap-2">{scores.length === 0 && <span className="text-sm text-muted-foreground">No scores entered.</span>}
          {scores.map((s) => <button key={s.id} disabled={!canEdit} onClick={() => setEdit({ bureau: s.bureau, key: "score", model: s.score_model, existing: s })} className="rounded border px-3 py-2 text-left text-sm"><div className="label-caps text-[0.6rem] text-muted-foreground">{s.bureau} · {s.score_model}</div><div className="font-display text-2xl">{s.value ?? "Unknown"}</div></button>)}</div>
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

function EditField({ edit, reportId, clientId, onClose, onSaved }: { edit: { bureau: string; key: string; model: string | null; existing?: Field }; reportId: string; clientId: string; onClose: () => void; onSaved: () => void }) {
  const [val, setVal] = useState(edit.existing?.value != null ? String(edit.existing.value) : "");
  const [reason, setReason] = useState(""); const [src, setSrc] = useState(edit.existing?.source_ref ?? "");
  const isCorrection = edit.existing?.value != null;
  const save = async () => {
    const v = val.trim() === "" ? null : Number(val);
    if (v != null && Number.isNaN(v)) return toast.error("Enter a number, or leave empty for Unknown");
    if (isCorrection && reason.trim().length < 5) return toast.error("A reason is required for corrections");
    if (edit.existing) {
      const { error } = await supabase.from("report_fields").update({ value: v, status: isCorrection ? "corrected" : v == null ? "unknown" : "entered", source_ref: src || null, updated_at: new Date().toISOString() }).eq("id", edit.existing.id);
      if (error) return toast.error(error.message);
      if (isCorrection) await supabase.from("field_corrections").insert({ field_id: edit.existing.id, client_id: clientId, old_value: edit.existing.value, new_value: v, reason: reason.slice(0, 500), source_ref: src || null });
    } else {
      const { error } = await supabase.from("report_fields").insert({ report_id: reportId, client_id: clientId, bureau: edit.bureau, field_key: edit.key, score_model: edit.model, value: v, status: v == null ? "unknown" : "entered", source_ref: src || null });
      if (error) return toast.error(error.message);
    }
    toast.success("Saved — re-run matching to recalculate"); onSaved();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{edit.bureau} · {edit.model ?? edit.key.replace(/_/g, " ")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Value (empty = Unknown)" inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} />
          <Input placeholder="Source reference (e.g. PDF page 3)" value={src} onChange={(e) => setSrc(e.target.value)} />
          {isCorrection && <Input placeholder="Reason for correction (required)" value={reason} onChange={(e) => setReason(e.target.value)} />}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type TL = { id: string; report_id: string; bureau: string; creditor: string; account_type: string | null; account_ref_last4: string | null; balance: number | null; credit_limit: number | null; is_open: boolean | null; late_count: number | null; is_collection: boolean; reconcile_key: string | null };

function Tradelines({ report, all, canEdit, clientId, onSaved }: { report: { id: string; report_type: string }; all: TL[]; canEdit: boolean; clientId: string; onSaved: () => void }) {
  const [f, setF] = useState({ bureau: report.report_type === "tri_merge" || report.report_type === "unknown" ? "experian" : report.report_type, creditor: "", last4: "", type: "revolving", balance: "", limit: "", open: "yes", late: "", collection: "no" });
  const add = async () => {
    if (!f.creditor.trim()) return;
    const key = `${f.creditor.trim().toLowerCase().replace(/\s+/g, " ")}|${f.last4.trim()}`;
    const { error } = await supabase.from("tradelines").insert({ report_id: report.id, client_id: clientId, bureau: f.bureau, creditor: f.creditor.slice(0, 80), account_ref_last4: f.last4.slice(-4) || null, account_type: f.type, balance: f.balance ? Number(f.balance) : null, credit_limit: f.limit ? Number(f.limit) : null, is_open: f.open === "unknown" ? null : f.open === "yes", late_count: f.late ? Number(f.late) : null, is_collection: f.collection === "yes", reconcile_key: key });
    if (error) return toast.error(error.message);
    setF({ ...f, creditor: "", last4: "", balance: "", limit: "", late: "" }); onSaved();
  };
  const groups = new Map<string, TL[]>();
  for (const t of all) { const k = t.reconcile_key ?? t.id; groups.set(k, [...(groups.get(k) ?? []), t]); }
  return (
    <div>
      <div className="label-caps mb-2 text-muted-foreground">Accounts — reconciled across bureaus ({groups.size} unique, {all.length} bureau entries)</div>
      <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
        <thead><tr className="text-left text-muted-foreground"><th className="p-2">Account</th><th className="p-2">Bureaus reporting</th><th className="p-2">Balance / limit per bureau</th><th className="p-2">Lates</th><th className="p-2">Flags</th></tr></thead>
        <tbody className="divide-y">{[...groups.values()].map((g) => <tr key={g[0]!.id}>
          <td className="p-2 font-medium">{g[0]!.creditor}{g[0]!.account_ref_last4 ? ` ··${g[0]!.account_ref_last4}` : ""}<div className="text-xs text-muted-foreground">{g[0]!.account_type}</div></td>
          <td className="p-2">{g.map((t) => t.bureau).join(", ")}</td>
          <td className="p-2 text-xs">{g.map((t) => <div key={t.id}>{t.bureau}: {t.balance ?? "?"} / {t.credit_limit ?? "?"}</div>)}</td>
          <td className="p-2 text-xs">{g.map((t) => <div key={t.id}>{t.bureau}: {t.late_count ?? "Unknown"}</div>)}</td>
          <td className="p-2">{g.some((t) => t.is_collection) && <StatusBadge value="fail" label="collection" />} {g.some((t) => t.is_open === false) && <StatusBadge value="draft" label="closed" />}</td>
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
        <Button onClick={add}>Add account entry</Button>
      </div>}
    </div>
  );
}
