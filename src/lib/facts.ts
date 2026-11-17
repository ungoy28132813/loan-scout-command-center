import { supabase } from "@/integrations/supabase/client";
import type { Bureau, Facts } from "@/lib/match-engine";

/** Builds engine facts from staff-entered report fields (latest report wins per bureau/key) + questionnaire. */
export async function loadFacts(clientId: string): Promise<Facts> {
  const [reports, fields, answers] = await Promise.all([
    supabase.from("credit_reports").select("id, extraction_status, report_date, created_at").eq("client_id", clientId),
    supabase.from("report_fields").select("report_id, bureau, field_key, score_model, value").eq("client_id", clientId),
    supabase.from("questionnaire_answers").select("question_key, value_numeric, status").eq("client_id", clientId),
  ]);
  const reps = reports.data ?? [];
  const order = new Map(reps.map((r) => [r.id, new Date(r.report_date ?? r.created_at).getTime()]));
  const sorted = [...(fields.data ?? [])].sort((a, b) => (order.get(a.report_id) ?? 0) - (order.get(b.report_id) ?? 0));
  const bureau: Facts["bureau"] = {};
  const scoreMap = new Map<string, { bureau: Bureau; model: string; value: number | null }>();
  for (const f of sorted) {
    const b = f.bureau as Bureau;
    if (f.field_key === "score" && f.score_model) scoreMap.set(`${b}|${f.score_model}`, { bureau: b, model: f.score_model, value: f.value });
    else { bureau[b] = bureau[b] ?? {}; bureau[b]![f.field_key] = f.value; }
  }
  const ans: Record<string, number | null> = {};
  for (const a of answers.data ?? []) ans[a.question_key] = a.status === "answered" ? a.value_numeric : null;
  const criticalWarnings: string[] = [];
  if (reps.length === 0) criticalWarnings.push("No credit report on file.");
  for (const r of reps) {
    if (r.extraction_status === "unreadable" || r.extraction_status === "clearer_pdf_requested") criticalWarnings.push("A report is unreadable — clearer PDF requested.");
    if (r.extraction_status === "awaiting_manual_entry") criticalWarnings.push("A report has not had its data entered yet.");
  }
  return { scores: [...scoreMap.values()], bureau, answers: ans, criticalWarnings: [...new Set(criticalWarnings)] };
}
