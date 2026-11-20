import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Trash2, Eye, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { extractFile, saveExtraction } from "@/lib/credit-report-parser/save";
import { submitClientExtraction } from "@/lib/credit-report-parser/client-submit";
import { PdfReadError } from "@/lib/credit-report-parser/pdf";
import type { Me } from "@/lib/use-me";
import { DOC_CATEGORIES, fmtDate } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

const ALLOWED = ["application/pdf", "image/jpeg", "image/png"];

export function DocumentsPanel({ clientId, me, canUpload, consentOk = true }: { clientId: string; me: Me; canUpload: boolean; consentOk?: boolean }) {
  const qc = useQueryClient();
  const [category, setCategory] = useState<string>("credit_reports");
  const [reportType, setReportType] = useState<string>("unknown");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ name: string; state: string; tone: "info" | "ok" | "warn" | "error" }[]>([]);
  const canExtract = (me.primary === "owner" || me.primary === "employee") && me.perms.can_edit_extractions;
  const canAutoRead = consentOk && (canExtract || me.primary === "client");
  const setP = (i: number, state: string, tone: "info" | "ok" | "warn" | "error") => setProgress((p) => p.map((x, k) => (k === i ? { ...x, state, tone } : x)));
  const docs = useQuery({
    queryKey: ["documents", clientId],
    queryFn: async () => (await supabase.from("documents").select("*").eq("client_id", clientId).order("created_at", { ascending: false })).data ?? [],
  });

  const upload = async () => {
    if (!files.length) return;
    const bad = files.filter((f) => (category === "credit_reports" ? f.type !== "application/pdf" : !ALLOWED.includes(f.type)));
    if (bad.length) return void toast.error(category === "credit_reports" ? "Credit reports must be PDF files." : "Only PDF, JPG or PNG files are accepted.");
    if (files.some((f) => f.size > 25 * 1024 * 1024)) return void toast.error("Each file must be 25 MB or smaller.");
    setBusy(true);
    setProgress(files.map((f) => ({ name: f.name.slice(0, 80), state: "Uploading…", tone: "info" as const })));
    const batch = crypto.randomUUID();
    let ok = 0;
    for (const [i, f] of files.entries()) {
      const ext = f.type === "application/pdf" ? "pdf" : f.type === "image/png" ? "png" : "jpg";
      const path = `${clientId}/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from("client-documents").upload(path, f, { contentType: f.type, upsert: false });
      if (up.error) { setP(i, "Upload failed", "error"); continue; }
      const { data: doc, error } = await supabase.from("documents").insert({ client_id: clientId, category, storage_path: path, file_name: f.name.slice(0, 200), mime_type: f.type, size_bytes: f.size, batch_id: batch, uploaded_by: me.id }).select("id").single();
      if (error || !doc) { setP(i, "Could not record file", "error"); continue; }
      if (category === "credit_reports") {
        const { data: rep } = await supabase.from("credit_reports").insert({ client_id: clientId, document_id: doc.id, report_type: reportType }).select("id").single();
        if (!rep) setP(i, "Uploaded, but the report record could not be created", "warn");
        else if (!canAutoRead) setP(i, "Received securely — our team will review it", "ok");
        else {
          setP(i, "Reading PDF in this browser…", "info");
          try {
            const r = await extractFile(await f.arrayBuffer(), (d, t, stage) => setP(i, stage === "ocr" ? `Local OCR: page ${d} of ${t}…` : `Reading page ${d} of ${t}…`, "info"));
            if (canExtract) {
              const saved = await saveExtraction(rep.id, clientId, r);
              if (!saved.ok) setP(i, `Uploaded; automatic read not saved: ${saved.error}`, "warn");
              else if (r.status === "unreadable") setP(i, "Uploaded; local OCR could not read enough English text — use a clearer scan or text-based PDF", "warn");
              else if (r.status === "awaiting_manual_entry") setP(i, "Uploaded; nothing could be read reliably — enter manually", "warn");
              else setP(i, `Uploaded; read ${r.scores.length} score(s), ${r.fields.length} field(s), ${r.tradelines.length} account entr${r.tradelines.length === 1 ? "y" : "ies"} — review in Reports`, r.status === "partial" ? "warn" : "ok");
            } else {
              const submitted = await submitClientExtraction(rep.id, r);
              if (!submitted.ok) setP(i, "Uploaded, but the automatic read could not be submitted. Assigned staff can read the private PDF.", "warn");
              else if (r.status === "unreadable") setP(i, "Uploaded; local OCR could not read enough English text. Staff can see the unreadable status.", "warn");
              else if (r.status === "awaiting_manual_entry") setP(i, "Uploaded; no reliable values were read. Staff will review the report.", "warn");
              else {
                const { data: receipt, error: receiptError } = await supabase.from("client_extraction_submissions").select("review_status").eq("report_id", rep.id).maybeSingle();
                setP(i, `Uploaded; ${r.scores.length} score(s), ${r.fields.length} field(s), ${r.tradelines.length} account entr${r.tradelines.length === 1 ? "y" : "ies"} — ${!receiptError && receipt?.review_status === "accepted" ? "staff verified" : "automatically received; awaiting staff verification"}`, "ok");
              }
            }
          } catch (e) {
            setP(i, `Uploaded; automatic read failed: ${e instanceof PdfReadError ? e.message : "the PDF could not be read"}`, "warn");
          }
        }
      } else setP(i, "Uploaded securely", "ok");
      ok++;
    }
    setBusy(false); setFiles([]);
    toast.success(`${ok} of ${files.length} file(s) uploaded securely`);
    qc.invalidateQueries({ queryKey: ["facts", clientId] });
    qc.invalidateQueries({ queryKey: ["documents", clientId] });
    qc.invalidateQueries({ queryKey: ["reports", clientId] });
    qc.invalidateQueries({ queryKey: ["client-extraction-submissions", clientId] });
    qc.invalidateQueries({ queryKey: ["client-portal", clientId] });
  };

  const view = async (d: { id: string; storage_path: string }) => {
    const { data, error } = await supabase.storage.from("client-documents").createSignedUrl(d.storage_path, 60);
    if (error || !data) return void toast.error("Access denied");
    await supabase.rpc("log_event", { _action: "view", _entity: "document", _entity_id: d.id, _client_id: clientId, _meta: {} });
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const remove = async (d: { id: string; storage_path: string }) => {
    const s = await supabase.storage.from("client-documents").remove([d.storage_path]);
    if (s.error) return void toast.error("Could not delete file");
    const { error } = await supabase.from("documents").delete().eq("id", d.id);
    if (error) return void toast.error(error.message);
    toast.success("Permanently deleted");
    qc.invalidateQueries({ queryKey: ["documents", clientId] });
  };

  return (
    <div className="space-y-4">
      {canUpload && (
        <Card>
          <CardHeader><CardTitle className="label-caps">Upload documents</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {!consentOk ? <p className="text-sm text-muted-foreground">Please accept the authorization above before uploading.</p> : <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger aria-label="Category"><SelectValue /></SelectTrigger>
                  <SelectContent>{DOC_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
                {category === "credit_reports" && (
                  <Select value={reportType} onValueChange={setReportType}>
                    <SelectTrigger aria-label="Report type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tri_merge">3-bureau combined</SelectItem>
                      <SelectItem value="experian">Experian</SelectItem>
                      <SelectItem value="equifax">Equifax</SelectItem>
                      <SelectItem value="transunion">TransUnion</SelectItem>
                      <SelectItem value="unknown">Not sure</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
              <input type="file" multiple accept={category === "credit_reports" ? "application/pdf" : "application/pdf,image/jpeg,image/png"} onChange={(e) => setFiles(Array.from(e.target.files ?? []))} className="block w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-secondary-foreground" />
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">{category === "credit_reports" ? (canAutoRead ? "PDF only. Text and English-language OCR run inside this browser — never sent to an AI or cloud OCR service. OCR reads at most 20 scanned pages. Read values are received automatically; staff verification is required before matching. Low-confidence, missing or unreadable values stay Unknown." : "PDF only.") : "PDF, JPG or PNG."} Max 25 MB / 80 pages each. Stored privately; never publicly linkable.</p>
                <Button onClick={upload} disabled={!files.length || busy}><Upload className="mr-2 h-4 w-4" />{busy ? "Uploading…" : `Upload ${files.length || ""}`}</Button>
              </div>
              {progress.length > 0 && <ul aria-live="polite" className="divide-y rounded border text-sm">{progress.map((p, k) => (
                <li key={k} className="flex flex-wrap items-center justify-between gap-2 p-2">
                  <span className="min-w-0 truncate">{p.name}</span>
                  <span className={p.tone === "error" ? "text-destructive" : p.tone === "warn" ? "text-warning" : p.tone === "ok" ? "text-primary" : "text-muted-foreground"}>{p.state}</span>
                </li>))}</ul>}
            </>}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle className="label-caps">Document library</CardTitle></CardHeader>
        <CardContent>
          {(docs.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No documents yet.</p> :
            <div className="space-y-5">{DOC_CATEGORIES.map((c) => {
              const list = (docs.data ?? []).filter((d) => d.category === c.value);
              if (!list.length) return null;
              return <div key={c.value}><div className="label-caps mb-2 text-muted-foreground">{c.label}</div>
                <ul className="divide-y rounded border">{list.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 p-3 text-sm">
                    <FileText className="h-4 w-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate">{d.file_name}</span>
                    <span className="hidden text-xs text-muted-foreground sm:inline">{fmtDate(d.created_at)}</span>
                    <Button size="sm" variant="ghost" onClick={() => view(d)} aria-label="View"><Eye className="h-4 w-4" /></Button>
                    {me.primary === "owner" && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild><Button size="sm" variant="ghost" aria-label="Delete"><Trash2 className="h-4 w-4 text-destructive" /></Button></AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>Permanently delete this document?</AlertDialogTitle>
                            <AlertDialogDescription>This removes the file and its record. Confirm this is consistent with your legal retention obligations. The deletion is recorded in the audit log.</AlertDialogDescription></AlertDialogHeader>
                          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => remove(d)}>Delete permanently</AlertDialogAction></AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </li>))}</ul></div>;
            })}</div>}
        </CardContent>
      </Card>
    </div>
  );
}
