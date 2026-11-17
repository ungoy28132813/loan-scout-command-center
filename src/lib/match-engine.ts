export type Bureau = "transunion" | "experian" | "equifax";
export type SourceTier = "verified_primary" | "secondary_source" | "observational";
export type Outcome = "pass" | "fail" | "unknown";
export type MatchStatus = "potential_match" | "needs_review" | "does_not_meet_published";
export type MatchMode = "strict" | "expanded";
export type ApplicationMode = "individual" | "joint" | "unknown";

export interface AnswerProvenance {
  status: string;
  verified: boolean;
  financial_source: string;
}

export interface Rule {
  id: string;
  product_id?: string;
  rule_key: string;
  bureau: string | null;
  score_model: string | null;
  lookback_months: number | null;
  threshold: number | null;
  text_threshold?: string | null;
  input_key?: string | null;
  application_mode?: "any" | "individual" | "joint" | null;
  requires_verified_facts?: boolean | null;
  source_tier: SourceTier;
  source_title: string;
  source_url: string;
  verified_on: string;
  effective_date?: string | null;
  stale_after_days: number;
}

export interface Facts {
  scores: { bureau: Bureau; model: string; value: number | null }[];
  bureau: Partial<Record<Bureau, Record<string, number | null>>>;
  answers: Record<string, number | null>;
  answerTexts?: Record<string, string | null>;
  answerMeta?: Record<string, AnswerProvenance>;
  applicationMode?: ApplicationMode;
  criticalWarnings: string[];
}

export interface Condition {
  rule_id: string;
  rule_key: string;
  label: string;
  required: string;
  observed: string;
  outcome: Outcome;
  explanation: string;
  source_tier: SourceTier;
  source_title: string;
  source_url: string;
  verified_on: string;
  stale: boolean;
  input_key?: string;
}

export interface MatchEvaluation {
  status: MatchStatus;
  score: number | null;
  conditions: Condition[];
  improvement_steps: string[];
  summary: string;
  pricing_assumption: string;
}

export const ENGINE_VERSION = "2.4.0";
export const PRICING_ASSUMPTION = "Eligibility conditions do not infer individualized pricing. Marketed APR and amount ranges are product-level information only, not an offer or approval odds.";

const normalizeModel = (model: string) => model.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^fico0([0-9])/, "fico$1");
export const sameScoreModel = (a: string, b: string) => normalizeModel(a) === normalizeModel(b);

export function isStale(verifiedOn: string, staleAfterDays: number, now = new Date()): boolean {
  const verified = new Date(`${verifiedOn}T00:00:00Z`).getTime();
  if (Number.isNaN(verified)) return true;
  return now.getTime() - verified > staleAfterDays * 86_400_000;
}

function base(r: Rule): Omit<Condition, "required" | "observed" | "outcome" | "explanation" | "label"> {
  return { rule_id: r.id, rule_key: r.rule_key, source_tier: r.source_tier, source_title: r.source_title, source_url: r.source_url, verified_on: r.verified_on, stale: isStale(r.verified_on, r.stale_after_days), ...(r.input_key ? { input_key: r.input_key } : {}) };
}

function unknown(r: Rule, label: string, required: string, observed: string, explanation: string): Condition {
  return { ...base(r), label, required, observed, outcome: "unknown", explanation };
}

function pass(r: Rule, label: string, required: string, observed: string, explanation: string): Condition {
  return { ...base(r), label, required, observed, outcome: "pass", explanation };
}

function fail(r: Rule, label: string, required: string, observed: string, explanation: string): Condition {
  return { ...base(r), label, required, observed, outcome: "fail", explanation };
}

function provenance(facts: Facts, key: string): AnswerProvenance {
  return facts.answerMeta?.[key] ?? { status: "answered", verified: false, financial_source: "self_reported" };
}

function provenanceLabel(meta: AnswerProvenance): string {
  const source = meta.financial_source.replaceAll("_", " ");
  return meta.verified ? `verified · ${source}` : `${source} · unverified`;
}

function numericInput(r: Rule, facts: Facts, defaultKey: string): { key: string; value: number | null; meta: AnswerProvenance } {
  const key = r.input_key ?? defaultKey;
  const value = facts.answers[key];
  return { key, value: value == null || !Number.isFinite(value) ? null : value, meta: provenance(facts, key) };
}

