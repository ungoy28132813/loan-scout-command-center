import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GitCompareArrows, Calculator, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { evaluateRule, type Facts, type Rule } from "@/lib/match-engine";
import { compareSnapshots, buildUtilizationAccounts, simulateUtilization, bureauUtilizationScenario, clampPaydown, type AnalysisField, type AnalysisReport, type AnalysisTradeline, type NumericChange, type ScenarioInput, type UtilizationAccount } from "@/lib/credit-analysis";
import { fmtDate, fmtMoney } from "@/lib/labels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { StatusBadge } from "@/components/StatusBadge";

const FIELD_LABELS: Record<string, string> = { inquiries_6mo: "Hard inquiries (6 mo)", inquiries_12mo: "Hard inquiries (12 mo)", late_payments_24mo: "Late payments (24 mo)", collections_count: "Collections", open_tradelines: "Open tradelines" };
const num = (v: number | null) => v == null ? "Unknown" : String(v);
const money = (v: number | null) => v == null ? "Unknown" : fmtMoney(v);
const delta = (v: number | null, suffix = "") => v == null ? "Unknown" : `${v > 0 ? "+" : ""}${v}${suffix}`;
const reportLabel = (r: AnalysisReport) => `${r.file_name ?? "Credit report"} · ${r.report_date ?? `uploaded ${fmtDate(r.created_at)}`}`;

function ChangeValue({ change, currency = false }: { change: NumericChange; currency?: boolean }) {
  const format = currency ? money : num;
  return <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
    <div><span className="text-muted-foreground">Earlier </span>{format(change.earlier)}</div>
    <div><span className="text-muted-foreground">Later </span>{format(change.later)}</div>
    <div className="col-span-2 md:col-span-1"><span className="text-muted-foreground">Change </span><span className="font-medium">{delta(change.delta, currency ? "" : "")}</span></div>
    <div className="col-span-2 text-xs text-muted-foreground md:col-span-3">Source pages: {change.earlierPage ? `earlier p${change.earlierPage}` : "earlier Unknown"} · {change.laterPage ? `later p${change.laterPage}` : "later Unknown"}</div>
  </div>;
}

