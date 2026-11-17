import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Check, X, Play, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Me } from "@/lib/use-me";
import { evaluateProduct, ENGINE_VERSION, type Rule, type Condition } from "@/lib/match-engine";
import { loadFacts } from "@/lib/facts";
import { MATCH_STATUS_LABEL, fmtDate, fmtMoney } from "@/lib/labels";
import { DISCLAIMER, type SnapshotItem } from "@/components/client/PublishedStrategy";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";

export function MatchingPanel({ clientId, me }: { clientId: string; me: Me }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"strict" | "expanded">("strict");
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ["matching", clientId], queryFn: async () => {
    const runs = (await supabase.from("match_runs").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(1)).data ?? [];
    const run = runs[0] ?? null;
    const [results, products, snaps] = await Promise.all([
      run ? supabase.from("match_results").select("*").eq("run_id", run.id).order("rank") : Promise.resolve({ data: [] as never[] }),
      supabase.from("lender_products").select("*, lenders(name)"),
      supabase.from("published_snapshots").select("*").eq("client_id", clientId).order("version", { ascending: false }),
    ]);
    return { run, results: results.data ?? [], products: products.data ?? [], snaps: snaps.data ?? [] };
  } });
  const refresh = () => qc.invalidateQueries({ queryKey: ["matching", clientId] });

  const run = async () => {
    setBusy(true);
    try {
      const [facts, prods, rules] = await Promise.all([
        loadFacts(clientId),
        supabase.from("lender_products").select("id"),
        supabase.from("lender_rules").select("*").eq("approval_status", "active"),
      ]);
      if (!prods.data?.length) { refresh(); return; }
      const { data: runRow, error } = await supabase.from("match_runs").insert({ client_id: clientId, mode, engine_version: ENGINE_VERSION, critical_warnings: facts.criticalWarnings }).select("id").single();
      if (error || !runRow) { toast.error(error?.message ?? "Run failed"); return; }
      const evals = prods.data.map((p) => ({ p, e: evaluateProduct((rules.data ?? []).filter((r) => r.product_id === p.id) as unknown as Rule[], facts, mode) }));
      evals.sort((a, b) => (b.e.score ?? -1) - (a.e.score ?? -1));
      const rows = evals.map(({ p, e }, i) => ({ run_id: runRow.id, client_id: clientId, product_id: p.id, status: e.status, suitability_score: e.score, conditions: { list: e.conditions, summary: e.summary, steps: e.improvement_steps } as never, rank: i + 1 }));
      const ins = await supabase.from("match_results").insert(rows);
      if (ins.error) toast.error(ins.error.message); else toast.success(`Evaluated ${rows.length} products (${mode} mode). Nothing is published until you approve.`);
      refresh();
    } finally { setBusy(false); }
  };

  if (!q.data) return null;
  const { results, products, snaps } = q.data;
  if (products.length === 0 && results.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="label-caps">Lender matching</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="font-medium">No verified lender products are available yet. Add a product with documented rules to begin matching.</p>
          <p className="text-muted-foreground">The 24 lender names are on file, but no product requirements have been entered from documented sources. No matches or approval results are shown until they are.</p>
          {me.primary === "owner" ? <Button asChild><Link to="/lenders">Add a lender product</Link></Button> : <p className="text-muted-foreground">Ask the owner to add lender products.</p>}
        </CardContent>
      </Card>
    );
  }
  const prod = (id: string) => products.find((p) => p.id === id);
  const canReview = me.perms.can_approve_publish;

  const update = async (id: string, patch: Record<string, unknown>) => {
    const { error } = await supabase.from("match_results").update(patch as never).eq("id", id);
    if (error) toast.error(error.message); else refresh();
  };
  const move = async (idx: number, dir: -1 | 1) => {
    const a = results[idx], b = results[idx + dir]; if (!a || !b) return;
    await supabase.from("match_results").update({ rank: b.rank }).eq("id", a.id);
    await supabase.from("match_results").update({ rank: a.rank }).eq("id", b.id);
    refresh();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="label-caps">Match engine</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">Deterministic evaluation against owner-approved, cited lender rules only. The suitability index (0–100) is relative fit — <b>not</b> approval probability. Unknown evidence never disqualifies.</p>
          {me.perms.can_run_matching ? <div className="flex flex-wrap items-center gap-2">
            <Select value={mode} onValueChange={(v) => setMode(v as "strict" | "expanded")}><SelectTrigger className="w-64"><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="strict">Strict — verified primary sources only</SelectItem>
              <SelectItem value="expanded">Expanded — include marked estimates</SelectItem></SelectContent></Select>
            <Button onClick={run} disabled={busy}><Play className="mr-2 h-4 w-4" />{busy ? "Running…" : "Run matching"}</Button>
          </div> : <p className="text-muted-foreground">You don't have the "Run matching" permission.</p>}
          {q.data.run && <div className="text-xs text-muted-foreground">Last run {fmtDate(q.data.run.created_at)} · {q.data.run.mode} · {q.data.run.engine_version}</div>}
          {q.data.run && (q.data.run.critical_warnings as string[]).length > 0 && <Alert variant="destructive"><AlertDescription>Critical evidence warnings: {(q.data.run.critical_warnings as string[]).join(" ")}</AlertDescription></Alert>}
        </CardContent>
      </Card>

      {results.length > 0 && <Card>
        <CardHeader><CardTitle className="label-caps">Match review center</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {results.map((r, idx) => {
            const p = prod(r.product_id); const c = r.conditions as unknown as { list: Condition[]; summary: string; steps: string[] };
            return (
              <div key={r.id} className={`rounded border p-4 ${r.review_status === "rejected" ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">#{r.rank} {(p?.lenders as { name: string } | null)?.name} — {p?.name}</div>
                    <div className="mt-1 flex flex-wrap gap-2"><StatusBadge value={r.status} label={MATCH_STATUS_LABEL[r.status]} /><StatusBadge value={r.review_status} /> {r.manual_added && <StatusBadge value="estimate_concern" label="manually added" />}</div>
                  </div>
                  <div className="text-right"><div className="label-caps text-[0.6rem] text-muted-foreground">Suitability index</div><div className="font-display text-4xl text-primary">{r.suitability_score ?? "—"}</div></div>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{c?.summary}</p>
                <div className="mt-1 text-xs text-muted-foreground">Published range: {p?.published_min_amount == null && p?.published_max_amount == null ? "Unknown" : `${fmtMoney(p?.published_min_amount)} – ${fmtMoney(p?.published_max_amount)}`} ({p?.amount_kind === "credit_limit" ? "credit limit, not cash" : p?.amount_kind}) · Pull: {p?.pull_type}</div>
                {c?.list?.length > 0 && <ul className="mt-3 divide-y rounded border text-sm">{c.list.map((x, k) => (
                  <li key={k} className="grid gap-1 p-2 md:grid-cols-[1fr_auto]">
                    <div><b>{x.label}</b> — required {x.required}, observed {x.observed}. <span className="text-muted-foreground">{x.explanation}</span>
                      <div className="text-xs text-muted-foreground">Source: <a className="underline" href={x.source_url} target="_blank" rel="noreferrer">{x.source_title}</a> · {x.source_tier.replace(/_/g, " ")} · verified {x.verified_on} {x.stale && <b className="text-destructive">· STALE</b>}</div></div>
                    <StatusBadge value={x.outcome} />
                  </li>))}</ul>}
                {c?.steps?.length > 0 && <div className="mt-2 text-sm"><div className="label-caps text-muted-foreground">Prioritized improvement steps</div><ol className="list-decimal pl-5">{c.steps.map((s, k) => <li key={k}>{s}</li>)}</ol></div>}
                {r.manual_reason && <p className="mt-2 text-xs">Manual reason: {r.manual_reason}</p>}
                {canReview && <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button size="sm" variant={r.review_status === "approved" ? "default" : "outline"} onClick={() => update(r.id, { review_status: "approved" })}><Check className="mr-1 h-4 w-4" />Approve</Button>
                  <Button size="sm" variant={r.review_status === "rejected" ? "destructive" : "outline"} onClick={() => update(r.id, { review_status: "rejected" })}><X className="mr-1 h-4 w-4" />Reject</Button>
                  <Button size="icon" variant="ghost" aria-label="Move up" onClick={() => move(idx, -1)}><ArrowUp className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label="Move down" onClick={() => move(idx, 1)}><ArrowDown className="h-4 w-4" /></Button>
                  <PrivateNote initial={r.private_note ?? ""} onSave={(v) => update(r.id, { private_note: v })} />
                  {r.manual_added && <Button size="sm" variant="ghost" onClick={async () => { await supabase.from("match_results").delete().eq("id", r.id); refresh(); }}>Remove</Button>}
                </div>}
              </div>
            );
          })}
          {canReview && q.data.run && <ManualAdd runId={q.data.run.id} clientId={clientId} products={products.filter((p) => !results.some((r) => r.product_id === p.id))} onDone={refresh} />}
        </CardContent>
      </Card>}

      {canReview && results.some((r) => r.review_status === "approved") && <PublishBuilder clientId={clientId} results={results.filter((r) => r.review_status === "approved")} prod={prod} nextVersion={(snaps[0]?.version ?? 0) + 1} onDone={refresh} />}

      <Card><CardHeader><CardTitle className="label-caps">Publication history</CardTitle></CardHeader><CardContent>
        {snaps.length === 0 ? <p className="text-sm text-muted-foreground">Nothing published. Clients see nothing until a staff member publishes.</p> :
          <ul className="divide-y text-sm">{snaps.map((s) => <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>v{s.version} · {s.scope} · {(s.content as { items: unknown[] }).items.length} item(s) · created {fmtDate(s.created_at)}{s.scheduled_for ? ` · scheduled ${fmtDate(s.scheduled_for)}` : ""}</span>
            <span className="flex items-center gap-2"><StatusBadge value={s.status} />{s.needs_rereview && <StatusBadge value="needs_review" label="re-review" />}
              {canReview && (s.status === "draft" || s.status === "scheduled") && <Button size="sm" onClick={() => publishSnap(clientId, s.id, me.id).then(refresh)}>Publish now</Button>}
              {canReview && s.status === "published" && <Button size="sm" variant="outline" onClick={async () => { await supabase.from("published_snapshots").update({ status: "withdrawn" }).eq("id", s.id); refresh(); }}>Withdraw</Button>}
              {canReview && s.status === "published" && s.needs_rereview && <Button size="sm" variant="ghost" onClick={async () => { await supabase.from("published_snapshots").update({ needs_rereview: false }).eq("id", s.id); refresh(); }}>Mark re-reviewed</Button>}
              {(s.status === "published") && me.perms.can_export_pdf && <Link to="/print/$clientId" params={{ clientId }} className="text-primary underline">PDF</Link>}
            </span></li>)}</ul>}
      </CardContent></Card>
    </div>
  );
}

async function publishSnap(clientId: string, id: string, uid: string) {
  await supabase.from("published_snapshots").update({ status: "superseded" }).eq("client_id", clientId).eq("status", "published");
  const { error } = await supabase.from("published_snapshots").update({ status: "published", published_by: uid, published_at: new Date().toISOString(), needs_rereview: false }).eq("id", id);
  if (error) toast.error(error.message); else toast.success("Published to client dashboard");
}

function PrivateNote({ initial, onSave }: { initial: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(initial);
  return <div className="flex flex-1 gap-2"><Input placeholder="Private staff note (never shown to client)" value={v} onChange={(e) => setV(e.target.value)} /><Button size="sm" variant="secondary" onClick={() => onSave(v.slice(0, 1000))}>Save note</Button></div>;
}

function ManualAdd({ runId, clientId, products, onDone }: { runId: string; clientId: string; products: { id: string; name: string; lenders: unknown }[]; onDone: () => void }) {
  const [pid, setPid] = useState(""); const [reason, setReason] = useState("");
  if (!products.length) return null;
  const add = async () => {
    if (!pid || reason.trim().length < 5) return void toast.error("Choose a product and give a reason");
    const { error } = await supabase.from("match_results").insert({ run_id: runId, client_id: clientId, product_id: pid, status: "needs_review", suitability_score: null, conditions: { list: [], summary: "Manually added by staff — not evaluated against cited rules. Eligibility is unverified.", steps: [] } as never, manual_added: true, manual_reason: reason.slice(0, 500), rank: 999 });
    if (error) toast.error(error.message); else { setPid(""); setReason(""); onDone(); }
  };
  return <div className="rounded border border-dashed p-3">
    <div className="label-caps mb-2 text-muted-foreground">Manually add a lender product</div>
    <div className="flex flex-col gap-2 sm:flex-row">
      <Select value={pid} onValueChange={setPid}><SelectTrigger className="sm:w-72"><SelectValue placeholder="Product" /></SelectTrigger><SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{(p.lenders as { name: string } | null)?.name} — {p.name}</SelectItem>)}</SelectContent></Select>
      <Input placeholder="Reason (required, audited)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <Button variant="outline" onClick={add}><Plus className="mr-1 h-4 w-4" />Add</Button>
    </div>
    <p className="mt-1 text-xs text-warning-foreground">Warning: manually added products have not been checked against verified requirements.</p>
  </div>;
}

type Res = { id: string; product_id: string; status: string; suitability_score: number | null; conditions: unknown; rank: number | null };

function PublishBuilder({ clientId, results, prod, nextVersion, onDone }: { clientId: string; results: Res[]; prod: (id: string) => { name: string; lenders: unknown; product_type: string; official_url: string | null; published_min_amount: number | null; published_max_amount: number | null; amount_kind: string; pull_type: string } | undefined; nextVersion: number; onDone: () => void }) {
  const [picked, setPicked] = useState<string[]>(results.map((r) => r.id));
  const [extra, setExtra] = useState<Record<string, { summary: string; checklist: string; docs: string }>>({});
  const [when, setWhen] = useState("");
  const build = (): SnapshotItem[] => results.filter((r) => picked.includes(r.id)).map((r, i) => {
    const p = prod(r.product_id); const c = r.conditions as { list: Condition[] }; const e = extra[r.id] ?? { summary: "", checklist: "", docs: "" };
    return { product_id: r.product_id, lender: (p?.lenders as { name: string } | null)?.name ?? "", product: p?.name ?? "", product_type: p?.product_type ?? "unknown", official_url: p?.official_url ?? null,
      published_min: p?.published_min_amount ?? null, published_max: p?.published_max_amount ?? null, amount_kind: p?.amount_kind ?? "unknown", pull_type: p?.pull_type ?? "unknown",
      status: r.status, score: r.suitability_score, sequence: i + 1,
      conditions: (c?.list ?? []).map((x) => ({ label: x.label, outcome: x.outcome, required: x.required, observed: x.observed, source_title: x.source_title, source_url: x.source_url })),
      checklist: e.checklist.split("\n").map((s) => s.trim()).filter(Boolean), documents: e.docs.split("\n").map((s) => s.trim()).filter(Boolean), client_summary: e.summary.trim() };
  });
  const save = async (status: "draft" | "scheduled") => {
    if (!picked.length) return void toast.error("Select at least one approved item");
    if (status === "scheduled" && !when) return void toast.error("Pick a date");
    const { error } = await supabase.from("published_snapshots").insert({ client_id: clientId, version: nextVersion, scope: picked.length === 1 ? "individual" : picked.length === results.length ? "strategy" : "group", status, content: { items: build(), disclaimer: DISCLAIMER } as never, scheduled_for: status === "scheduled" ? new Date(when).toISOString() : null });
    if (error) toast.error(error.message); else { toast.success(status === "draft" ? "Draft saved — use Publish now in history when ready" : "Saved as scheduled — release it from history on that date"); onDone(); }
  };
  return <Card className="border-primary">
    <CardHeader><CardTitle className="label-caps">Publish builder — version {nextVersion}</CardTitle><p className="text-sm text-muted-foreground">Only approved items appear. Private notes, rejected options and internal comments are never included.</p></CardHeader>
    <CardContent className="space-y-3">
      {results.map((r) => { const p = prod(r.product_id); const e = extra[r.id] ?? { summary: "", checklist: "", docs: "" }; const set = (k: string, v: string) => setExtra({ ...extra, [r.id]: { ...e, [k]: v } });
        return <div key={r.id} className="rounded border p-3">
          <label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={picked.includes(r.id)} onChange={(ev) => setPicked(ev.target.checked ? [...picked, r.id] : picked.filter((x) => x !== r.id))} />{(p?.lenders as { name: string } | null)?.name} — {p?.name}</label>
          {picked.includes(r.id) && <div className="mt-2 grid gap-2 md:grid-cols-3">
            <Textarea placeholder="Client-facing summary" value={e.summary} onChange={(ev) => set("summary", ev.target.value)} />
            <Textarea placeholder="Application checklist (one per line)" value={e.checklist} onChange={(ev) => set("checklist", ev.target.value)} />
            <Textarea placeholder="Documents to prepare (one per line)" value={e.docs} onChange={(ev) => set("docs", ev.target.value)} />
          </div>}
        </div>; })}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => save("draft")}>Save draft</Button>
        <Input type="date" className="w-44" value={when} onChange={(e) => setWhen(e.target.value)} aria-label="Schedule date" />
        <Button variant="outline" onClick={() => save("scheduled")}>Save as scheduled</Button>
        <span className="text-xs text-muted-foreground">Scheduled versions are released manually by staff (automatic release is not built).</span>
      </div>
    </CardContent>
  </Card>;
}
