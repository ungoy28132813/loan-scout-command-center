import { useState } from "react";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, PlugZap, Power, RefreshCw, Sparkles, Check, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "./AppShell";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Alert, AlertDescription } from "./ui/alert";
import { localAiState, pairLocalAi, requestLocalAi, reviewLocalAi, revokeLocalAi } from "@/lib/local-ai.functions";
import { adviceSchema, inputSchema, LOCAL_AI_MODEL, workerIsOnline } from "@/lib/local-ai";

export const localAiQuery = { queryKey: ["local-ai"], queryFn: () => localAiState(), refetchInterval: 15_000 };

export function LocalAiWorkspace() {
  const { data } = useSuspenseQuery(localAiQuery);
  const qc = useQueryClient();
  const pair = useServerFn(pairLocalAi); const request = useServerFn(requestLocalAi);
  const review = useServerFn(reviewLocalAi); const revoke = useServerFn(revokeLocalAi);
  const [label, setLabel] = useState("My Ollama computer");
  const [model, setModel] = useState<string>(LOCAL_AI_MODEL);
  const [productId, setProductId] = useState("");
  const [busy, setBusy] = useState(false);
  const worker = data.workers.find((w) => w.enabled);
  const online = worker ? workerIsOnline(worker.last_seen_at, worker.enabled) : false;
  const activeJob = data.jobs.some((j) => ["running", "queued"].includes(j.status) && Date.parse(j.expires_at) > Date.now());
  const refresh = () => qc.invalidateQueries({ queryKey: ["local-ai"] });
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); await refresh(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Local AI action unavailable"); }
    finally { setBusy(false); }
  };
  const download = async () => {
    // Load the template before creating a credential. Credentials never enter browser storage or chat.
    const response = await fetch("/local-ai/worker.ps1", { cache: "no-store" });
    if (!response.ok) throw new Error("Setup download unavailable");
    const template = await response.text();
    if (!template.includes("__TOKEN_BASE64__") || !template.includes("__APP_BASE64__")) throw new Error("Invalid setup download");
    const origin = window.location.origin;
    if (!origin.startsWith("https://")) throw new Error("Download the paired setup from the HTTPS Loan Scout preview");
    const paired = await pair({ data: { label, model } });
    const script = template.replace("__TOKEN_BASE64__", btoa(paired.token)).replace("__APP_BASE64__", btoa(origin));
    const url = URL.createObjectURL(new Blob([script], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "LoanScout-LocalAI.ps1"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("Paired setup downloaded. Keep this file private and run it on your Ollama computer.");
  };

  return <div className="mx-auto max-w-5xl space-y-6">
    <PageHeader title="Local AI Intelligence" kicker="Loan Scout · owner pilot">
      <Button variant="outline" size="icon" aria-label="Refresh local AI status" title="Refresh status" onClick={() => void refresh()}><RefreshCw className="h-4 w-4" /></Button>
    </PageHeader>
    <Alert><AlertDescription>AI advice is unverified. Only public lender text and anonymous verified-outcome totals enter this pilot—not credit reports. Nothing changes eligibility, verifies evidence, or publishes automatically.</AlertDescription></Alert>
    <section className="space-y-4 border-b pb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl">Your computer</h2>
        <span className="flex items-center gap-2 text-sm"><PlugZap className="h-4 w-4 text-primary" />{online ? "Online" : worker ? "Offline · start the local worker" : "Not connected"}</span>
      </div>
      {worker && <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 text-sm"><div className="min-w-0"><b>{worker.label}</b><div className="break-all text-xs text-muted-foreground">{worker.model}</div>{worker.last_seen_at && <div className="text-xs text-muted-foreground">Last seen {new Date(worker.last_seen_at).toLocaleString()}</div>}</div><Button variant="outline" disabled={busy} onClick={() => void act(() => revoke({ data: { id: worker.id } }))}><Power className="mr-2 h-4 w-4" />Disconnect</Button></div>}
      <div className="grid items-end gap-3 sm:grid-cols-[1fr_2fr_auto]">
        <div className="space-y-1"><Label htmlFor="computer-name">Computer name</Label><Input id="computer-name" maxLength={80} value={label} onChange={(e) => setLabel(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="local-model">Installed Ollama model</Label><Input id="local-model" maxLength={160} value={model} onChange={(e) => setModel(e.target.value)} /></div>
        <Button disabled={busy || !label.trim() || !model.trim()} onClick={() => void act(download)}><Download className="mr-2 h-4 w-4" />{worker ? "Replace connection" : "Download paired setup"}</Button>
      </div>
      <details className="border-t pt-3"><summary className="cursor-pointer text-sm font-medium">Windows setup &amp; restart commands</summary><div className="mt-3 space-y-3 text-sm">
        <p>Save the paired download in Downloads, then run this once in PowerShell on your Ollama computer:</p>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs"><code>{'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\\Downloads\\LoanScout-LocalAI.ps1"'}</code></pre>
        <p>Restart later using the shortcut in the folder that opens, or run:</p>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs"><code>{'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\\LoanScoutAI\\worker.ps1"'}</code></pre>
        <p>Keep the worker window open; Ctrl+C stops it. No administrator rights or firewall changes. The paired installer contains a private credential until first run—never share it.</p>
      </div></details>
    </section>
    <section className="space-y-4 border-b pb-6">
      <h2 className="font-display text-2xl">Public-source review</h2>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Select value={productId} onValueChange={setProductId}><SelectTrigger aria-label="Lender product for AI review" className="min-w-0"><SelectValue placeholder="Choose a lender product" /></SelectTrigger><SelectContent>{data.products.filter((p) => p.official_url).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}{p.channel_scope ? ` · ${p.channel_scope}` : ""}</SelectItem>)}</SelectContent></Select>
        <Button disabled={busy || !online || !productId || activeJob} onClick={() => void act(async () => { const result = await request({ data: { productId } }); toast.success(result.cached ? "Reused identical analysis; no new inference" : "Queued on your computer"); })}><Sparkles className="mr-2 h-4 w-4" />{activeJob ? "Analysis in progress" : "Analyze official source"}</Button>
      </div>
      <p className="text-xs text-muted-foreground">30 analyses/day · one at a time · 1,024 output tokens · no hosted AI fallback. Outcome context requires at least five verified, non-demo records with both approvals and denials; refreshed on each request, not model training.</p>
    </section>
    <section className="space-y-3">
      <h2 className="font-display text-2xl">Analysis history</h2>
      {data.jobs.length === 0 && <p className="py-6 text-sm text-muted-foreground">No local analyses yet.</p>}
      {data.jobs.map((job) => {
        const result = adviceSchema.safeParse(job.result); const input = inputSchema.safeParse(job.input);
        const status = ["queued", "running"].includes(job.status) && Date.parse(job.expires_at) <= Date.now() ? "expired" : job.status;
        return <article key={job.id} className="space-y-3 rounded-md border bg-card p-4">
          <div className="flex flex-wrap justify-between gap-2"><div className="font-semibold">{data.products.find((p) => p.id === job.product_id)?.name ?? "Lender source"}</div><div className="text-xs text-muted-foreground">{status} · {job.review_status.replace(/_/g, " ")} · {new Date(job.created_at).toLocaleString()}</div></div>
          {input.success && <div className="space-y-1 text-xs text-muted-foreground"><a className="break-all underline" href={input.data.product.url} target="_blank" rel="noreferrer">Official source · checked {input.data.product.checkedAt}</a><div>{input.data.product.scope}</div><div>{input.data.outcomes ? `${input.data.outcomes.sample} verified outcomes in context (${input.data.outcomes.approved} approvals, ${input.data.outcomes.denied} denials); not future odds` : "Outcome context withheld: insufficient verified approvals and denials"}</div></div>}
          {job.error_code && <p className="text-sm text-muted-foreground">Analysis unavailable: {job.error_code.replace(/_/g, " ")}. No automatic retry or paid fallback.</p>}
          {result.success && <><p className="whitespace-pre-wrap break-words text-sm">{result.data.summary}</p>{result.data.findings.map((f, i) => <div key={i} className="border-l-2 border-primary pl-3 text-sm"><p className="break-words">{f.statement}</p><blockquote className="mt-1 break-words text-xs text-muted-foreground">“{f.evidenceQuote.replace(/\s+/g, " ")}”</blockquote></div>)}{result.data.unknowns.length > 0 && <div><h3 className="text-sm font-semibold">Unknown / needs review</h3><ul className="ml-4 list-disc space-y-1 text-sm text-muted-foreground">{result.data.unknowns.map((s, i) => <li key={i}>{s}</li>)}</ul></div>}
            {job.review_status === "pending" && <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={busy} onClick={() => void act(() => review({ data: { id: job.id, decision: "accepted_note" } }))}><Check className="mr-2 h-4 w-4" />Keep as advisory note</Button><Button variant="ghost" size="sm" disabled={busy} onClick={() => void act(() => review({ data: { id: job.id, decision: "rejected" } }))}><X className="mr-2 h-4 w-4" />Reject</Button></div>}
          </>}
        </article>;
      })}
    </section>
  </div>;
}