export type Bureau = "experian" | "equifax" | "transunion";

export interface AnalysisReport {
  id: string;
  report_date: string | null;
  created_at: string;
  extraction_status: string;
  file_name: string | null;
}
export interface AnalysisField {
  id: string;
  report_id: string;
  bureau: string;
  field_key: string;
  score_model: string | null;
  value: number | null;
  status: string;
  needs_review: boolean;
  source_page: number | null;
  score_date: string | null;
  confidence: string | null;
}
export interface AnalysisTradeline {
  id: string;
  report_id: string;
  bureau: string;
  creditor: string;
  account_ref_last4: string | null;
  account_type: string | null;
  balance: number | null;
  credit_limit: number | null;
  needs_review: boolean;
  reconcile_key: string | null;
  source_page: number | null;
}

export interface NumericChange {
  earlier: number | null;
  later: number | null;
  delta: number | null;
  status: "changed" | "unchanged" | "unknown";
  earlierPage: number | null;
  laterPage: number | null;
}
export interface ScoreChange extends NumericChange {
  bureau: string;
  model: string;
  earlierScoreDate: string | null;
  laterScoreDate: string | null;
}
export interface SummaryChange extends NumericChange { bureau: string; fieldKey: string }
export interface AccountChange {
  key: string;
  bureau: string;
  creditor: string;
  last4: string;
  balance: NumericChange;
  limit: NumericChange;
  note: string | null;
}
export interface SnapshotComparison {
  scores: ScoreChange[];
  summaries: SummaryChange[];
  accounts: AccountChange[];
  warnings: string[];
  excludedUnverified: number;
}

const SUMMARY_KEYS = new Set(["inquiries_30d", "inquiries_3mo", "inquiries_6mo", "inquiries_12mo", "inquiries_24mo", "late_30_count", "late_60_count", "late_90_count", "late_payments_24mo", "delinquent_accounts_count", "collections_count", "chargeoffs_count", "open_tradelines"]);
const round = (n: number) => Math.round(n * 100) / 100;
const numericChange = (earlier: number | null, later: number | null, earlierPage: number | null = null, laterPage: number | null = null): NumericChange => ({
  earlier, later, earlierPage, laterPage,
  delta: earlier == null || later == null ? null : round(later - earlier),
  status: earlier == null || later == null ? "unknown" : earlier === later ? "unchanged" : "changed",
});
const confirmedField = (f: AnalysisField) => !f.needs_review && f.status !== "unknown" && f.value != null;
const confirmedAccount = (t: AnalysisTradeline) => !t.needs_review;
const normalizedCreditor = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const accountIdentity = (t: AnalysisTradeline) => t.account_ref_last4 && /^\d{4}$/.test(t.account_ref_last4) ? `${normalizedCreditor(t.creditor)}|${t.account_ref_last4}` : null;

function uniqueIndex<T>(rows: T[], key: (row: T) => string | null) {
  const map = new Map<string, T>();
  const ambiguous = new Set<string>();
  for (const row of rows) {
    const k = key(row);
    if (!k || ambiguous.has(k)) continue;
    if (map.has(k)) { map.delete(k); ambiguous.add(k); } else map.set(k, row);
  }
  return { map, ambiguous };
}

