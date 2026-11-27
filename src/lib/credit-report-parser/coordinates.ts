/** Pure SmartCredit geometry. Coordinates and identity remain in browser memory only. */
import { BUREAUS, type Bureau } from './types';
import { parseDate } from './text';
export interface PosItem { x: number; y: number; w: number; str: string }
export interface PosPage { page: number; width: number; height: number; items: PosItem[] }
export interface Row { page: number; y: number; items: PosItem[]; text: string }
export type PerBureau<T> = Record<Bureau, T>;
export type PayStatus = 'OK' | '30' | '60' | '90' | 'CO';
export interface MonthCell { month: string; page: number; x: number; y: number; w: number; status: PayStatus | null }
export interface ColBounds { order: [Bureau, Bureau, Bureau]; labelEnd: number; split1: number; split2: number }
export interface Tradeline {
  section: string; creditor: string; page: number;
  fields: Record<string, PerBureau<string | null>>;
  originalCreditor: PerBureau<string | null> | null;
  paymentHistory2Years: PerBureau<MonthCell[] | null>;
  daysLate: PerBureau<{ d30: number | null; d60: number | null; d90: number | null } | null>;
}
export interface CoordinateReport {
  parserVersion: string; recognized: boolean; variant: 'classic_3b' | 'ultra_4k_3b' | 'unknown';
  scores: PerBureau<number | null>; scorePage: number; scoreModel: string | null;
  personal: {
    name: PerBureau<string | null>;
    reportDate: PerBureau<string | null>;
    currentAddresses: PerBureau<string[]>;
    previousAddresses: PerBureau<string[]>;
    employers: PerBureau<string[]>;
    /** Only the four-digit year when that is all the report prints; never a fabricated full date. */
    birthYear: PerBureau<number | null>;
  };
  summary: Record<string, PerBureau<string | null>>; summaryPages: Record<string, number>;
  tradelines: Tradeline[]; inquiries: { date: string; creditor: string; bureau: Bureau; page: number }[];
  inquiryAudit: { headerCount: number | null; counts: PerBureau<number>; expected: PerBureau<number | null>; pass: boolean; mismatches: Bureau[] };
  warnings: string[];
}
export const EDGE_BAND = 35;
export const CHROME_BAND = 58;
export const COORDINATE_VERSION = 'smartcredit-coord-v5';
const DEFAULT_BOUNDS: ColBounds = { order: ['transunion', 'experian', 'equifax'], labelEnd: 172, split1: 303, split2: 434 };
const PRINT_CHROME = /(?:member\.smartcredit\.com|^https?:\/\/\S+|^Page \d+ of \d+$|^(?:Classic|Ultra 4K) 3B Report\b|^\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}\s*:\s*\d{2}\s*(?:AM|PM)\b)/i;
export const triple = <T,>(f: () => T): PerBureau<T> => ({ transunion: f(), experian: f(), equifax: f() });
export const clean = (s?: string | null): string | null => {
  const value = (s ?? '')
    // Some SmartCredit embedded fonts encode the "ff" ligature as "!".
    .replace(/\bo!as\b/gi, 'off as')
    .replace(/o!(?=\s|$|[,.;:/-])/gi, 'off')
    .replace(/[®™\u00a0]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return !value || /^(?:[-–—]+|n\/?a|none reported)$/i.test(value) ? null : value;
};
export function money(s?: string | null): number | null {
  const t = clean(s)?.replace(/\s/g, '').replace(/^\$|\$$/g, '');
  if (!t || !/^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$|^\d{1,3}(?:\.\d{3})+$/.test(t)) return null;
  const normalized = /^\d{1,3}(?:\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t.replace(/,/g, '');
  const n = Number(normalized); return Number.isFinite(n) ? n : null;
}
export const integer = (s?: string | null) => { const t = clean(s); return t && /^\d+$/.test(t) ? Number(t) : null; };
const bureauOf = (s: string): Bureau | null => {
  const t = s.replace(/®/g, '').trim().toLowerCase();
  return t === 'transunion' || t === 'experian' || t === 'equifax' ? t : null;
};
export function stripEdges(p: PosPage): PosItem[] { return p.items.filter(it => it.str.trim() && it.y > EDGE_BAND && it.y < p.height - EDGE_BAND); }
export function toRows(pages: PosPage[]): Row[] {
  const rows: Row[] = [];
  for (const p of pages) {
    const pageRows: Row[] = [];
    let current: Row | null = null;
    for (const it of stripEdges(p).sort((a,b) => b.y-a.y || a.x-b.x)) {
      if (current && Math.abs(current.y-it.y) <= 3.8) current.items.push(it);
      else { current = { page:p.page,y:it.y,items:[it],text:'' }; pageRows.push(current); }
    }
    for (const r of pageRows) {
      r.items.sort((a,b) => a.x-b.x);
      r.text = r.items.map(it => it.str.trim()).join(' ');
      if ((r.y <= CHROME_BAND || r.y >= p.height - CHROME_BAND) && PRINT_CHROME.test(r.text)) continue;
      rows.push(r);
    }
  }
  return rows;
}
function join(items: PosItem[]): string {
  let value = ''; let previous: PosItem | null = null;
  for (const it of items) {
    const s = it.str.trim();
    if (s === '®' || s === '™') continue;
    const gap = previous ? it.x - (previous.x + previous.w) : Infinity;
    // PDF.js normally keeps words in one item. A visible two-point gap is a word break,
    // not kerning; only near-overlapping glyph fragments should be attached implicitly.
    const attached = previous && (previous.str.trim() === '$' || s === '$' || /^[*%]+$/.test(s) || gap < 0.5);
    value += value && !attached ? ` ${s}` : s; previous = it;
  }
  return value.trim();
}
export function boundsFromHeader(header: PosItem[], width: number, mode: string): ColBounds | null {
  if (header.length !== 3) return null;
  const sorted = [...header].sort((a, b) => a.x - b.x);
  const b0 = bureauOf(sorted[0]!.str), b1 = bureauOf(sorted[1]!.str), b2 = bureauOf(sorted[2]!.str);
  if (!b0 || !b1 || !b2 || new Set([b0, b1, b2]).size !== 3) return null;
  const s = 612 / width;
  const x0 = sorted[0]!.x * s, x1 = sorted[1]!.x * s, x2 = sorted[2]!.x * s;
  const c0 = (sorted[0]!.x + sorted[0]!.w / 2) * s;
  const c1 = (sorted[1]!.x + sorted[1]!.w / 2) * s;
  const c2 = (sorted[2]!.x + sorted[2]!.w / 2) * s;
  const order: [Bureau, Bureau, Bureau] = [b0, b1, b2];
  if (x0 >= 140) {
    const step = (c2 - c0) / 2;
    return { order, labelEnd: c0 - step * 0.52, split1: c1 - step * 0.52, split2: c2 - step * 0.52 };
  }
  if (mode === 'late') return { order, labelEnd: -Infinity, split1: x1 - 10, split2: x2 - 10 };
  return { order, labelEnd: -Infinity, split1: (c0 + c1) / 2, split2: (c1 + c2) / 2 };
}
export function split(r: Row, width = 612, bounds: ColBounds = DEFAULT_BOUNDS) {
  const groups = triple<PosItem[]>(() => []); const labels: PosItem[] = [];
  const [b0, b1, b2] = bounds.order;
  for (const it of r.items) {
    const s = it.str.trim();
    if (s === '®' || s === '™') continue;
    const x = it.x * 612 / width;
    if (x < bounds.labelEnd) labels.push(it);
    else groups[x < bounds.split1 ? b0 : x < bounds.split2 ? b1 : b2].push(it);
  }
  return { label:join(labels), cells:triple<string | null>(() => null), groups,
    values: { transunion:clean(join(groups.transunion)), experian:clean(join(groups.experian)), equifax:clean(join(groups.equifax)) } };
}
const MONTH = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|'\d{2})$/i;
const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
export function monthRow(items: PosItem[], page: number, y: number): MonthCell[] {
  const labels = items.filter(it => MONTH.test(it.str.trim())).sort((a,b) => a.x-b.x);
  const first = labels.findIndex(it => it.str.trim().startsWith("'"));
  const anchor = labels[first]; if (!anchor) return [];
  let year = 2000 + Number(anchor.str.trim().slice(1)) - 1;
  return labels.map(it => { const s = it.str.trim(); if (s.startsWith("'")) year = 2000 + Number(s.slice(1));
    const month = s.startsWith("'") ? 1 : MONTHS.indexOf(s.toLowerCase())+1;
    return {month:`${year}-${String(month).padStart(2,'0')}`,page,x:it.x,y,w:it.w,status:null}; });
}
const SECTION = /^(Revolving|Installment|Mortgage|Line of Credit|Collections?|Other|Unknown|Open|Closed) Accounts$/i;
const TRADE_LABELS = new Set(['Account Number','High Balance','Last Verified','Date of Last Activity','Date Reported','Date Opened','Balance Owed','Closed Date','Account Rating','Account Description','Dispute Status','Creditor Type','Account Status','Payment Status','Creditor Remarks','Original Creditor','Payment Amount','Last Payment','Term Length','Past Due Amount','Account Type','Payment Frequency','Credit Limit','Utilization']);
const SUMMARY = new Set(['Total Accounts','Open Accounts','Closed Accounts','Delinquent','Derogatory','Balances','Payments','Public Records','Inquiries (2 Years)']);
const NON_HEADING = /^(?:TransUnion|Experian|Equifax|NONE REPORTED|Open|Closed|\d+%\s*Credit Utilization|Last Payment|Payment History|Days Late|This information|Below |The amount of credit|Match\b|No Match\b|Account\b)/i;
function addresses(lines: string[]): string[] {
  const out: string[] = [];
  let buffer: string[] = [];
  for (const line of lines) {
    buffer.push(line);
    const candidate = clean(buffer.join(' '));
    // ZIP may be on the next visual line and may be ZIP+4 without a hyphen.
    if (candidate && /\b[A-Z]{2},?\s+\d{5}(?:-\d{4}|\d{4})?(?=\s|$)/.test(candidate)) {
      out.push(candidate);
      buffer = [];
    }
  }
  const remainder = clean(buffer.join(' '));
  if (remainder) out.push(remainder);
  return out;
}
function monthCutoff(isoDate: string, months: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}
export function parseCoordinates(pages: PosPage[]): CoordinateReport {
  const rows = toRows(pages); const text = rows.map(r=>r.text).join('\n');
  const rawAll = pages.flatMap(p=>p.items.map(it=>it.str)).join(' ');
  const explicitBrand = /SmartCredit|Classic 3B Report|Ultra 4K 3B Report/i.test(rawAll);
  const hasTriHeader = rows.some(r => r.items.filter(it => bureauOf(it.str)).length === 3);
  const structuralSmart = /^Credit Scores$/m.test(text) && /^Personal Information$/m.test(text) && /^Summary$/m.test(text)
    && (/Below is an overview of your present and past credit status|Credit Report Date/i.test(text)) && hasTriHeader;
  const otherProvider = /IdentityIQ|MyScoreIQ|powered by\s+Equifax|Credit Score and Rating/i.test(rawAll);
  const recognized = !otherProvider && ((explicitBrand && /^Personal Information$/m.test(text) && /^Credit Scores$/m.test(text)) || structuralSmart);
  const rep: CoordinateReport = {
    parserVersion:COORDINATE_VERSION,recognized,variant:recognized ? /Ultra 4K 3B Report/i.test(rawAll) ? 'ultra_4k_3b' : 'classic_3b' : 'unknown',
    scores:triple(()=>null),scorePage:1,scoreModel:null,personal:{
      name:triple(()=>null),reportDate:triple(()=>null),currentAddresses:triple(()=>[]),previousAddresses:triple(()=>[]),employers:triple(()=>[]),birthYear:triple(()=>null),
    },
    summary:{},summaryPages:{},tradelines:[],inquiries:[],inquiryAudit:{headerCount:null,counts:triple(()=>0),expected:triple(()=>null),pass:false,mismatches:[]},warnings:[],
  };
  if (!recognized) return rep;
  const widthOf = (r:Row) => pages.find(p=>p.page===r.page)?.width ?? 612;
  let mode = ''; let section = ''; let tl:Tradeline | null = null; let pendingHeading:Row | null = null;
  let lastLabel = ''; let payBureau:Bureau | null = null; let inquiryWindowYears: number | null = null;
  let pendingInquiry: {date:string; bureau:Bureau | null; page:number} | null = null;
  let tableBounds: ColBounds = DEFAULT_BOUNDS;
  let scoreBounds: ColBounds = DEFAULT_BOUNDS;
  let lateBounds: ColBounds = { order: ['transunion', 'experian', 'equifax'], labelEnd: -Infinity, split1: 215, split2: 395 };
  let utilBounds: ColBounds = DEFAULT_BOUNDS;
  let headerOrderWarned = false;
  const personal: Record<string, PerBureau<string[]>> = {};
  const scoreModels = new Set<string>();
  for (const r of rows) {
    const t = r.text; const w = widthOf(r); const x0 = (r.items[0]?.x ?? 0) * 612 / w;
    const activeBounds = mode === 'scores' ? scoreBounds : mode === 'late' ? lateBounds : mode === 'utilization' ? utilBounds : tableBounds;
    const {label,values,groups} = split(r, w, activeBounds);
    if (t === 'Credit Scores') {mode='scores';continue;}
    if (t === 'Personal Information') {mode='personal';lastLabel='';continue;}
    if (t === 'Summary') {mode='summary';continue;}
    if (t === 'Credit Utilization') {mode='utilization';continue;}
    if (SECTION.test(t) && mode !== 'personal' && x0 < 110 && !values.transunion && !values.experian && !values.equifax) {
      section=t.replace(/ Accounts$/i,'');mode='heading';tl=null;pendingHeading=null;lastLabel='';continue;
    }
    if (/^Inquiries(?:\s+\d+)?$/i.test(t) || /We found \d+ inquiries/i.test(t)) {
      mode='inquiries';tl=null;pendingHeading=null;pendingInquiry=null;
      const found = /We found (\d+) inquiries(?:\s+in the past (\d+)\s+years?)?/i.exec(t);
      const hdr = /^Inquiries\s+(\d+)$/i.exec(t);
      if (found) { rep.inquiryAudit.headerCount = Number(found[1]); if (found[2]) inquiryWindowYears = Number(found[2]); }
      else if (hdr) rep.inquiryAudit.headerCount = Number(hdr[1]);
      continue;
    }
    if (/^Creditor Contacts(?:\s+\d+)?$/i.test(t) || (t==='Public Records' && mode!=='summary')) {mode='none';tl=null;pendingHeading=null;continue;}
    if (mode === 'utilization' && /TOTAL USED/i.test(t) && /UTILIZATION/i.test(t)) {
      const u = r.items.find(it => /TOTAL|USED/i.test(it.str));
      const a = r.items.find(it => /AVAILABLE/i.test(it.str));
      const p = r.items.find(it => /UTILIZATION/i.test(it.str));
      if (u && a && p) {
        const sc = 612 / w;
        const c0 = (u.x + u.w / 2) * sc, c1 = (a.x + a.w / 2) * sc, c2 = (p.x + p.w / 2) * sc;
        const step = (c2 - c0) / 2;
        utilBounds = { order: ['transunion', 'experian', 'equifax'], labelEnd: c0 - step * 0.52, split1: c1 - step * 0.52, split2: c2 - step * 0.52 };
      }
      continue;
    }
    const header = r.items.filter(it=>bureauOf(it.str));
    if (header.length===3) {
      const nextBounds = boundsFromHeader(header, w, mode);
      if (nextBounds) {
        if (nextBounds.order.join('|') !== 'transunion|experian|equifax' && !headerOrderWarned) {
          headerOrderWarned = true;
          rep.warnings.push('Bureau headers are out of SmartCredit order; values require review.');
        }
        if (mode === 'scores') scoreBounds = nextBounds;
        else if (mode === 'late') lateBounds = nextBounds;
        else tableBounds = nextBounds;
      }
      const valueHeader = header.every(it=>it.x*612/w>=140);
      if(valueHeader) {
        if(pendingHeading && section && !['personal','summary','scores','utilization'].includes(mode)) {
          tl={section,creditor:pendingHeading.text.replace(/\s+[\w-]*\*{2,}\s*(?:Open|Closed)?$/i,'').replace(/\s+(?:Open|Closed)$/i,'').trim(),page:pendingHeading.page,fields:{},originalCreditor:null,paymentHistory2Years:triple(()=>null),daysLate:triple(()=>null)};
          rep.tradelines.push(tl);mode='trade';pendingHeading=null;
        }
        continue;
      }
      if (mode === 'scores' || mode === 'late') continue;
    }
    if(mode==='scores') {
      // Only the bounded score section supplies models; no model is assumed by provider.
      const models=t.match(/Vantage\s?Score\s*(?:®\s*)?([34](?:\.0)?)/i);
      if(models) scoreModels.add(`VantageScore ${Number(models[1])}.0`);
      const fico = t.match(/FICO\s*(?:Score\s*)?(8|9|10T|10)\b/i);
      if(fico) scoreModels.add(`FICO ${fico[1]!.toUpperCase()}`);
      for(const b of BUREAUS) {
        const value=integer(values[b]); if(value!==null && value>=300 && value<=850) {
          if(rep.scores[b]!==null && rep.scores[b]!==value) rep.warnings.push(`Conflicting score readings for ${b}.`);
          rep.scores[b]=value;rep.scorePage=r.page;
        }
      }
      continue;
    }
    if(mode==='personal') {
      if(label) lastLabel=label;
      if(!lastLabel) continue;
      const target=personal[lastLabel] ??= triple(()=>[]);
      for(const b of BUREAUS) if(values[b]) target[b].push(values[b]);
      continue;
    }
    if(mode==='summary') {
      if(SUMMARY.has(label)) {
        const prior=rep.summary[label];
        if(prior && BUREAUS.some(b=>prior[b]!==values[b])) rep.warnings.push('Repeated summary values disagree; review required.');
        rep.summary[label]=values;rep.summaryPages[label]=r.page;
      }
      continue;
    }
    if(mode==='utilization') {
      // This table is transposed (bureau rows, used/available/percent columns), not a score grid.
      const b=bureauOf(label); if(b) {
        (rep.summary['Revolving Used'] ??= triple(()=>null))[b]=values.transunion;
        (rep.summary['Revolving Available'] ??= triple(()=>null))[b]=values.experian;
        (rep.summary['Revolving Utilization'] ??= triple(()=>null))[b]=values.equifax;
        rep.summaryPages['Revolving Utilization']=r.page;
      }
      continue;
    }
    if(mode==='inquiries') {
      const dateToken=r.items.find(it=>parseDate(it.str));const date=parseDate(dateToken?.str);
      const b=header.map(it=>bureauOf(it.str)).find((x):x is Bureau=>x!==null) ?? null;
      if(date) {
        const creditor=clean(r.items.filter(it=>it!==dateToken && !bureauOf(it.str)).map(it=>it.str).join(' '));
        if(b && creditor) { rep.inquiries.push({date,bureau:b,page:r.page,creditor}); pendingInquiry=null; }
        else pendingInquiry={date,bureau:b,page:r.page};
      } else if(pendingInquiry && !pendingInquiry.bureau && b && r.items.every(it => bureauOf(it.str) || it.str.trim() === '®')) {
        pendingInquiry.bureau = b;
      } else if(pendingInquiry && pendingInquiry.bureau && x0<120 && !/^(?:Match|No Match|Date|Bureau|Creditor|Below|The inquiries|We found)/i.test(t)) {
        const creditor = clean(t);
        if (creditor) rep.inquiries.push({date:pendingInquiry.date,bureau:pendingInquiry.bureau,page:pendingInquiry.page,creditor});
        pendingInquiry=null;
      }
      continue;
    }
    if(t==='Payment History - Last 2 Years' && tl) {mode='pay';payBureau=null;continue;}
    if(/^Days Late - Last 7 Years/.test(t) && tl) {mode='late';continue;}
    if(mode==='pay' && tl) {
      const first=r.items[0];const b=first && x0<110 ? bureauOf(first.str):null;
      if(b) {payBureau=b;tl.paymentHistory2Years[b]=/NONE REPORTED/i.test(t)?null:[];}
      if(payBureau && /NONE REPORTED/i.test(t)) {tl.paymentHistory2Years[payBureau]=null;continue;}
      if(payBureau && r.items.some(it=>MONTH.test(it.str.trim()))) {
        const cells=monthRow(r.items,r.page,r.y);tl.paymentHistory2Years[payBureau]?.push(...cells);continue;
      }
      if(b) continue;
    }
    if(mode==='late' && tl && /(?:30|60|90):/.test(t)) {
      for(const b of BUREAUS) {
        const cell=join(groups[b]);const counts={d30:null as number|null,d60:null as number|null,d90:null as number|null};
        for(const [n,key] of [['30','d30'],['60','d60'],['90','d90']] as const) counts[key]=integer(cell.match(new RegExp(`${n}:\\s*(\\d+|--)`))?.[1]);
        if(Object.values(counts).some(x=>x!==null) || /--/.test(cell)) tl.daysLate[b]=counts;
      }
      mode='after_trade';continue;
    }
    if(section && TRADE_LABELS.has(label)) {
      // Some print variants omit the repeating value header. Account Number anchors the pending block.
      if(!tl && pendingHeading && label==='Account Number') {
        tl={section,creditor:pendingHeading.text.replace(/\s+[\w-]*\*{2,}\s*(?:Open|Closed)?$/i,'').trim(),page:pendingHeading.page,fields:{},originalCreditor:null,paymentHistory2Years:triple(()=>null),daysLate:triple(()=>null)};
        rep.tradelines.push(tl);pendingHeading=null;
      }
      if(tl) {tl.fields[label]=values;lastLabel=label;mode='trade';if(label==='Original Creditor') tl.originalCreditor=values;}
      continue;
    }
    if(tl && !label && lastLabel && mode==='trade') {
      const target=tl.fields[lastLabel];if(target) for(const b of BUREAUS) if(values[b]) target[b]=clean(`${target[b]??''} ${values[b]}`);
      continue;
    }
    if(section && x0<110 && /[A-Za-z]{2}/.test(t) && t.length <= 90 && !NON_HEADING.test(t) && !TRADE_LABELS.has(label)
      && !values.experian && !values.equifax && (mode !== 'trade' || !values.transunion)) {
      pendingHeading=r;tl=null;mode='heading';lastLabel='';
    }
  }
  rep.scoreModel=scoreModels.size===1 ? [...scoreModels][0] ?? null:null;
  for(const b of BUREAUS) {
    rep.personal.name[b]=clean(personal['Name']?.[b].join(' '));
    const raw=personal['Credit Report Date']?.[b].join(' ');rep.personal.reportDate[b]=parseDate(raw);
    rep.personal.currentAddresses[b]=addresses([...(personal['Current Address']?.[b]??[]),...(personal['Address']?.[b]??[])]);
    rep.personal.previousAddresses[b]=addresses([...(personal['Previous Address']?.[b]??[]),...(personal['Previous Addresses']?.[b]??[])]);
    rep.personal.employers[b]=personal['Employer']?.[b]??[];
    const birthValues=[...(personal['Date of Birth']?.[b]??[]),...(personal['Birth Year']?.[b]??[])];
    const birthYears=[...new Set(birthValues.flatMap(value => {
      const match=value.match(/(?:^|\D)((?:19|20)\d{2})(?:\D|$)/);
      const year=match ? Number(match[1]) : null;
      return year && year <= new Date().getUTCFullYear() ? [year] : [];
    }))];
    rep.personal.birthYear[b]=birthYears.length===1 ? birthYears[0]! : null;
    rep.inquiryAudit.expected[b]=integer(rep.summary['Inquiries (2 Years)']?.[b]);
  }
  for(const q of rep.inquiries) rep.inquiryAudit.counts[q.bureau]++;
  const distinctDates = new Set(BUREAUS.map(b => rep.personal.reportDate[b]).filter((d): d is string => Boolean(d)));
  const commonDate = distinctDates.size === 1 ? [...distinctDates][0] ?? null : null;
  const counts24 = triple(() => 0);
  if (commonDate) {
    const cutoff = monthCutoff(commonDate, 24);
    for (const q of rep.inquiries) if (q.date >= cutoff && q.date <= commonDate) counts24[q.bureau]++;
  }
  rep.inquiryAudit.mismatches=BUREAUS.filter(b => {
    const exp = rep.inquiryAudit.expected[b];
    if (exp === null) return true;
    if (exp === rep.inquiryAudit.counts[b]) return false;
    return !(commonDate && inquiryWindowYears && inquiryWindowYears > 2 && exp === counts24[b]);
  });
  rep.inquiryAudit.pass=!rep.inquiryAudit.mismatches.length && (rep.inquiryAudit.headerCount===null || rep.inquiryAudit.headerCount===rep.inquiries.length);
  if(!rep.inquiryAudit.pass) rep.warnings.push('Dated inquiry listing does not reconcile with printed totals; lookback counts require review.');
  return rep;
}
/** Unknown/neutral pixels remain null; no missing box is interpreted as an on-time payment. */
export function classifyCellColor(r:number,g:number,b:number):PayStatus|null {
  const max=Math.max(r,g,b),min=Math.min(r,g,b);if(max-min<40) return null;
  if(g>=110 && g>r*1.3 && g>b*1.2) return 'OK';
  if(r>=150 && g>=130 && b<110) return '30';
  if(r>=170 && g>=70 && g<130 && b<90) return '60';
  if(r>=150 && g<70 && b<80) return '90';
  return null; // charge-off text must be explicit; dark borders are not evidence
}
