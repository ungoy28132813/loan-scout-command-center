import { bureausIn, headerOrder } from "./detect";
import { modelIn } from "./models";
import { rowValues } from "./text";
import type { Bureau, ExtractedField, ExtractedScore, PageText } from "./types";

/** Provider layouts are recognized by their headings, not by filenames or guessed models. */
export function readFormatSummaries(pages: PageText[], scoreDate: string | null, ocrPages: ReadonlySet<number> = new Set()): { scores: ExtractedScore[]; fields: ExtractedField[] } {
  const scores: ExtractedScore[] = [];
  const fields: ExtractedField[] = [];
  const summaryCards = pages.some((p) => p.lines.some((l) => /^Credit Score and Rating$/i.test(l)));
  const modelFor = (bureau: Bureau, pageIndex: number): { model: string | null; ocr: boolean } => {
    // Only the score section and adjacent disclosure page. A model mentioned elsewhere
    // (education, simulator, or an account) cannot supply the report's scoring model.
    const hits = new Set<string | null>();
    let ocr = false;
    for (const p of pages.slice(pageIndex, pageIndex + 2)) {
      for (const line of p.lines) {
        if (!/credit score (?:provided|shown)|scores? (?:are |is )?(?:calculated|based)|scoring model|score model/i.test(line)) continue;
        if (/simulat|example|may use|lenders? use|different model/i.test(line)) continue;
        const named = bureausIn(line);
        if (named.length && !named.includes(bureau)) continue;
        const hit = modelIn(line);
        if (hit) { hits.add(hit.model); ocr ||= ocrPages.has(p.page); }
      }
    }
    return { model: hits.size === 1 ? [...hits][0] ?? null : null, ocr };
  };
  let summaryBureau: Bureau | null = null;
  let accountTable = false;
  for (const [pageIndex, p] of pages.entries()) {
    let scoreSection = false;
    let scoreHeader: Bureau[] | null = null;
    let headerAt = -1;
    let utilizationSection = false;
    for (const [i, line] of p.lines.entries()) {
      if (/^(?:Credit Scores|Credit Score and Rating)$/i.test(line)) {
        scoreSection = true; scoreHeader = null; headerAt = -1;
      } else if (/^(?:Personal Information|Summary|Credit Utilization|Account History|Factors affecting|Other Credit Items|\d+\.\s)/i.test(line) || /Accounts Summary$/i.test(line)) {
        scoreSection = false;
      }
      if (scoreSection) {
        const h = headerOrder(line);
        if (h) { scoreHeader = h; headerAt = i; }
        // Require a complete row of score cells or explicit blanks, directly below
        // the printed header. Never read footnote markers, ratings, or score factors.
        else if (scoreHeader && i - headerAt <= 3 && /^(?:\d{3}|-+|N\/A|Not Reported)(?:\s+(?:\d{3}|-+|N\/A|Not Reported))*$/i.test(line)) {
          const values = rowValues(line);
          if (values.length !== scoreHeader.length) continue;
          const localModels = p.lines.slice(Math.max(0, headerAt - 3), i).map(modelIn).filter((hit) => hit !== null);
          const distinct = new Set(localModels.map((hit) => hit.model));
          for (const [k, bureau] of scoreHeader.entries()) {
            const value = values[k];
            if (value == null || !Number.isInteger(value) || value < 300 || value > 850) continue;
            const disclosure = distinct.size ? { model: distinct.size === 1 ? [...distinct][0] ?? null : null, ocr: ocrPages.has(p.page) } : summaryCards ? modelFor(bureau, pageIndex) : { model: null, ocr: false };
            const { model, ocr } = disclosure;
            scores.push({ bureau, model, value, scoreDate, page: p.page, confidence: model && !ocr ? "high" : "low", needsReview: !model || ocr,
              evidence: `${ocr ? "OCR" : "Auto"}: page ${p.page}, printed credit score grid${model ? "" : " — exact score model not stated"}${ocr ? " — model disclosure read by OCR" : ""}` });
          }
          scoreSection = false;
        }
      }

      // SmartCredit's AVAILABLE column is not assumed to be a credit limit.
      // Read the explicitly printed percentage only, never balance/available arithmetic.
      if (/^Credit Utilization$/i.test(line)) utilizationSection = true;
      else if (/^(?:Account History|Account Number|\d+%\s*Credit Utilization|Personal Information)/i.test(line)) utilizationSection = false;
      if (utilizationSection) {
        const bureau = bureausIn(line);
        const pct = line.match(/(?:^|\s)(\d+(?:\.\d+)?)%\s*$/);
        if (bureau.length === 1 && pct) {
          const value = Number(pct[1]);
          const target = bureau[0];
          if (target && Number.isFinite(value) && value >= 0 && value <= 1000) fields.push(field(target, "utilization_pct", value, p.page, "printed revolving utilization percentage"));
        }
      }

      // Equifax-powered three-bureau summaries used by IQ: per-bureau tables
      // can continue onto the following page. Only the full known column header
      // activates the table; mortgage/total ratios must never become card utilization.
      const named = bureausIn(line);
      if (/Accounts Summary$/i.test(line) && named.length === 1) {
        summaryBureau = named[0] ?? null; accountTable = false;
      }
      if (/^Account Type\s+Open\s+With Balance\s+Total Balance\s+Available\s+Credit Limit\s+Debt-To-Credit\s+Payment$/i.test(line)) accountTable = true;
      if (/^Other Credit Items|^\d+\.\s|^Credit Score|^Account (?:Number|Details)/i.test(line)) { summaryBureau = null; accountTable = false; }
      if (summaryBureau && accountTable && /^(?:Revolving|Total)\s/i.test(line)) {
        const values = rowValues(line.replace(/^(?:Revolving|Total)\s+/i, ""));
        if (values.length !== 7) continue;
        if (/^Revolving\s/i.test(line)) {
          const value = values[5];
          if (value != null && value >= 0 && value <= 1000 && /\d(?:\.\d+)?%/.test(line)) fields.push(field(summaryBureau, "utilization_pct", value, p.page, "revolving Debt-To-Credit column"));
        } else {
          const value = values[0];
          if (value != null && Number.isInteger(value) && value >= 0) fields.push(field(summaryBureau, "open_tradelines", value, p.page, "total open accounts column"));
          accountTable = false;
        }
      }
    }
  }
  return { scores, fields };
}

function field(bureau: Bureau, key: string, value: number, page: number, label: string): ExtractedField {
  return { bureau, key, value, page, confidence: "high", needsReview: false, evidence: `Auto: page ${page}, ${label}` };
}