/** Compares only staff-confirmed values. Missing accounts never become confirmed deletions or zero balances. */
export function compareSnapshots(earlier: AnalysisReport, later: AnalysisReport, fields: AnalysisField[], tradelines: AnalysisTradeline[]): SnapshotComparison {
  const scopedFields = fields.filter((f) => f.report_id === earlier.id || f.report_id === later.id);
  const scopedAccounts = tradelines.filter((t) => t.report_id === earlier.id || t.report_id === later.id);
  const excludedUnverified = scopedFields.filter((f) => !confirmedField(f)).length + scopedAccounts.filter((t) => !confirmedAccount(t)).length;
  const warnings: string[] = [];
  if (excludedUnverified) warnings.push(`${excludedUnverified} unverified or unknown row(s) were excluded from confirmed comparisons.`);
  if (earlier.id === later.id) warnings.push("Choose two different report snapshots for a historical comparison.");

  const scoreRows = scopedFields.filter((f) => f.field_key === "score" && confirmedField(f));
  const unknownModels = scoreRows.filter((f) => !f.score_model).length;
  if (unknownModels) warnings.push(`${unknownModels} score row(s) without an exact model were not compared; models are never inferred.`);
  const scores = uniqueIndex(scoreRows.filter((f) => f.score_model), (f) => `${f.report_id}|${f.bureau}|${f.score_model}`);
  if (scores.ambiguous.size) warnings.push("Ambiguous duplicate score rows were excluded.");
  const scoreKeys = [...new Set([...scores.map.keys()].map((k) => k.split("|").slice(1).join("|")))].filter((key) => !scores.ambiguous.has(`${earlier.id}|${key}`) && !scores.ambiguous.has(`${later.id}|${key}`));
  const scoreChanges: ScoreChange[] = scoreKeys.map((key) => {
    const [bureau, model] = key.split("|");
    const a = scores.map.get(`${earlier.id}|${bureau}|${model}`);
    const b = scores.map.get(`${later.id}|${bureau}|${model}`);
    return { bureau: bureau!, model: model!, ...numericChange(a?.value ?? null, b?.value ?? null, a?.source_page ?? null, b?.source_page ?? null), earlierScoreDate: a?.score_date ?? null, laterScoreDate: b?.score_date ?? null };
  }).sort((a, b) => `${a.bureau}${a.model}`.localeCompare(`${b.bureau}${b.model}`));

  const summaryRows = scopedFields.filter((f) => SUMMARY_KEYS.has(f.field_key) && confirmedField(f));
  const summaries = uniqueIndex(summaryRows, (f) => `${f.report_id}|${f.bureau}|${f.field_key}`);
  if (summaries.ambiguous.size) warnings.push("Ambiguous duplicate bureau summary rows were excluded.");
  const summaryKeys = [...new Set([...summaries.map.keys()].map((k) => k.split("|").slice(1).join("|")))].filter((key) => !summaries.ambiguous.has(`${earlier.id}|${key}`) && !summaries.ambiguous.has(`${later.id}|${key}`));
  const summaryChanges: SummaryChange[] = summaryKeys.map((key) => {
    const [bureau, fieldKey] = key.split("|");
    const a = summaries.map.get(`${earlier.id}|${bureau}|${fieldKey}`);
    const b = summaries.map.get(`${later.id}|${bureau}|${fieldKey}`);
    return { bureau: bureau!, fieldKey: fieldKey!, ...numericChange(a?.value ?? null, b?.value ?? null, a?.source_page ?? null, b?.source_page ?? null) };
  }).sort((a, b) => `${a.fieldKey}${a.bureau}`.localeCompare(`${b.fieldKey}${b.bureau}`));

  const eligibleAccounts = scopedAccounts.filter(confirmedAccount);
  const withoutIdentity = eligibleAccounts.filter((t) => !accountIdentity(t)).length;
  if (withoutIdentity) warnings.push(`${withoutIdentity} account row(s) without a grounded creditor + four-digit ending were not compared across reports.`);
  const accounts = uniqueIndex(eligibleAccounts, (t) => {
    const identity = accountIdentity(t);
    return identity ? `${t.report_id}|${identity}|${t.bureau}` : null;
  });
  if (accounts.ambiguous.size) warnings.push(`${accounts.ambiguous.size} duplicate account/bureau identity group(s) were excluded as ambiguous.`);
  const identities = new Set([...accounts.map.keys()].map((k) => k.split("|").slice(1).join("|")));
  const accountChanges: AccountChange[] = [...identities].filter((identityAndBureau) => !accounts.ambiguous.has(`${earlier.id}|${identityAndBureau}`) && !accounts.ambiguous.has(`${later.id}|${identityAndBureau}`)).map((identityAndBureau) => {
    const parts = identityAndBureau.split("|");
    const bureau = parts.pop()!;
    const identity = parts.join("|");
    const a = accounts.map.get(`${earlier.id}|${identity}|${bureau}`);
    const b = accounts.map.get(`${later.id}|${identity}|${bureau}`);
    const base = a ?? b!;
    return {
      key: `${identity}|${bureau}`, bureau, creditor: base.creditor, last4: base.account_ref_last4!,
      balance: numericChange(a?.balance ?? null, b?.balance ?? null, a?.source_page ?? null, b?.source_page ?? null),
      limit: numericChange(a?.credit_limit ?? null, b?.credit_limit ?? null, a?.source_page ?? null, b?.source_page ?? null),
      note: !a ? "No confirmed matching account in the earlier report; this is not proof the account is new." : !b ? "Not confirmed in the later report; this is not treated as a deletion, closure, or dispute removal." : null,
    };
  }).sort((a, b) => `${a.creditor}${a.bureau}`.localeCompare(`${b.creditor}${b.bureau}`));
  return { scores: scoreChanges, summaries: summaryChanges, accounts: accountChanges, warnings: [...new Set(warnings)], excludedUnverified };
}

export interface UtilizationMember {
  id: string;
  bureau: string;
  balance: number | null;
  limit: number | null;
  currentUtilization: number | null;
  needsReview: boolean;
  sourcePage: number | null;
}
export interface UtilizationAccount {
  key: string;
  creditor: string;
  last4: string | null;
  members: UtilizationMember[];
  combinedEligible: boolean;
  reasons: string[];
  balance: number | null;
  limit: number | null;
}
export interface ScenarioInput { selected: boolean; paydown: number }
export interface AccountScenario {
  key: string;
  appliedPaydown: number;
  remaining: number;
  currentUtilization: number;
  proposedUtilization: number;
  members: { id: string; proposedBalance: number; proposedUtilization: number }[];
}
export interface UtilizationScenario {
  accounts: AccountScenario[];
  totalPaydown: number;
  combined: null | { currentBalance: number; proposedBalance: number; currentLimit: number; currentUtilization: number; proposedUtilization: number; differencePoints: number };
  warnings: string[];
}

