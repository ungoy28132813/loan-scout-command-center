import type { MatchEvaluation } from "@/lib/match-engine";

export const SCENARIO_TIERS = ["conservative", "medium", "expanded"] as const;
export type ScenarioTier = typeof SCENARIO_TIERS[number];
export type ScenarioAmounts = Record<ScenarioTier, number | null>;

export interface PlannerProduct {
  id: string;
  name: string;
  lender: string;
  product_type: string;
  amount_kind: string;
  published_min_amount: number | null;
  published_max_amount: number | null;
  published_apr_min: number | null;
  published_apr_max: number | null;
  apr_source_url: string | null;
  apr_as_of: string | null;
  published_term_min_months: number | null;
  published_term_max_months: number | null;
  term_source_url: string | null;
  term_as_of: string | null;
  pull_type: string;
  official_url: string | null;
}

export interface PlannerItemInput {
  product: PlannerProduct;
  amounts: ScenarioAmounts;
  termMonths: number | null;
}

export interface PaymentRange {
  low: number | null;
  high: number | null;
  reason: string;
  termMonths: number | null;
  aprMin: number | null;
  aprMax: number | null;
  sourceUrl: string | null;
  sourceDate: string | null;
  aprSourceUrl: string | null;
  aprSourceDate: string | null;
}

export interface AffordabilityInput {
  goalType: "personal" | "business";
  monthlyGrossIncome: number | null;
  existingMonthlyDebtPayments: number | null;
  monthlyNetCashFlow: number | null;
  provenance: string;
}

export interface TierScenario {
  tier: ScenarioTier;
  cashTotal: number | null;
  knownCashSubtotal: number;
  revolvingLimitTotal: number | null;
  knownRevolvingSubtotal: number;
  unknownAmountProducts: string[];
  paymentLow: number | null;
  paymentHigh: number | null;
  knownPaymentLowSubtotal: number;
  knownPaymentHighSubtotal: number;
  unknownPaymentProducts: string[];
  existingDti: number | null;
  scenarioDtiLow: number | null;
  scenarioDtiHigh: number | null;
  remainingMonthlyIncomeLow: number | null;
  remainingMonthlyIncomeHigh: number | null;
  remainingBusinessCashFlowLow: number | null;
  remainingBusinessCashFlowHigh: number | null;
  affordabilityNote: string;
  assumptions: string[];
}

const roundMoney = (value: number) => Math.round(value * 100) / 100;
const roundPercent = (value: number) => Math.round(value * 10) / 10;
const validAmount = (value: number | null): value is number => value != null && Number.isFinite(value) && value > 0;

/** Standard amortizing-loan arithmetic only. APR and term must come from documented product fields. */
export function amortizingPayment(amount: number, annualAprPct: number, termMonths: number): number | null {
  if (![amount, annualAprPct, termMonths].every(Number.isFinite) || amount <= 0 || annualAprPct < 0 || termMonths <= 0) return null;
  const monthlyRate = annualAprPct / 100 / 12;
  if (monthlyRate === 0) return roundMoney(amount / termMonths);
  return roundMoney(amount * monthlyRate / (1 - Math.pow(1 + monthlyRate, -termMonths)));
}

export function marketingComparison(amount: number | null, product: PlannerProduct): "unknown" | "within" | "below" | "above" {
  if (!validAmount(amount) || (product.published_min_amount == null && product.published_max_amount == null)) return "unknown";
  if (product.published_min_amount != null && amount < product.published_min_amount) return "below";
  if (product.published_max_amount != null && amount > product.published_max_amount) return "above";
  return "within";
}