function textInput(r: Rule, facts: Facts, defaultKey: string): { key: string; value: string | null; meta: AnswerProvenance } {
  const key = r.input_key ?? defaultKey;
  const value = facts.answerTexts?.[key]?.trim() || null;
  return { key, value, meta: provenance(facts, key) };
}

function verificationUnknown(r: Rule, label: string, required: string, inputs: { key: string; meta: AnswerProvenance }[]): Condition | null {
  if (!r.requires_verified_facts) return null;
  const unverified = inputs.filter((input) => !input.meta.verified);
  if (!unverified.length) return null;
  return unknown(r, label, required, "Self-reported or verification not recorded", `This documented condition requires staff-verified evidence for ${unverified.map((input) => input.key).join(" and ")}. It remains Unknown, not a pass or fail.`);
}

const moneyRules = new Set(["min_annual_income", "min_annual_revenue", "min_average_monthly_deposits"]);
const percentRules = new Set(["max_dti_pct", "max_utilization_pct", "min_owner_share_pct"]);
function formatValue(ruleKey: string, value: number): string {
  if (moneyRules.has(ruleKey)) return `$${value.toLocaleString()}`;
  if (percentRules.has(ruleKey)) return `${value}%`;
  return String(value);
}

function applicationModeUnknown(r: Rule, facts: Facts, label: string, required: string): Condition | null {
  const requiredMode = r.application_mode ?? "any";
  if (requiredMode === "any") return null;
  const actual = facts.applicationMode ?? "unknown";
  if (actual === requiredMode) return null;
  return unknown(r, label, `${required} · ${requiredMode} applications only`, actual === "unknown" ? "Application type unknown" : `${actual} application`, actual === "joint"
    ? "The cited rule does not establish this exact joint-application path. Joint applicability requires staff review and is never inferred from individual criteria."
    : `The rule is documented only for ${requiredMode} applications. Provide the matching application type or leave the condition Unknown.`);
}

const numericAnswerRules: Record<string, { key: string; label: string; comparison: "min" | "max"; description: string }> = {
  min_annual_income: { key: "annual_income", label: "Annual income", comparison: "min", description: "goal-specific annual income" },
  min_annual_revenue: { key: "annual_business_revenue", label: "Annual business revenue", comparison: "min", description: "selected business's annual revenue" },
  min_months_in_business: { key: "months_in_business", label: "Time in business", comparison: "min", description: "selected business's operating history" },
  min_existing_product_months: { key: "existing_product_months", label: "Qualifying existing product age", comparison: "min", description: "goal-specific existing product relationship" },
  min_membership_months: { key: "membership_months", label: "Credit union membership age", comparison: "min", description: "goal-specific membership history" },
  min_banking_history_months: { key: "banking_history_months", label: "Banking history", comparison: "min", description: "selected business's banking history" },
  min_average_monthly_deposits: { key: "average_monthly_deposits", label: "Average monthly deposits", comparison: "min", description: "selected business's deposit history" },
  min_owner_share_pct: { key: "owner_share_pct", label: "Owner share", comparison: "min", description: "selected business's ownership share" },
};

function bureauValue(r: Rule, facts: Facts, field: string): number | null {
  if (!r.bureau) return null;
  const value = facts.bureau[r.bureau as Bureau]?.[field];
  return value == null || !Number.isFinite(value) ? null : value;
}

function evaluateDti(r: Rule, facts: Facts, stale: boolean): Condition {
  const label = "Debt-to-income ratio";
  const required = `≤ ${r.threshold}%`;
  const debt = numericInput(r, facts, "monthly_debt_payments");
  const income = numericInput({ ...r, input_key: null }, facts, "monthly_gross_income");
  if (debt.value == null || income.value == null || income.value <= 0) return unknown(r, label, required, "Unknown", "Monthly debt payments and positive monthly gross income must both be known for this goal. Missing income is not zero.");
  const blocked = verificationUnknown(r, label, required, [debt, income]);
  if (blocked) return blocked;
  const dti = (debt.value / income.value) * 100;
  const observed = `${dti.toFixed(1)}% · ${provenanceLabel(debt.meta)} / ${provenanceLabel(income.meta)}`;
  const explanation = "Calculated as goal-specific monthly debt payments ÷ monthly gross income × 100. This definition does not assume a lender's undisclosed calculation.";
  if (stale) return unknown(r, label, required, observed, "The source is stale; recheck the lender document before relying on this calculated result.");
  return dti <= r.threshold! ? pass(r, label, required, observed, explanation) : fail(r, label, required, observed, explanation);
}

