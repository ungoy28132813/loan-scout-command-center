/**
 * SmartCredit Classic 3B coordinate parser (pure, deterministic, browser-local).
 * Works on positioned pdf.js text items; never logs or persists report text.
 * Unknown stays null; nothing is inferred.
 */
import type { Bureau } from "@/lib/credit-report-parser/types";

export const CLASSIC3B_PARSER_VERSION = "sc-classic3b-1.0.0";
export const BUREAU_ORDER: Bureau[] = ["transunion", "experian", "equifax"];
/** Running header/footer band height in PDF points (timestamps, title, print URL, "X/Y" counters). */
export const EDGE_BAND = 35;

export interface PosItem { x: number; y: number; w: number; str: string }
export interface PosPage { page: number; width: number; height: number; items: PosItem[] }
export interface Row { page: number; y: number; items: PosItem[]; text: string }
export type PerBureau<T> = Record<Bureau, T>;

export type PayStatus = "OK" | "30" | "60" | "90" | "CO";
export interface MonthCell { month: string; page: number; x: number; y: number; w: number; status: PayStatus | null }
export interface Tradeline {
  section: string; creditor: string; page: number;
  fields: Record<string, PerBureau<string | null>>;
  originalCreditor: PerBureau<string | null> | null;
  /** null = bureau printed NONE REPORTED or no grid found. */
  paymentHistory2Years: PerBureau<MonthCell[] | null>;
  daysLate: PerBureau<{ d30: number | null; d60: number | null; d90: number | null } | null>;
}
export interface Inquiry { date: string; creditor: string; bureau: Bureau; page: number }
export interface Classic3BReport {
  parserVersion: string;
  isClassic3B: boolean;
  scores: PerBureau<number | null>;
  personal: {
    name: PerBureau<string | null>; alsoKnownAs: PerBureau<string[]>; currentAddress: PerBureau<string | null>;
    previousAddresses: PerBureau<string[]>; employers: PerBureau<string[]>; reportDate: PerBureau<string | null>;
  };
  summary: Record<string, PerBureau<string | null>>;
  tradelines: Tradeline[];
  inquiries: Inquiry[];
  inquiryAudit: { headerCount: number | null; counts: PerBureau<number>; expected: PerBureau<number | null>; pass: boolean; mismatches: Bureau[] };
  warnings: string[];
}

const pb = <T,>(f: () => T): PerBureau<T> => ({ transunion: f(), experian: f(), equifax: f() });
const MISSING = /^(?:[-–—]+|n\/?a)$/i;
export const clean = (s: string | null | undefined) => { const t = (s ?? "").replace(/®/g, "").trim(); return !t || MISSING.test(t) ? null : t; };
const bureauOf = (s: string): Bureau | null => { const t = s.replace(/®/g, "").trim().toLowerCase(); return t === "transunion" ? "transunion" : t === "experian" ? "experian" : t === "equifax" ? "equifax" : null; };

/** Refinement 1: drop running headers/footers before clustering rows. */
export function stripEdges(p: PosPage, band = EDGE_BAND): PosItem[] {
  return p.items.filter((it) => it.str.trim() && it.y > band && it.y < p.height - band);
}

export function toRows(pages: PosPage[]): Row[] {
  const rows: Row[] = [];
  for (const p of pages) {
    const items = stripEdges(p).sort((a, b) => b.y - a.y || a.x - b.x);
    let cur: Row | null = null;
    for (const it of items) {
      if (cur && Math.abs(cur.y - it.y) <= 2.5) cur.items.push(it);
      else { cur = { page: p.page, y: it.y, items: [it], text: "" }; rows.push(cur); }
    }
  }
  for (const r of rows) { r.items.sort((a, b) => a.x - b.x); r.text = r.items.map((i) => i.str.trim()).join(" "); }
  return rows;
}

interface Cols { label: number; b1: number; b2: number }
const DEFAULT_COLS: Cols = { label: 170, b1: 290, b2: 420 };
/** Bureau header row → column boundaries (midpoints between bureau labels). */
function headerCols(r: Row): Cols | null {
  const xs: Partial<Record<Bureau, number>> = {};
  for (const it of r.items) { const b = bureauOf(it.str); if (b) xs[b] = it.x; }
  if (xs.transunion == null || xs.experian == null || xs.equifax == null) return null;
  if (xs.transunion < 150) return null; // label-column bureau rows (payment grid / days late) are not value headers
  return { label: Math.min(170, xs.transunion - 20), b1: (xs.transunion + xs.experian) / 2, b2: (xs.experian + xs.equifax) / 2 };
}
const isBureauHeader = (r: Row) => r.items.length >= 3 && r.items.filter((i) => bureauOf(i.str)).length === 3 && r.items.every((i) => bureauOf(i.str) || i.str.trim() === "®");
function split(r: Row, c: Cols): { label: string; cells: PerBureau<string[]> } {
  const cells = pb<string[]>(() => []); const label: string[] = [];
  for (const it of r.items) {
    const s = it.str.trim(); if (!s || s === "®") continue;
    if (it.x < c.label) label.push(s);
    else cells[it.x < c.b1 ? "transunion" : it.x < c.b2 ? "experian" : "equifax"].push(s);
  }
  return { label: label.join(" "), cells };
}

