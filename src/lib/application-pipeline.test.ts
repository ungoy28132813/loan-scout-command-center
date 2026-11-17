import { describe, expect, it } from "vitest";
import { APP_STATUSES } from "@/lib/labels";
import { guidanceItems, hasVerifiedApplicationUrl, monthlyApplicationMetrics, shiftMonth } from "@/lib/application-pipeline";

describe("guided application pipeline", () => {
  it("preserves exactly the five approved status labels", () => {
    expect(APP_STATUSES).toEqual([
      { value: "not_started", label: "Not Started" },
      { value: "submitted", label: "Submitted" },
      { value: "pending", label: "Pending" },
      { value: "approved", label: "Approved" },
      { value: "denied", label: "Denied" },
    ]);
  });

  it("calculates monthly metrics only from non-demo application records", () => {
    const result = monthlyApplicationMetrics([
      { id: "a", status: "approved", statusDate: "2026-11-10T12:00:00Z", isDemo: false, outcomeVerification: "staff_verified" },
      { id: "b", status: "denied", statusDate: "2026-11-11T12:00:00Z", isDemo: false, outcomeVerification: "unverified" },
      { id: "c", status: "pending", statusDate: "2026-11-12T12:00:00Z", isDemo: true, outcomeVerification: "staff_verified" },
      { id: "d", status: "submitted", statusDate: "2026-10-01T12:00:00Z", isDemo: false },
      { id: "e", status: "invented", statusDate: "2026-11-12T12:00:00Z", isDemo: false },
    ], "2026-11");
    expect(result.total).toBe(2);
    expect(result.counts.approved).toBe(1);
    expect(result.counts.denied).toBe(1);
    expect(result.counts.pending).toBe(0);
    expect(result.verifiedTotal).toBe(1);
    expect(result.verifiedCounts.approved).toBe(1);
    expect(result.verifiedCounts.denied).toBe(0);
  });

  it("keeps client self-reports out of verified outcome metrics", () => {
    const result = monthlyApplicationMetrics([
      { id: "self", status: "approved", statusDate: "2026-11-01T00:00:00Z", isDemo: false, outcomeVerification: "unverified" },
    ], "2026-11");
    expect(result.total).toBe(1);
    expect(result.verifiedTotal).toBe(0);
  });

  it("accepts a sourced application destination but rejects a home page or missing provenance", () => {
    const product = {
      application_url: "https://icomplete.wellsfargo.com/oas/status/personal-loans-rate-checker/getting-started/",
      application_url_source_url: "https://www.wellsfargo.com/personal-loans/checklist/",
      application_url_verified_on: "2026-11-17",
    };
    expect(hasVerifiedApplicationUrl(product)).toBe(true);
    expect(hasVerifiedApplicationUrl({ ...product, application_url: "https://www.wellsfargo.com/" })).toBe(false);
    expect(hasVerifiedApplicationUrl({ ...product, application_url_verified_on: null })).toBe(false);
    expect(hasVerifiedApplicationUrl({ ...product, application_url: "http://www.wellsfargo.com/apply" })).toBe(false);
  });

  it("reads only bounded string guidance and shifts months correctly", () => {
    expect(guidanceItems(["Gather pay stubs", "", 42, "If requested"])).toEqual(["Gather pay stubs", "If requested"]);
    expect(guidanceItems({ text: "not an array" })).toEqual([]);
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});
