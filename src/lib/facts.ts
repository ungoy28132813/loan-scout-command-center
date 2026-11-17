import { supabase } from "@/integrations/supabase/client";
import { scopedGoalAnswers, type BusinessFinancialProfile, type GoalType } from "@/lib/business-funding";
import type { Bureau, Facts } from "@/lib/match-engine";

/** Builds engine facts from confirmed report fields plus only the selected goal's personal or business answers. */
export async function loadFacts(clientId: string, goalId: string): Promise<Facts> {
  const goalResult = await supabase.from("funding_goals").select("id, goal_type, business_profile_id").eq("client_id", clientId).eq("id", goalId).maybeSingle();
  if (goalResult.error || !goalResult.data) throw new Error("Choose a valid funding goal before matching");
  const goal = goalResult.data;
  const isBusiness = goal.goal_type === "business";
  if (isBusiness && !goal.business_profile_id) throw new Error("This business goal has no business profile");

  const [reports, fields, personalAnswers, businessResult, businessAnswers] = await Promise.all([
    supabase.from("credit_reports").select("id, extraction_status, report_date, created_at").eq("client_id", clientId),
    supabase.from("report_fields").select("report_id, bureau, field_key, score_model, value, needs_review").eq("client_id", clientId),
    supabase.from("questionnaire_answers").select("question_key, value_numeric, status").eq("client_id", clientId),
    isBusiness ? supabase.from("business_profiles").select("*").eq("client_id", clientId).eq("id", goal.business_profile_id!).maybeSingle() : Promise.resolve({ data: null, error: null }),
    isBusiness ? supabase.from("business_questionnaire_answers").select("question_key, value_numeric, status, verified").eq("client_id", clientId).eq("business_profile_id", goal.business_profile_id!) : Promise.resolve({ data: [], error: null }),
  ]);
  const business = businessResult.data as BusinessFinancialProfile | null;
  if (isBusiness && (businessResult.error || !business)) throw new Error("The selected business profile is unavailable");
  if (businessAnswers.error) throw new Error("Business-specific answers could not be loaded");

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

  const personal: Record<string, number | null> = {};
  for (const answer of personalAnswers.data ?? []) personal[answer.question_key] = answer.status === "answered" ? answer.value_numeric : null;
  const businessSpecific: Record<string, number | null> = {};
  for (const answer of businessAnswers.data ?? []) businessSpecific[answer.question_key] = answer.status === "answered" ? answer.value_numeric : null;
  const answers = scopedGoalAnswers({ goalType: goal.goal_type as GoalType, personalAnswers: personal, business, businessAnswers: businessSpecific });

  const criticalWarnings: string[] = [];
  if (reps.length === 0) criticalWarnings.push("No credit report on file.");
  for (const report of reps) {
    if (report.extraction_status === "unreadable" || report.extraction_status === "clearer_pdf_requested") criticalWarnings.push("A report is unreadable — clearer PDF requested.");
    if (report.extraction_status === "awaiting_manual_entry") criticalWarnings.push("A report has not had its data entered yet.");
  }
  if ((fields.data ?? []).some((field) => field.needs_review)) criticalWarnings.push("Some automatically read report values still need staff review and were not used.");
  if (business && business.verification_status !== "verified") criticalWarnings.push("The selected business financial profile is self-reported or not fully verified; every result requires review.");
  if ((businessAnswers.data ?? []).some((answer) => answer.status === "answered" && !answer.verified)) criticalWarnings.push("Some business-specific follow-up answers are self-reported and unverified.");
  return { scores: [...scoreMap.values()], bureau, answers, criticalWarnings: [...new Set(criticalWarnings)] };
}
