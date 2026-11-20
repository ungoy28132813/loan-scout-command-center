import { describe, expect, it } from "vitest";
import { selectReportFacts, type FactField, type FactReport } from "./report-facts";

const old: FactReport = { id: "old", extraction_status: "verified", report_date: "2026-10-01", created_at: "2026-11-20", report_type: "transunion" };
const recent: FactReport = { ...old, id: "recent", report_date: "2026-11-01", created_at: "2026-11-01" };
const score = (report_id: string, value: number, score_model = "FICO 8"): FactField => ({ report_id, value, score_model, bureau: "transunion", field_key: "score", needs_review: false, status: "verified" });

describe("current report evidence", () => {
  it("uses report date, not later upload time, to select the current score", () => {
    expect(selectReportFacts([recent, old], [score("old", 760), score("recent", 610)]).scores[0]?.value).toBe(610);
  });
  it("does not inherit an old score when the newer snapshot only has an account count", () => {
    const count: FactField = { ...score("recent", 2), field_key: "open_trades", score_model: null };
    const result = selectReportFacts([old, recent], [score("old", 760), count]);
    expect(result.scores).toEqual([]);
    expect(result.bureau.transunion?.["open_trades"]).toBe(2);
  });
  it("never substitutes a historical score for an unreadable newer report", () => {
    expect(selectReportFacts([old, { ...recent, extraction_status: "unreadable" }], [score("old", 760)]).scores).toEqual([]);
  });
  it("keeps conflicting FICO 08/FICO 8 aliases unknown rather than selecting a favorable value", () => {
    const result = selectReportFacts([recent], [score("recent", 760, "FICO 08"), score("recent", 610)]);
    expect(result.scores).toHaveLength(1);
    expect(result.scores[0]?.value).toBeNull();
  });
  it("preserves exact model and bureau isolation", () => {
    const ex = { ...recent, id: "ex", report_type: "experian" };
    const result = selectReportFacts([recent, ex], [score("recent", 610), score("recent", 700, "VantageScore 3.0"), { ...score("ex", 750), bureau: "experian" }]);
    expect(result.scores).toEqual([{ bureau: "transunion", model: "FICO 8", value: 610 }, { bureau: "transunion", model: "VantageScore 3.0", value: 700 }, { bureau: "experian", model: "FICO 8", value: 750 }]);
  });
  it("keeps explicit zero but not a null or review-flagged value", () => {
    const field = { ...score("recent", 0), field_key: "collections", score_model: null };
    expect(selectReportFacts([recent], [field]).bureau.transunion?.["collections"]).toBe(0);
    expect(selectReportFacts([recent], [{ ...field, value: null }]).bureau.transunion?.["collections"]).toBeNull();
    expect(selectReportFacts([recent], [{ ...field, needs_review: true }]).bureau.transunion?.["collections"]).toBeNull();
  });
  it("does not invent freshness for multiple undated reports", () => {
    expect(selectReportFacts([old, { ...recent, report_date: null }], [score("old", 760), score("recent", 610)]).scores).toEqual([]);
  });
  it("treats same-date conflicting snapshots as ambiguous", () => {
    expect(selectReportFacts([recent, { ...recent, id: "second" }], [score("recent", 610), score("second", 760)]).scores[0]?.value).toBeNull();
  });
  it("keeps an automatically confirmed low-confidence reading out of eligibility facts", () => {
    expect(selectReportFacts([recent], [{ ...score("recent", 760), confidence: "low" }]).scores[0]?.value).toBeNull();
    expect(selectReportFacts([recent], [{ ...score("recent", 610), confidence: "high" }]).scores[0]?.value).toBe(610);
  });
  it("never trusts an automatically received report or extracted field before staff verification", () => {
    expect(selectReportFacts([{ ...recent, extraction_status: "complete_unverified" }], [score("recent", 760)]).scores).toEqual([]);
    expect(selectReportFacts([recent], [{ ...score("recent", 760), status: "extracted" }]).scores[0]?.value).toBeNull();
  });
});