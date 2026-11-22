/** Browser-only: load PDF locally, parse Classic 3B, and sample payment-grid colors from an offscreen canvas. */
import { MAX_BYTES, MAX_PAGES, PdfReadError } from "@/lib/credit-report-parser/pdf";
import { classifyCellColor, parseClassic3B, type Classic3BReport, type PosPage, type MonthCell, BUREAU_ORDER } from "./parse";

const SCALE = 2;

export async function readClassic3B(data: ArrayBuffer): Promise<Classic3BReport> {
  if (data.byteLength > MAX_BYTES) throw new PdfReadError("too_large", "File is larger than 25 MB.");
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  let doc;
  try { doc = await pdfjs.getDocument({ data: new Uint8Array(data), isEvalSupported: false, enableXfa: false }).promise; }
  catch (e) { throw new PdfReadError((e as { name?: string })?.name === "PasswordException" ? "encrypted" : "invalid", "This file could not be opened as a PDF."); }
  try {
    const total = Math.min(doc.numPages, MAX_PAGES); const pages: PosPage[] = [];
    for (let n = 1; n <= total; n++) {
      const page = await doc.getPage(n); const vp = page.getViewport({ scale: 1 }); const tc = await page.getTextContent();
      pages.push({ page: n, width: vp.width, height: vp.height, items: (tc.items as Array<{ str?: string; transform: number[]; width: number }>).filter((i) => i.str).map((i) => ({ x: i.transform[4]!, y: i.transform[5]!, w: i.width, str: i.str! })) });
      page.cleanup();
    }
    const rep = parseClassic3B(pages);
    const byPage = new Map<number, MonthCell[]>();
    for (const t of rep.tradelines) for (const b of BUREAU_ORDER) for (const c of t.paymentHistory2Years[b] ?? []) { const a = byPage.get(c.page) ?? []; a.push(c); byPage.set(c.page, a); }
    for (const [n, cells] of byPage) {
      const page = await doc.getPage(n); const viewport = page.getViewport({ scale: SCALE });
      const canvas = document.createElement("canvas"); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d", { willReadFrequently: true }); if (!ctx) continue;
      await page.render({ canvasContext: ctx, viewport, canvas } as unknown as Parameters<typeof page.render>[0]).promise;
      for (const c of cells) {
        // PDF y=0 is bottom-left; canvas y=0 is top-left → convert first, then move up 12–16pt.
        const [cx, cy] = viewport.convertToViewportPoint(c.x + c.w / 2, c.y) as [number, number];
        const votes = new Map<string, number>();
        for (let dy = 12; dy <= 16; dy++) for (const dx of [-5, -3, 3, 5]) {
          const px = ctx.getImageData(Math.round(cx + dx * SCALE), Math.round(cy - dy * SCALE), 1, 1).data;
          const s = classifyCellColor(px[0]!, px[1]!, px[2]!); if (s) votes.set(s, (votes.get(s) ?? 0) + 1);
        }
        const best = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
        c.status = best && best[1] >= 4 ? (best[0] as MonthCell["status"]) : null;
      }
      canvas.width = 0; canvas.height = 0; page.cleanup();
    }
    return rep;
  } finally { await doc.destroy(); }
}