export function HistoricalComparison({ reports, fields, tradelines }: { reports: AnalysisReport[]; fields: AnalysisField[]; tradelines: AnalysisTradeline[] }) {
  const [earlierId, setEarlierId] = useState(reports[1]?.id ?? reports[0]?.id ?? "");
  const [laterId, setLaterId] = useState(reports[0]?.id ?? reports[1]?.id ?? "");
  useEffect(() => {
    if (!reports.some((r) => r.id === earlierId)) setEarlierId(reports[1]?.id ?? reports[0]?.id ?? "");
    if (!reports.some((r) => r.id === laterId)) setLaterId(reports[0]?.id ?? reports[1]?.id ?? "");
  }, [reports, earlierId, laterId]);
  const earlier = reports.find((r) => r.id === earlierId);
  const later = reports.find((r) => r.id === laterId);
  const comparison = useMemo(() => earlier && later ? compareSnapshots(earlier, later, fields, tradelines) : null, [earlier, later, fields, tradelines]);

  return <Card>
    <CardHeader><CardTitle className="label-caps flex items-center gap-2"><GitCompareArrows className="h-4 w-4 text-primary" />Phase 2 · Historical comparison</CardTitle></CardHeader>
    <CardContent className="space-y-5 text-sm">
      <p className="text-muted-foreground">Compares staff-confirmed values only. Missing values stay Unknown; a missing account is never called deleted or removed. Score changes are numeric observations, not predicted outcomes.</p>
      {reports.length < 2 ? <div className="rounded border border-dashed p-4 text-muted-foreground">Upload at least two report snapshots to compare history. Original reports remain unchanged.</div> : <>
        <div className="grid gap-3 md:grid-cols-2">
          <SnapshotSelect label="Earlier snapshot" value={earlierId} onChange={setEarlierId} reports={reports} />
          <SnapshotSelect label="Later snapshot" value={laterId} onChange={setLaterId} reports={reports} />
        </div>
        {earlier && later && <div className="rounded bg-muted p-3 text-xs text-muted-foreground">Earlier: {reportLabel(earlier)} · status {earlier.extraction_status.replace(/_/g, " ")}<br />Later: {reportLabel(later)} · status {later.extraction_status.replace(/_/g, " ")}</div>}
        {comparison?.warnings.map((w) => <Alert key={w}><AlertDescription>{w}</AlertDescription></Alert>)}
        {comparison && <div className="space-y-5">
          <section><h3 className="label-caps mb-2 text-muted-foreground">Scores · same bureau + exact model only</h3>
            {comparison.scores.length === 0 ? <p className="text-muted-foreground">No confirmed score comparisons available.</p> : <div className="space-y-2">{comparison.scores.map((s) => <div key={`${s.bureau}${s.model}`} className="rounded border p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{s.bureau} · {s.model}</span><span className="font-display text-2xl text-primary">{delta(s.delta)}</span></div>
              <ChangeValue change={s} />
              <div className="mt-1 text-xs text-muted-foreground">Score dates: {s.earlierScoreDate ?? "Unknown"} → {s.laterScoreDate ?? "Unknown"}</div>
            </div>)}</div>}
          </section>
          <section><h3 className="label-caps mb-2 text-muted-foreground">Bureau summaries · extracted and comparable only</h3>
            {comparison.summaries.length === 0 ? <p className="text-muted-foreground">No confirmed inquiry, late-payment, collection, or open-tradeline summaries to compare.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[680px]"><thead><tr className="text-left text-muted-foreground"><th className="p-2">Field / bureau</th><th className="p-2">Earlier</th><th className="p-2">Later</th><th className="p-2">Change</th><th className="p-2">Pages</th></tr></thead><tbody className="divide-y">{comparison.summaries.map((s) => <tr key={`${s.bureau}${s.fieldKey}`}><td className="p-2">{FIELD_LABELS[s.fieldKey] ?? s.fieldKey}<div className="text-xs text-muted-foreground">{s.bureau}</div></td><td className="p-2">{num(s.earlier)}</td><td className="p-2">{num(s.later)}</td><td className="p-2 font-medium">{delta(s.delta)}</td><td className="p-2 text-xs text-muted-foreground">{s.earlierPage ?? "?"} → {s.laterPage ?? "?"}</td></tr>)}</tbody></table></div>}
          </section>
          <section><h3 className="label-caps mb-2 text-muted-foreground">Account balance / revolving limit differences</h3>
            <AccountDifferences comparison={comparison} />
          </section>
        </div>}
      </>}
    </CardContent>
  </Card>;
}

function SnapshotSelect({ label, value, onChange, reports }: { label: string; value: string; onChange: (v: string) => void; reports: AnalysisReport[] }) {
  return <label className="space-y-1"><span className="label-caps text-xs text-muted-foreground">{label}</span><Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label}><SelectValue /></SelectTrigger><SelectContent>{reports.map((r) => <SelectItem key={r.id} value={r.id}>{reportLabel(r)}</SelectItem>)}</SelectContent></Select></label>;
}

function AccountDifferences({ comparison }: { comparison: ReturnType<typeof compareSnapshots> }) {
  const rows = comparison.accounts.filter((a) => a.note || a.balance.status === "changed" || a.limit.status === "changed");
  if (!rows.length) return <p className="text-muted-foreground">No confirmed account balance or limit differences. Unreconciled and unchanged accounts are not shown here.</p>;
  return <div className="space-y-2">{rows.map((a) => <div key={a.key} className="rounded border p-3">
    <div className="font-medium">{a.creditor} ··{a.last4}<span className="ml-2 text-xs font-normal text-muted-foreground">{a.bureau}</span></div>
    {a.note && <p className="mt-1 flex gap-1 text-xs text-warning"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{a.note}</p>}
    <div className="mt-3 grid gap-3 lg:grid-cols-2"><div><div className="label-caps mb-1 text-xs text-muted-foreground">Balance</div><ChangeValue change={a.balance} currency /></div><div><div className="label-caps mb-1 text-xs text-muted-foreground">Revolving limit</div><ChangeValue change={a.limit} currency /></div></div>
  </div>)}</div>;
}

