import { describe, expect, it } from "vitest";
import { buildRecoveryDownload, recoveryLearning, sanitizeBenchmarkLog, symptomsSchema, symptomSignature, validateDiagnosis } from "./benchmark-diagnostics";

const log = { hardware: { runError: "timeout", powershell: "5.1", ramFreeGB: 3.5 }, results: [{ test: "time-to-first-content", pass: false, errorCode: "timeout", seconds: 180, tokensPerSecond: null }, { test: "exact-model", pass: true }] };
const symptoms = sanitizeBenchmarkLog(JSON.stringify(log));
describe("benchmark diagnostic safety and learning", () => {
  it("keeps concrete timeout metrics and does not count failed tests as passes", () => {
    expect(symptoms.passedRows).toBe(1); expect(symptoms.failedRows).toBe(1);
    expect(symptoms.failures[0]).toEqual({ test: "time-to-first-content", code: "timeout", seconds: 180, tokensPerSecond: null });
  });
  it("removes credentials, arbitrary text, model replies, private paths and injected commands", () => {
    const sentinel = "PRIVATE_SENTINEL";
    const filtered = sanitizeBenchmarkLog(JSON.stringify({ ...log, password: sentinel, hardware: { ...log.hardware, cpu: sentinel, ollamaVersion: sentinel }, results: [{ test: sentinel, pass: false, errorCode: "timeout", response: sentinel, prompt: sentinel, error: sentinel, account: sentinel }] }));
    expect(JSON.stringify(filtered)).not.toContain(sentinel);
    expect(filtered.failures[0]?.test).toBe("unrecognized-test");
    expect(filtered.environment.ollamaVersion).toBeNull();
  });
  it("rejects raw reports or unexpected server payload keys", () => {
    expect(() => sanitizeBenchmarkLog('{"creditReport":"secret"}')).toThrow();
    expect(symptomsSchema.safeParse({ ...symptoms, rawLog: "secret" }).success).toBe(false);
  });
  it("accepts recognized text failures without forwarding the original log", () => {
    const filtered = sanitizeBenchmarkLog("PRIVATE_SENTINEL timeout ollama_offline");
    expect(filtered.failures.map((f) => f.code)).toEqual(["timeout", "ollama_offline"]);
    expect(JSON.stringify(filtered)).not.toContain("PRIVATE_SENTINEL");
  });
  it("enforces 2 MB upload bound and 40 failure/200 row bounds", () => {
    expect(() => sanitizeBenchmarkLog("x".repeat(2_000_001))).toThrow();
    const filtered = sanitizeBenchmarkLog(JSON.stringify({ results: Array.from({ length: 250 }, () => log.results[0]) }));
    expect(filtered.totalRows).toBe(200); expect(filtered.failures).toHaveLength(40);
  });
  it("accepts only recovery catalog IDs and actual failure evidence", () => {
    const good = { summary: "Timeout observed", causes: [{ failureCode: "timeout", cause: "May be slow", confidence: "possible", evidenceTests: ["time-to-first-content"] }], recoveryIds: ["reduce_load"], unknowns: [] };
    expect(validateDiagnosis(good,symptoms).recoveryIds).toEqual(["reduce_load"]);
    expect(() => validateDiagnosis({ ...good, recoveryIds: ["run_arbitrary_shell"] },symptoms)).toThrow();
    expect(() => validateDiagnosis({ ...good, causes: [{ ...good.causes[0], evidenceTests: ["fabricated-test"] }] },symptoms)).toThrow();
  });
  it("learns only matching symptom outcomes and excludes unrelated recoveries", () => {
    const result = recoveryLearning(symptoms,[{ signature: symptomSignature(symptoms), recoveryId: "reduce_load", outcome: "resolved" }, { signature: symptomSignature(symptoms), recoveryId: "reduce_load", outcome: "not_resolved" }, { signature: "ollama_offline", recoveryId: "start_ollama", outcome: "resolved" }]);
    expect(result).toEqual([{ recoveryId: "reduce_load", resolved: 1, notResolved: 1 }]);
  });
  it("recovery download never evaluates model text and requires consent before rerunning", () => {
    const script = buildRecoveryDownload(["reduce_load"]);
    expect(script).not.toContain("Invoke-Expression");
    expect(script).toContain("Read-Host");
    expect(script).toContain("if ($Choice -eq 'y')");
    expect(script).not.toContain("ollama pull");
  });
});