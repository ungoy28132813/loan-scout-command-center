import { describe, expect, it } from "vitest";
import { eligibleOutcomeContext, inputSchema, LOCAL_AI_LIMITS, validateAdvice, workerIsOnline } from "./local-ai";

const input = inputSchema.parse({ product: { name: "Synthetic product", type: "personal_loan", scope: "Note Channel only", url: "https://example.org/product", checkedAt: "2026-11-20" }, source: { excerpt: "Minimum amount $2,000. Exact score model is not disclosed.", sha256: "a".repeat(64) }, outcomes: null });
describe("local AI advisory boundaries", () => {
  it("keeps fewer than five verified outcomes out of AI context", () => {
    expect(eligibleOutcomeContext([{ status: "denied", verified: true, demo: false }, ...Array.from({ length: 3 }, () => ({ status: "approved", verified: true, demo: false }))])).toBeNull();
  });
  it("requires both real verified approvals and denials", () => {
    const approvals = Array.from({ length: 5 }, () => ({ status: "approved", verified: true, demo: false }));
    expect(eligibleOutcomeContext(approvals)).toBeNull();
    expect(eligibleOutcomeContext([...approvals, { status: "denied", verified: true, demo: false }])).toEqual({ sample: 6, approved: 5, denied: 1 });
  });
  it("never learns from demos, pending records or unverified self-reports", () => {
    expect(eligibleOutcomeContext(Array.from({ length: 10 }, (_, i) => ({ status: i % 2 ? "approved" : "denied", verified: i % 2 === 0, demo: i % 2 === 0 })))).toBeNull();
  });
  it("rejects raw-report and client identifier payload keys", () => {
    expect(inputSchema.safeParse({ ...input, reportText: "PRIVATE", clientId: "PRIVATE" }).success).toBe(false);
  });
  it("rejects fabricated source quotes", () => {
    expect(() => validateAdvice({ summary: "Review", findings: [{ statement: "Model minimum", evidenceQuote: "FICO 8 600" }], unknowns: [] }, input)).toThrow("Unsubstantiated");
    expect(validateAdvice({ summary: "Review", findings: [{ statement: "Published minimum amount", evidenceQuote: "Minimum amount $2,000." }], unknowns: ["Exact score model"] }, input).findings).toHaveLength(1);
  });
  it("rejects tool commands or automatic policy mutation fields in results", () => {
    expect(() => validateAdvice({ summary: "Review", findings: [], unknowns: [], activateRule: true }, input)).toThrow();
  });
  it("does not accept whitespace-only evidence as a source citation", () => {
    expect(() => validateAdvice({ summary: "Review", findings: [{ statement: "Unsupported", evidenceQuote: " \n " }], unknowns: [] }, input)).toThrow();
  });
  it("marks a disconnected or revoked computer offline", () => {
    const now = Date.parse("2026-11-20T22:00:00Z");
    expect(workerIsOnline("2026-11-20T21:59:30Z", true, now)).toBe(true);
    expect(workerIsOnline("2026-11-20T21:58:00Z", true, now)).toBe(false);
    expect(workerIsOnline("2026-11-20T21:59:30Z", false, now)).toBe(false);
  });
  it("bounds inference to one small-model response", () => {
    expect(LOCAL_AI_LIMITS.outputTokens).toBe(1024);
    expect(LOCAL_AI_LIMITS.contextTokens).toBe(8192);
    expect(LOCAL_AI_LIMITS.dailyJobs).toBe(30);
  });
});