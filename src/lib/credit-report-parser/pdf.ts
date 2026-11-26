/**
 * Browser-only PDF text extraction with a locally bundled pdf.js worker (no CDN, no network).
 * Text stays in memory; it is never logged, stored or sent anywhere.
 */
import type { MonthCell, PosPage } from "./coordinates";
import type { PageText } from "./types";

export const MAX_BYTES = 25 * 1024 * 1024;
export const MAX_PAGES = 80;
export const TIMEOUT_MS = 90_000;

export class PdfReadError extends Error {
  constructor(public kind: "too_large" | "encrypted" | "invalid" | "timeout" | "ocr_failed", msg: string) { super(msg); }
}

interface Item { str: string; transform: number[]; width: number; height?: number }

function assertSize(data: ArrayBuffer) {
  if (data.byteLength > MAX_BYTES) throw new PdfReadError("too_large", "File is larger than 25 MB.");
}

async function pdfDocument(data: ArrayBuffer) {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjs.getDocument({ data: new Uint8Array(data), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, stopAtErrors: false, enableXfa: false });
}

function openError(e: unknown): PdfReadError {
  const name = (e as { name?: string })?.name ?? "";
  if (name === "PasswordException") return new PdfReadError("encrypted", "This PDF is password-protected. Upload an unlocked copy.");
  return new PdfReadError("invalid", "This file could not be opened as a PDF.");
}

export async function extractPdfText(data: ArrayBuffer, onProgress?: (done: number, total: number) => void): Promise<{ pages: PageText[]; positionedPages: PosPage[]; truncated: boolean }> {
  assertSize(data);
  const task = await pdfDocument(data);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, rej) => { timer = setTimeout(() => { void task.destroy(); rej(new PdfReadError("timeout", "Reading the PDF took too long.")); }, TIMEOUT_MS); });
  try {
    return await Promise.race([read(), timeout]);
  } finally { clearTimeout(timer); }

  async function read() {
    let doc;
    try { doc = await task.promise; }
    catch (e) { throw openError(e); }
    const total = Math.min(doc.numPages, MAX_PAGES);
    const pages: PageText[] = [];
    const positionedPages: PosPage[] = [];
    try {
      for (let n = 1; n <= total; n++) {
        const page = await doc.getPage(n);
        const viewport = page.getViewport({ scale: 1 });
        const tc = await page.getTextContent();
        const items = (tc.items as unknown as Item[]).filter((item) => item.str && item.str.trim());
        pages.push({ page: n, lines: toLines(items) });
        positionedPages.push({
          page: n,
          width: viewport.width,
          height: viewport.height,
          items: items.map((item) => ({ x: item.transform[4]!, y: item.transform[5]!, w: item.width, str: item.str })),
        });
        page.cleanup();
        onProgress?.(n, total);
      }
      const truncated = doc.numPages > MAX_PAGES;
      return { pages, positionedPages, truncated };
    } finally { await doc.destroy(); }
  }
}

/**
 * Samples only SmartCredit payment-grid pixels in this browser. Unknown colors remain null;
 * no pixel, page image or report text is logged or persisted.
 */
export async function samplePaymentGridColors(data: ArrayBuffer, cells: MonthCell[]): Promise<void> {
  if (!cells.length) return;
  assertSize(data);
  const byPage = new Map<number, MonthCell[]>();
  for (const cell of cells) {
    const pageCells = byPage.get(cell.page) ?? [];
    pageCells.push(cell);
    byPage.set(cell.page, pageCells);
  }
  const scale = 2;
  const task = await pdfDocument(data);
  let doc;
  try { doc = await task.promise; }
  catch (e) { throw openError(e); }
  try {
    for (const [pageNumber, pageCells] of byPage) {
      if (pageNumber > doc.numPages) continue;
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) { canvas.width = 0; canvas.height = 0; page.cleanup(); continue; }
      try {
        await page.render({ canvasContext: ctx, viewport, canvas } as unknown as Parameters<typeof page.render>[0]).promise;
        const { classifyCellColor } = await import("./coordinates");
        for (const cell of pageCells) {
          const [cx, cy] = viewport.convertToViewportPoint(cell.x + cell.w / 2, cell.y);
          const votes = new Map<string, number>();
          for (let dy = 12; dy <= 16; dy++) {
            for (const dx of [-5, -3, 3, 5]) {
              const x = Math.round(cx + dx * scale);
              const y = Math.round(cy - dy * scale);
              if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) continue;
              const pixel = ctx.getImageData(x, y, 1, 1).data;
              const status = classifyCellColor(pixel[0]!, pixel[1]!, pixel[2]!);
              if (status) votes.set(status, (votes.get(status) ?? 0) + 1);
            }
          }
          const best = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
          cell.status = best && best[1] >= 6 ? best[0] as MonthCell["status"] : null;
        }
      } finally {
        canvas.width = 0;
        canvas.height = 0;
        page.cleanup();
      }
    }
  } finally { await doc.destroy(); }
}

/** Groups positioned text items into visual lines (top→bottom, left→right), with wide gaps kept as column breaks. */
export function toLines(items: Item[]): string[] {
  const sorted = items.filter((it) => it.str && it.str.trim()).sort((a, b) => b.transform[5]! - a.transform[5]!);
  const groups: { y: number; row: Item[] }[] = [];
  for (const it of sorted) {
    const y = it.transform[5]!;
    const g = groups[groups.length - 1];
    if (g && Math.abs(g.y - y) <= 2.5) g.row.push(it); else groups.push({ y, row: [it] });
  }
  return groups.map(({ row }) => {
    row.sort((a, b) => a.transform[4]! - b.transform[4]!);
    let out = ""; let end = -Infinity;
    for (const it of row) {
      const x = it.transform[4]!;
      out += out ? (x - end > 12 ? "   " : x - end > 1 ? " " : "") : "";
      out += it.str; end = x + it.width;
    }
    return out;
  });
}
