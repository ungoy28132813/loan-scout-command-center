import { detectBureaus, detectProvider, bureausIn, hasTextLayer, headerOrder } from "./detect";
import { fieldsFromDatedInquiries } from "./inquiries";
import { readFormatSummaries } from "./formats";
import { modelIn } from "./models";
import { datesIn, last4, maskSensitive, normalizeLine, parseDate, rowValues } from "./text";
import type { Bureau, Confidence, ExtractedField, ExtractedScore, ExtractedTradeline, PageText, ParseResult } from "./types";

export const PARSER_VERSION = "ls-parse-1.2.0";

/** Summary rows mapped only when the label states the exact window/meaning. Anything else stays Unknown. */
const FIELD_ROWS: [RegExp, string][] = [
  [/^(?:hard\s+)?inquiries\s*(?:\((?:last\s*)?30\s*(?:days?|d)\)|(?:in\s+)?(?:the\s+)?last\s+30\s*(?:days?|d))/i, "inquiries_30d"],
  [/^(?:hard\s+)?inquiries\s*(?:\((?:last\s*)?3\s*mo(?:nths?)?\)|(?:in\s+)?(?:the\s+)?last\s+3\s*mo(?:nths?)?)/i, "inquiries_3mo"],
  [/^(?:hard\s+)?inquiries\s*(?:\((?:last\s*)?6\s*mo(?:nths?)?\)|(?:in\s+)?(?:the\s+)?last\s+6\s*mo(?:nths?)?)/i, "inquiries_6mo"],
  [/^(?:hard\s+)?inquiries\s*(?:\((?:last\s*)?12\s*mo(?:nths?)?\)|(?:in\s+)?(?:the\s+)?last\s+12\s*mo(?:nths?)?)/i, "inquiries_12mo"],
  [/^(?:hard\s+)?inquiries\s*(?:\((?:last\s*)?24\s*mo(?:nths?)?\)|(?:in\s+)?(?:the\s+)?last\s+24\s*mo(?:nths?)?)/i, "inquiries_24mo"],
  [/^(?:hard\s+)?inquiries\s*\((?:last\s*)?2\s*years?\)/i, "inquiries_24mo"],
  [/^open\s+accounts\b/i, "open_tradelines"],
  [/^(?:revolving\s+)?(?:credit\s+)?utilization\b/i, "utilization_pct"],
  [/^collections?\b(?!\s+agency)/i, "collections_count"],
  [/^(?:charge[- ]?offs?|charged[- ]?off\s+accounts?)\b/i, "chargeoffs_count"],
  [/^(?:currently\s+)?delinquent(?:\s+accounts)?\b/i, "delinquent_accounts_count"],
  [/^(?:30[- ]day|30\s+days?)\s+(?:late\s+payments?|lates?|delinquenc(?:y|ies))/i, "late_30_count"],
  [/^(?:60[- ]day|60\s+days?)\s+(?:late\s+payments?|lates?|delinquenc(?:y|ies))/i, "late_60_count"],
  [/^(?:90[- ]day|90\s+days?)\s+(?:late\s+payments?|lates?|delinquenc(?:y|ies))/i, "late_90_count"],
  [/^late\s+payments\s*\((?:last\s*)?24\s*mo(?:nths?)?\)/i, "late_payments_24mo"],
  [/^months\s+since\s+(?:bankruptcy|bankruptcy\s+filing)/i, "months_since_bankruptcy"],
];
const SCORE_ROW = /^(?:(?:trans\s?union|experian|equifax)\s+)?(?:credit\s+score|fico\s*(?:score)?[\s\w().]*|vantage\s?score[\s\w().]*|score)\s*:?\s/i;

interface Ctx { header: Bureau[] | null; headerLine: number }
interface ParseOptions {
  truncated?: boolean;
  originalHasTextLayer?: boolean;
  ocrPages?: number[];
  ocrTruncated?: boolean;
}

function labelAndRest(line: string): [string, string] {
  const i = line.indexOf(":");
  if (i > 0 && i < 60) return [line.slice(0, i), line.slice(i + 1)];
  const m = line.match(/^([^\d$]*?)\s(?=[\d$-])/);
  return m ? [m[1]!, line.slice(m[1]!.length)] : [line, ""];
}

