import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import type { SnapshotContent, SnapshotItem } from "@/components/client/PublishedStrategy";
import { MATCH_STATUS_LABEL, fmtMoney } from "@/lib/labels";

export interface StrategyExportPayload {
  client_name: string;
  snapshot_id: string;
  version: number;
  published_at: string | null;
  content: SnapshotContent;
}

const PAGE: [number, number] = [595.28, 841.89];
const MARGIN = 46;
const BODY_WIDTH = PAGE[0] - MARGIN * 2;
const EMERALD = rgb(0, 122 / 255, 83 / 255);
const CHARCOAL = rgb(43 / 255, 51 / 255, 61 / 255);
const SLATE = rgb(66 / 255, 83 / 255, 92 / 255);
const MIST = rgb(244 / 255, 248 / 255, 245 / 255);
const BORDER = rgb(213 / 255, 229 / 255, 220 / 255);

export function safePdfText(value: unknown): string {
  return String(value ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2022/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/[^\u0009\u000a\u000d\u0020-\u007e\u00a0-\u00ff]/g, "?")
    .trim();
}

export function strategyFilename(clientName: string, version: number): string {
  const safe = safePdfText(clientName).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "client";
  return `loan-scout-strategy-${safe}-v${version}.pdf`;
}

export function wrapPdfText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const output: string[] = [];
  for (const paragraph of safePdfText(text).split(/\n/)) {
    if (!paragraph) { output.push(""); continue; }
    let line = "";
    for (const originalWord of paragraph.split(/\s+/)) {
      const words = splitLongWord(originalWord, font, size, maxWidth);
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
        else { if (line) output.push(line); line = word; }
      }
    }
    if (line) output.push(line);
  }
  return output.length ? output : [""];
}

function splitLongWord(word: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (font.widthOfTextAtSize(word, size) <= maxWidth) return [word];
  const parts: string[] = [];
  let current = "";
  for (const character of word) {
    const candidate = current + character;
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) { parts.push(current); current = character; }
    else current = candidate;
  }
  if (current) parts.push(current);
  return parts;
}

class PdfWriter {
  page: PDFPage;
  y = PAGE[1] - MARGIN;
  constructor(private doc: PDFDocument, private regular: PDFFont, private bold: PDFFont) {
    this.page = doc.addPage(PAGE);
  }

  private newPage() {
    this.page = this.doc.addPage(PAGE);
    this.y = PAGE[1] - MARGIN;
  }

  space(height: number) {
    if (this.y - height < MARGIN + 24) this.newPage();
  }

  gap(height = 10) { this.space(height); this.y -= height; }

  text(text: unknown, options: { size?: number; bold?: boolean; color?: typeof CHARCOAL; width?: number; indent?: number; lineHeight?: number } = {}) {
    const size = options.size ?? 9.5;
    const font = options.bold ? this.bold : this.regular;
    const indent = options.indent ?? 0;
    const width = options.width ?? BODY_WIDTH - indent;
    const lineHeight = options.lineHeight ?? size * 1.4;
    const lines = wrapPdfText(String(text ?? ""), font, size, width);
    for (const line of lines) {
      this.space(lineHeight);
      this.page.drawText(line, { x: MARGIN + indent, y: this.y - size, size, font, color: options.color ?? CHARCOAL });
      this.y -= lineHeight;
    }
  }

  heading(text: unknown, level = 1) {
    this.gap(level === 1 ? 8 : 5);
    this.text(text, { size: level === 1 ? 17 : 12, bold: true, color: EMERALD, lineHeight: level === 1 ? 23 : 17 });
    this.gap(2);
  }

  rule() {
    this.space(10);
    this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: PAGE[0] - MARGIN, y: this.y }, thickness: 0.7, color: BORDER });
    this.y -= 10;
  }

  banner(text: string) {
    const lines = wrapPdfText(text, this.regular, 8.5, BODY_WIDTH - 20);
    const height = lines.length * 12 + 18;
    this.space(height);
    this.page.drawRectangle({ x: MARGIN, y: this.y - height + 8, width: BODY_WIDTH, height, color: MIST, borderColor: BORDER, borderWidth: 0.7 });
    let lineY = this.y - 7;
    for (const line of lines) {
      this.page.drawText(line, { x: MARGIN + 10, y: lineY - 8.5, size: 8.5, font: this.regular, color: SLATE });
      lineY -= 12;
    }
    this.y -= height;
  }
}

function amount(item: SnapshotItem): string {
  if (item.published_min == null && item.published_max == null) return "Unknown";
  return `${fmtMoney(item.published_min)} - ${fmtMoney(item.published_max)}`;
}

