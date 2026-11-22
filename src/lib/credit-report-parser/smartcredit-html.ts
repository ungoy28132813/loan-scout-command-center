/**
 * Privacy-first SmartCredit Classic 3B HTML reader.
 *
 * Important: HTML is parsed only into an inert document; do not append its
 * nodes to the live page or evaluate scripts. No network operations, storage,
 * telemetry or automatic verification occur in this module.
 *
 * This is a source-structured extraction layer, not an underwriting decision.
 * Parsed values must remain unverified until authorized staff review.
 */
import type { Bureau } from "./types";

export const SMARTCREDIT_HTML_PARSER_VERSION = "ls-smartcredit-html-0.1.0";

export type HtmlSource = {
  section: string;
  row: number;
  column: number;
  accountBlock?: number;
  elementPath: string;
};

export type HtmlCell = {
  raw: string | null;
  needsReview: true;
  source: HtmlSource;
};

export type HtmlBureauRow = {
  label: string;
  cells: Partial<Record<Bureau, HtmlCell>>;
};

export type HtmlAccountBlock = {
  category: string;
  blockNumber: number;
  creditor: string;
  rows: HtmlBureauRow[];
  lateCounts: Partial<Record<Bureau, { late30: HtmlCell | null; late60: HtmlCell | null; late90: HtmlCell | null }>>;
  needsReview: true;
};

export type HtmlInquiry = {
  creditor: string;
  dateRaw: string | null;
  bureau: Bureau;
  needsReview: true;
  source: HtmlSource;
};

export type HtmlScore = {
  bureau: Bureau;
  score: number;
  model: string | null;
  needsReview: true;
  source: HtmlSource;
};

export type SmartCreditHtmlResult = {
  parserVersion: string;
  provider: "smartcredit";
  format: "classic_3b_html";
  status: "unreadable" | "partial" | "complete_unverified";
  scores: HtmlScore[];
  summary: HtmlBureauRow[];
  accounts: HtmlAccountBlock[];
  inquiries: HtmlInquiry[];
  warnings: string[];
};

const ACCOUNT_SECTIONS = [
  "Revolving Accounts",
  "Installment Accounts",
  "Other Accounts",
  "Line of Credit Accounts",
  "Collections Accounts",
] as const;

const BUREAUS: Bureau[] = ["transunion", "experian", "equifax"];
const MAX_HTML_LENGTH = 25 * 1024 * 1024;

const norm = (s: string | null | undefined): string =>
  (s ?? "").replace(/\s+/g, " ").trim();

function bureauOf(text: string | null | undefined): Bureau | null {
  const s = norm(text).toLowerCase().replace(/[®™:]/g, "");
  if (s === "transunion" || s === "trans union") return "transunion";
  if (s === "experian") return "experian";
  if (s === "equifax") return "equifax";
  return null;
}

function cellText(node: Element | undefined): string | null {
  if (!node) return null;
  const t = norm(node.textContent);
  return !t || /^(?:--|—|–|n\/a|not reported|not available)$/i.test(t) ? null : t;
}

/** Direct grid rows only: nested payment-history grids must not leak into an account's fields. */
function fourColumnRows(scope: Element): Element[] {
  return Array.from(scope.children).filter((el) =>
    el.tagName === "DIV" && el.classList.contains("grid-cols-4") && el.children.length === 4);
}

function orderFromHeader(row: Element): Bureau[] | null {
  const cells = Array.from(row.children);
  if (cells.length !== 4) return null;
  const found = cells.slice(1).map((c) => bureauOf(c.textContent));
  if (found.some((x) => !x) || new Set(found).size !== 3) return null;
  return found as Bureau[];
}

function readLabeledRows(
  scope: Element, section: string, warnings: string[], accountBlock?: number
): HtmlBureauRow[] {
  const rows = fourColumnRows(scope);
  let columns: Bureau[] | null = null;
  const result: HtmlBureauRow[] = [];
  let headerCount = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const order = orderFromHeader(row);
    if (order) {
      columns = order;
      headerCount++;
      continue;
    }
    const cells = Array.from(row.children);
    const label = norm(cells[0]?.textContent);
    if (!label) continue;
    if (!columns) {
      warnings.push(section + ": grid row without a preceding explicit bureau header");
      continue;
    }
    const field: HtmlBureauRow = { label, cells: {} };
    for (let col = 1; col <= 3; col++) {
      const bureau = columns[col - 1]!;
      field.cells[bureau] = {
        raw: cellText(cells[col]),
        needsReview: true,
        source: {
          section,
          row: i,
          column: col,
          ...(accountBlock === undefined ? {} : { accountBlock }),
          elementPath: "grid[" + i + "]/cell[" + col + "]",
        },
      };
    }
    result.push(field);
  }
  if (!headerCount) warnings.push(section + ": missing unambiguous three-bureau header");
  return result;
}

