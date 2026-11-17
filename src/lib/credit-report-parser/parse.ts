import { detectBureaus, detectProvider, bureausIn, hasTextLayer, headerOrder } from "./detect";
import { modelIn } from "./models";
import { last4, maskSensitive, normalizeLine, parseDate, rowValues } from "./text";
import type { Bureau, ExtractedField, ExtractedScore, ExtractedTradeline, PageText, ParseResult } from "./types";

export const PARSER_VERSION = "ls-parse-1.0.0";

/** Summary rows mapped only when the label states the exact window/meaning. Anything else stays Unknown. */
const FIELD_ROWS: [RegExp, string][] = [
  [/^(?:hard\s+)?inquiries\s*\((?:last\s*)?6\s*mo(?:nths?)?\)|^(?:hard\s+)?inquiries\s+(?:in\s+)?(?:the\s+)?last\s+6\s+months/i, "inquiries_6mo"],
  [/^(?:hard\s+)?inquiries\s*\((?:last\s*)?12\s*mo(?:nths?)?\)|^(?:hard\s+)?inquiries\s+(?:in\s+)?(?:the\s+)?last\s+12\s+months/i, "inquiries_12mo"],
  [/^open\s+accounts\b/i, "open_tradelines"],
  [/^(?:revolving\s+)?(?:credit\s+)?utilization\b/i, "utilization_pct"],
  [/^collections?\b(?!\s+agency)/i, "collections_count"],
  [/^late\s+payments\s*\((?:last\s*)?24\s*mo(?:nths?)?\)/i, "late_payments_24mo"],
];
const SCORE_ROW = /^(?:(?:trans\s?union|experian|equifax)\s+)?(?:credit\s+score|fico\s*(?:score)?[\s\w().]*|vantage\s?score[\s\w().]*|score)\s*:?\s/i;

interface Ctx { header: Bureau[] | null; headerLine: number }

function labelAndRest(line: string): [string, string] {
  const i = line.indexOf(":");
  if (i > 0 && i < 60) return [line.slice(0, i), line.slice(i + 1)];
  const m = line.match(/^([^\d$]*?)\s(?=[\d$-])/);
  return m ? [m[1]!, line.slice(m[1]!.length)] : [line, ""];
}

