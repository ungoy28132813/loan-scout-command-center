import { z } from "zod";
import { BENCHMARK_CASES } from "./ai-benchmark";

export const FAILURE_CODES = ["timeout", "ollama_offline", "model_unavailable", "local_http_failure", "output_or_request_failure", "download_or_command", "worker_offline", "accuracy_failure", "unknown"] as const;
export const RECOVERY_IDS = ["start_ollama", "check_models", "reduce_load", "review_output", "restart_worker", "redownload_benchmark", "manual_review"] as const;
export type FailureCode = typeof FAILURE_CODES[number];
export type RecoveryId = typeof RECOVERY_IDS[number];
const codeSchema = z.enum(FAILURE_CODES);
const numberOrNull = z.number().finite().nonnegative().nullable();
export const symptomsSchema = z.object({
  version: z.literal(1), totalRows: z.number().int().min(0).max(200), passedRows: z.number().int().min(0).max(200), failedRows: z.number().int().min(0).max(200),
  runError: codeSchema.nullable(),
  environment: z.object({ ollamaVersion: z.string().regex(/^[0-9.]{1,30}$/).nullable(), powershell: z.string().regex(/^[0-9.]{1,30}$/).nullable(), ramFreeGB: numberOrNull, processors: numberOrNull }).strict(),
  failures: z.array(z.object({ test: z.string().max(80), code: codeSchema, seconds: numberOrNull, tokensPerSecond: numberOrNull }).strict()).max(40),
}).strict();
export type Symptoms = z.infer<typeof symptomsSchema>;

function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function numeric(value: unknown) { return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1_000_000 ? value : null; }
function version(value: unknown) { return typeof value === "string" && /^[0-9.]{1,30}$/.test(value) ? value : null; }
export function failureCode(value: unknown): FailureCode {
  if (typeof value !== "string") return "unknown";
  if (FAILURE_CODES.includes(value as FailureCode)) return value as FailureCode;
  if (/timeout|timed out/i.test(value)) return "timeout";
  if (/model.*(?:unavailable|not found)|no suitable installed/i.test(value)) return "model_unavailable";
  if (/offline|connection refused|actively refused/i.test(value)) return "ollama_offline";
  if (/json|output|vector/i.test(value)) return "output_or_request_failure";
  return "unknown";
}
const tests = new Set(BENCHMARK_CASES.map((c) => c.id));
export function safeTest(value: unknown) {
  if (typeof value !== "string") return "unrecognized-test";
  return tests.has(value) || /^(cold-ish-load|repeat-[123]|repeat-answer-consistency|time-to-first-content|context-(1000|5000|10000)-chars-(start|middle|end)|app-advisory-protocol|bounded-output-16-tokens|two-local-requests|synthetic-embedding-dimensions-and-ranking|missing-model-404|preflight)$/.test(value) ? value : "unrecognized-test";
}

/** Reconstruct allowlisted metrics only; never forward raw responses, names, paths, prompts or exception bodies. */
export function sanitizeBenchmarkLog(text: string): Symptoms {
  if (new TextEncoder().encode(text).byteLength > 2_000_000) throw new Error("Choose a benchmark log smaller than 2 MB.");
  if (!text.trim()) throw new Error("Choose a benchmark JSON or text log.");
  const emptyEnvironment = { ollamaVersion: null, powershell: null, ramFreeGB: null, processors: null };
  if (!text.trim().startsWith("{")) {
    const codes = FAILURE_CODES.filter((code) => code !== "unknown" && new RegExp(`\\b${code}\\b`, "i").test(text));
    if (!codes.length) throw new Error("No recognized benchmark failure codes found. Use benchmark_results.json for a complete diagnosis.");
    return symptomsSchema.parse({ version: 1, totalRows: 0, passedRows: 0, failedRows: 0, runError: codes[0] ?? null, environment: emptyEnvironment, failures: codes.map((code) => ({ test: "preflight", code, seconds: null, tokensPerSecond: null })) });
  }
  let root: Record<string, unknown>;
  try { root = record(JSON.parse(text)); } catch { throw new Error("The JSON log is incomplete. Choose the saved benchmark_results.json."); }
  const hardware = record(root["hardware"]);
  if (!Array.isArray(root["results"]) && !hardware["runError"]) throw new Error("This is not a benchmark results file.");
  const rows = Array.isArray(root["results"]) ? root["results"].slice(0, 200).map(record) : [];
  const failed = rows.filter((r) => r["pass"] === false);
  const failures = failed.slice(0, 40).map((r) => ({ test: safeTest(r["test"]), code: r["errorCode"] || r["error"] ? failureCode(r["errorCode"] ?? r["error"]) : "accuracy_failure", seconds: numeric(r["seconds"]), tokensPerSecond: numeric(r["tokensPerSecond"]) }));
  const runError = hardware["runError"] ? failureCode(hardware["runError"]) : null;
  if (runError && failures.length < 40) failures.push({ test: "preflight", code: runError, seconds: null, tokensPerSecond: null });
  return symptomsSchema.parse({ version: 1, totalRows: rows.length, passedRows: rows.filter((r) => r["pass"] === true).length, failedRows: failed.length, runError, environment: { ollamaVersion: version(hardware["ollamaVersion"]), powershell: version(hardware["powershell"]), ramFreeGB: numeric(hardware["ramFreeGB"]), processors: numeric(hardware["logicalProcessors"]) }, failures });
}