function monthsBetween(earlier: string, later: string): number | null {
  const a = new Date(`${earlier}T00:00:00Z`);
  const b = new Date(`${later}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || a > b) return null;
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth();
  if (b.getUTCDate() < a.getUTCDate()) months--;
  return Math.max(0, months);
}

export function parseReportText(rawPages: PageText[], opts: ParseOptions = {}): ParseResult {
  const pages = rawPages.map((p) => ({ page: p.page, lines: p.lines.map(normalizeLine).filter(Boolean) }));
  const all = pages.flatMap((p) => p.lines).join("\n");
  const warnings: string[] = [];
  const ocrPages = new Set(opts.ocrPages ?? []);
  const ocrUsed = ocrPages.size > 0;
  const originalHasTextLayer = opts.originalHasTextLayer ?? hasTextLayer(pages);
  const base = {
    parserVersion: PARSER_VERSION, provider: detectProvider(all), pageCount: pages.length,
    scores: [] as ExtractedScore[], fields: [] as ExtractedField[], tradelines: [] as ExtractedTradeline[],
  };
  if (opts.truncated) warnings.push("Only the first 80 pages were read. Remaining pages need manual review.");
  if (opts.ocrTruncated) warnings.push("Local OCR was limited to 20 scanned pages. Remaining scanned pages need manual review or a text-based PDF.");
  if (ocrUsed) warnings.push("Local English-language OCR was used inside this browser. OCR values have low confidence and require staff review; unsupported languages or poor scans may remain unreadable.");
  if (!hasTextLayer(pages)) {
    return { ...base, bureausDetected: [], reportType: "unknown", reportDate: null, hasTextLayer: originalHasTextLayer, ocrUsed, status: "unreadable",
      warnings: [...warnings, ocrUsed
        ? "Local OCR could not recover enough readable English text. Try a clearer upright scan or a text-based PDF; nothing was extracted."
        : "No text layer detected — this looks like a scanned/image PDF. Local OCR was not available. Nothing was extracted."] };
  }
  const bureausDetected = detectBureaus(pages);
  const single: Bureau | null = bureausDetected.length === 1 ? bureausDetected[0]! : null;
  const reportType: ParseResult["reportType"] = bureausDetected.length >= 2 ? "tri_merge" : single ?? "unknown";
  if (!bureausDetected.length) warnings.push("No credit bureau named in the report text — bureau-specific values were not extracted.");

  const reportDates = new Set<string | null>();
  const scoreDates = new Set<string | null>();
  for (const line of pages.flatMap((p) => p.lines)) {
    if (/^report\s*date\b/i.test(line)) datesIn(line).forEach((date) => reportDates.add(date));
    if (/^(?:score\s*date|date\s*of\s*score|scores?\s+as\s+of)\b/i.test(line)) datesIn(line).forEach((date) => scoreDates.add(date));
  }
  const reportDate = reportDates.size === 1 ? [...reportDates][0] ?? null : null;
  const scoreDate = scoreDates.size === 1 ? [...scoreDates][0] ?? null : null;
  if (reportDates.size > 1) warnings.push("Printed report dates disagree; the snapshot date and date-based calculations stay Unknown until staff review.");
  if (scoreDates.size > 1) warnings.push("Printed score dates disagree; the score date stays Unknown until staff review.");

  const scores: ExtractedScore[] = [];
  const fields: ExtractedField[] = [];
  const tradelines: ExtractedTradeline[] = [];
  const fieldKeys = new Map<string, ExtractedField>();
  const pushField = (field: ExtractedField) => {
    const key = `${field.bureau}|${field.key}`;
    const existing = fieldKeys.get(key);
    if (!existing) { fieldKeys.set(key, field); fields.push(field); return; }
    if (existing.value === field.value) return;
    existing.needsReview = true;
    existing.confidence = "low";
    field.needsReview = true;
    field.confidence = "low";
    fields.push(field);
    fieldKeys.set(key, field);
    warnings.push(`Page ${field.page}: conflicting ${field.key.replace(/_/g, " ")} values were kept for review; neither was treated as confirmed.`);
  };

  const format = readFormatSummaries(pages, scoreDate, ocrPages);
  scores.push(...format.scores);
  format.fields.forEach(pushField);

  let blockIdx = 0;
  let ambiguousScoreRows = 0;
  const seenAccounts = new Set<string>();

  for (const p of pages) {
    const ctx: Ctx = { header: null, headerLine: -1 };
    for (let i = 0; i < p.lines.length; i++) {
      const line = p.lines[i]!;
      const h = headerOrder(line);
      if (h) { ctx.header = h; ctx.headerLine = i; continue; }
      const cols = ctx.header && i - ctx.headerLine <= 60 ? ctx.header : null;

      // ---- Scores ----
      if (SCORE_ROW.test(line) && !/range|factor|simulator|goal|change/i.test(line)) {
        const [label, rest] = labelAndRest(line);
        const nums = rowValues(rest);
        const inRange = nums.filter((n): n is number => n != null && Number.isInteger(n) && n >= 300 && n <= 850);
        if (inRange.length && inRange.length === nums.filter((n) => n != null).length) {
          let hit = modelIn(label);
          let sameLine = !!hit;
          if (!hit) {
            const window = p.lines.slice(Math.max(0, i - 4), i).map(modelIn).filter(Boolean);
            const distinct = new Set(window.map((w) => w!.model ?? "?"));
            if (distinct.size === 1) hit = window[0]!; else if (distinct.size > 1) hit = { model: null, vague: true };
            sameLine = false;
          }
          const model = hit?.model ?? null;
          const inlineB = bureausIn(label);
          let assign: [Bureau, number][] = [];
          if (inlineB.length === 1 && inRange.length === 1) assign = [[inlineB[0]!, inRange[0]!]];
          else if (cols && nums.length === cols.length) assign = cols.flatMap((b, k) => (nums[k] != null ? [[b, nums[k]!] as [Bureau, number]] : []));
          else if (single && inRange.length === 1 && inlineB.length === 0) assign = [[single, inRange[0]!]];
          if (!assign.length) { ambiguousScoreRows++; continue; }
          const conf: Confidence = model && (sameLine || inlineB.length === 1 || cols) ? "high" : model ? "medium" : "low";
          for (const [b, v] of assign) {
            if (scores.some((s) => s.bureau === b && s.model === model && s.value === v)) continue;
            scores.push({ bureau: b, model, value: v, scoreDate, page: p.page, confidence: conf, needsReview: !model || conf !== "high",
              evidence: `Auto: page ${p.page}, "${maskSensitive(label.trim()).slice(0, 40)}" row${model ? "" : " — score model not stated"}` });
          }
          continue;
        }
      }

      // ---- Bankruptcy presence and explicit filing dates ----
      if (/^bankruptcy(?:\s+on\s+file)?\s*:?/i.test(line) && !/filed|filing|discharg|date|months\s+since/i.test(line)) {
        const [label, rest] = labelAndRest(line);
        const tokens = rest.trim().split(/\s{3,}|\s*\|\s*/).filter(Boolean);
        const values = tokens.map((token) => /^(?:yes|y|true|1)$/i.test(token.trim()) ? 1 : /^(?:no|n|false|0)$/i.test(token.trim()) ? 0 : null);
        const targets = cols ?? (single ? [single] : null);
        if (targets && values.length === targets.length) targets.forEach((bureau, k) => {
          const value = values[k];
          if (value != null) pushField({ bureau, key: "bankruptcy_on_file", value, page: p.page, confidence: cols ? "high" : "medium", needsReview: !cols, evidence: `Auto: page ${p.page}, "${label.slice(0, 40)}" row` });
        });
        continue;
      }
      if (/^bankruptcy\s+(?:filed|filing)(?:\s+date)?\s*:?/i.test(line)) {
        const [label, rest] = labelAndRest(line);
        const dates = rest.trim().split(/\s{3,}|\s*\|\s*/).filter(Boolean).map((token) => /^--?$|^n\/?a$/i.test(token) ? null : parseDate(token));
        const targets = cols ?? (single ? [single] : null);
        if (targets && dates.length === targets.length) targets.forEach((bureau, k) => {
          const filed = dates[k];
          if (!filed) return;
          pushField({ bureau, key: "bankruptcy_on_file", value: 1, page: p.page, confidence: cols ? "high" : "medium", needsReview: !cols, evidence: `Auto: page ${p.page}, "${label.slice(0, 40)}" row` });
          const months = reportDate ? monthsBetween(filed, reportDate) : null;
          if (months != null) pushField({ bureau, key: "months_since_bankruptcy", value: months, page: p.page, confidence: "medium", needsReview: true, evidence: `Auto: page ${p.page}, filing date to report date` });
        });
        if (!reportDate) warnings.push(`Page ${p.page}: bankruptcy filing date found, but months since filing stay Unknown because the report date is Unknown.`);
        continue;
      }

      // ---- Summary fields ----
      const fr = FIELD_ROWS.find(([re]) => re.test(line));
      if (fr) {
        // Consume the entire label first: the "2" in Inquiries (2 Years)
        // is a window, not an inquiry count or a bureau column.
        const label = line.match(fr[0])?.[0] ?? "";
        const rest = line.slice(label.length).replace(/^\s*:\s*/, "");
        const nums = rowValues(rest);
        const isPct = fr[1] === "utilization_pct";
        let assign: [Bureau, number][] = [];
        if (cols && nums.length === cols.length) assign = cols.flatMap((b, k) => (nums[k] != null ? [[b, nums[k]!] as [Bureau, number]] : []));
        else if (single && nums.length === 1 && nums[0] != null) assign = [[single, nums[0]]];
        else if (nums.length) warnings.push(`Page ${p.page}: "${label.trim().slice(0, 30)}" row could not be matched to bureaus — left Unknown.`);
        for (const [b, v] of assign) {
          if (v < 0 || (isPct && v > 1000) || (!isPct && !Number.isInteger(v))) continue;
          pushField({ bureau: b, key: fr[1], value: v, page: p.page, confidence: cols ? "high" : "medium", needsReview: !cols,
            evidence: `Auto: page ${p.page}, "${label.trim().slice(0, 40)}" row` });
        }
        continue;
      }

      // ---- Tradelines ----
      if (/^account\s*(?:#|number|no\.?)\s*:?/i.test(line)) {
        const creditor = findCreditor(p.lines, i);
        if (!creditor) { warnings.push(`Page ${p.page}: an account without a readable creditor name was skipped.`); continue; }
        const block = collectBlock(p.lines, i);
        const acctTokens = line.replace(/^account\s*(?:#|number|no\.?)\s*:?/i, "").trim().split(/\s+/).filter(Boolean);
        const targets: Bureau[] | null = cols ?? (single ? [single] : null);
        if (!targets) { warnings.push(`Page ${p.page}: account "${creditor}" not matched to a bureau — skipped.`); continue; }
        const aligned = acctTokens.length === targets.length;
        const idx = blockIdx++;
        const l4s = targets.map((_, k) => (aligned ? last4(acctTokens[k]) : null));
        const reporting = targets.map((_, k) => !(aligned && /^-+$/.test(acctTokens[k] ?? "")));
        const distinctL4 = new Set(l4s.filter(Boolean));
        targets.forEach((b, k) => {
          if (!reporting[k]) return;
          const pick = (key: string) => { const v = block[key]; return v && v.length === targets.length ? v[k] ?? null : targets.length === 1 && v ? v[0] ?? null : null; };
          const statusTxt = pickText(block.__status, targets.length, k);
          const typeTxt = pickText(block.__type, targets.length, k);
          const identity = l4s[k] ? `${b}|${creditor.toLowerCase()}|${l4s[k]}` : null;
          const duplicateBureauAppearance = identity ? seenAccounts.has(identity) : false;
          if (identity) seenAccounts.add(identity);
          const key = distinctL4.size === 1 && !duplicateBureauAppearance ? `${creditor.toLowerCase()}|${[...distinctL4][0]}` : `blk:${idx}`;
          const explicitLate = pick("late");
          const lateParts = [pick("late30"), pick("late60"), pick("late90")];
          const lateCount = explicitLate ?? (lateParts.every((value) => value != null) ? lateParts.reduce<number>((sum, value) => sum + value!, 0) : null);
          tradelines.push({
            bureau: b, creditor, last4: l4s[k] ?? null,
            accountType: typeTxt ? (/revolv|credit card/i.test(typeTxt) ? "revolving" : /install/i.test(typeTxt) ? "installment" : /mortgage/i.test(typeTxt) ? "mortgage" : /auto/i.test(typeTxt) ? "auto" : /student/i.test(typeTxt) ? "student" : "other") : null,
            balance: pick("balance"), creditLimit: pick("limit"),
            isOpen: statusTxt ? (/\bopen\b/i.test(statusTxt) ? true : /closed/i.test(statusTxt) ? false : null) : null,
            lateCount,
            isCollection: !!statusTxt && /collection/i.test(statusTxt),
            isChargeoff: !!statusTxt && /charge.?off/i.test(statusTxt),
            reconcileKey: key, page: p.page, needsReview: !aligned || distinctL4.size > 1 || duplicateBureauAppearance,
          });
          if (duplicateBureauAppearance) warnings.push(`Page ${p.page}: repeated account identity for "${creditor}" on ${b}; kept separate for duplicate review.`);
        });
        if (distinctL4.size > 1) warnings.push(`Page ${p.page}: "${creditor}" shows different account endings per bureau — kept separate for review.`);
      }
    }
  }

  for (const derived of fieldsFromDatedInquiries(pages, single, reportDate, warnings)) {
    const existing = fields.find((field) => field.bureau === derived.bureau && field.key === derived.key);
    if (!existing) pushField(derived);
    else if (existing.value !== derived.value) {
      existing.needsReview = true;
      existing.confidence = "low";
      warnings.push(`Page ${derived.page}: dated inquiry listing and printed ${derived.key.replace(/_/g, " ")} summary differ; the value requires review.`);
    }
  }

  // Repeated score cards with disagreeing values/models are never silently preferred.
  for (const bureau of bureausDetected) {
    const own = scores.filter((score) => score.bureau === bureau);
    if (new Set(own.map((score) => `${score.model ?? "unknown"}|${score.value}`)).size <= 1) continue;
    own.forEach((score) => { score.confidence = "low"; score.needsReview = true; });
    warnings.push(`Conflicting score readings for ${bureau} were kept for staff review.`);
  }

  // OCR provenance is page-specific and never upgrades a value to verified.
  if (ocrUsed) {
    for (const item of [...scores, ...fields]) {
      if (!ocrPages.has(item.page)) continue;
      item.confidence = "low";
      item.needsReview = true;
      item.evidence = item.evidence.replace(/^Auto:/, "OCR:");
    }
    for (const item of tradelines) if (ocrPages.has(item.page)) item.needsReview = true;
  }

  if (ambiguousScoreRows) warnings.push(`${ambiguousScoreRows} score row(s) could not be tied to a specific bureau and were not saved.`);
  if (!scores.length) warnings.push("No credit score with an identifiable bureau was found. Scores stay Unknown.");
  if (scores.some((s) => !s.model)) warnings.push("Some scores did not state their exact model; they are saved for review but not used in matching.");

  const anything = scores.length + fields.length + tradelines.length > 0;
  const review = scores.some((s) => s.needsReview) || fields.some((f) => f.needsReview) || tradelines.some((t) => t.needsReview);
  const status: ParseResult["status"] = !anything ? "awaiting_manual_entry" : review || warnings.length > 1 || opts.truncated || opts.ocrTruncated ? "partial" : "complete_unverified";
  return { ...base, bureausDetected, reportType, reportDate, hasTextLayer: originalHasTextLayer, ocrUsed, scores, fields, tradelines, warnings: warnings.map(maskSensitive), status };
}

function findCreditor(lines: string[], i: number): string | null {
  for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
    const line = lines[j]!;
    if (line.includes(":") || headerOrder(line)) continue;
    if (/^[A-Za-z][A-Za-z0-9 &.,'/-]{1,59}$/.test(line) && !/\d{5,}/.test(line)) return maskSensitive(line).slice(0, 60);
  }
  return null;
}

type Block = Record<string, (number | null)[]> & { __status?: string[]; __type?: string[] };
function collectBlock(lines: string[], i: number): Block {
  const block: Block = {};
  for (let j = i + 1; j < Math.min(lines.length, i + 30); j++) {
    const line = lines[j]!;
    if (/^account\s*(?:#|number|no\.?)/i.test(line)) break;
    const [label, rest] = labelAndRest(line);
    if (/^balance\b/i.test(label)) block["balance"] = rowValues(rest);
    else if (/^(credit\s+limit|high\s+credit)/i.test(label)) block["limit"] ??= rowValues(rest);
    else if (/^late\s+payments?\b/i.test(label)) block["late"] = rowValues(rest);
    else if (/^(?:30[- ]day|30\s+days?)\s+(?:lates?|late\s+payments?)/i.test(label)) block["late30"] = rowValues(rest);
    else if (/^(?:60[- ]day|60\s+days?)\s+(?:lates?|late\s+payments?)/i.test(label)) block["late60"] = rowValues(rest);
    else if (/^(?:90[- ]day|90\s+days?)\s+(?:lates?|late\s+payments?)/i.test(label)) block["late90"] = rowValues(rest);
    else if (/^(account\s+status|payment\s+status|status)\b/i.test(label)) block.__status = rest.trim().split(/\s{3,}|\s*\|\s*/).filter(Boolean);
    else if (/^account\s+type\b/i.test(label)) block.__type = rest.trim().split(/\s{3,}|\s*\|\s*/).filter(Boolean);
  }
  return block;
}
function pickText(value: string[] | undefined, n: number, k: number): string | null {
  if (!value) return null;
  if (value.length === n) return value[k] ?? null;
  if (n === 1) return value.join(" ");
  const words = value.join(" ").split(/\s+/);
  if (words.length === n) return words[k] ?? null;
  return null;
}
