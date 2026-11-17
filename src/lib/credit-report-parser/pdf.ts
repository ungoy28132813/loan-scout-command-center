/**
 * Browser-only PDF text extraction with a locally bundled pdf.js worker (no CDN, no network).
 * Text stays in memory; it is never logged, stored or sent anywhere.
 */
import type { PageText } from "./types";

export const MAX_BYTES = 25 * 1024 * 1024;
export const MAX_PAGES = 80;
export const TIMEOUT_MS = 90_000;

export class PdfReadError extends Error {
  constructor(public kind: "too_large" | "encrypted" | "invalid" | "timeout", msg: string) { super(msg); }
}

export async function extractPdfText(data: ArrayBuffer, onProgress?: (done: number, total: number) => void): Promise<{ pages: PageText[]; truncated: boolean }> {
  if (data.byteLength > MAX_BYTES) throw new PdfReadError("too_large", "File is larger than 25 MB.");
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({ data: new Uint8Array(data), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, stopAtErrors: false, enableXfa: false });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, rej) => { timer = setTimeout(() => { void task.destroy(); rej(new PdfReadError("timeout", "Reading the PDF took too long.")); }, TIMEOUT_MS); });
  try {
    return await Promise.race([read(), timeout]);
  } finally { clearTimeout(timer); }

  async function read() {
    let doc;
    try { doc = await task.promise; }
    catch (e) {
      const name = (e as { name?: string })?.name ?? "";
      if (name === "PasswordException") throw new PdfReadError("encrypted", "This PDF is password-protected. Upload an unlocked copy.");
      throw new PdfReadError("invalid", "This file could not be opened as a PDF.");
    }
    const total = Math.min(doc.numPages, MAX_PAGES);
    const pages: PageText[] = [];
    for (let n = 1; n <= total; n++) {
      const page = await doc.getPage(n);
      const tc = await page.getTextContent();
      pages.push({ page: n, lines: toLines(tc.items as unknown as Item[]) });
      page.cleanup();
      onProgress?.(n, total);
    }
    const truncated = doc.numPages > MAX_PAGES;
    await doc.destroy();
    return { pages, truncated };
  }
}

interface Item { str: string; transform: number[]; width: number; height?: number }
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