export const diagnosisSchema = z.object({ summary: z.string(), causes: z.array(z.object({ failureCode: codeSchema, cause: z.string(), confidence: z.enum(["likely", "possible", "unknown"]), evidenceTests: z.array(z.string()) }).strict()), recoveryIds: z.array(z.enum(RECOVERY_IDS)), unknowns: z.array(z.string()) }).strict();
export type Diagnosis = z.infer<typeof diagnosisSchema>;
export function validateDiagnosis(value: unknown, symptoms: Symptoms): Diagnosis {
  const result = diagnosisSchema.parse(value);
  const codes = new Set(symptoms.failures.map((f) => f.code));
  if (symptoms.runError) codes.add(symptoms.runError);
  const testNames = new Set(symptoms.failures.map((f) => f.test));
  if (!result.summary.trim() || result.summary.length > 1600 || result.causes.length > 6 || result.unknowns.length > 8 || result.recoveryIds.length < 1 || result.recoveryIds.length > 7 || result.causes.some((c) => !codes.has(c.failureCode) || c.cause.length > 800 || c.evidenceTests.some((t) => !testNames.has(t))) || result.unknowns.some((s) => s.length > 600)) throw new Error("Diagnosis did not match the submitted evidence; no repair was applied.");
  return result;
}

const benchmarkCommand = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\\Downloads\\LoanScout-Benchmark.ps1" -SkipConcurrency -MaxMinutes 120';
export const RECOVERIES: Record<RecoveryId, { title: string; steps: string[]; commands: string[] }> = {
  start_ollama: { title: "Start the local Ollama service", steps: ["Open the Ollama desktop app, or run ollama serve in a second window and leave it open. Do not expose port 11434 publicly.", "Once the local version check works, rerun the benchmark."], commands: ['ollama serve', 'Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/version" -TimeoutSec 10', benchmarkCommand] },
  check_models: { title: "Check installed generation models", steps: ["Embedding models cannot answer generation tests. The default benchmark skips model files larger than 12 GB.", "Use -IncludeLargeModels only for already installed larger models. A missing-model-404 pass is an intentional test, not a repair request.", "Install a missing model manually only if you choose to download it; no automatic model pulls."], commands: ["ollama list", "ollama ps", `${benchmarkCommand} -IncludeLargeModels`] },
  reduce_load: { title: "Reduce load and rerun", steps: ["Stop the Loan Scout worker with Ctrl+C; close heavy apps. Keep Ollama open.", "The larger total budget does not extend the 180-second generation timeout. A smaller installed generation model may be needed."], commands: ["ollama ps", benchmarkCommand] },
  review_output: { title: "Review model output accuracy", steps: ["Keep the failed benchmark results. Invalid JSON, fabricated citations and incorrect answers are not passes.", "A synthetic benchmark cannot establish underwriting accuracy. Review the evidence before relying on the model."], commands: [benchmarkCommand] },
  restart_worker: { title: "Restore the paired worker connection", steps: ["Restore internet access. Restart the worker after the benchmark; keep its window open.", "A revoked connection needs a fresh paired download from Local AI. Never upload the connection file."], commands: ['powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\\LoanScoutAI\\worker.ps1"'] },
  redownload_benchmark: { title: "Replace an incomplete benchmark download", steps: ["Download a fresh benchmark from Local AI and save it in Downloads, then rerun. Do not run the unfilled repository template."], commands: [benchmarkCommand] },
  manual_review: { title: "Check what remains unknown", steps: ["No automatic repair is supported by this evidence. Save the results and compare after a controlled rerun.", "No cloud fallback, code rewrite, credential change, lender approval or credit-report verification is performed."], commands: [] },
};
export function symptomSignature(symptoms: Symptoms) { return [...new Set(symptoms.failures.map((f) => f.code).concat(symptoms.runError ? [symptoms.runError] : []))].sort().join("|"); }
export type RecoveryObservation = { recoveryId: RecoveryId; outcome: "resolved" | "not_resolved"; signature: string };
export function recoveryLearning(symptoms: Symptoms, rows: RecoveryObservation[]) {
  const signature = symptomSignature(symptoms);
  return RECOVERY_IDS.map((recoveryId) => {
    const matching = rows.filter((r) => r.signature === signature && r.recoveryId === recoveryId);
    return { recoveryId, resolved: matching.filter((r) => r.outcome === "resolved").length, notResolved: matching.filter((r) => r.outcome === "not_resolved").length };
  }).filter((r) => r.resolved + r.notResolved > 0);
}
export function buildRecoveryDownload(ids: RecoveryId[]) {
  const sections = [...new Set(ids)].map((id) => `${RECOVERIES[id].title}\n${RECOVERIES[id].steps.join("\n")}\n${RECOVERIES[id].commands.join("\n")}`).join("\n\n");
  // No model text enters executable PowerShell; only the reviewed static catalog is embedded as inert text.
  const encoded = btoa(sections);
  return `# Loan Scout guided recovery: no model-generated commands are executed.\n$ErrorActionPreference = 'Stop'\n$Steps = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'))\nWrite-Host $Steps\nWrite-Host '\nChecking localhost Ollama (no paid fallback)...'\ntry { Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/version' -TimeoutSec 10 | Format-List } catch { Write-Host 'Ollama is offline. Open the Ollama app, then rerun this helper.' -ForegroundColor Yellow }\n$Benchmark = Join-Path $env:USERPROFILE 'Downloads\\LoanScout-Benchmark.ps1'\nif (Test-Path -LiteralPath $Benchmark) {\n  $Choice = Read-Host 'Stop the normal worker first. Rerun the existing benchmark now? (y/N)'\n  if ($Choice -eq 'y') { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Benchmark -SkipConcurrency -MaxMinutes 120 }\n} else { Write-Host 'Download the benchmark from Local AI into Downloads first.' }\nWrite-Host 'Upload the new results in Local AI and record whether the selected recovery worked.'\n`;
}