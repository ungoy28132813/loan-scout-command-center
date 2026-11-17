import { bureausIn, headerOrder } from "./detect";
import { maskSensitive, parseDate } from "./text";
import type { Bureau, ExtractedField, PageText } from "./types";

interface DatedEntry { bureau: Bureau; date: string; page: number }
interface OpenSection { bureau: Bureau; entries: DatedEntry[]; sawDatedEntry: boolean }

const INQUIRY_HEADING = /^(?:hard\s+)?inquir(?:y|ies)(?:\s+(?:history|records?|listing))?\s*:?$/i;
const INLINE_BUREAU_HEADING = /^(?:trans\s?union|experian|equifax)\s+(?:hard\s+)?inquir(?:y|ies)(?:\s+(?:history|records?|listing))?\s*:?$/i;
const NEXT_SECTION = /^(?:accounts?|tradelines?|credit\s+scores?|public\s+records?|personal\s+information|collections?|summary|payment\s+history|statements?|messages?)\b/i;
const DATE_AT_START = /^(\d{1,2}\/\d{1,2}\/\d{4})(?:\s+|$)/;

function monthStart(reportDate: string, months: number): string {
  const d = new Date(`${reportDate}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

/**
 * Reads only explicitly labeled, dated inquiry sections. Creditor names are discarded immediately.
 * Entries are counted individually: similar names/dates are never assumed to be duplicates.
 */
export function fieldsFromDatedInquiries(pages: PageText[], single: Bureau | null, reportDate: string | null, warnings: string[]): ExtractedField[] {
  let currentBureau: Bureau | null = single;
  let active: OpenSection | null = null;
  const completed: OpenSection[] = [];

  for (const page of pages) {
    for (const line of page.lines) {
      const named = bureausIn(line);
      if (named.length === 1 && !headerOrder(line) && line.length <= 80 && !DATE_AT_START.test(line)) currentBureau = named[0]!;
      const inline = INLINE_BUREAU_HEADING.test(line);
      if ((inline || INQUIRY_HEADING.test(line)) && currentBureau) {
        if (active?.sawDatedEntry) completed.push(active);
        active = { bureau: currentBureau, entries: [], sawDatedEntry: false };
        continue;
      }
      if (!active) continue;
      if (NEXT_SECTION.test(line) || (named.length === 1 && /credit\s+report|credit\s+file/i.test(line) && !DATE_AT_START.test(line))) {
        if (active.sawDatedEntry) completed.push(active);
        active = null;
        continue;
      }
      const match = line.match(DATE_AT_START);
      if (!match) continue;
      const date = parseDate(match[1]);
      if (!date) continue;
      active.entries.push({ bureau: active.bureau, date, page: page.page });
      active.sawDatedEntry = true;
    }
  }
  if (active?.sawDatedEntry) completed.push(active);
  const entries = completed.flatMap((section) => section.entries);
  if (!entries.length) return [];
  warnings.push("Dated inquiry entries were counted individually; possible duplicate names or dates were not removed.");
  if (!reportDate) {
    warnings.push("Dated inquiries were found, but the report date is Unknown; lookback counts were not calculated.");
    return [];
  }

  const valid = entries.filter((entry) => entry.date <= reportDate);
  if (valid.length < entries.length) warnings.push("Inquiry dates after the report date were excluded from lookback counts.");
  const windows = [
    { key: "inquiries_30d", start: monthStart(reportDate, 0), days: 30 },
    { key: "inquiries_3mo", start: monthStart(reportDate, 3) },
    { key: "inquiries_6mo", start: monthStart(reportDate, 6) },
    { key: "inquiries_12mo", start: monthStart(reportDate, 12) },
    { key: "inquiries_24mo", start: monthStart(reportDate, 24) },
  ];
  const result: ExtractedField[] = [];
  for (const bureau of [...new Set(valid.map((entry) => entry.bureau))]) {
    const own = valid.filter((entry) => entry.bureau === bureau);
    for (const window of windows) {
      const start = window.days ? new Date(`${reportDate}T00:00:00Z`).getTime() - window.days * 86400000 : null;
      const value = own.filter((entry) => window.days
        ? new Date(`${entry.date}T00:00:00Z`).getTime() >= start! && entry.date <= reportDate
        : entry.date >= window.start && entry.date <= reportDate).length;
      const firstPage = Math.min(...own.map((entry) => entry.page));
      result.push({
        bureau, key: window.key, value, page: firstPage, confidence: "medium", needsReview: true,
        evidence: maskSensitive(`Auto: page ${firstPage}, dated inquiry listing; ${own.length} readable dated entries`),
      });
    }
  }
  return result;
}
