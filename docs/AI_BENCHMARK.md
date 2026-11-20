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

## Troubleshooting and exact recovery commands

The downloaded command now prints numbered recovery steps once per failure type and saves them in `README.txt` and `benchmark_results.json`; CSV rows include a sanitized `errorCode`. Partial results are preserved even when Ollama is offline or no suitable model is installed. Exception bodies and service responses are not copied into troubleshooting reports.

### Timeout or total time budget reached
Stop the normal worker with Ctrl+C and close heavy apps, leaving Ollama open. Check and warm up the installed default model with a fictional prompt:

```powershell
ollama ps
ollama run "hf.co/unsloth/Qwen3.5-9B-GGUF:Q5_K_M" "Return only OK."
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\LoanScout-Benchmark.ps1" -SkipConcurrency -MaxMinutes 120
```

Generation/stream requests remain capped at 180 seconds, embeddings at 60 seconds and concurrent requests at 120 seconds. `-MaxMinutes` extends only the total benchmark budget; it does not fix an individual request timeout. Try a smaller installed generation model if warm-up and reduced load do not help. Skipped, timed-out or malformed tests never count as passes.

### Local model unavailable
Run `ollama list`. Embedding models cannot answer generation tests; the default selection skips model files larger than 12 GB. To test a larger **already installed** generation model:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\LoanScout-Benchmark.ps1" -IncludeLargeModels -SkipConcurrency -MaxMinutes 120
```

If the default model is absent, the following **optional manual download requires internet and disk space**; the benchmark never runs it for you:

```powershell
ollama pull "hf.co/unsloth/Qwen3.5-9B-GGUF:Q5_K_M"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\LoanScout-Benchmark.ps1" -SkipConcurrency -MaxMinutes 120
```

The deliberate `missing-model-404` probe is expected to pass when Ollama rejects the fictional missing model; do not install that fictional model.

### Ollama offline or fallback unavailable
Open the Ollama desktop app, or run `ollama serve` in a **second PowerShell window** and leave it open. If the port is already in use, check the existing service instead of starting another. In the original window:

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/version" -TimeoutSec 10
ollama list
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\LoanScout-Benchmark.ps1" -SkipConcurrency -MaxMinutes 120
```

Only retry once the version check succeeds. Keep Ollama on localhost; do not expose its port publicly. **No offline, cloud or paid AI fallback exists**: results stay saved, but unavailable analysis stays unavailable. The local benchmark cannot verify the hosted app connection. If the app worker remains offline, restore internet access and restart it **after the benchmark** using the restart command above; a revoked connection needs fresh pairing from Local AI. Do not share connection files or credentials.

If a download is unfilled/corrupt, download it again from Local AI into Downloads. If local responses work but JSON/citation checks fail, retain the failure report for review rather than assuming accuracy or enabling fallback.

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
### Troubleshooting improvement verification — 2026-11-20
- Benchmark Vitest suite: **22/22 passed**. Downloaded PowerShell harness self-test passed with all 20 synthetic fixtures.
- Durable `tests/powershell/benchmark-troubleshooting.ps1`: **11 failure classifications**, nested timeout detection, duplicate suppression, sanitized saved recovery and empty preflight-result persistence passed in PowerShell 7.6.5.
- Executed the embedded downloaded command against three isolated loopback scenarios: refused connection, empty installed-model list, and a service exceeding the 10-second preflight timeout. All displayed the correct numbered recovery commands and saved JSON/README with zero fabricated passing rows.
- No app data, service configuration, model installation, cloud fallback or security findings changed. Physical Windows PowerShell 5.1 and actual owner model behavior remain unverified.

To rerun the durable PowerShell regression from the repository root on Windows:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\tests\powershell\benchmark-troubleshooting.ps1"
```

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