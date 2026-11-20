# Comprehensive synthetic benchmark — 2026-11-20

## Scope, not an “everything passed” claim
This benchmark measures what can be safely exercised without the owner's computer or real reports. No finite benchmark covers every underwriting case. App regression tests, a controlled mock of Ollama, actual model evaluation and real-world lender outcomes are separate evidence layers; never substitute one for another.

## Owner computer: one download, one command
In the owner **Local AI** page choose **Download benchmark**, save to Downloads and stop the normal local worker with Ctrl+C. Run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\LoanScout-Benchmark.ps1"
```

Default: installed generation models whose file size is <=12 GB; no model pulls or software installs. The Qwen 9B Q5 model is tested first when present. At most 60 minutes, partial reports saved after each probe. For all installed generation models including the 27B model:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\LoanScout-Benchmark.ps1" -IncludeLargeModels -MaxMinutes 120
```

For a quieter run without the two-request stress probe, add `-SkipConcurrency`. Ctrl+C stops the script; completed probe results have already been saved. File Explorer opens with `benchmark_results.json` selected. Attach that file and `benchmark_metrics.csv` in chat; `README.txt` explains coverage and failures. All model prompts/responses are synthetic. The script never reads the app's connection file, passwords, client documents or private reports, and contacts only localhost Ollama. Electricity and hardware load remain real costs.

To test the grader only, without inference:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\LoanScout-Benchmark.ps1" -SelfTest
```

Restart the normal local worker after testing:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\LoanScoutAI\worker.ps1"
```

## Model probes
- **20 independently graded exact-answer fixtures:** exact bureau/model and channel, unknown vs zero, newest-report selection, conflicting aliases, business isolation, utilization/paydown arithmetic, missing limit, cash vs credit, no 48-hour filter, verified approvals AND denials, unverified OCR, absent-account non-deletion, injected page commands/private-file requests, manual approval/publishing, strict >0 and secondary-estimate non-disqualification.
- **App advisory protocol:** the actual application system prompt, field limits and whitespace-normalized quote presence. Quote presence is not interpretation accuracy. The exact-answer prompt is intentionally separate and its score is not represented as app-advice accuracy.
- **Latency:** cold-ish model load after unload, warmed repeated runs, Ollama load/prompt/generation counters, generation/prompt tokens per second, first nonempty streamed response time, mixed-test p50/p95 wall time. Cold-ish is not controlled OS cache state; other processes may affect results.
- **Context:** 1,000 / 5,000 / 10,000-character excerpts, each with the single relevant fact placed at beginning/middle/end; 8,192-token requested context, prompt counters recorded. This does not establish the model's maximum native context.
- **Stability:** three fixed-seed repeats, exact answers and parsed-answer consistency. Nonidentical key order can conservatively flag a repeat; deterministic seed does not promise deterministic inference on all hardware.
- **Failure behavior:** missing-model 404 without pulling; deliberate 16-token output truncation marked as an expected probe, not an accuracy failure. HTTP, malformed JSON and timeout failures retain sanitized errors.
- **Load:** two local requests of 256 output tokens, isolated from the production worker's one-job policy. This tests two requests only, not load capacity for an unlimited staff population.
- **Embeddings:** installed embedding-name models, finite/equal vector dimensions, identical-text cosine repeatability and synthetic relevant-vs-unrelated ranking. Not an app retrieval implementation or a validated retrieval corpus.
- **Inventory:** OS, CPU/RAM, graphics names/drivers, reported WMI graphics memory warning, loopback listener and Ollama runner/model inventory. No confirmed electrical usage, temperature, VRAM total, long-term hardware health or price measurement.

## Executed in the sandbox
- All 167 application tests pass across 19 suites, including 22 new benchmark-grader cases and prior parser, model matching, finance/math, source provenance, privacy and PDF content tests.
- PowerShell actual embedded-download self-test passes; a controlled loopback Ollama mock exercises the complete script, including inference metrics, streaming, nine context positions, repetitions, truncation, concurrent jobs, embedding vectors and saved report generation: 40 probe rows, all pass for intentionally correct mock answers. **These are harness tests, not Qwen scores or hardware timings.**
- Owner browser workspace/phone checks: no page errors, no page overflow, offline analysis disabled, unauthenticated worker endpoint 401. Additional downloaded-file/runtime checks and sandbox timings are recorded below after execution.

### Measured sandbox results
- Browser downloaded the exact embedded `LoanScout-Benchmark.ps1`; its PowerShell self-test passed. No connection credential or private-file read appears in that download. Owner page at 431px had zero horizontal overflow and zero page errors.
- Three owner page navigation-to-ready samples: 4,376.6 / 2,410.4 / 2,082.4 ms. These include Playwright's network-idle wait and local development overhead, **not production performance or a load SLA**.
- Five unauthenticated worker endpoint responses: all HTTP 401, 38.25 / 13.83 / 13.28 / 10.98 / 8.63 ms on localhost. No authenticated database capacity is inferred.
- Pure deterministic matching, 1,000 synthetic products × 20 rules, five Bun runs: 55.97 / 54.43 / 35.96 / 28.56 / 29.52 ms. No database/network/React rendering included.
- Parsing 80 synthetic text pages: 16.80 / 3.86 / 4.47 / 5.70 / 5.23 ms. This is already-extracted text, **not PDF decoding or OCR stress**.
- Output-limit issue reproduced: field-schema-valid maximal ASCII advice serializes to 17,558 bytes; schema-valid multibyte advice serializes to 18,071 bytes, both exceeding the current 16,000-byte storage cap. Recorded as an open correctness defect, not silently fixed during benchmarking.
- Preview compilation reported build OK. No app records, worker credentials, lender rules or production publication were changed by this benchmark.

## Findings from read-only integration review (not repaired by this benchmark)
- Current server result storage caps JSON at 16,000 bytes while field-level advisory schema allows larger combined ASCII or multibyte payloads. Model output can satisfy field checks but fail transport/storage. Benchmark app-format results must be reviewed for this; it is not proof all boundary sizes work.
- Worker raw string validation and server trimmed validation are not identical. Literal source quotation and whitespace-normalized validator acceptance also differ.
- PowerShell 7 restart shortcut targets `powershell.exe` under `$PSHOME`, which can be absent there. The supplied commands use Windows PowerShell 5.1; actual Windows 5.1 and Windows PowerShell 7 install/restart still need physical execution.
- A synchronous inference can exceed the 90-second heartbeat window, making a healthy busy worker appear offline; five-minute lease has limited first-run margin. There is no lease renewal or safely repeatable completion after an ambiguous network acknowledgment.
- In-app created-to-finished time includes polling/queue/network/self-test; it is not inference latency. Use the standalone benchmark's direct Ollama counters instead.
- Current first-model fixture checks format/citations, not expected conclusions. This independent benchmark adds concrete factual assertions but does not auto-select a model or approve advice.

## Still unverified
Owner PC real model results, Windows DPAPI/ACL/shortcut behavior, hosted preview connectivity, maximum viable context/concurrency, wattage/thermals, OCR/PDF worst-case memory on physical devices, screen-reader/complete accessibility, legal readiness and actual future lender outcomes. No real data, production deployment, lender approval or security-finding resolution/ignore occurred.