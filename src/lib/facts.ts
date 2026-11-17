import { supabase } from "@/integrations/supabase/client";
import { businessCoreAnswers, scopedGoalAnswers, type BusinessFinancialProfile, type GoalType } from "@/lib/business-funding";
import type { AnswerProvenance, ApplicationMode, Bureau, Facts } from "@/lib/match-engine";

const GOAL_SCOPED_PERSONAL_KEYS = new Set([
  "annual_income", "monthly_gross_income", "monthly_debt_payments", "housing_payment",
  "existing_product_months", "membership_months", "direct_deposit", "location_state", "application_mode",
]);

type AnswerRow = {
  question_key: string;
  value_numeric: number | null;
  value_text: string | null;
  status: string;
  verified: boolean;
  financial_source?: string;
};

function answerMeta(row: AnswerRow): AnswerProvenance {
  return { status: row.status, verified: row.verified, financial_source: row.financial_source ?? (row.verified ? "staff_entered" : "self_reported") };
}

function splitAnswers(rows: AnswerRow[]) {
  const numeric: Record<string, number | null> = {};
  const text: Record<string, string | null> = {};
  const meta: Record<string, AnswerProvenance> = {};
  for (const row of rows) {
    numeric[row.question_key] = row.status === "answered" ? row.value_numeric : null;
    text[row.question_key] = row.status === "answered" ? row.value_text : null;
    meta[row.question_key] = answerMeta(row);
  }
  return { numeric, text, meta };
}