export function UtilizationSimulator({ report, tradelines, activeRuleCount }: { report: AnalysisReport; tradelines: AnalysisTradeline[]; activeRuleCount: number }) {
  const accounts = useMemo(() => buildUtilizationAccounts(report.id, tradelines), [report.id, tradelines]);
  const [inputs, setInputs] = useState<Record<string, ScenarioInput>>({});
  useEffect(() => {
    setInputs(Object.fromEntries(accounts.filter((a) => a.combinedEligible).map((a) => [a.key, { selected: true, paydown: 0 }])));
  }, [report.id, accounts]);
  const scenario = useMemo(() => simulateUtilization(accounts, inputs), [accounts, inputs]);
  const utilizationRules = useQuery({ queryKey: ["active-utilization-rules"], queryFn: async () => (await supabase.from("lender_rules").select("*").eq("approval_status", "active").eq("rule_key", "max_utilization_pct")).data ?? [] });
  const resultFor = (key: string) => scenario.accounts.find((a) => a.key === key);
  const setInput = (key: string, patch: Partial<ScenarioInput>) => setInputs((current) => ({ ...current, [key]: { selected: false, paydown: 0, ...current[key], ...patch } }));

  return <Card>
    <CardHeader><CardTitle className="label-caps flex items-center gap-2"><Calculator className="h-4 w-4 text-primary" />Phase 2 · Utilization / paydown simulator</CardTitle></CardHeader>
    <CardContent className="space-y-4 text-sm">
      <Alert><AlertDescription><b>Hypothetical, not a credit score prediction.</b> This is arithmetic on the selected snapshot ({report.report_date ?? `uploaded ${fmtDate(report.created_at)}`}), not a funding approval or promised score effect. Nothing is saved; original reports and lender match records are unchanged.</AlertDescription></Alert>
      <p className="text-xs text-muted-foreground">Combined totals include only selected accounts with confirmed matching balances and limits across bureaus. Unverified, missing-limit, duplicate, or conflicting entries remain informational and are excluded. Balances may be out of date after the report date.</p>
      <UtilizationRulePreview accounts={accounts} inputs={inputs} rules={utilizationRules.data as unknown as Rule[] | undefined} loading={utilizationRules.isLoading} activeRuleCount={activeRuleCount} />
      {accounts.length === 0 ? <p className="rounded border border-dashed p-4 text-muted-foreground">No revolving account entries are available in this snapshot.</p> : <>
        <div className="grid gap-3 rounded bg-muted p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Combined current" value={scenario.combined ? `${scenario.combined.currentUtilization}%` : "Unknown"} />
          <Metric label="Combined proposed" value={scenario.combined ? `${scenario.combined.proposedUtilization}%` : "Unknown"} />
          <Metric label="Difference" value={scenario.combined ? `${scenario.combined.differencePoints} percentage points` : "Unknown"} />
          <Metric label="Total proposed paydown" value={money(scenario.totalPaydown)} />
        </div>
        {scenario.combined && <p className="text-xs text-muted-foreground">Combined balance {money(scenario.combined.currentBalance)} → {money(scenario.combined.proposedBalance)} · combined revolving limit {money(scenario.combined.currentLimit)}. Duplicate bureau appearances are counted once only when values agree.</p>}
        {!scenario.combined && <p className="text-muted-foreground">Select at least one eligible, conservatively reconciled account for combined totals.</p>}
        <div className="space-y-3">{accounts.map((account) => {
          const input = inputs[account.key] ?? { selected: false, paydown: 0 };
          const result = resultFor(account.key);
          return <div key={account.key} className="rounded border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <label className="flex items-center gap-2 font-medium"><input type="checkbox" aria-label={`Include ${account.creditor}`} disabled={!account.combinedEligible} checked={account.combinedEligible && input.selected} onChange={(e) => setInput(account.key, { selected: e.target.checked })} />{account.creditor}{account.last4 ? ` ··${account.last4}` : ""}</label>
              <span className={account.combinedEligible ? "text-xs text-primary" : "text-xs text-warning"}>{account.combinedEligible ? "Eligible for combined scenario" : "Informational only"}</span>
            </div>
            {account.reasons.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-warning">{account.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
            <div className="mt-3 grid gap-2 md:grid-cols-3">{account.members.map((member) => {
              const proposed = result?.members.find((m) => m.id === member.id);
              return <div key={member.id} className="rounded bg-muted p-3 text-xs"><div className="label-caps text-muted-foreground">{member.bureau}{member.sourcePage ? ` · page ${member.sourcePage}` : ""}</div><div className="mt-1">Balance {money(member.balance)} / limit {money(member.limit)}</div><div>Current utilization: <b>{member.currentUtilization == null ? "Unknown" : `${member.currentUtilization}%`}</b></div>{proposed && <div>Proposed: <b>{money(proposed.proposedBalance)} · {proposed.proposedUtilization}%</b></div>}{member.needsReview && <div className="mt-1 text-warning">Unverified — not in combined totals</div>}</div>;
            })}</div>
            {account.combinedEligible && <div className="mt-3 grid items-end gap-3 sm:grid-cols-3">
              <label className="space-y-1"><span className="label-caps text-xs text-muted-foreground">Proposed paydown</span><Input type="number" min={0} max={account.balance ?? 0} step={50} aria-label={`Paydown for ${account.creditor}`} value={input.paydown} onChange={(e) => setInput(account.key, { paydown: clampPaydown(Number(e.target.value), account.balance ?? 0) })} /></label>
              <div><span className="text-muted-foreground">Applied paydown</span><div className="font-medium">{money(result?.appliedPaydown ?? 0)}</div></div>
              <div><span className="text-muted-foreground">Amount remaining</span><div className="font-medium">{money(result?.remaining ?? account.balance)}</div></div>
            </div>}
          </div>;
        })}</div>
      </>}
    </CardContent>
  </Card>;
}

function UtilizationRulePreview({ accounts, inputs, rules, loading, activeRuleCount }: { accounts: UtilizationAccount[]; inputs: Record<string, ScenarioInput>; rules: Rule[] | undefined; loading: boolean; activeRuleCount: number }) {
  if (loading) return <p className="text-xs text-muted-foreground">Checking for owner-approved utilization criteria…</p>;
  if (!rules?.length) return <p className="rounded border border-gold p-2">No lender-specific simulation available yet. Utilization math remains available without approved lender rules{activeRuleCount > 0 ? "; other active rule types do not apply to this preview" : ""}.</p>;
  return <section className="space-y-2 rounded border p-3">
    <div><h3 className="label-caps text-muted-foreground">Internal hypothetical preview · owner-approved utilization criteria</h3><p className="mt-1 text-xs text-muted-foreground">Only confirmed, eligible bureau-specific accounts feed this arithmetic. No FICO or other score change is predicted, no actual match record changes, and nothing publishes.</p></div>
    {rules.map((rule) => {
      const bureau = rule.bureau ?? "unknown";
      const current = bureauUtilizationScenario(accounts, inputs, bureau);
      const factsFor = (value: number): Facts => ({ scores: [], bureau: { [bureau]: { utilization_pct: value } } as Facts["bureau"], answers: {}, answerTexts: {}, answerMeta: {}, applicationMode: "unknown", criticalWarnings: [] });
      const currentCondition = current ? evaluateRule(rule, factsFor(current.currentUtilization)) : null;
      const proposedCondition = current ? evaluateRule(rule, factsFor(current.proposedUtilization)) : null;
      return <div key={rule.id} className="rounded bg-muted/40 p-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2"><b>{rule.source_title} · {bureau}</b><span className="flex items-center gap-1">{currentCondition && <StatusBadge value={currentCondition.outcome} label={`Current ${currentCondition.outcome}`} />}{proposedCondition && <StatusBadge value={proposedCondition.outcome} label={`Hypothetical ${proposedCondition.outcome}`} />}</span></div>
        {current ? <div className="mt-2">Current {current.currentUtilization}% → hypothetical {current.proposedUtilization}% · required {proposedCondition?.required} · paydown {money(current.totalPaydown)} · {current.accountCount} confirmed account(s) · source page(s) {current.sourcePages.join(", ") || "Unknown"}</div> : <div className="mt-2">Unknown — no eligible confirmed {bureau} accounts are selected for this scenario.</div>}
        <div className="mt-1 text-muted-foreground">Source: <a className="underline" href={rule.source_url} target="_blank" rel="noreferrer">{rule.source_title}</a> · verified {rule.verified_on} · {proposedCondition?.explanation ?? "No rule evaluation without comparable accounts."}</div>
      </div>;
    })}
  </section>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><div className="label-caps text-xs text-muted-foreground">{label}</div><div className="mt-1 font-display text-2xl">{value}</div></div>;
}
