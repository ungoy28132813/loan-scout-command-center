import { BUREAUS, type Bureau, type PageText, type ParseResult } from "./types";

const NAME: Record<Bureau, RegExp> = { transunion: /trans\s?union/i, experian: /experian/i, equifax: /equifax/i };

export function detectProvider(all: string): ParseResult["provider"] {
  if (/smart\s?credit/i.test(all)) return "smartcredit";
  if (/identity\s?iq/i.test(all)) return "identityiq";
  if (/my\s?score\s?iq/i.test(all)) return "myscoreiq";
  return "unknown";
}

export function bureausIn(line: string): Bureau[] {
  return BUREAUS.filter((b) => NAME[b].test(line));
}

/** A column header lists 2+ bureau names and little else; returns them in printed order. */
export function headerOrder(line: string): Bureau[] | null {
  const found = BUREAUS.map((b) => ({ b, i: line.search(NAME[b]) })).filter((x) => x.i >= 0);
  if (found.length < 2) return null;
  const stripped = line.replace(/trans\s?union|experian|equifax/gi, "").replace(/[^a-z]/gi, "");
  if (stripped.length > 12) return null; // a sentence mentioning bureaus, not a header
  return found.sort((a, b) => a.i - b.i).map((x) => x.b);
}

export function detectBureaus(pages: PageText[]): Bureau[] {
  const counts = new Map<Bureau, number>();
  for (const p of pages) for (const l of p.lines) for (const b of bureausIn(l)) counts.set(b, (counts.get(b) ?? 0) + 1);
  return BUREAUS.filter((b) => (counts.get(b) ?? 0) > 0);
}

export function hasTextLayer(pages: PageText[]): boolean {
  if (!pages.length) return false;
  const chars = pages.reduce((n, p) => n + p.lines.join("").replace(/\s/g, "").length, 0);
  return chars / pages.length >= 40;
}