function evaluateDirectDeposit(r: Rule, facts: Facts, stale: boolean): Condition {
  const label = "Direct deposit";
  const required = "Documented qualifying direct deposit";
  const input = textInput(r, facts, "direct_deposit");
  const numeric = numericInput(r, facts, "direct_deposit");
  const normalized = input.value?.toLowerCase() ?? (numeric.value == null ? null : numeric.value === 1 ? "yes" : numeric.value === 0 ? "no" : null);
  if (normalized !== "yes" && normalized !== "no") return unknown(r, label, required, "Unknown", "Answer yes, no, or Skip for this exact goal. Missing direct-deposit evidence is not a denial.");
  const blocked = verificationUnknown(r, label, required, [input]);
  if (blocked) return blocked;
  const observed = `${normalized === "yes" ? "Yes" : "No"} · ${provenanceLabel(input.meta)}`;
  if (stale) return unknown(r, label, required, observed, "The source is stale; recheck the direct-deposit requirement.");
  return normalized === "yes" ? pass(r, label, required, observed, "Compared only with the documented direct-deposit condition for this product and channel.") : fail(r, label, required, observed, "The supplied answer does not meet the documented direct-deposit condition; verify the actual deposit history with the lender.");
}

function evaluateAllowedStates(r: Rule, facts: Facts, stale: boolean): Condition {
  const label = "Location / residency";
  const allowed = (r.text_threshold ?? "").split(",").map((state) => state.trim().toUpperCase()).filter(Boolean);
  const required = allowed.length ? `Allowed: ${allowed.join(", ")}` : "Documented location requirement";
  const input = textInput(r, facts, "location_state");
  if (!input.value || !allowed.length) return unknown(r, label, required, input.value ?? "Unknown", "The goal or selected business location and the cited allowed-state list must both be known.");
  const blocked = verificationUnknown(r, label, required, [input]);
  if (blocked) return blocked;
  const state = input.value.toUpperCase();
  const observed = `${state} · ${provenanceLabel(input.meta)}`;
  if (stale) return unknown(r, label, required, observed, "The location source is stale; recheck current product availability.");
  return allowed.includes(state) ? pass(r, label, required, observed, "Exact state code matched against the cited list; no neighboring-state or nationwide availability is inferred.") : fail(r, label, required, observed, "The supplied state is outside the cited list. Confirm current availability directly with the lender.");
}