export function documentedPaymentRange(product: PlannerProduct, amount: number | null, termMonths: number | null): PaymentRange {
  const base = { low: null, high: null, termMonths, aprMin: product.published_apr_min, aprMax: product.published_apr_max, sourceUrl: product.term_source_url, sourceDate: product.term_as_of, aprSourceUrl: product.apr_source_url, aprSourceDate: product.apr_as_of };
  if (product.amount_kind !== "loan_cash") return { ...base, reason: "No amortizing payment inferred for a card, credit line, card feature, or unknown amount type." };
  if (!validAmount(amount)) return { ...base, reason: "Enter a positive hypothetical loan request amount; it is not an expected approval." };
  if ((product.published_term_min_months == null && product.published_term_max_months == null) || !product.term_source_url) return { ...base, reason: "Documented term or its source is Unknown, so payment is Unknown." };
  if (termMonths == null || !Number.isInteger(termMonths) || termMonths <= 0) return { ...base, reason: "Choose a hypothetical term within the documented range." };
  if ((product.published_term_min_months != null && termMonths < product.published_term_min_months) || (product.published_term_max_months != null && termMonths > product.published_term_max_months)) return { ...base, reason: "The selected term is outside the documented range; payment is not calculated." };
  if ((product.published_apr_min == null && product.published_apr_max == null) || !product.apr_source_url) return { ...base, reason: "Documented APR or its source is Unknown, so payment is Unknown." };
  const aprMin = product.published_apr_min ?? product.published_apr_max!;
  const aprMax = product.published_apr_max ?? product.published_apr_min!;
  const low = amortizingPayment(amount, aprMin, termMonths);
  const high = amortizingPayment(amount, aprMax, termMonths);
  if (low == null || high == null) return { ...base, reason: "Payment inputs are invalid; payment remains Unknown." };
  return { ...base, low, high, reason: "Mathematical payment range using the selected hypothetical term and marketed APR endpoints. Rate, term combinations, fees and approval are not guaranteed.", termMonths, aprMin, aprMax };
}

function affordabilityUnknown(input: AffordabilityInput, reason: string): Pick<TierScenario, "existingDti" | "scenarioDtiLow" | "scenarioDtiHigh" | "remainingMonthlyIncomeLow" | "remainingMonthlyIncomeHigh" | "remainingBusinessCashFlowLow" | "remainingBusinessCashFlowHigh" | "affordabilityNote"> {
  return { existingDti: null, scenarioDtiLow: null, scenarioDtiHigh: null, remainingMonthlyIncomeLow: null, remainingMonthlyIncomeHigh: null, remainingBusinessCashFlowLow: null, remainingBusinessCashFlowHigh: null, affordabilityNote: `${reason} Source/provenance: ${input.provenance}. No affordability threshold or approval conclusion is inferred.` };
}

