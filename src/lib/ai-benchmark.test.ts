import { describe, expect, it } from "vitest";
import { BENCHMARK_CASES, buildBenchmarkDownload, gradeExactAnswer } from "./ai-benchmark";

describe("synthetic benchmark grader", () => {
  for (const fixture of BENCHMARK_CASES) {
    it(`${fixture.id}: accepts its concrete expected values and rejects missing answers`, () => {
      expect(gradeExactAnswer(fixture.expected, fixture.expected).pass).toBe(true);
      expect(gradeExactAnswer({}, fixture.expected).pass).toBe(false);
      const first = Object.keys(fixture.expected)[0];
      if (!first) throw new Error("Empty benchmark case");
      expect(gradeExactAnswer({ ...fixture.expected, [first]: "wrong" }, fixture.expected).pass).toBe(false);
    });
  }
  it("rejects numeric strings, extra fields and non-objects", () => {
    expect(gradeExactAnswer({ score: "600" }, { score: 600 }).pass).toBe(false);
    expect(gradeExactAnswer({ score: 600, activate: true }, { score: 600 }).pass).toBe(false);
    expect(gradeExactAnswer(null, { score: 600 }).pass).toBe(false);
  });
  it("embeds only synthetic prompts without credentials into the download", () => {
    const script = buildBenchmarkDownload("payload=__BENCHMARK_BASE64__");
    const payload = script.slice("payload=".length);
    const bundle = JSON.parse(atob(payload)) as { cases: unknown[]; advisorySystem: string };
    expect(bundle.cases).toHaveLength(20);
    expect(bundle.advisorySystem).toContain("advisory public-source reviewer");
    expect(() => buildBenchmarkDownload("no placeholder")).toThrow();
  });
});