function pullLabel(value: string): string {
  if (value === "soft_prequal") return "Soft-pull pre-qualification documented";
  if (value === "hard") return "Hard inquiry documented at application";
  return "Credit pull type not documented";
}

export async function generateStrategyPdf(payload: StrategyExportPayload): Promise<Blob> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Loan Scout approved funding strategy v${payload.version}`);
  doc.setAuthor("Loan Scout LLC");
  doc.setSubject("Staff-reviewed informational funding strategy; not an approval or funding guarantee");
  doc.setCreator("Loan Scout Matching Tool");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const writer = new PdfWriter(doc, regular, bold);
  const content = payload.content;

  writer.text("LOAN SCOUT MATCHING TOOL", { size: 10, bold: true, color: EMERALD });
  writer.heading("Approved funding strategy");
  writer.text(`Prepared for: ${payload.client_name}`, { bold: true, size: 11 });
  writer.text(`Version ${payload.version} | Published ${payload.published_at ? new Date(payload.published_at).toLocaleDateString("en-US") : "date Unknown"}`);
  if (content.goal) writer.text(`Goal: ${content.goal}`);
  writer.gap(4);
  writer.banner(content.disclaimer);

  const items = [...content.items].sort((a, b) => a.sequence - b.sequence);
  for (const item of items) {
    writer.heading(`Step ${item.sequence}: ${item.lender} - ${item.product}`);
    writer.text(`Review result: ${MATCH_STATUS_LABEL[item.status] ?? item.status}. Suitability index: ${item.score ?? "Unknown"} (not an approval probability).`, { bold: true });
    writer.text(`Published ${item.amount_kind === "credit_limit" ? "credit limit (not cash)" : "amount"}: ${amount(item)}`);
    writer.text(pullLabel(item.pull_type));
    if (item.official_url) {
      writer.text(`Official product source: ${item.official_url}`, { size: 8, color: SLATE });
      writer.text(`Product source checked: ${item.source_verified_on ?? "Unknown"}`, { size: 8, color: SLATE });
    }
    if (item.client_summary) writer.text(item.client_summary, { size: 10 });

    if (item.scenario_amounts) {
      writer.text("Hypothetical staff-entered request scenarios - not expected approvals:", { bold: true });
      for (const tier of ["conservative", "medium", "expanded"] as const) {
        const payment = item.payment_scenarios?.[tier];
        writer.text(`${tier}: ${fmtMoney(item.scenario_amounts[tier])}; monthly payment ${payment?.low == null ? "Unknown" : `${fmtMoney(payment.low)} - ${fmtMoney(payment.high)}`}`, { indent: 10, size: 8.5 });
      }
      if (item.planner_note) writer.text(item.planner_note, { indent: 10, size: 8.5, color: SLATE });
    }

    writer.text("Application checklist", { bold: true });
    if (item.checklist.length) item.checklist.forEach((entry) => writer.text(`- ${entry}`, { indent: 10 }));
    else writer.text("No client checklist was included.", { indent: 10, color: SLATE });
    writer.text("Documents to prepare", { bold: true });
    if (item.documents.length) item.documents.forEach((entry) => writer.text(`- ${entry}`, { indent: 10 }));
    else writer.text("No document list was included.", { indent: 10, color: SLATE });

    writer.text("Cited requirement comparison", { bold: true });
    if (!item.conditions.length) writer.text("No verified underwriting requirements were on file when this version was approved.", { indent: 10, color: SLATE });
    for (const condition of item.conditions) {
      writer.text(`${condition.label}: required ${condition.required}; observed ${condition.observed}; result ${condition.outcome}.`, { indent: 10, size: 8.5 });
      writer.text(`Citation: ${condition.source_title}; verified ${condition.verified_on ?? "date Unknown"}`, { indent: 18, size: 8, color: SLATE });
      writer.text(condition.source_url, { indent: 18, size: 7.5, color: SLATE });
    }
    writer.rule();
  }

  if (content.approved_note) {
    writer.heading("Advisor note", 2);
    writer.text(content.approved_note);
  }
  if (content.planner) {
    writer.heading("Scenario assumptions and affordability", 2);
    writer.text(content.planner.affordability_notes);
    writer.heading("Editorial sequencing", 2);
    writer.text(content.planner.sequencing_notes);
  }
  writer.gap(6);
  writer.banner("This export contains only the approved client-facing snapshot. Internal staff notes, rejected products, private match comments, and unpublished drafts are excluded.");

  const pages = doc.getPages();
  pages.forEach((page, index) => {
    page.drawText(`Loan Scout LLC | Approved strategy v${payload.version} | Page ${index + 1} of ${pages.length}`, {
      x: MARGIN, y: 24, size: 7.5, font: regular, color: SLATE,
    });
  });
  const bytes = await doc.save({ useObjectStreams: false });
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}