export function evaluateRule(r: Rule, facts: Facts, now = new Date()): Condition {
  const stale = isStale(r.verified_on, r.stale_after_days, now);
  if (r.effective_date && new Date(`${r.effective_date}T00:00:00Z`).getTime() > now.getTime()) return unknown(r, r.rule_key, String(r.text_threshold ?? r.threshold ?? "Documented requirement"), "Not evaluated", "This rule is not yet effective.");

  const genericLabel = r.rule_key.replaceAll("_", " ");
  const modeBlock = applicationModeUnknown(r, facts, genericLabel, String(r.text_threshold ?? r.threshold ?? "Documented requirement"));
  if (modeBlock) return modeBlock;

  if (r.rule_key === "min_score") {
    const label = `Credit score (${r.bureau}, ${r.score_model})`;
    const required = `≥ ${r.threshold}`;
    const score = facts.scores.find((s) => s.bureau === r.bureau && sameScoreModel(s.model, r.score_model ?? ""));
    if (!score || score.value == null) return unknown(r, label, required, "Unknown", "No matching bureau + scoring model value. Other bureaus or models are never substituted.");
    const observed = String(score.value);
    if (stale) return unknown(r, label, required, observed, "The source is stale; recheck before relying on it.");
    return score.value >= r.threshold! ? pass(r, label, required, observed, "Exact bureau and model compared with the cited requirement.") : fail(r, label, required, observed, "Observed score is below the documented threshold for this exact bureau and model.");
  }

  if (r.rule_key === "max_inquiries") {
    const months = r.lookback_months ?? 6;
    const label = `Hard inquiries (${months} mo${r.bureau ? `, ${r.bureau}` : ""})`;
    const required = `≤ ${r.threshold}`;
    const value = bureauValue(r, facts, `inquiries_${months}mo`);
    if (value == null) return unknown(r, label, required, "Unknown", "The exact bureau and lookback window were not confirmed. Other bureaus or windows are not substituted.");
    const observed = String(value);
    if (stale) return unknown(r, label, required, observed, "The source is stale; recheck before relying on it.");
    return value <= r.threshold! ? pass(r, label, required, observed, "Bureau-specific dated inquiry window compared without assuming duplicates.") : fail(r, label, required, observed, "Confirmed inquiries exceed the documented window threshold.");
  }

  if (r.rule_key === "max_dti_pct") return evaluateDti(r, facts, stale);
  if (r.rule_key === "requires_direct_deposit") return evaluateDirectDeposit(r, facts, stale);
  if (r.rule_key === "allowed_states") return evaluateAllowedStates(r, facts, stale);

  const numericConfig = numericAnswerRules[r.rule_key];
  if (numericConfig) {
    const { label, comparison, description } = numericConfig;
    const required = `${comparison === "min" ? "≥" : "≤"} ${formatValue(r.rule_key, r.threshold ?? 0)}`;
    const input = numericInput(r, facts, numericConfig.key);
    if (input.value == null) return unknown(r, label, required, "Unknown", `The ${description} is unknown or skipped. It is not converted to zero.`);
    const blocked = verificationUnknown(r, label, required, [input]);
    if (blocked) return blocked;
    const observed = `${formatValue(r.rule_key, input.value)} · ${provenanceLabel(input.meta)}`;
    if (stale) return unknown(r, label, required, observed, "The source is stale; recheck before relying on it.");
    const passes = comparison === "min" ? input.value >= r.threshold! : input.value <= r.threshold!;
    const explanation = `Compared with the ${description}; provenance is shown separately from the result.`;
    return passes ? pass(r, label, required, observed, explanation) : fail(r, label, required, observed, explanation);
  }

  const bureauRules: Record<string, { field: string; label: string; comparison: "min" | "max" }> = {
    min_open_tradelines: { field: "open_tradelines", label: "Open tradelines", comparison: "min" },
    min_months_since_bankruptcy: { field: "months_since_bankruptcy", label: "Months since bankruptcy", comparison: "min" },
    max_utilization_pct: { field: "utilization_pct", label: "Revolving utilization", comparison: "max" },
    max_delinquent_accounts: { field: "delinquent_accounts_count", label: "Currently delinquent accounts", comparison: "max" },
    max_collections: { field: "collections_count", label: "Collections", comparison: "max" },
    max_chargeoffs: { field: "chargeoffs_count", label: "Charge-offs", comparison: "max" },
  };
  if (r.rule_key === "max_late_payments") {
    const months = r.lookback_months ?? 24;
    bureauRules["max_late_payments"] = { field: `late_payments_${months}mo`, label: `Late payments (${months} mo)`, comparison: "max" };
  }
  const bureauConfig = bureauRules[r.rule_key];
  if (bureauConfig) {
    const label = `${bureauConfig.label}${r.bureau ? ` (${r.bureau})` : ""}`;
    const required = `${bureauConfig.comparison === "min" ? "≥" : "≤"} ${formatValue(r.rule_key, r.threshold ?? 0)}`;
    const value = bureauValue(r, facts, bureauConfig.field);
    if (value == null) return unknown(r, label, required, "Unknown", "This exact bureau-specific field was not confirmed. Missing or ambiguous report rows are not treated as zero or removal.");
    const observed = formatValue(r.rule_key, value);
    if (stale) return unknown(r, label, required, observed, "The source is stale; recheck before relying on it.");
    const passes = bureauConfig.comparison === "min" ? value >= r.threshold! : value <= r.threshold!;
    const explanation = "Compared only with confirmed report evidence for the stated bureau and field.";
    return passes ? pass(r, label, required, observed, explanation) : fail(r, label, required, observed, explanation);
  }

  return unknown(r, r.rule_key, String(r.text_threshold ?? r.threshold ?? "Documented requirement"), "Not evaluated", "This rule type is not supported by the deterministic engine; it remains a review note.");
}