const SECTIONS = /^(Revolving|Installment|Mortgage|Line of Credit|Collections|Other|Unknown|Open|Closed) Accounts$/;
const MONTH = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|'2[0-9])$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const STACKED = new Set(["Previous Address", "Previous Addresses", "Employer", "Also Known As"]);
const SUMMARY_LABELS = new Set(["Total Accounts", "Open Accounts", "Closed Accounts", "Delinquent", "Derogatory", "Balances", "Payments", "Public Records", "Inquiries (2 Years)"]);

/** Assign calendar months to a 24-label row: "'YY" marks January of 20YY. */
export function monthRow(items: PosItem[], page: number, y: number): MonthCell[] {
  const labels = items.filter((i) => MONTH.test(i.str.trim())).sort((a, b) => a.x - b.x);
  const first = labels.findIndex((i) => i.str.trim().startsWith("'"));
  if (first < 0) return [];
  const yr0 = 2000 + Number(labels[first]!.str.trim().slice(1));
  const out: MonthCell[] = []; let year = yr0 - 1;
  labels.forEach((it, i) => {
    const s = it.str.trim();
    if (s.startsWith("'")) year = 2000 + Number(s.slice(1)); else if (i < first) year = yr0 - 1;
    const m = s.startsWith("'") ? 1 : MONTHS.indexOf(s) + 1;
    out.push({ month: `${year}-${String(m).padStart(2, "0")}`, page, x: it.x, y, w: it.w, status: null });
  });
  return out;
}

const num = (s: string | undefined) => { const c = clean(s); return c != null && /^\d+$/.test(c) ? Number(c) : null; };
const US_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const iso = (s: string) => { const m = US_DATE.exec(s.trim()); return m ? `${m[3]}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}` : null; };
const CITY_LINE = /,\s*[A-Z]{2}\s+\d{5}/;
function groupAddresses(lines: string[]): string[] {
  const out: string[] = []; let buf: string[] = [];
  for (const l of lines) { buf.push(l); if (CITY_LINE.test(l)) { out.push(buf.join(", ")); buf = []; } }
  if (buf.length) out.push(buf.join(", "));
  return out;
}

export function isClassic3B(rows: Row[]): boolean {
  const t = new Set(rows.map((r) => r.text));
  return t.has("Credit Scores") && t.has("Personal Information") && rows.some((r) => r.text === "Payment History - Last 2 Years") && rows.some((r) => r.text.startsWith("Days Late - Last 7 Years"));
}

