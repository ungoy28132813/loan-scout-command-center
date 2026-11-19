import { describe, expect, it } from "vitest";
import { generateStrategyPdf, strategyFilename, safePdfText, type StrategyExportPayload } from "./strategy-pdf";

const payload = (): StrategyExportPayload => ({
  client_name: "Synthetic Client Alpha", snapshot_id: "00000000-0000-0000-0000-000000000001", version: 2, published_at: "2026-11-19T00:00:00Z",
  content: {
    disclaimer: "SYNTH-DISCLAIMER not an approval probability",
    items: [{ product_id: "p1", lender: "Synthetic Lender", product: "Synthetic Card", product_type: "personal_card", official_url: "https://example.com/card",
      published_min: null, published_max: null, amount_kind: "credit_limit", pull_type: "unknown", status: "needs_review", score: null, sequence: 1,
      conditions: [{ label: "Score", outcome: "unknown", required: "n/a", observed: "Unknown", source_title: "SYNTH-SOURCE", source_url: "https://example.com/src", verified_on: "2026-11-01" }],
      checklist: [], documents: [], client_summary: "summary",
      ...( { private_note: "SECRET-INTERNAL-NOTE" } as object) } as never],
  },
});

async function text(blob: Blob) {
  const { PDFDocument } = await import("pdf-lib");
  const bytes = await new Promise<Uint8Array>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(new Uint8Array(fr.result as ArrayBuffer)); fr.onerror = rej; fr.readAsArrayBuffer(blob); });
  await PDFDocument.load(bytes); // valid PDF
  return { head: new TextDecoder("latin1").decode(bytes.slice(0, 5)), size: bytes.length, raw: new TextDecoder("latin1").decode(bytes) };
}

describe("strategy PDF export", () => {
  it("produces a real PDF", async () => {
    const r = await text(await generateStrategyPdf(payload()));
    expect(r.head).toBe("%PDF-");
    expect(r.size).toBeGreaterThan(1000);
  });
  it("never renders fields outside the published content contract (internal notes)", async () => {
    const r = await text(await generateStrategyPdf(payload()));
    expect(r.raw).not.toContain("SECRET-INTERNAL-NOTE");
  });
  it("makes a safe filename", () => {
    expect(strategyFilename("../Evil <Name>", 3)).toBe("loan-scout-strategy-evil-name-v3.pdf");
    expect(safePdfText("a\u0000b")).toBe("ab");
  });
});
