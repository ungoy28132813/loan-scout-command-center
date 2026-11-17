import { describe, expect, it } from "vitest";
import { isCleanupEligible, isSafeOrphanPath, ORPHAN_CLEANUP_MIN_AGE_MS } from "./orphan-files";

const VALID = "3c1d2bb4-84c4-4c4f-bb77-6e843bb6a55a/3b02adda-88ab-4944-a45b-ce0c67519577.pdf";

describe("orphaned private file cleanup rules", () => {
  it("accepts only a UUID client folder containing one UUID document filename", () => {
    expect(isSafeOrphanPath(VALID)).toBe(true);
    expect(isSafeOrphanPath(VALID.toUpperCase())).toBe(true);
  });

  it("rejects traversal, root files, nested content, and unexpected extensions", () => {
    for (const path of [
      "../client/report.pdf",
      "report.pdf",
      `${VALID}/more.txt`,
      VALID.replace(".pdf", ".txt"),
      VALID.replace("3c1d2bb4", "not-a-uuid"),
      `/${VALID}`,
    ]) expect(isSafeOrphanPath(path)).toBe(false);
  });

  it("requires the full 15-minute waiting period and a valid past timestamp", () => {
    const now = Date.parse("2026-11-17T02:00:00Z");
    const created = new Date(now - ORPHAN_CLEANUP_MIN_AGE_MS).toISOString();
    expect(isCleanupEligible(created, now)).toBe(true);
    expect(isCleanupEligible(new Date(now - ORPHAN_CLEANUP_MIN_AGE_MS + 1000).toISOString(), now)).toBe(false);
    expect(isCleanupEligible(new Date(now + 1000).toISOString(), now)).toBe(false);
    expect(isCleanupEligible(null, now)).toBe(false);
    expect(isCleanupEligible("not-a-date", now)).toBe(false);
  });
});