export function parseClassic3B(pages: PosPage[]): Classic3BReport {
  const rows = toRows(pages);
  const rep: Classic3BReport = {
    parserVersion: CLASSIC3B_PARSER_VERSION, isClassic3B: isClassic3B(rows), scores: pb(() => null),
    personal: { name: pb(() => null), alsoKnownAs: pb(() => []), currentAddress: pb(() => null), previousAddresses: pb(() => []), employers: pb(() => []), reportDate: pb(() => null) },
    summary: {}, tradelines: [], inquiries: [],
    inquiryAudit: { headerCount: null, counts: pb(() => 0), expected: pb(() => null), pass: false, mismatches: [] }, warnings: [],
  };
  if (!rep.isClassic3B) { rep.warnings.push("This file does not match the SmartCredit Classic 3B layout."); return rep; }

  type Mode = "none" | "scores" | "personal" | "summary" | "trade" | "pay" | "late" | "inq";
  let mode: Mode = "none"; let cols = DEFAULT_COLS; let section = ""; let tl: Tradeline | null = null;
  let lastLabel = ""; let stack: PerBureau<string[]> | null = null; let payBureau: Bureau | null = null;
  let lateCols: { x: number; b: Bureau }[] = []; let pendingInq: { date: string; bureau: Bureau; page: number } | null = null;
  const personalLines: Record<string, PerBureau<string[]>> = {};

  const flushStack = () => {
    if (!stack) return;
    const target = mode === "personal" ? (personalLines[lastLabel] ??= pb(() => [])) : null;
    if (target) for (const b of BUREAU_ORDER) target[b].push(...stack[b]);
    else if (tl) { const f = (tl.fields[lastLabel] ??= pb(() => null)); for (const b of BUREAU_ORDER) f[b] = clean(stack[b].join(" ")); }
    stack = null;
  };

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!; const t = r.text;
    if (t === "Credit Scores") { mode = "scores"; continue; }
    if (t === "Personal Information") { flushStack(); mode = "personal"; continue; }
    if (t === "Summary") { flushStack(); mode = "summary"; continue; }
    if (t === "Inquiries" || /We found \d+ inquir/i.test(t)) {
      flushStack(); tl = null; mode = "inq";
      const m = /We found (\d+) inquir/i.exec(t); if (m) rep.inquiryAudit.headerCount = Number(m[1]);
      continue;
    }
    if (t === "Public Records" && r.items[0]!.x < 60 && mode !== "summary") { flushStack(); tl = null; mode = "none"; continue; }
    if (SECTIONS.test(t) && r.items[0]!.x < 60 && mode !== "summary" && mode !== "personal") { flushStack(); section = t.replace(/ Accounts$/, ""); tl = null; mode = "none"; continue; }
    if (t === "Payment History - Last 2 Years") { flushStack(); mode = "pay"; payBureau = null; continue; }
    if (t.startsWith("Days Late - Last 7 Years")) { mode = "late"; lateCols = []; continue; }

    if (isBureauHeader(r)) {
      const c = headerCols(r);
      if (c) {
        cols = c;
        // A value header directly under a left-aligned title = new tradeline.
        const prev = rows[i - 1];
        if (section && prev && prev.page === r.page && prev.y - r.y < 14 && prev.items[0]!.x < 60 && !SECTIONS.test(prev.text) && mode !== "personal" && mode !== "summary" && mode !== "scores") {
          flushStack();
          tl = { section, creditor: prev.text, page: prev.page, fields: {}, originalCreditor: null, paymentHistory2Years: pb(() => null), daysLate: pb(() => null) };
          rep.tradelines.push(tl); mode = "trade";
        }
        continue;
      }
      if (mode === "late") { lateCols = r.items.filter((it) => bureauOf(it.str)).map((it) => ({ x: it.x, b: bureauOf(it.str)! })); continue; }
    }

    if (mode === "scores") {
      const vals = r.items.map((it) => it.str.trim()).filter((s) => /^\d{3}$/.test(s)).map(Number);
      if (vals.length === 3 && vals.every((v) => v >= 300 && v <= 900)) { BUREAU_ORDER.forEach((b, k) => { rep.scores[b] = vals[k]!; }); mode = "none"; }
      continue;
    }
    if (mode === "inq" && tl === null) {
      const first = r.items[0]!.str.trim(); const d = iso(first);
      const b = r.items.map((it) => bureauOf(it.str)).find(Boolean) ?? null;
      if (d && b) { pendingInq = { date: d, bureau: b, page: r.page }; continue; }
      if (pendingInq && !d && r.items[0]!.x < 60) { rep.inquiries.push({ ...pendingInq, creditor: t.replace(/®/g, "").trim() }); pendingInq = null; continue; }
      continue;
    }
    if (mode === "pay" && tl) {
      const lead = r.items[0]!; const b = lead.x < 60 ? bureauOf(lead.str) : null;
      if (b) { payBureau = b; tl.paymentHistory2Years[b] = /NONE REPORTED/i.test(t) ? null : []; continue; }
      if (/^NONE REPORTED$/i.test(t) && payBureau) { tl.paymentHistory2Years[payBureau] = null; continue; }
      if (payBureau && r.items.some((it) => MONTH.test(it.str.trim()))) { const cells = monthRow(r.items, r.page, r.y); const arr = tl.paymentHistory2Years[payBureau]; if (arr) arr.push(...cells); }
      continue;
    }
    if (mode === "late" && tl) {
      if (!lateCols.length || !/\d{2}:/.test(t)) continue;
      const bounds = lateCols.slice().sort((a, b) => a.x - b.x);
      const which = (x: number) => { let b = bounds[0]!.b; for (const c of bounds) if (x >= c.x - 6) b = c.b; return b; };
      const acc = pb<Record<string, number | null>>(() => ({}));
      for (let k = 0; k < r.items.length; k++) {
        const it = r.items[k]!; const m = /^(30|60|90):$/.exec(it.str.trim()); if (!m) continue;
        const nxt = r.items[k + 1]; acc[which(it.x)][m[1]!] = nxt && !/:$/.test(nxt.str.trim()) ? num(nxt.str) : null;
      }
      for (const b of BUREAU_ORDER) { const a = acc[b]; if (Object.keys(a).length) tl.daysLate[b] = { d30: a["30"] ?? null, d60: a["60"] ?? null, d90: a["90"] ?? null }; }
      mode = "trade"; continue;
    }

    if (mode === "personal" || mode === "summary" || mode === "trade") {
      const { label, cells } = split(r, cols);
      if (label) {
        flushStack(); lastLabel = label;
        if (mode === "summary" && SUMMARY_LABELS.has(label)) { rep.summary[label] = pb(() => null); for (const b of BUREAU_ORDER) rep.summary[label]![b] = clean(cells[b].join(" ")); continue; }
        if (mode === "summary") continue;
        stack = pb(() => []); for (const b of BUREAU_ORDER) stack[b].push(...cells[b].map((s) => s));
        if (mode === "trade" && tl && /^Original Creditor$/i.test(label) && tl.section === "Collections") {
          tl.originalCreditor = pb(() => null); for (const b of BUREAU_ORDER) tl.originalCreditor[b] = clean(cells[b].join(" "));
        }
      } else if (stack) {
        for (const b of BUREAU_ORDER) stack[b].push(...cells[b]);
      }
    }
  }
  flushStack();

  // Personal info: stacked arrays per bureau.
  const lines = (k: string) => personalLines[k] ?? pb<string[]>(() => []);
  for (const b of BUREAU_ORDER) {
    const keep = (a: string[]) => a.map((s) => clean(s)).filter((s): s is string => !!s);
    rep.personal.name[b] = clean(lines("Name")[b].join(" "));
    rep.personal.alsoKnownAs[b] = keep(lines("Also Known As")[b]);
    rep.personal.currentAddress[b] = groupAddresses(keep(lines("Current Address")[b]))[0] ?? null;
    rep.personal.previousAddresses[b] = groupAddresses(keep([...lines("Previous Address")[b], ...lines("Previous Addresses")[b]]));
    rep.personal.employers[b] = keep(lines("Employer")[b]);
    const d = clean(lines("Credit Report Date")[b].join(" ")); rep.personal.reportDate[b] = d ? iso(d) : null;
  }
  // Collections: original creditor already captured; mirror into fields if missed due to stacking.
  for (const t of rep.tradelines) {
    if (t.section === "Collections" && !t.originalCreditor && t.fields["Original Creditor"]) t.originalCreditor = t.fields["Original Creditor"];
    for (const b of BUREAU_ORDER) { const h = t.paymentHistory2Years[b]; if (h) t.paymentHistory2Years[b] = h.sort((a, c) => a.month.localeCompare(c.month)).slice(-24); }
  }
  // Refinement 5: inquiry audit vs Summary.inquiries2Years.
  const sumInq = rep.summary["Inquiries (2 Years)"];
  for (const q of rep.inquiries) rep.inquiryAudit.counts[q.bureau]++;
  for (const b of BUREAU_ORDER) rep.inquiryAudit.expected[b] = num(sumInq?.[b] ?? undefined);
  rep.inquiryAudit.mismatches = BUREAU_ORDER.filter((b) => rep.inquiryAudit.expected[b] == null || rep.inquiryAudit.expected[b] !== rep.inquiryAudit.counts[b]);
  rep.inquiryAudit.pass = rep.inquiryAudit.mismatches.length === 0;
  if (!rep.inquiryAudit.pass) rep.warnings.push(`Inquiry list does not match the summary totals for: ${rep.inquiryAudit.mismatches.join(", ")}.`);
  if (BUREAU_ORDER.some((b) => rep.scores[b] == null)) rep.warnings.push("One or more bureau scores could not be read; they stay Unknown.");
  return rep;
}

/** Refinement 2 classifier: RGB of a filled grid cell → status (white/gray → null). */
export function classifyCellColor(r: number, g: number, b: number): PayStatus | null {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max - min < 40) return max < 70 ? "CO" : null; // near-black = charge-off; white/gray = no data
  if (g >= 110 && g > r * 1.3 && g > b * 1.2) return "OK";
  if (r >= 150 && g >= 130 && b < 110) return "30";
  if (r >= 170 && g >= 70 && g < 130 && b < 90) return "60";
  if (r >= 150 && g < 70 && b < 80) return "90";
  if (r >= 90 && g < 40 && b >= 50) return "CO";
  return null;
}