export function parseReportText(rawPages: PageText[], opts: { truncated?: boolean } = {}): ParseResult {
  const pages = rawPages.map((p) => ({ page: p.page, lines: p.lines.map(normalizeLine).filter(Boolean) }));
  const all = pages.flatMap((p) => p.lines).join("\n");
  const warnings: string[] = [];
  const base = {
    parserVersion: PARSER_VERSION, provider: detectProvider(all), pageCount: pages.length,
    scores: [] as ExtractedScore[], fields: [] as ExtractedField[], tradelines: [] as ExtractedTradeline[],
  };
  if (opts.truncated) warnings.push("Only the first pages were read (page limit). Remaining pages need manual review.");
  if (!hasTextLayer(pages)) {
    return { ...base, bureausDetected: [], reportType: "unknown", reportDate: null, hasTextLayer: false, status: "unreadable",
      warnings: [...warnings, "No text layer detected — this looks like a scanned/image PDF. It needs OCR or a clearer, text-based report. Nothing was extracted."] };
  }
  const bureausDetected = detectBureaus(pages);
  const single: Bureau | null = bureausDetected.length === 1 ? bureausDetected[0]! : null;
  const reportType: ParseResult["reportType"] = bureausDetected.length >= 2 ? "tri_merge" : single ?? "unknown";
  if (!bureausDetected.length) warnings.push("No credit bureau named in the report text — bureau-specific values were not extracted.");

  let reportDate: string | null = null;
  let scoreDate: string | null = null;
  for (const l of pages.flatMap((p) => p.lines)) {
    if (!reportDate && /report\s*date/i.test(l)) reportDate = parseDate(l);
    if (!scoreDate && /score\s*date|date\s*of\s*score|scores?\s+as\s+of/i.test(l)) scoreDate = parseDate(l);
  }

  const scores: ExtractedScore[] = [];
  const fields: ExtractedField[] = [];
  const tradelines: ExtractedTradeline[] = [];
  let blockIdx = 0;
  let ambiguousScoreRows = 0;

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
          const conf = model && (sameLine || inlineB.length === 1 || cols) ? "high" : model ? "medium" : "low";
          for (const [b, v] of assign) {
            if (scores.some((s) => s.bureau === b && s.model === model && s.value === v)) continue;
            scores.push({ bureau: b, model, value: v, scoreDate, page: p.page, confidence: conf, needsReview: !model || conf !== "high",
              evidence: `Auto: page ${p.page}, "${maskSensitive(label.trim()).slice(0, 40)}" row${model ? "" : " — score model not stated"}` });
          }
          continue;
        }
      }

      // ---- Summary fields ----
      const fr = FIELD_ROWS.find(([re]) => re.test(line));
      if (fr) {
        const [label, rest] = labelAndRest(line);
        const nums = rowValues(rest);
        const isPct = fr[1] === "utilization_pct";
        let assign: [Bureau, number][] = [];
        if (cols && nums.length === cols.length) assign = cols.flatMap((b, k) => (nums[k] != null ? [[b, nums[k]!] as [Bureau, number]] : []));
        else if (single && nums.length === 1 && nums[0] != null) assign = [[single, nums[0]]];
        else if (nums.length) warnings.push(`Page ${p.page}: "${label.trim().slice(0, 30)}" row could not be matched to bureaus — left Unknown.`);
        for (const [b, v] of assign) {
          if (v < 0 || (isPct && v > 1000) || (!isPct && !Number.isInteger(v))) continue;
          fields.push({ bureau: b, key: fr[1], value: v, page: p.page, confidence: cols ? "high" : "medium", needsReview: !cols,
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
          const key = distinctL4.size === 1 ? `${creditor.toLowerCase()}|${[...distinctL4][0]}` : `blk:${idx}`;
          tradelines.push({
            bureau: b, creditor, last4: l4s[k] ?? null,
            accountType: typeTxt ? (/revolv|credit card/i.test(typeTxt) ? "revolving" : /install/i.test(typeTxt) ? "installment" : /mortgage/i.test(typeTxt) ? "mortgage" : /auto/i.test(typeTxt) ? "auto" : /student/i.test(typeTxt) ? "student" : "other") : null,
            balance: pick("balance"), creditLimit: pick("limit"),
            isOpen: statusTxt ? (/\bopen\b/i.test(statusTxt) ? true : /closed/i.test(statusTxt) ? false : null) : null,
            isCollection: !!statusTxt && /collection|charge.?off/i.test(statusTxt),
            reconcileKey: key, page: p.page, needsReview: !aligned || distinctL4.size > 1,
          });
        });
        if (distinctL4.size > 1) warnings.push(`Page ${p.page}: "${creditor}" shows different account endings per bureau — kept separate for review.`);
      }
    }
  }
  if (ambiguousScoreRows) warnings.push(`${ambiguousScoreRows} score row(s) could not be tied to a specific bureau and were not saved.`);
  if (!scores.length) warnings.push("No credit score with an identifiable bureau was found. Scores stay Unknown.");
  if (scores.some((s) => !s.model)) warnings.push("Some scores did not state their exact model; they are saved for review but not used in matching.");

  // Tradelines reconciled across reports must not merge unrelated same-name accounts: keys without last4 stay block-scoped.
  const anything = scores.length + fields.length + tradelines.length > 0;
  const review = scores.some((s) => s.needsReview) || fields.some((f) => f.needsReview) || tradelines.some((t) => t.needsReview);
  const status: ParseResult["status"] = !anything ? "awaiting_manual_entry" : review || warnings.length > 1 || opts.truncated ? "partial" : "complete_unverified";
  return { ...base, bureausDetected, reportType, reportDate, hasTextLayer: true, scores, fields, tradelines, warnings: warnings.map(maskSensitive), status };
}

function findCreditor(lines: string[], i: number): string | null {
  for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
    const l = lines[j]!;
    if (l.includes(":") || headerOrder(l)) continue;
    if (/^[A-Za-z][A-Za-z0-9 &.,'/-]{1,59}$/.test(l) && !/\d{5,}/.test(l)) return maskSensitive(l).slice(0, 60);
  }
  return null;
}

type Block = Record<string, (number | null)[]> & { __status?: string[]; __type?: string[] };
function collectBlock(lines: string[], i: number): Block {
  const b: Block = {};
  for (let j = i + 1; j < Math.min(lines.length, i + 25); j++) {
    const l = lines[j]!;
    if (/^account\s*(?:#|number|no\.?)/i.test(l)) break;
    const [label, rest] = labelAndRest(l);
    if (/^balance\b/i.test(label)) b["balance"] = rowValues(rest);
    else if (/^(credit\s+limit|high\s+credit)/i.test(label)) b["limit"] ??= rowValues(rest);
    else if (/^(account\s+status|payment\s+status|status)\b/i.test(label)) b.__status = rest.trim().split(/\s{3,}|\s*\|\s*/).filter(Boolean);
    else if (/^account\s+type\b/i.test(label)) b.__type = rest.trim().split(/\s{3,}|\s*\|\s*/).filter(Boolean);
  }
  return b;
}
function pickText(v: string[] | undefined, n: number, k: number): string | null {
  if (!v) return null;
  if (v.length === n) return v[k] ?? null;
  if (n === 1) return v.join(" ");
  const words = v.join(" ").split(/\s+/);
  if (words.length === n) return words[k] ?? null;
  return null;
}