const utilization = (balance: number | null, limit: number | null) => balance == null || limit == null || limit <= 0 ? null : round((balance / limit) * 100);
export const clampPaydown = (value: number, balance: number) => Math.min(Math.max(Number.isFinite(value) ? value : 0, 0), Math.max(balance, 0));

/** Groups only grounded revolving identities. Conflicting/duplicate/unverified groups stay informational and never enter combined totals. */
export function buildUtilizationAccounts(reportId: string, tradelines: AnalysisTradeline[]): UtilizationAccount[] {
  const rows = tradelines.filter((t) => t.report_id === reportId && t.account_type === "revolving");
  const groups = new Map<string, AnalysisTradeline[]>();
  for (const row of rows) {
    const key = accountIdentity(row) ?? `unreconciled:${row.id}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()].map(([key, members]) => {
    const reasons: string[] = [];
    const identityGrounded = !key.startsWith("unreconciled:");
    if (!identityGrounded) reasons.push("Missing grounded four-digit account ending; excluded from combined totals.");
    if (members.some((m) => m.needs_review)) reasons.push("Unverified balance or account details; informational only.");
    if (members.some((m) => m.balance == null)) reasons.push("Balance is Unknown.");
    if (members.some((m) => m.credit_limit == null)) reasons.push("Revolving limit is Unknown.");
    if (members.some((m) => m.credit_limit != null && m.credit_limit <= 0)) reasons.push("Zero or negative credit limits cannot be used for utilization.");
    if (members.some((m) => m.balance != null && m.balance < 0)) reasons.push("Negative balances are not valid for this scenario.");
    if (new Set(members.map((m) => m.bureau)).size !== members.length) reasons.push("Duplicate bureau appearance has an ambiguous identity; excluded from combined totals.");
    const balances = new Set(members.map((m) => m.balance));
    const limits = new Set(members.map((m) => m.credit_limit));
    if (balances.size > 1 || limits.size > 1) reasons.push("Bureau balances or limits differ; no value was chosen for combined totals.");
    const first = members[0]!;
    const combinedEligible = identityGrounded && reasons.length === 0 && first.balance != null && first.credit_limit != null && first.credit_limit > 0;
    return {
      key, creditor: first.creditor, last4: first.account_ref_last4,
      members: members.map((m) => ({ id: m.id, bureau: m.bureau, balance: m.balance, limit: m.credit_limit, currentUtilization: utilization(m.balance, m.credit_limit), needsReview: m.needs_review, sourcePage: m.source_page })),
      combinedEligible, reasons: [...new Set(reasons)], balance: combinedEligible ? first.balance : null, limit: combinedEligible ? first.credit_limit : null,
    };
  }).sort((a, b) => a.creditor.localeCompare(b.creditor));
}

/** Pure hypothetical math only; does not mutate reports, produce a score prediction, or publish a match. */
export function simulateUtilization(accounts: UtilizationAccount[], inputs: Record<string, ScenarioInput>): UtilizationScenario {
  const results: AccountScenario[] = [];
  const warnings: string[] = [];
  let totalPaydown = 0, currentBalance = 0, proposedBalance = 0, currentLimit = 0;
  for (const account of accounts) {
    if (!account.combinedEligible) {
      if (account.reasons.length) warnings.push(`${account.creditor}: ${account.reasons.join(" ")}`);
      continue;
    }
    const input = inputs[account.key];
    if (!input?.selected) continue;
    const balance = account.balance!, limit = account.limit!;
    const appliedPaydown = clampPaydown(input.paydown, balance);
    const remaining = round(balance - appliedPaydown);
    const currentUtilization = utilization(balance, limit)!;
    const proposedUtilization = utilization(remaining, limit)!;
    results.push({ key: account.key, appliedPaydown, remaining, currentUtilization, proposedUtilization,
      members: account.members.map((m) => ({ id: m.id, proposedBalance: remaining, proposedUtilization })) });
    totalPaydown += appliedPaydown;
    currentBalance += balance;
    proposedBalance += remaining;
    currentLimit += limit;
  }
  const currentUtilization = utilization(currentBalance, currentLimit);
  const proposedUtilization = utilization(proposedBalance, currentLimit);
  return {
    accounts: results, totalPaydown: round(totalPaydown),
    combined: results.length && currentUtilization != null && proposedUtilization != null ? { currentBalance: round(currentBalance), proposedBalance: round(proposedBalance), currentLimit: round(currentLimit), currentUtilization, proposedUtilization, differencePoints: round(currentUtilization - proposedUtilization) } : null,
    warnings,
  };
}
