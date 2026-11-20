# In-app benchmark diagnosis and guided recovery

## Built
- Owner **Local AI → Benchmark diagnosis & recovery** accepts a saved `benchmark_results.json` or recognized text failure log (maximum 2 MB). File contents are read locally; only reconstructed metrics, allowlisted test names and failure codes are submitted. Original files, answers/prompts, credentials, personal paths, CPU names, credit reports and other arbitrary text are excluded from both the model and saved history.
- Explicit checkbox and **Analyze log · uses credits** trigger a streamed Lovable AI Gateway Responses request using `openai/gpt-6-astra`, low reasoning effort and a 4,096 output-token budget. Existing local Ollama research is unchanged. No automatic hosted calls, polling for diagnosis, substitute model or retries.
- Likely causes reference actual submitted failure tests. Recovery IDs must belong to the static reviewed recovery catalog. The model cannot produce executable repair commands, activate underwriting policies, edit software, publish, inspect reports or modify credentials.
- Same filtered-log hash reuses a completed saved diagnosis without another AI call. Five new diagnoses per owner per UTC day, one active at a time; database transaction lock protects concurrent submissions. This is a request-count limit, not an absolute monetary spending cap.
- Credits/policy/provider denial/unavailable endpoint pauses persist in the database. The owner must restore the reported issue, confirm it in-app, explicitly resume, then start a fresh request. Stop cancels the browser request and propagates upstream; interrupted records can be released manually without replaying inference.
- **Mark resolved / Still failing** saves an operator observation for the chosen recommended recovery. Future *new* diagnoses receive aggregate prior outcomes for matching failure-code sets; current recovery choices rank by resolved minus unresolved counts. Cached diagnosis text is not regenerated. This is retrieval/feedback, not model training or independent verification.
- **Download recovery + rerun** contains only static reviewed guidance, a localhost service check and an optional rerun of the already downloaded benchmark. It does not execute any model-generated text, install models, change firewall settings or rewrite software. Service startup/model downloads remain manual actions. Upload the new result and confirm which recovery worked entirely within the app.

## Exact operator command
Save `LoanScout-Recovery.ps1` in Downloads and run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\LoanScout-Recovery.ps1"
```

Stop the normal worker first, follow the displayed recovery steps, and answer the helper's rerun prompt. Return to Local AI to submit new results and mark the selected recovery resolved or still failing. There is no need to paste benchmark logs into chat.

## Verification
- All **175 application tests pass** (20 suites), including eight new privacy, evidence, catalog, limits, and symptom-learning tests.
- Real signed-in owner Chromium flow: upload a synthetic log with planted private/injection sentinel → consent → actual Gateway diagnosis → saved recovery advice → confirmation persisted on reload → downloaded PowerShell helper → repeated upload served from cache. The sentinel was absent from submitted metrics. Zero page errors and zero horizontal overflow at 686px.
- Gateway request inspected: Responses, HTTP/upstream 200, streaming true, exact model, strict JSON schema, low reasoning, `store:false`, encrypted reasoning carry, 4,096-token cap. First test: 962 input / 351 output tokens, 5.715 seconds, **0.10868 workspace credits**. This observed cost is not a guarantee for later calls.
- Downloaded recovery helper passed actual PowerShell syntax validation in 7.6.5. Physical Windows execution and actual hardware recovery cannot be performed remotely.
- **15/15 read-only database readiness checks passed**: owner-only RLS/read grants, service-only queue writes, audited feedback, five-per-day gate, single-running index and persisted pause state. Initial checks detected inherited default grants; additive migration 0047 removed them, then every check passed. Durable test: `tests/sql/benchmark_diagnostics_readiness.sql`.
- A second actual streamed diagnosis included the first operator-confirmed successful recovery in its prompt (`reduce_load`: 1 resolved, 0 unresolved). Gateway HTTP/upstream 200; 979 input / 385 output tokens; 7.527 seconds; 0.11616 credits. Exactly two new Gateway calls were observed; identical-log repeats made no new calls. Signed-out diagnosis POST returned 401.
- Both synthetic diagnoses and their synthetic recovery feedback were removed after testing; audit entries remain. Final readback: zero benchmark diagnoses/pause records, 24 lenders, 49 products, 13 source candidates and four active existing rules; lender data was not changed. Preview reported build OK.

## Not autonomous code repair
The hosted app cannot safely rewrite its repository or run arbitrary commands on the operator's computer. The implemented loop diagnoses, supplies a reviewed recovery helper, records results and improves future guidance. It never claims a suggested fix was executed or independently verified. Full autonomous deployment, remote machine administration and unrestricted model-generated repairs are not enabled.