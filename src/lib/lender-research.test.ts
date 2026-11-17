import { describe, expect, it } from "vitest";
import { isOfficialProductUrl, researchIsStale, sourceText, validHttpsUrl } from "./lender-research";

describe("lender source retrieval safeguards", () => {
  it("accepts only HTTPS URLs without embedded credentials", () => {
    expect(validHttpsUrl("https://www.example.com/product")).toBe(true);
    expect(validHttpsUrl("http://www.example.com/product")).toBe(false);
    expect(validHttpsUrl("https://user:secret@example.com/product")).toBe(false);
    expect(validHttpsUrl("not a URL")).toBe(false);
  });

  it("restricts retrieval to the official host and its real subdomains", () => {
    const official = "https://www.chase.com/personal/credit-cards";
    expect(isOfficialProductUrl(official, "https://www.chase.com/personal/credit-cards/my-chase-loan")).toBe(true);
    expect(isOfficialProductUrl(official, "https://creditcards.chase.com/example")).toBe(true);
    expect(isOfficialProductUrl(official, "https://chase.com.example.org/phishing")).toBe(false);
    expect(isOfficialProductUrl(official, "https://example.org/chase")).toBe(false);
  });

  it("removes executable and non-content markup without interpreting criteria", () => {
    const text = sourceText("<main><h1>Product</h1><script>secretRule()</script><p>APR &amp; details</p><p>Second paragraph</p></main>");
    expect(text).toBe("Product\nAPR & details\nSecond paragraph");
    expect(text).not.toContain("secretRule");
  });

  it("bounds source excerpts and flags stale research", () => {
    expect(sourceText("x".repeat(20), 12)).toHaveLength(12);
    expect(researchIsStale("2026-05-01", new Date("2026-11-17T00:00:00Z"))).toBe(true);
    expect(researchIsStale("2026-11-01", new Date("2026-11-17T00:00:00Z"))).toBe(false);
  });
});