function headingSection(root: Element, level: "h2" | "h4", heading: string): Element | null {
  const found = Array.from(root.querySelectorAll(level)).find((h) => norm(h.textContent) === heading);
  return found?.parentElement ?? null;
}

function findAccountGroup(root: Element, name: string): Element | null {
  const heading = Array.from(root.querySelectorAll("h4")).find((h) => norm(h.textContent) === name);
  if (!heading) return null;
  for (let p = heading.parentElement; p && p !== root; p = p.parentElement) {
    const children = Array.from(p.children);
    const cards = children.filter((child) => child.querySelector("h5"));
    if (cards.length && children.some((child) => child.contains(heading))) return p;
  }
  return null;
}

function findAccountCard(scope: Element): Element | null {
  const heading = scope.querySelector("h5");
  if (!heading) return null;
  for (let p = heading.parentElement; p && p !== scope.parentElement; p = p.parentElement) {
    if (fourColumnRows(p).length >= 2) return p;
  }
  return null;
}

function lateCell(
  card: Element, type: "30" | "60" | "90", bureau: Bureau, category: string, index: number
): HtmlCell | null {
  const el = card.querySelector('[data-test="late-' + type + "-" + bureau + '"]');
  if (!el) return null;
  return {
    raw: cellText(el),
    needsReview: true,
    source: {
      section: category + "/late-" + type,
      accountBlock: index,
      row: -1,
      column: BUREAUS.indexOf(bureau) + 1,
      elementPath: '[data-test="late-' + type + "-" + bureau + '"]',
    },
  };
}

function readScores(scope: Element | null, model: string | null, warnings: string[]): HtmlScore[] {
  if (!scope) {
    warnings.push("Credit Scores section missing");
    return [];
  }
  const grids = Array.from(scope.querySelectorAll("div.grid-cols-4")).filter((r) => r.children.length === 4);
  const result: HtmlScore[] = [];
  let order: Bureau[] | null = null;
  for (let i = 0; i < grids.length; i++) {
    const row = grids[i]!;
    const header = orderFromHeader(row);
    if (header) {
      order = header;
      continue;
    }
    if (!order) continue;
    const cells = Array.from(row.children);
    // Only accept a purely numeric score cell; model/rating descriptors are not scores.
    for (let col = 1; col <= 3; col++) {
      const raw = cellText(cells[col]);
      if (!raw || !/^\d{3}$/.test(raw)) continue;
      const score = Number(raw);
      if (score < 300 || score > 850) continue;
      result.push({
        bureau: order[col - 1]!,
        score,
        model,
        needsReview: true,
        source: { section: "Credit Scores", row: i, column: col, elementPath: "score-grid[" + i + "]/cell[" + col + "]" },
      });
    }
    break;
  }
  if (result.length === 0) warnings.push("Credit Scores: no unambiguous scores found");
  return result;
}

function explicitScoreModel(root: Element): string | null {
  // Restrict to the Classic report title. Do not infer a model from nearby marketing content.
  const title = Array.from(root.querySelectorAll("h1")).map((h) => norm(h.textContent)).join(" ");
  const m = title.match(/VantageScore\s*®?\s*(3\.0|4\.0)\b/i);
  if (m) return "VantageScore " + m[1];
  const fico = title.match(/\bFICO\s*(?:Score)?\s*(8|9|10)\b/i);
  return fico ? "FICO " + fico[1] : null;
}