/** Builds engine facts from confirmed report fields plus only the selected goal's personal or business answers. */
export async function loadFacts(clientId: string, goalId: string): Promise<Facts> {
  const goalResult = await supabase.from("funding_goals").select("id, goal_type, business_profile_id").eq("client_id", clientId).eq("id", goalId).maybeSingle();
  if (goalResult.error || !goalResult.data) throw new Error("Choose a valid funding goal before matching");
  const goal = goalResult.data;
  const isBusiness = goal.goal_type === "business";
  if (isBusiness && !goal.business_profile_id) throw new Error("This business goal has no business profile");

  const [reports, fields, personalAnswers, businessResult, businessAnswers, goalAnswers] = await Promise.all([
    supabase.from("credit_reports").select("id, extraction_status, report_date, created_at").eq("client_id", clientId),
    supabase.from("report_fields").select("report_id, bureau, field_key, score_model, value, needs_review").eq("client_id", clientId),
    supabase.from("questionnaire_answers").select("question_key, value_numeric, value_text, status, verified").eq("client_id", clientId),
    isBusiness ? supabase.from("business_profiles").select("*").eq("client_id", clientId).eq("id", goal.business_profile_id!).maybeSingle() : Promise.resolve({ data: null, error: null }),
    isBusiness ? supabase.from("business_questionnaire_answers").select("question_key, value_numeric, value_text, status, verified, financial_source").eq("client_id", clientId).eq("business_profile_id", goal.business_profile_id!) : Promise.resolve({ data: [], error: null }),
    supabase.from("goal_questionnaire_answers").select("question_key, value_numeric, value_text, status, verified, financial_source").eq("client_id", clientId).eq("goal_id", goalId),
  ]);
  const business = businessResult.data as BusinessFinancialProfile | null;
  if (isBusiness && (businessResult.error || !business)) throw new Error("The selected business profile is unavailable");
  if (businessAnswers.error) throw new Error("Business-specific answers could not be loaded");
  if (goalAnswers.error) throw new Error("Goal-specific answers could not be loaded");
  if (personalAnswers.error) throw new Error("Personal background answers could not be loaded");

  const reps = reports.data ?? [];
  const order = new Map(reps.map((report) => [report.id, new Date(report.report_date ?? report.created_at).getTime()]));
  const sorted = [...(fields.data ?? [])].sort((a, b) => (order.get(a.report_id) ?? 0) - (order.get(b.report_id) ?? 0));
  const bureau: Facts["bureau"] = {};
  const scoreMap = new Map<string, { bureau: Bureau; model: string; value: number | null }>();
  for (const field of sorted) {
    if (field.needs_review) continue;
    const b = field.bureau as Bureau;
    if (field.field_key === "score" && field.score_model) scoreMap.set(`${b}|${field.score_model}`, { bureau: b, model: field.score_model, value: field.value });
    else { bureau[b] = bureau[b] ?? {}; bureau[b]![field.field_key] = field.value; }
  }

  // Legacy client-global financial answers remain background data only. Rule inputs come from the exact goal.
  const personalRows = (personalAnswers.data ?? []).filter((answer) => !GOAL_SCOPED_PERSONAL_KEYS.has(answer.question_key));
  const personal = splitAnswers(personalRows);
  const businessSpecific = splitAnswers((businessAnswers.data ?? []) as AnswerRow[]);
  const goalSpecific = splitAnswers((goalAnswers.data ?? []) as AnswerRow[]);
  const scopedNumeric = scopedGoalAnswers({ goalType: goal.goal_type as GoalType, personalAnswers: personal.numeric, business, businessAnswers: businessSpecific.numeric });
  const answers = { ...scopedNumeric, ...goalSpecific.numeric };

  const core = business ? businessCoreAnswers(business) : {};
  const coreMeta = Object.fromEntries(Object.keys(core).map((key) => [key, {
    status: core[key as keyof typeof core] == null ? "unknown" : "answered",
    verified: business?.verification_status === "verified",
    financial_source: business?.financial_source ?? "self_reported",
  }]));
  const answerMetaByScope = isBusiness
    ? { ...businessSpecific.meta, ...coreMeta, location_state: { status: business?.location_state ? "answered" : "unknown", verified: business?.verification_status === "verified", financial_source: business?.financial_source ?? "self_reported" }, ...goalSpecific.meta }
    : { ...personal.meta, ...goalSpecific.meta };
  const answerTexts = isBusiness
    ? { location_state: business?.location_state ?? null, ...goalSpecific.text }
    : { ...personal.text, ...goalSpecific.text };
  const applicationAnswer = goalSpecific.text["application_mode"];
  const applicationMode: ApplicationMode = applicationAnswer === "individual" || applicationAnswer === "joint" ? applicationAnswer : "unknown";

  const criticalWarnings: string[] = [];
  if (reps.length === 0) criticalWarnings.push("No credit report on file.");
  for (const report of reps) {
    if (report.extraction_status === "unreadable" || report.extraction_status === "clearer_pdf_requested") criticalWarnings.push("A report is unreadable — clearer PDF requested.");
    if (report.extraction_status === "awaiting_manual_entry") criticalWarnings.push("A report has not had its data entered yet.");
  }
  if ((fields.data ?? []).some((field) => field.needs_review)) criticalWarnings.push("Some automatically read report values still need staff review and were not used.");
  if (business && business.verification_status !== "verified") criticalWarnings.push("The selected business financial profile is self-reported or not fully verified; every result requires review.");
  if ((businessAnswers.data ?? []).some((answer) => answer.status === "answered" && !answer.verified)) criticalWarnings.push("Some business-specific follow-up answers are self-reported and unverified.");
  if ((goalAnswers.data ?? []).some((answer) => answer.status === "answered" && !answer.verified)) criticalWarnings.push("Some goal-specific answers are self-reported and unverified; rules requiring verified evidence will remain Unknown.");
  if (applicationMode === "joint") criticalWarnings.push("Joint application selected; only rules explicitly documented for that exact joint path can support a potential match.");

  return {
    scores: [...scoreMap.values()],
    bureau,
    answers,
    answerTexts,
    answerMeta: answerMetaByScope,
    applicationMode,
    criticalWarnings: [...new Set(criticalWarnings)],
  };
}
