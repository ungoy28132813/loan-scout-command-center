# Local Ollama pilot — 2026-11-20

## Built
- Owner-only `/local-ai` workspace; paired private Windows download, online/offline status, product selection, public-source retrieval, queue/history, citation checks, keep-as-note/reject, revocation.
- The user's installed Qwen 9B Q5 model is the default based on the uploaded 39.4 tokens/second benchmark. This is speed evidence, not an accuracy certification.
- Windows worker uses outbound HTTPS to the app and loopback HTTP to Ollama. No inbound port, tunnel, administrator rights, cloud AI fallback or automatic startup task.
- First run stores the worker credential with Windows current-user DPAPI encryption and locks the local folder ACL. It installs a credential-free worker and restart shortcut, deletes the paired installer and opens File Explorer. The paired download is itself sensitive until that first run; never share it.
- Only freshly fetched public lender excerpts and product metadata enter prompts. Individual reports, structured credit facts, client identifiers and internal notes never enter this pilot.
- Optional outcome context is refreshed per request from non-demo, lender-verified terminal outcomes. At least five verified records, with both approvals and denials, are required. Only counts are sent; no percent, applicant traits or approval predictions. This is retrieval-based context, not model training or proven adaptive underwriting.
- Exact quoted substrings are validated independently against source text. This verifies quote presence, not whether the model's interpretation is correct. All results remain advisory, including accepted notes; no connection to rule activation, matching, extraction verification or publication.
- Limits: 30 analyses/day, one active job, 10,000-character public excerpt, 8,192-token context, 1,024 output tokens, local timeout, expiring lease and 15-minute job expiry; identical non-rejected results reused for 24 hours. Computer polls at 30-second intervals while its window is open (2,880 connection checks/day if left running). These use hosting/database resources, not hosted AI inference; electricity and platform costs remain. No lender monitoring runs in the background.

## One-time owner action
Open the HTTPS preview, sign in as owner, select **Local AI → Download paired setup**, and save it in Downloads. Run in PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\LoanScout-LocalAI.ps1"
```

The connection file stays private. Keep the worker window open. To restart later, double-click **Start Loan Scout AI** in the opened folder, or run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\LoanScoutAI\worker.ps1"
```

To open the folder:

```powershell
Start-Process explorer.exe -ArgumentList ('"' + "$env:LOCALAPPDATA\LoanScoutAI" + '"')
```

Ctrl+C stops the worker. **Disconnect** in the owner workspace revokes its credential immediately; replacing a connection also revokes older credentials. No production deployment is authorized; this setup points to the HTTPS origin where the download was made.

## Verification and blockers
- Authenticated Chromium: pairing, heartbeat, real Wells Fargo BusinessLine official-source retrieval, claim, fabricated-quote rejection (422), synthetic advisory return, owner note review and readback, revocation (401). The worker/model response was simulated, explicitly labeled synthetic; the model was not run remotely on the owner's computer.
- Desktop and 390px mobile workspace inspected; no horizontal page overflow; no browser page errors. Offline analysis button disabled; unauthenticated endpoint 401.
- Application suite: 145 tests after the final whitespace-citation regression. New local AI tests cover privacy gating, both terminal outcomes, demo exclusion, payload allowlist, quotes, automatic-mutation rejection, offline status and inference limits.
- Read-only privilege checks: 9/9; owner-bootstrap regression: 12/12. Transaction-rollback test exercised owner pairing, offline refusal, forbidden payload key, duplicate active job refusal, bad credential, wrong lease, completion, note review and non-owner pairing denial. Sentinel intentionally rolls back all writes.
- PowerShell installer and extracted installed body parse successfully under PowerShell 7. Windows DPAPI/ACL/shortcut/installer execution, actual Ollama HTTP behavior, answer accuracy, GPU acceleration, concurrent users and preview reachability from the user's PC remain unverified until the owner runs the download.
- Temporary browser workers/jobs were removed; catalog/policies preserved. Security findings remain deferred as requested; no scans were resolved or ignored. Sections 08/09 and overall production readiness remain partial.