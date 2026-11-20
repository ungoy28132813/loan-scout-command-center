import { useEffect, useRef, useState } from "react";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Clipboard, Download, Square, Sparkles, Upload, X } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { benchmarkDiagnosisHistory, confirmBenchmarkRecovery, resumeBenchmarkDiagnosis, stopBenchmarkDiagnosis } from "@/lib/benchmark-diagnostics.functions";
import { buildRecoveryDownload, diagnosisSchema, RECOVERIES, RECOVERY_IDS, recoveryLearning, sanitizeBenchmarkLog, symptomsSchema, symptomSignature, validateDiagnosis } from "@/lib/benchmark-diagnostics";
import type { Diagnosis, RecoveryId, RecoveryObservation, Symptoms } from "@/lib/benchmark-diagnostics";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Alert, AlertDescription } from "./ui/alert";

export const benchmarkDiagnosisQuery = { queryKey: ["benchmark-diagnostics"], queryFn: () => benchmarkDiagnosisHistory() };
const eventSchema = z.object({ type: z.string(), id: z.string().optional(), text: z.string().optional(), message: z.string().optional(), result: z.unknown().optional() }).passthrough();

export function BenchmarkDiagnostics() {
  const { data } = useSuspenseQuery(benchmarkDiagnosisQuery);
  const qc = useQueryClient();
  const confirm = useServerFn(confirmBenchmarkRecovery); const resume = useServerFn(resumeBenchmarkDiagnosis); const stop = useServerFn(stopBenchmarkDiagnosis);
  const [symptoms, setSymptoms] = useState<Symptoms | null>(null);
  const [consent, setConsent] = useState(false); const [restored, setRestored] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<Record<string, RecoveryId>>({}); const [downloaded, setDownloaded] = useState(false);
  const abort = useRef<AbortController | null>(null); const activeId = useRef<string | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const refresh = () => qc.invalidateQueries({ queryKey: ["benchmark-diagnostics"] });
  const observations: RecoveryObservation[] = data.runs.flatMap((run) => {
    const parsed = symptomsSchema.safeParse(run.symptoms);
    return parsed.success && run.recovery_id && RECOVERY_IDS.includes(run.recovery_id as RecoveryId) && (run.recovery_outcome === "resolved" || run.recovery_outcome === "not_resolved") ? [{ recoveryId: run.recovery_id as RecoveryId, outcome: run.recovery_outcome, signature: symptomSignature(parsed.data) }] : [];
  });
  const loadFile = async (file: File | undefined) => {
    setSymptoms(null); setConsent(false); setError("");
    if (!file) return;
    try { if (file.size > 2_000_000) throw new Error("Choose a log smaller than 2 MB."); setSymptoms(sanitizeBenchmarkLog(await file.text())); }
    catch (e) { setError(e instanceof Error ? e.message : "Unsupported benchmark log."); }
  };
  const analyze = async () => {
    if (!symptoms || !consent || busy) return;
    setBusy(true); setError(""); setNotes(""); activeId.current = null;
    const controller = new AbortController(); abort.current = controller;
    try {
      const session = await supabase.auth.getSession();
      if (!session.data.session) throw new Error("Sign in again to analyze benchmarks.");
      const response = await fetch("/api/public/benchmark-diagnosis", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.data.session.access_token}` }, body: JSON.stringify(symptoms), signal: controller.signal });
      if (response.headers.get("content-type")?.includes("application/json")) {
        const body = z.object({ error: z.string().optional(), id: z.string().optional(), cached: z.boolean().optional(), result: z.unknown().optional() }).parse(await response.json());
        if (!response.ok) throw new Error(body.error ?? "Hosted diagnosis unavailable.");
        validateDiagnosis(body.result, symptoms);
        toast.success("Reused saved diagnosis—no new AI charge.");
      } else {
        if (!response.body) throw new Error("No diagnosis stream received.");
        const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let completed = false;
        const consume = (line: string) => {
          if (!line.trim()) return;
          const event = eventSchema.parse(JSON.parse(line));
          if (event.type === "started" && event.id) activeId.current = event.id;
          if (event.type === "reasoning" && event.text) setNotes((s) => (s + event.text).slice(0,12000));
          if (event.type === "error") throw new Error(event.message ?? "Diagnosis unavailable.");
          if (event.type === "complete") { validateDiagnosis(event.result, symptoms); completed = true; }
        };
        try { while (true) { const part = await reader.read(); if (part.done) break; buffer += decoder.decode(part.value, { stream: true }); const lines = buffer.split("\n"); buffer = lines.pop() ?? ""; for (const line of lines) consume(line); } consume(buffer + decoder.decode()); }
        finally { await reader.cancel(); }
        if (!completed) throw new Error("Diagnosis interrupted. Saved history retains its status; no automatic retry.");
        toast.success("Diagnosis saved. Choose a recovery below.");
      }
    } catch (e) { setError(controller.signal.aborted ? "Analysis stopped. No automatic retry." : e instanceof Error ? e.message : "Hosted diagnosis unavailable."); }
    finally { abort.current = null; try { await refresh(); } finally { setBusy(false); } }
  };
  const stopActive = async () => { abort.current?.abort(); if (activeId.current) await stop({ data: { id: activeId.current } }); await refresh(); };
  const saveOutcome = async (id: string, recoveryId: RecoveryId, outcome: "resolved" | "not_resolved") => {
    try { await confirm({ data: { id, recoveryId, outcome } }); await refresh(); toast.success("Recovery outcome saved for future similar diagnoses."); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Unable to save recovery outcome."); }
  };
  const downloadRecovery = (ids: RecoveryId[]) => {
    const url = URL.createObjectURL(new Blob([buildRecoveryDownload(ids)], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "LoanScout-Recovery.ps1"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); setDownloaded(true);
  };
  return <section className="space-y-4 border-b pb-6" aria-labelledby="benchmark-diagnosis-title">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="benchmark-diagnosis-title" className="font-display text-2xl">Benchmark diagnosis &amp; recovery</h2><span className="text-xs text-muted-foreground">Hosted AI · five new diagnoses/day</span></div>
    <div className="space-y-2"><Label htmlFor="benchmark-log">Benchmark log · JSON or text</Label><div className="flex items-center gap-2"><Upload className="h-4 w-4 shrink-0 text-muted-foreground" /><Input id="benchmark-log" type="file" accept=".json,.txt,.log" disabled={busy} onChange={(e) => void loadFile(e.target.files?.[0])} className="min-w-0" /></div></div>
    {symptoms && <div className="space-y-2 border-l-2 border-primary pl-3 text-sm"><p><b>{symptoms.passedRows}</b> passed · <b>{symptoms.failedRows}</b> failed · {symptoms.totalRows} recorded tests</p><p className="break-words text-muted-foreground">{symptoms.failures.length ? [...new Set(symptoms.failures.map((f) => f.code))].join(" · ").replaceAll("_", " ") : "No recorded failures; executed tests only, not certification."}</p><details><summary className="cursor-pointer text-xs font-medium">Filtered metrics sent to AI</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-xs">{JSON.stringify(symptoms,null,2)}</pre></details></div>}
    <div className="flex items-start gap-2"><Checkbox id="benchmark-consent" checked={consent} disabled={!symptoms || busy} onCheckedChange={(v) => setConsent(v === true)} /><Label htmlFor="benchmark-consent" className="text-sm font-normal leading-5">Analyze only these filtered benchmark metrics using hosted AI credits. Raw logs, responses, paths and private documents are excluded.</Label></div>
    {data.control?.paused && <Alert><AlertDescription><p>Hosted diagnosis paused: {data.control.message}</p><div className="mt-3 flex items-start gap-2"><Checkbox id="diagnosis-access-restored" checked={restored} onCheckedChange={(v) => setRestored(v === true)} /><Label htmlFor="diagnosis-access-restored" className="font-normal">The reported credit or access issue has been restored.</Label></div><Button className="mt-3" variant="outline" disabled={!restored || busy} onClick={() => void resume().then(refresh).catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Unable to resume"))}>Resume hosted diagnosis</Button></AlertDescription></Alert>}
    <div className="flex flex-wrap gap-2"><Button disabled={!symptoms || !consent || busy || data.control?.paused === true} onClick={() => void analyze()}><Sparkles className="mr-2 h-4 w-4" />{busy ? "Analyzing benchmark…" : "Analyze log · uses credits"}</Button>{busy && <Button variant="outline" onClick={() => void stopActive()}><Square className="mr-2 h-4 w-4" />Stop</Button>}</div>
    {error && <Alert variant="destructive"><AlertDescription className="break-words">{error}</AlertDescription></Alert>}
    {notes && <details open={busy}><summary className="cursor-pointer text-sm font-medium">AI analysis notes</summary><p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground" aria-live="polite">{notes}</p></details>}
    {downloaded && <div className="space-y-2 text-sm"><p>Save the recovery download in Downloads, then run on the Ollama computer:</p><pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs"><code>{'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\\Downloads\\LoanScout-Recovery.ps1"'}</code></pre></div>}
    <h3 className="font-display text-xl">Saved diagnoses</h3>
    {data.runs.length === 0 && <p className="text-sm text-muted-foreground">No benchmark diagnoses yet.</p>}
    {data.runs.map((run) => {
      const parsed = diagnosisSchema.safeParse(run.result); const input = symptomsSchema.safeParse(run.symptoms);
      if (!parsed.success || !input.success) return <article key={run.id} className="rounded-md border bg-card p-4 text-sm"><p>{run.status} · {new Date(run.created_at).toLocaleString()}</p>{run.error_message && <p className="mt-2 break-words text-muted-foreground">{run.error_message}</p>}{run.status === "running" && !busy && <Button className="mt-2" variant="outline" onClick={() => void stop({ data: { id: run.id } }).then(refresh)}>Release interrupted analysis</Button>}</article>;
      const diagnosis: Diagnosis = parsed.data; const learning = recoveryLearning(input.data, observations);
      const ids = [...new Set(diagnosis.recoveryIds)].sort((a,b) => { const score = (id: RecoveryId) => { const obs = learning.find((r) => r.recoveryId === id); return obs ? obs.resolved - obs.notResolved : 0; }; return score(b)-score(a); });
      const choice = selected[run.id] ?? (run.recovery_id && ids.includes(run.recovery_id as RecoveryId) ? run.recovery_id as RecoveryId : ids[0]);
      return <article key={run.id} className="space-y-3 rounded-md border bg-card p-4">
        <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span>{new Date(run.created_at).toLocaleString()}</span><span>{run.recovery_outcome.replaceAll("_", " ")} · operator reported</span></div>
        <p className="break-words text-sm font-medium">{diagnosis.summary}</p>
        {diagnosis.causes.map((cause,i) => <div key={i} className="border-l-2 border-border pl-3 text-sm"><p className="break-words">{cause.cause}</p><p className="mt-1 break-words text-xs text-muted-foreground">{cause.confidence} · {cause.failureCode.replaceAll("_", " ")} · {cause.evidenceTests.join(", ")}</p></div>)}
        {ids.map((id) => <details key={id} className="border-t pt-3" open={id === choice}><summary className="cursor-pointer text-sm font-semibold">{RECOVERIES[id].title}</summary><div className="mt-2 space-y-2"><ul className="ml-4 list-disc space-y-1 text-sm text-muted-foreground">{RECOVERIES[id].steps.map((s,i) => <li key={i}>{s}</li>)}</ul>{RECOVERIES[id].commands.map((command,i) => <div key={i} className="flex min-w-0 items-start gap-2"><pre className="min-w-0 flex-1 overflow-x-auto rounded-md bg-muted p-3 text-xs"><code>{command}</code></pre><Button variant="ghost" size="icon" aria-label={`Copy recovery command ${i+1} for ${RECOVERIES[id].title}`} title="Copy command" onClick={() => void navigator.clipboard.writeText(command).then(() => toast.success("Command copied"))}><Clipboard className="h-4 w-4" /></Button></div>)}{learning.find((r) => r.recoveryId === id) && <p className="text-xs text-muted-foreground">Similar symptoms: {learning.find((r) => r.recoveryId === id)?.resolved} resolved, {learning.find((r) => r.recoveryId === id)?.notResolved} not resolved · operator-confirmed, not independently verified</p>}</div></details>)}
        {diagnosis.unknowns.length > 0 && <ul className="ml-4 list-disc space-y-1 text-xs text-muted-foreground">{diagnosis.unknowns.map((s,i) => <li className="break-words" key={i}>{s}</li>)}</ul>}
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => downloadRecovery(ids)}><Download className="mr-2 h-4 w-4" />Download recovery + rerun</Button></div>
        {choice && <div className="space-y-2 border-t pt-3"><Label>Recovery tried</Label><Select value={choice} onValueChange={(v) => setSelected((s) => ({ ...s, [run.id]: v as RecoveryId }))}><SelectTrigger aria-label="Recovery tried" className="min-w-0"><SelectValue /></SelectTrigger><SelectContent>{ids.map((id) => <SelectItem key={id} value={id}>{RECOVERIES[id].title}</SelectItem>)}</SelectContent></Select><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => void saveOutcome(run.id,choice,"resolved")}><Check className="mr-2 h-4 w-4" />Mark resolved</Button><Button variant="ghost" disabled={busy} onClick={() => void saveOutcome(run.id,choice,"not_resolved")}><X className="mr-2 h-4 w-4" />Still failing</Button></div></div>}
      </article>;
    })}
  </section>;
}