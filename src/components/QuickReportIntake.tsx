import { useRef, useState, type DragEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, AlertTriangle, FileUp, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Me } from "@/lib/use-me";
import { extractFileForIntake, saveExtraction } from "@/lib/credit-report-parser/save";
import type { IntakeExtraction } from "@/lib/credit-report-parser/intake";
import { PdfReadError } from "@/lib/credit-report-parser/pdf";
import { recalculateInternalMatches } from "@/lib/internal-matching";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/StatusBadge";

const DEFAULT_GOAL_TITLE = "Personal Credit Lines & Cards — Maximize Funding";

export function QuickReportIntake({ me }: { me: Me }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [readingState, setReadingState] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [intake, setIntake] = useState<IntakeExtraction | null>(null);
  const [clientName, setClientName] = useState("");
  const [email, setEmail] = useState("");
  const [sendInvite, setSendInvite] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [confirmReconciled, setConfirmReconciled] = useState(false);
  const [runInstantMatch, setRunInstantMatch] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  if (me.primary !== "owner") return null;

  const reset = () => {
    setFile(null); setIntake(null); setClientName(""); setEmail("");
    setSendInvite(false); setIsDemo(false); setConfirmReconciled(false);
    setRunInstantMatch(true); setReadingState(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleFile = async (picked: File | undefined) => {
    if (!picked) return;
    const isPdf = picked.type === "application/pdf" || picked.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) return void toast.error("Drop a credit report PDF file.");
    if (picked.size > 25 * 1024 * 1024) return void toast.error("PDF must be 25 MB or smaller.");
    setFile(picked); setIntake(null);
    setReadingState("Reading PDF in this browser…");
    try {
      const parsed = await extractFileForIntake(await picked.arrayBuffer(), (done, total, stage) => {
        setReadingState(stage === "ocr" ? `Local OCR: page ${done} of ${total}…` : `Reading page ${done} of ${total}…`);
      });
      setIntake(parsed);
      setClientName(parsed.suggestedName ?? "");
      setConfirmReconciled(parsed.crossFoot.eligibleForOneClickAccept && me.perms.can_edit_extractions);
      setRunInstantMatch(me.perms.can_run_matching);
      setReadingState(null);
    } catch (error) {
      setReadingState(null);
      setFile(null);
      toast.error(error instanceof PdfReadError ? error.message : "Could not read this PDF.");
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setDragging(false);
    void handleFile(e.dataTransfer.files?.[0]);
  };

  const confirmAndCreate = async () => {
    if (!file || !intake) return;
    const trimmedName = clientName.trim();
    if (!trimmedName) return void toast.error("Enter the client's name before creating the file.");
    setSubmitting(true);
    let createdClientId: string | null = null;
    try {
      const cleanEmail = email.trim().toLowerCase() || null;
      const shouldAccept = confirmReconciled && intake.crossFoot.eligibleForOneClickAccept && me.perms.can_edit_extractions;
      const shouldMatch = runInstantMatch && me.perms.can_run_matching;
      const { data: client, error: clientErr } = await supabase
        .from("clients")
        .insert({ display_name: trimmedName.slice(0, 120), email: cleanEmail, is_demo: isDemo, stage: shouldMatch ? "review" : "analysis" })
        .select("id")
        .single();
      if (clientErr || !client) throw new Error(clientErr?.message ?? "Could not create client");
      createdClientId = client.id;

      if (sendInvite && cleanEmail) {
        const inv = await supabase.from("invitations").insert({ email: cleanEmail, role: "client", client_id: client.id });
        if (inv.error) toast.error(`Client created, but portal invite failed: ${inv.error.message}`);
      }

      const path = `${client.id}/${crypto.randomUUID()}.pdf`;
      const up = await supabase.storage.from("client-documents").upload(path, file, { contentType: "application/pdf", upsert: false });
      if (up.error) throw new Error("Client created, but PDF upload failed.");

      const { data: doc, error: docErr } = await supabase
        .from("documents")
        .insert({ client_id: client.id, category: "credit_reports", storage_path: path, file_name: file.name.slice(0, 200), mime_type: "application/pdf", size_bytes: file.size, batch_id: crypto.randomUUID(), uploaded_by: me.id })
        .select("id")
        .single();
      if (docErr || !doc) throw new Error(docErr?.message ?? "Could not record document");

      const { data: report, error: repErr } = await supabase
        .from("credit_reports")
        .insert({ client_id: client.id, document_id: doc.id, report_type: intake.result.reportType })
        .select("id")
        .single();
      if (repErr || !report) throw new Error(repErr?.message ?? "Could not create report record");

      const saved = await saveExtraction(report.id, client.id, intake.result);
      if (!saved.ok) throw new Error(saved.error);

      if (shouldAccept) {
        const { error: accErr } = await supabase.rpc("accept_staff_extraction", { _report_id: report.id });
        if (accErr) throw new Error(accErr.message);
      }

      let goalId: string | undefined;
      if (shouldMatch) {
        const { data: goal, error: goalErr } = await supabase
          .from("funding_goals")
          .insert({ client_id: client.id, title: DEFAULT_GOAL_TITLE, goal_type: "personal", target_amount: null })
          .select("id")
          .single();
        if (goalErr || !goal) throw new Error(goalErr?.message ?? "Could not initialize default funding goal");
        goalId = goal.id;
        await recalculateInternalMatches(client.id);
      }

      qc.invalidateQueries({ queryKey: ["directory"] });
      qc.invalidateQueries({ queryKey: ["staff-dashboard"] });
      toast.success(shouldMatch ? "Client created and internal match run ready. Nothing was published." : "Client created and report staged for review.");
      const targetTab = shouldAccept && shouldMatch ? "match" : "reports";
      navigate({
        to: "/clients/$clientId",
        params: { clientId: client.id },
        search: goalId ? { tab: targetTab, goalId } : { tab: targetTab },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Intake could not complete");
      if (createdClientId) {
        qc.invalidateQueries({ queryKey: ["directory"] });
        qc.invalidateQueries({ queryKey: ["staff-dashboard"] });
        navigate({ to: "/clients/$clientId", params: { clientId: createdClientId }, search: { tab: "reports" } });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const checks = intake ? [
    { label: "Report date", ok: intake.crossFoot.reportDateValid },
    { label: "Accounts", ok: intake.crossFoot.accountsReconciled },
    { label: "Balances", ok: intake.crossFoot.balancesReconciled },
    { label: "Payments", ok: intake.crossFoot.paymentsReconciled },
    { label: "Inquiries", ok: intake.crossFoot.inquiriesReconciled },
  ] : [];

  return (
    <Card className="border-primary/40">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="label-caps flex items-center gap-2 text-primary"><Sparkles className="h-4 w-4" />Drop Credit Report to Start</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Upload a 3-bureau PDF to extract the client’s name, dates, accounts, and inquiries locally in your browser—then open matched lenders in one click.</p>
          </div>
          {intake && <Button size="sm" variant="ghost" onClick={reset} disabled={submitting} aria-label="Clear selected report"><X className="mr-1 h-4 w-4" />Clear</Button>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!intake && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`flex flex-col items-center justify-center rounded-md border-2 border-dashed p-6 text-center transition-colors ${dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/60"}`}
          >
            <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => void handleFile(e.target.files?.[0])} />
            {readingState ? (
              <div className="flex items-center gap-2 text-sm font-medium text-primary"><Loader2 className="h-4 w-4 animate-spin" />{readingState}</div>
            ) : (
              <>
                <FileUp className="h-7 w-7 text-primary" />
                <div className="mt-2 text-sm font-medium">Drag & drop a SmartCredit, IdentityIQ, or MyScoreIQ PDF here</div>
                <p className="mt-1 text-xs text-muted-foreground">Runs 100% locally in your browser · Max 25 MB / 80 pages · Never auto-publishes to clients</p>
                <Button size="sm" variant="secondary" className="mt-3" onClick={() => inputRef.current?.click()}>Choose credit report PDF</Button>
              </>
            )}
          </div>
        )}

        {intake && file && (
          <div className="space-y-4 rounded-md border bg-muted/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm">
                <span className="font-medium">{file.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {intake.result.pageCount} pages · {intake.result.reportDate ?? "Date unknown"} · {intake.result.scores.length} scores · {intake.result.tradelines.length} account entries
                </span>
              </div>
              <StatusBadge
                value={intake.crossFoot.eligibleForOneClickAccept ? "verified" : "needs_review"}
                label={intake.crossFoot.eligibleForOneClickAccept ? "100% cross-foot reconciled" : "Review needed"}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {checks.map((c) => (
                <span key={c.label} className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs ${c.ok ? "border-primary/40 bg-primary/5 text-primary" : "border-warning/50 bg-warning/10 text-warning-foreground"}`}>
                  {c.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                  {c.label}
                </span>
              ))}
            </div>

            {!intake.crossFoot.eligibleForOneClickAccept && intake.crossFoot.reasons.length > 0 && (
              <div className="rounded border border-warning/50 bg-warning/10 p-3 text-xs">
                <div className="font-medium">Manual review required before matching facts are trusted:</div>
                <ul className="mt-1 list-disc pl-4">{intake.crossFoot.reasons.map((r, idx) => <li key={idx}>{r}</li>)}</ul>
              </div>
            )}

            {intake.crossFoot.missingScoreModels && (
              <p className="text-xs text-muted-foreground">Note: Exact score model (e.g. FICO 8 vs VantageScore 3.0) was not printed on this report; scores remain Unknown in matching until verified, while reconciled accounts, utilization, and inquiries are evaluated immediately.</p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium" htmlFor="intake-client-name">Client name {intake.suggestedName ? "(detected from report)" : intake.nameConflict ? "(bureaus disagreed — enter manually)" : "(enter manually)"}</label>
                <Input id="intake-client-name" className="mt-1" placeholder="Full legal name" value={clientName} onChange={(e) => setClientName(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium" htmlFor="intake-client-email">Client email (optional)</label>
                <Input id="intake-client-email" className="mt-1" type="email" placeholder="client@example.com" value={email} onChange={(e) => { setEmail(e.target.value); if (e.target.value.trim()) setSendInvite(true); }} />
              </div>
            </div>

            <div className="space-y-2 text-sm">
              {email.trim() && (
                <label className="flex items-center gap-2"><Checkbox checked={sendInvite} onCheckedChange={(v) => setSendInvite(Boolean(v))} />Invite client to self-service portal (magic link / account signup)</label>
              )}
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={confirmReconciled}
                  disabled={!intake.crossFoot.eligibleForOneClickAccept || !me.perms.can_edit_extractions}
                  onCheckedChange={(v) => setConfirmReconciled(Boolean(v))}
                />
                <span>Confirm 100% reconciled report readings for internal matching</span>
              </label>
              <label className="flex items-center gap-2">
                <Checkbox checked={runInstantMatch} disabled={!me.perms.can_run_matching} onCheckedChange={(v) => setRunInstantMatch(Boolean(v))} />
                <span>Initialize default personal goal & run instant internal match (unpublished draft)</span>
              </label>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox checked={isDemo} onCheckedChange={(v) => setIsDemo(Boolean(v))} />Mark as DEMO (synthetic testing only)
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={confirmAndCreate} disabled={submitting || !clientName.trim()}>
                {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating & matching…</> : confirmReconciled && runInstantMatch ? "Confirm & Open Matches" : "Create Client & Review Report"}
              </Button>
              <Button variant="outline" onClick={reset} disabled={submitting}>Cancel</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}