function improvementForFailure(condition: Condition): string {
  switch (condition.rule_key) {
    case "min_score": return `Confirm the exact ${condition.label} requirement and pursue only accurate credit improvements. No score increase or approval is guaranteed.`;
    case "max_inquiries": return "Review the dated inquiry list for accuracy and consider the cited lookback before new applications; inquiry removal or score impact is not guaranteed.";
    case "max_dti_pct": return "Verify the goal's income and debt inputs, then review whether accurate debt reduction or documented income changes affect the defined ratio.";
    case "max_utilization_pct": return "Use the internal utilization planner to evaluate hypothetical paydowns; this is not a score prediction or funding guarantee.";
    case "min_existing_product_months": return "Document the actual qualifying product and its opening date; do not assume another banking relationship qualifies.";
    case "min_membership_months": return "Confirm actual membership start date and eligibility with the credit union; no membership age is inferred.";
    case "requires_direct_deposit": return "Have staff verify the actual qualifying deposit history required by the cited product.";
    case "allowed_states": return "Confirm current location eligibility directly with the lender before applying.";
    case "max_late_payments":
    case "max_delinquent_accounts":
    case "max_collections":
    case "max_chargeoffs":
    case "min_months_since_bankruptcy": return "Review the underlying report entries and dispute only genuine inaccuracies; removal, score changes and approval are never guaranteed.";
    default: return `Review the documented ${condition.label.toLowerCase()} requirement and supply accurate supporting evidence. Meeting one condition does not guarantee approval.`;
  }
}

export function evaluateProduct(rules: Rule[], facts: Facts, mode: MatchMode, now = new Date()): MatchEvaluation {
  const applicable = rules.filter((r) => mode === "expanded" || r.source_tier === "verified_primary");
  const conditions = applicable.map((r) => evaluateRule(r, facts, now));
  const passes = conditions.filter((c) => c.outcome === "pass").length;
  const primaryFails = conditions.filter((c) => c.source_tier === "verified_primary" && c.outcome === "fail").length;
  const secondaryFails = conditions.filter((c) => c.source_tier !== "verified_primary" && c.outcome === "fail").length;
  const unknowns = conditions.filter((c) => c.outcome === "unknown").length;
  const stale = conditions.some((c) => c.stale);
  const jointUnsupported = facts.applicationMode === "joint" && applicable.length > 0 && !applicable.some((rule) => rule.application_mode === "joint");

  let status: MatchStatus = "needs_review";
  if (!conditions.length) status = "needs_review";
  else if (!jointUnsupported && primaryFails > 0 && unknowns === 0 && !stale) status = "does_not_meet_published";
  else if (!jointUnsupported && primaryFails === 0 && secondaryFails === 0 && unknowns === 0 && !stale) status = "potential_match";

  const score = conditions.length && !jointUnsupported ? Math.round((passes / conditions.length) * 100) : null;
  const failureSteps = conditions.filter((c) => c.outcome === "fail").map(improvementForFailure);
  const unknownSteps = conditions.filter((c) => c.outcome === "unknown").map((condition) => condition.explanation.includes("requires staff-verified")
    ? `Have staff verify the evidence for ${condition.label.toLowerCase()}; self-reported data remains useful but cannot satisfy this specific condition.`
    : `Provide or review evidence for ${condition.label.toLowerCase()}, or leave it Unknown. Unknown is not a denial.`);
  if (jointUnsupported) unknownSteps.push("Joint application support is not documented for this exact product and channel. Keep the result Needs Review; do not substitute individual underwriting criteria.");

  let summary: string;
  if (!conditions.length) summary = "No owner-approved rules in this mode. Needs Review — no suitability score or eligibility conclusion.";
  else if (jointUnsupported) summary = "Needs Review: joint applicability is not established by the cited rules. No suitability score is assigned.";
  else if (status === "does_not_meet_published") summary = "At least one verified published requirement is not met and no required evidence is unknown. This is not a lender decision.";
  else if (status === "potential_match") summary = "All evaluated published conditions pass. Suitability only — not approval probability or a funding guarantee.";
  else summary = `${unknowns} unknown/stale condition(s), ${primaryFails} verified requirement failure(s), ${secondaryFails} secondary signal failure(s). Expanded secondary signals never automatically disqualify but always require review.`;

  return { status, score, conditions, improvement_steps: [...new Set([...failureSteps, ...unknownSteps])], summary, pricing_assumption: PRICING_ASSUMPTION };
}
