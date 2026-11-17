/**
 * Deterministic Loan Scout match engine (Phase 1).
 * - Evaluates ONLY rules stored in the database with provenance.
 * - Strict mode: only owner-approved `verified_primary` rules.
 * - Expanded mode: also secondary/observational rules, which can NEVER disqualify.
 * - Missing evidence is Unknown — never 0 and never an automatic disqualification.
 * - Score is a relative suitability index (0-100), NOT an approval probability.
 */
export const ENGINE_VERSION = "ls-match-1.0.0";

export type Bureau = "experian" | "equifax" | "transunion";
export type Outcome = "pass" | "fail" | "unknown" | "estimate_concern";

export interface ScoreFact { bureau: Bureau; model: string; value: number | null }
export interface Facts {
  scores: ScoreFact[];
  /** per-bureau numeric facts, e.g. inquiries_6mo, open_tradelines, utilization_pct */
  bureau: Partial<Record<Bureau, Record<string, number | null>>>;
  /** questionnaire facts; null = unknown/skipped */
  answers: Record<string, number | null>;
  criticalWarnings: string[];
}

export interface Rule {
  id: string;
  rule_key: string;
  bureau: string | null;
  score_model: string | null;
  lookback_months: number | null;
  threshold: number;
  source_tier: "verified_primary" | "secondary_source" | "observational";
  source_title: string;
  source_url: string;
  verified_on: string;
  stale_after_days: number;
}

export interface Condition {
  rule_id: string;
  rule_key: string;
  label: string;
  outcome: Outcome;
  required: string;
  observed: string;
  explanation: string;
  source_tier: Rule["source_tier"];
  source_title: string;
  source_url: string;
  verified_on: string;
  stale: boolean;
}

export type MatchStatus = "potential_match" | "needs_review" | "does_not_meet_published";

export interface MatchEvaluation {
  status: MatchStatus;
  score: number | null;
  conditions: Condition[];
  summary: string;
  improvement_steps: string[];
}

const BUREAUS: Bureau[] = ["experian", "equifax", "transunion"];

function bureauValues(f: Facts, key: string, bureau: string | null): { b: Bureau; v: number | null }[] {
  const list = bureau && bureau !== "any" ? [bureau as Bureau] : BUREAUS;
  return list.map((b) => ({ b, v: f.bureau[b]?.[key] ?? null }));
}

export function isStale(verifiedOn: string, staleAfterDays: number, now = new Date()): boolean {
  const d = new Date(verifiedOn + "T00:00:00Z");
  return (now.getTime() - d.getTime()) / 86400000 > staleAfterDays;
}

function cmp(op: ">=" | "<=", value: number, threshold: number) {
  return op === ">=" ? value >= threshold : value <= threshold;
}

