import { describe, expect, it } from "vitest";
import { MAX_BYTES, PdfReadError } from "./pdf";
import { MAX_OCR_PAGES, ocrPdfPages, selectOcrPages } from "./ocr";

describe("browser-local OCR limits", () => {
  it("caps scanned OCR at 20 unique valid pages without inventing skipped content", () => {
    const result = selectOcrPages([...Array.from({ length: 25 }, (_, i) => i + 1), 1, 0, 81, 1.5]);
    expect(result.selected).toHaveLength(MAX_OCR_PAGES);
    expect(result.selected[0]).toBe(1);
    expect(result.selected.at(-1)).toBe(20);
    expect(result.skippedPages).toBe(5);
  });

  it("returns no pages for invalid or duplicate-only empty selections", () => {
    expect(selectOcrPages([0, -1, 81, 2.2])).toEqual({ selected: [], skippedPages: 0 });
  });

  it("rejects oversized input before opening PDF or OCR workers", async () => {
    await expect(ocrPdfPages(new ArrayBuffer(MAX_BYTES + 1), [1])).rejects.toMatchObject({ kind: "too_large" } satisfies Partial<PdfReadError>);
  });
});