function readInquiries(section: Element | null, warnings: string[]): HtmlInquiry[] {
  if (!section) {
    warnings.push("Inquiries section missing");
    return [];
  }
  // The classic report uses a container of two-column cards: creditor/date + bureau.
  const outer = Array.from(section.children).find((c) =>
    Array.from(c.children).some((r) => r.tagName === "DIV" && r.children.length === 2 && !!bureauOf(r.children[1]?.textContent)));
  if (!outer) return [];
  const results: HtmlInquiry[] = [];
  let idx = 0;
  for (const row of Array.from(outer.children)) {
    if (row.tagName !== "DIV" || row.children.length !== 2) continue;
    const bureau = bureauOf(row.children[1]?.textContent);
    const left = row.children[0]!;
    const rawParts = Array.from(left.children).map((el) => norm(el.textContent)).filter(Boolean);
    if (!bureau || rawParts.length < 2) {
      warnings.push("Inquiries: incomplete or ambiguous two-column row #" + idx);
      idx++;
      continue;
    }
    results.push({
      creditor: rawParts[0]!,
      dateRaw: rawParts[1] || null,
      bureau,
      needsReview: true,
      source: { section: "Inquiries", row: idx, column: 1, elementPath: "inquiry-card[" + idx + "]" },
    });
    idx++;
  }
  return results;
}

/**
 * No scripts are executed; no HTML is attached to the active page.
 * This deliberately returns raw source values for local staff review, not trusted facts.
 */
export function parseSmartCreditClassicHtml(html: string): SmartCreditHtmlResult {
  const warnings: string[] = [];
  const result: SmartCreditHtmlResult = {
    parserVersion: SMARTCREDIT_HTML_PARSER_VERSION,
    provider: "smartcredit", format: "classic_3b_html", status: "unreadable",
    scores: [], summary: [], accounts: [], inquiries: [], warnings,
  };
  if (typeof html !== "string" || html.length === 0 || html.length > MAX_HTML_LENGTH) {
    warnings.push("HTML is empty or exceeds the 25 MB safety limit");
    return result;
  }
  if (typeof DOMParser === "undefined") {
    warnings.push("Browser DOMParser is unavailable; no HTML was processed");
    return result;
  }
  // HTML parsed by DOMParser is an inert document; DO NOT attach parsed nodes to document.
  const doc = new DOMParser().parseFromString(html, "text/html");
  const main = doc.querySelector("main");
  const title = main?.querySelector("h1");
  if (!main || !title || !/3B Report/i.test(norm(title.textContent)) || !doc.querySelector('html')) {
    warnings.push("Not a recognized SmartCredit Classic 3B HTML report");
    return result;
  }
  const model = explicitScoreModel(main);
  result.scores = readScores(headingSection(main, "h2", "Credit Scores"), model, warnings);

  const summarySection = headingSection(main, "h2", "Summary");
  if (summarySection) {
    const gridsContainer = Array.from(summarySection.children).find((child) => fourColumnRows(child).length > 0);
    if (gridsContainer) result.summary = readLabeledRows(gridsContainer, "Summary", warnings);
  } else {
    warnings.push("Summary section missing");
  }

  for (const category of ACCOUNT_SECTIONS) {
    const group = findAccountGroup(main, category);
    if (!group) continue;
    let index = 0;
    for (const wrapper of Array.from(group.children)) {
      const h5 = wrapper.querySelector("h5");
      if (!h5) continue;
      const creditor = norm(h5.textContent);
      const card = findAccountCard(wrapper);
      if (!card || !creditor) {
        warnings.push(category + ": could not identify account block #" + index);
        index++;
        continue;
      }
      const rows = readLabeledRows(card, category, warnings, index);
      const lateCounts: HtmlAccountBlock["lateCounts"] = {};
      for (const bureau of BUREAUS) {
        lateCounts[bureau] = {
          late30: lateCell(card, "30", bureau, category, index),
          late60: lateCell(card, "60", bureau, category, index),
          late90: lateCell(card, "90", bureau, category, index),
        };
      }
      result.accounts.push({ category, blockNumber: index, creditor, rows, lateCounts, needsReview: true });
      index++;
    }
  }

  result.inquiries = readInquiries(headingSection(main, "h2", "Inquiries"), warnings);
  if (!result.scores.length && !result.summary.length && !result.accounts.length && !result.inquiries.length) {
    warnings.push("No supported data sections could be read");
    return result;
  }
  result.status = warnings.length ? "partial" : "complete_unverified";
  return result;
}