export function evaluateRule(rule: Rule, f: Facts, now = new Date()): Condition {
  const base = {
    rule_id: rule.id, rule_key: rule.rule_key, source_tier: rule.source_tier,
    source_title: rule.source_title, source_url: rule.source_url, verified_on: rule.verified_on,
    stale: isStale(rule.verified_on, rule.stale_after_days, now),
  };
  let observed: number | null = null;
  let op: ">=" | "<=" = ">=";
  let label = rule.rule_key;
  let required = "";
  let unknownWhy = "";

  switch (rule.rule_key) {
    case "min_score": {
      label = `${rule.score_model ?? "Unspecified model"} score (${rule.bureau ?? "any bureau"})`;
      required = `≥ ${rule.threshold}`;
      if (!rule.score_model) { unknownWhy = "Rule does not specify a score model; models are not interchangeable."; break; }
      const matches = f.scores.filter((s) => s.model === rule.score_model && (rule.bureau === "any" || !rule.bureau || s.bureau === rule.bureau) && s.value != null);
      if (matches.length === 0) { unknownWhy = `No ${rule.score_model} score from ${rule.bureau ?? "the required bureau"} on file. Other models/bureaus are not substituted.`; break; }
      observed = Math.min(...matches.map((m) => m.value as number));
      break;
    }
    case "max_inquiries": {
      const key = `inquiries_${rule.lookback_months ?? 6}mo`;
      label = `Inquiries in ${rule.lookback_months ?? 6} months (${rule.bureau ?? "any bureau"})`;
      required = `≤ ${rule.threshold}`; op = "<=";
      const vals = bureauValues(f, key, rule.bureau);
      if (vals.some((x) => x.v == null)) { unknownWhy = `Inquiry count missing for: ${vals.filter((x) => x.v == null).map((x) => x.b).join(", ")}.`; break; }
      observed = Math.max(...vals.map((x) => x.v as number));
      break;
    }
    case "min_open_tradelines": {
      label = "Open tradelines"; required = `≥ ${rule.threshold}`;
      const vals = bureauValues(f, "open_tradelines", rule.bureau);
      if (vals.some((x) => x.v == null)) { unknownWhy = "Open tradeline count missing for one or more bureaus."; break; }
      observed = Math.min(...vals.map((x) => x.v as number));
      break;
    }
    case "max_utilization_pct": {
      label = "Revolving utilization %"; required = `≤ ${rule.threshold}%`; op = "<=";
      const vals = bureauValues(f, "utilization_pct", rule.bureau);
      if (vals.some((x) => x.v == null)) { unknownWhy = "Utilization missing for one or more bureaus."; break; }
      observed = Math.max(...vals.map((x) => x.v as number));
      break;
    }
    case "min_months_since_bankruptcy": {
      label = "Months since bankruptcy"; required = `≥ ${rule.threshold} (or none on file)`;
      const vals = bureauValues(f, "bankruptcy_on_file", rule.bureau);
      if (vals.some((x) => x.v == null)) { unknownWhy = "Bankruptcy presence not confirmed for every bureau."; break; }
      if (vals.every((x) => x.v === 0)) { observed = Infinity; break; }
      const months = bureauValues(f, "months_since_bankruptcy", rule.bureau).filter((x) => x.v != null);
      if (months.length === 0) { unknownWhy = "Bankruptcy on file but date not extracted."; break; }
      observed = Math.min(...months.map((x) => x.v as number));
      break;
    }
    case "max_dti_pct": {
      label = "Debt-to-income %"; required = `≤ ${rule.threshold}%`; op = "<=";
      const inc = f.answers["monthly_gross_income"]; const debt = f.answers["monthly_debt_payments"];
      if (inc == null || debt == null || inc <= 0) { unknownWhy = "Income or monthly debt payments not provided; DTI cannot be computed."; break; }
      observed = Math.round((debt / inc) * 1000) / 10;
      break;
    }
    case "min_months_in_business":
    case "min_annual_revenue":
    case "min_annual_income": {
      const key = { min_months_in_business: "months_in_business", min_annual_revenue: "annual_business_revenue", min_annual_income: "annual_income" }[rule.rule_key]!;
      label = key.replace(/_/g, " "); required = `≥ ${rule.threshold}`;
      const v = f.answers[key];
      if (rule.rule_key === "min_annual_income" && v == null && f.answers["monthly_gross_income"] != null) { observed = (f.answers["monthly_gross_income"] as number) * 12; break; }
      if (v == null) { unknownWhy = `${label} not provided.`; break; }
      observed = v;
      break;
    }
    default:
      unknownWhy = "Unsupported rule type.";
  }

  if (observed == null) {
    return { ...base, label, required, observed: "Unknown", outcome: "unknown", explanation: unknownWhy };
  }
  const ok = cmp(op, observed, rule.threshold);
  const obsText = observed === Infinity ? "None on file" : String(observed);
  if (ok) return { ...base, label, required, observed: obsText, outcome: "pass", explanation: "Meets the cited requirement." };
  if (rule.source_tier !== "verified_primary") {
    return { ...base, label, required, observed: obsText, outcome: "estimate_concern",
      explanation: "Does not meet a secondary/observational estimate. Estimates never disqualify — review manually." };
  }
  return { ...base, label, required, observed: obsText, outcome: "fail", explanation: "Does not meet the published, source-verified requirement." };
}

export function evaluateProduct(rules: Rule[], f: Facts, mode: "strict" | "expanded", now = new Date()): MatchEvaluation {
  const used = rules.filter((r) => mode === "expanded" || r.source_tier === "verified_primary");
  const conditions = used.map((r) => evaluateRule(r, f, now));
  if (conditions.length === 0) {
    return { status: "needs_review", score: null, conditions, summary: "No owner-approved, source-verified rules for this product yet (awaiting verified research).", improvement_steps: [] };
  }
  const pass = conditions.filter((c) => c.outcome === "pass").length;
  const unknown = conditions.filter((c) => c.outcome === "unknown" || c.outcome === "estimate_concern").length;
  const fail = conditions.filter((c) => c.outcome === "fail").length;
  const score = Math.round((100 * (pass + 0.5 * unknown)) / conditions.length);
  let status: MatchStatus;
  if (fail > 0) status = "does_not_meet_published";
  else if (unknown > 0 || f.criticalWarnings.length > 0 || conditions.some((c) => c.stale)) status = "needs_review";
  else status = "potential_match";
  const improvement_steps = conditions
    .filter((c) => c.outcome === "fail" || c.outcome === "unknown")
    .sort((a, b) => (a.outcome === "fail" ? -1 : 1) - (b.outcome === "fail" ? -1 : 1))
    .map((c) => c.outcome === "fail"
      ? `${c.label}: currently ${c.observed}, published requirement ${c.required} (${c.source_title}).`
      : `${c.label}: provide or verify evidence — ${c.explanation}`);
  const summary = `${pass} met · ${fail} not met · ${unknown} unknown/estimate of ${conditions.length} cited conditions.`;
  return { status, score, conditions, summary, improvement_steps };
}
