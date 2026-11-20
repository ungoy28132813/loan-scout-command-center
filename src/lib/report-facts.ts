import { sameScoreModel, type Bureau, type Facts } from "@/lib/match-engine";

export interface FactReport {
  id: string;
  extraction_status: string;
  report_date: string | null;
  created_at: string;
  report_type: string;
}

export interface FactField {
  report_id: string;
  bureau: string;
  field_key: string;
  score_model: string | null;
  value: number | null;
  needs_review: boolean;
  confidence?: string | null;
  status?: string;
}

const BUREAUS: Bureau[] = ["transunion", "experian", "equifax"];
const UNREADABLE = new Set(["unreadable", "awaiting_manual_entry", "clearer_pdf_requested"]);

/** Latest snapshot per bureau, never a merge of old and new fields. Conflicts remain unknown. */
export function selectReportFacts(reports: FactReport[], fields: FactField[]): Pick<Facts, "scores" | "bureau" | "criticalWarnings"> {
  const scores: Facts["scores"] = [];
  const bureau: Facts["bureau"] = {};
  const warnings = new Set<string>();
  if (!reports.length) warnings.add("No credit report on file.");

  for (const b of BUREAUS) {
    const candidates = reports.filter((report) => {
      const detected = fields.filter((field) => field.report_id === report.id).map((field) => field.bureau);
      return report.report_type === b || report.report_type === "tri_merge" || detected.includes(b)
        || report.report_type === "unknown" && !detected.length;
    });
    if (!candidates.length) continue;
    if (candidates.length > 1 && candidates.some((report) => !report.report_date || !Number.isFinite(Date.parse(report.report_date)))) {
      warnings.add(`${b}: report dates are missing or invalid; current evidence cannot be selected safely.`);
      continue;
    }
    if (candidates.length === 1 && !candidates[0]?.report_date) warnings.add(`${b}: report date is unknown; freshness requires review.`);
    const latestDate = Math.max(...candidates.map((report) => Date.parse(report.report_date ?? report.created_at)));
    const current = candidates.filter((report) => Date.parse(report.report_date ?? report.created_at) === latestDate);
    if (!current.length || current.some((report) => UNREADABLE.has(report.extraction_status) || report.extraction_status !== "verified")) {
      warnings.add(`${b}: the latest report is unreadable or not staff-verified; older values were not substituted.`);
      continue;
    }
    const ids = new Set(current.map((report) => report.id));
    const rows = fields.filter((field) => ids.has(field.report_id) && field.bureau === b);
    const groups: FactField[][] = [];
    for (const row of rows) {
      if (row.field_key === "score" && !row.score_model) {
        warnings.add(`${b}: a score has no stated model and was not used.`);
        continue;
      }
      const group = groups.find((items) => {
        const first = items[0];
        return first?.field_key === row.field_key && (row.field_key !== "score"
          || Boolean(first.score_model && row.score_model && sameScoreModel(first.score_model, row.score_model)));
      });
      if (group) group.push(row); else groups.push([row]);
    }
    for (const group of groups) {
      const first = group[0];
      if (!first) continue;
      const values = new Set(group.map((row) => row.value));
      const unusable = group.some((row) => row.needs_review || row.status !== "verified" || row.confidence === "low" || row.value == null || !Number.isFinite(row.value));
      const value = unusable || values.size !== 1 ? null : first.value;
      if (unusable || values.size !== 1) warnings.add(`${b}: missing, low-confidence, flagged or conflicting ${first.field_key} evidence remains Unknown.`);
      if (first.field_key === "score" && first.score_model) scores.push({ bureau: b, model: first.score_model, value });
      else {
        const bucket = bureau[b] ?? {};
        bucket[first.field_key] = value;
        bureau[b] = bucket;
      }
    }
  }
  return { scores, bureau, criticalWarnings: [...warnings] };
}