export function calculateTierScenario(items: PlannerItemInput[], tier: ScenarioTier, affordability: AffordabilityInput): TierScenario {
  let knownCashSubtotal = 0;
  let knownRevolvingSubtotal = 0;
  let knownPaymentLowSubtotal = 0;
  let knownPaymentHighSubtotal = 0;
  let unknownCash = false;
  let unknownRevolving = false;
  const unknownAmountProducts: string[] = [];
  const unknownPaymentProducts: string[] = [];
  let anyAmount = false;

  for (const item of items) {
    const amount = item.amounts[tier];
    const label = `${item.product.lender} — ${item.product.name}`;
    if (!validAmount(amount)) {
      unknownAmountProducts.push(label);
      if (item.product.amount_kind === "loan_cash") unknownCash = true;
      else unknownRevolving = true;
      unknownPaymentProducts.push(label);
      continue;
    }
    anyAmount = true;
    if (item.product.amount_kind === "loan_cash") {
      knownCashSubtotal += amount;
      const payment = documentedPaymentRange(item.product, amount, item.termMonths);
      if (payment.low == null || payment.high == null) unknownPaymentProducts.push(label);
      else {
        knownPaymentLowSubtotal += payment.low;
        knownPaymentHighSubtotal += payment.high;
      }
    } else {
      // Credit limits and available card credit are never added to cash funding or treated as a drawn balance.
      knownRevolvingSubtotal += amount;
      unknownPaymentProducts.push(`${label} (revolving balance/payment unknown)`);
    }
  }

  const paymentsComplete = anyAmount && unknownPaymentProducts.length === 0;
  const paymentLow = paymentsComplete ? roundMoney(knownPaymentLowSubtotal) : null;
  const paymentHigh = paymentsComplete ? roundMoney(knownPaymentHighSubtotal) : null;
  let affordabilityMath = affordabilityUnknown(affordability, !anyAmount ? "No positive scenario amounts were entered." : !paymentsComplete ? "Affordability is Unknown because at least one payment or revolving balance/payment is Unknown." : "Affordability inputs are incomplete.");
  if (paymentsComplete && paymentLow != null && paymentHigh != null) {
    if (affordability.goalType === "personal" && affordability.monthlyGrossIncome != null && affordability.monthlyGrossIncome > 0 && affordability.existingMonthlyDebtPayments != null && affordability.existingMonthlyDebtPayments >= 0) {
      const income = affordability.monthlyGrossIncome;
      const debt = affordability.existingMonthlyDebtPayments;
      affordabilityMath = {
        existingDti: roundPercent(debt / income * 100),
        scenarioDtiLow: roundPercent((debt + paymentLow) / income * 100),
        scenarioDtiHigh: roundPercent((debt + paymentHigh) / income * 100),
        remainingMonthlyIncomeLow: roundMoney(income - debt - paymentHigh),
        remainingMonthlyIncomeHigh: roundMoney(income - debt - paymentLow),
        remainingBusinessCashFlowLow: null,
        remainingBusinessCashFlowHigh: null,
        affordabilityNote: `Personal goal math only: existing debt plus hypothetical loan payments divided by goal-specific gross income. Source/provenance: ${affordability.provenance}. No lender DTI definition, threshold or approval is inferred.`,
      };
    } else if (affordability.goalType === "business" && affordability.monthlyNetCashFlow != null) {
      affordabilityMath = {
        existingDti: null,
        scenarioDtiLow: null,
        scenarioDtiHigh: null,
        remainingMonthlyIncomeLow: null,
        remainingMonthlyIncomeHigh: null,
        remainingBusinessCashFlowLow: roundMoney(affordability.monthlyNetCashFlow - paymentHigh),
        remainingBusinessCashFlowHigh: roundMoney(affordability.monthlyNetCashFlow - paymentLow),
        affordabilityNote: `Selected-business math only: monthly net cash flow less hypothetical new loan payments. Existing debt treatment inside reported cash flow is not inferred. Source/provenance: ${affordability.provenance}. No DSCR or approval threshold is inferred.`,
      };
    }
  }

  return {
    tier,
    cashTotal: unknownCash ? null : roundMoney(knownCashSubtotal),
    knownCashSubtotal: roundMoney(knownCashSubtotal),
    revolvingLimitTotal: unknownRevolving ? null : roundMoney(knownRevolvingSubtotal),
    knownRevolvingSubtotal: roundMoney(knownRevolvingSubtotal),
    unknownAmountProducts,
    paymentLow,
    paymentHigh,
    knownPaymentLowSubtotal: roundMoney(knownPaymentLowSubtotal),
    knownPaymentHighSubtotal: roundMoney(knownPaymentHighSubtotal),
    unknownPaymentProducts,
    ...affordabilityMath,
    assumptions: [
      "Conservative, medium and expanded are staff-selected request scenarios, not probability bands or expected approvals.",
      "Only loan_cash amounts enter cash totals; card limits, credit lines and available card credit remain separate and are not drawn balances.",
      "Payments require documented marketed APR and term fields. Unknown APR, terms, balances or payments remain Unknown.",
    ],
  };
}

export function sequencingNote(product: PlannerProduct, evaluation: MatchEvaluation): string {
  const notes: string[] = [];
  if (product.pull_type === "unknown") notes.push("Credit-pull type is Unknown; sequencing is uncertain.");
  else if (product.pull_type === "hard") notes.push("A hard pull is documented; staff ordering does not assume a timing advantage or approval outcome.");
  else if (product.pull_type === "soft_prequal") notes.push("Soft-pull pre-qualification is documented; later application pulls remain unknown unless separately cited.");
  const membership = evaluation.conditions.filter((condition) => ["min_membership_months", "min_existing_product_months", "requires_direct_deposit"].includes(condition.rule_key));
  if (membership.some((condition) => condition.outcome === "unknown")) notes.push("Membership, relationship or direct-deposit evidence is Unknown; confirm it before relying on this order.");
  const bureaus = [...new Set(evaluation.conditions.filter((condition) => ["min_score", "max_inquiries"].includes(condition.rule_key)).map((condition) => {
    const match = condition.label.match(/\((experian|equifax|transunion)/i) ?? condition.label.match(/(experian|equifax|transunion)/i);
    return match?.[1]?.toLowerCase();
  }).filter(Boolean))];
  if (bureaus.length) notes.push(`Cited bureau evidence: ${bureaus.join(", ")}. The lender's actual pull remains unconfirmed unless the product source states it.`);
  if (!notes.length) notes.push("No documented sequencing factors are available; staff order is editorial only.");
  return notes.join(" ");
}

export const PLANNER_DISCLAIMER = "Hypothetical staff planning only. Scenario amounts are not approvals, expected offers or cash guarantees. Card limits and available credit are not cash. Payment math excludes undocumented fees and does not predict credit scores or lender decisions.";
