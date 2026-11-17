/**
 * Browser-local OCR for image-only PDF pages. Every worker, WASM core and English language
 * asset is served from this app; report pixels and recognized text never leave the browser.
 */
import type { PageText } from "./types";
import { MAX_BYTES, MAX_PAGES, PdfReadError } from "./pdf";

export const MAX_OCR_PAGES = 20;
const MAX_RENDER_PIXELS = 12_000_000;

export interface OcrReadResult {
  pages: PageText[];
  skippedPages: number;
}

export function selectOcrPages(pageNumbers: number[]): { selected: number[]; skippedPages: number } {
  const unique = [...new Set(pageNumbers)].filter((n) => Number.isInteger(n) && n >= 1 && n <= MAX_PAGES);
  const selected = unique.slice(0, MAX_OCR_PAGES);
  return { selected, skippedPages: Math.max(0, unique.length - selected.length) };
}

/** OCR only the supplied page numbers. The original PDF is opened again in memory and then destroyed. */
export async function ocrPdfPages(
  data: ArrayBuffer,
  pageNumbers: number[],
  onProgress?: (done: number, total: number, stage: "ocr") => void,
): Promise<OcrReadResult> {
  if (data.byteLength > MAX_BYTES) throw new PdfReadError("too_large", "File is larger than 25 MB.");
  const { selected, skippedPages } = selectOcrPages(pageNumbers);
  if (!selected.length) return { pages: [], skippedPages };

  const origin = window.location.origin;
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({ data: new Uint8Array(data.slice(0)), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, stopAtErrors: false, enableXfa: false });
  let doc: Awaited<typeof task.promise> | null = null;
  let worker: import("tesseract.js").Worker | null = null;
  try {
    doc = await task.promise;
    const { createWorker, OEM, PSM } = await import("tesseract.js");
    worker = await createWorker("eng", OEM.LSTM_ONLY, {
      workerPath: `${origin}/ocr/worker.min.js`,
      corePath: `${origin}/ocr/core`,
      langPath: `${origin}/ocr/lang`,
      cacheMethod: "none",
      gzip: true,
    });
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: "1" });

    const pages: PageText[] = [];
    for (const [index, number] of selected.entries()) {
      if (number > doc.numPages) continue;
      const page = await doc.getPage(number);
      const base = page.getViewport({ scale: 1 });
      let scale = Math.max(1, Math.min(2, 1800 / Math.max(base.width, 1)));
      if (base.width * base.height * scale * scale > MAX_RENDER_PIXELS) {
        scale = Math.sqrt(MAX_RENDER_PIXELS / Math.max(base.width * base.height, 1));
      }
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new PdfReadError("ocr_failed", "This browser could not prepare the scan for local OCR.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      try {
        await page.render({ canvasContext: context, viewport }).promise;
        const result = await worker.recognize(canvas, {}, { text: true });
        const lines = result.data.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        pages.push({ page: number, lines });
      } finally {
        page.cleanup();
        canvas.width = 0;
        canvas.height = 0;
      }
      onProgress?.(index + 1, selected.length, "ocr");
    }
    return { pages, skippedPages };
  } catch (error) {
    if (error instanceof PdfReadError) throw error;
    throw new PdfReadError("ocr_failed", "Local OCR could not read this scan. Use a clear, upright English-language scan or a text-based PDF. Nothing was sent to an external service.");
  } finally {
    if (worker) await worker.terminate().catch(() => undefined);
    if (doc) await doc.destroy().catch(() => undefined);
    else await task.destroy().catch(() => undefined);
  }
}
