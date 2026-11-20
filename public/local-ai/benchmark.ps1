param([switch]$SelfTest, [switch]$IncludeLargeModels, [int]$MaxMinutes = 60, [switch]$SkipConcurrency)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$BundleBase64 = '__BENCHMARK_BASE64__'
$DefaultModel = 'hf.co/unsloth/Qwen3.5-9B-GGUF:Q5_K_M'
$Base = 'http://127.0.0.1:11434'
$Rows = New-Object 'System.Collections.Generic.List[object]'
$Started = Get-Date
$OutputRoot = [Environment]::GetFolderPath('Desktop')
if (-not $OutputRoot) { $OutputRoot = $HOME }
$Out = Join-Path $OutputRoot ('LoanScout-Benchmark-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))

function Grade-Exact($Value, $Expected) {
    $Failures = New-Object 'System.Collections.Generic.List[string]'
    if ($null -eq $Value -or $Value -is [array] -or $Value -is [string]) { return @{ pass = $false; errors = @('Not an object') } }
    $Keys = @($Expected.PSObject.Properties.Name)
    foreach ($Key in $Keys) {
        $Prop = $Value.PSObject.Properties[$Key]
        $Target = $Expected.$Key
        if ($null -eq $Prop) { $Failures.Add('Missing: ' + $Key); continue }
        $Actual = $Prop.Value
        $Ok = $false
        if ($null -eq $Target) { $Ok = $null -eq $Actual }
        elseif ($Target -is [bool]) { $Ok = $Actual -is [bool] -and $Actual -eq $Target }
        elseif ($Target -is [string]) { $Ok = $Actual -is [string] -and $Actual -ceq $Target }
        else { $Ok = $null -ne $Actual -and $Actual -isnot [string] -and $Actual -isnot [bool] -and $Actual -eq $Target }
        if (-not $Ok) { $Failures.Add('Wrong value/type: ' + $Key) }
    }
    foreach ($Key in @($Value.PSObject.Properties.Name)) { if ($Keys -notcontains $Key) { $Failures.Add('Unexpected: ' + $Key) } }
    return @{ pass = $Failures.Count -eq 0; errors = @($Failures.ToArray()) }
}

function Grade-Advice($Value, $Source) {
    $Failures = New-Object 'System.Collections.Generic.List[string]'
    if ($null -eq $Value -or $Value -is [array] -or $Value -is [string]) { return @{ pass = $false; errors = @('Not an object') } }
    if ((@($Value.PSObject.Properties.Name | Sort-Object) -join ',') -cne 'findings,summary,unknowns') { $Failures.Add('Wrong advisory fields') }
    if ($Value.summary -isnot [string] -or [string]::IsNullOrWhiteSpace($Value.summary) -or $Value.summary.Length -gt 2000) { $Failures.Add('Invalid summary') }
    if ($Value.findings -isnot [array] -or $Value.findings.Count -gt 8 -or $Value.unknowns -isnot [array] -or $Value.unknowns.Count -gt 10) { $Failures.Add('Invalid arrays') }
    $Normalized = ($Source -replace '\s+', ' ').Trim()
    foreach ($Finding in $Value.findings) {
        if ((@($Finding.PSObject.Properties.Name | Sort-Object) -join ',') -cne 'evidenceQuote,statement') { $Failures.Add('Wrong finding fields') }
        if ($Finding.statement -isnot [string] -or [string]::IsNullOrWhiteSpace($Finding.statement) -or $Finding.statement.Length -gt 800) { $Failures.Add('Invalid statement') }
        if ($Finding.evidenceQuote -isnot [string] -or [string]::IsNullOrWhiteSpace($Finding.evidenceQuote) -or $Finding.evidenceQuote.Length -gt 600) { $Failures.Add('Invalid quote'); continue }
        if (-not $Normalized.Contains(($Finding.evidenceQuote -replace '\s+', ' ').Trim())) { $Failures.Add('Fabricated quote') }
    }
    foreach ($Item in $Value.unknowns) { if ($Item -isnot [string] -or [string]::IsNullOrWhiteSpace($Item) -or $Item.Length -gt 400) { $Failures.Add('Invalid unknown') } }
    return @{ pass = $Failures.Count -eq 0; errors = @($Failures.ToArray()) }
}

function Test-Metrics($Response) {
    $Tps = $null; $PromptTps = $null
    if ($Response.eval_duration -gt 0) { $Tps = [Math]::Round($Response.eval_count / ($Response.eval_duration / 1e9), 2) }
    if ($Response.prompt_eval_duration -gt 0) { $PromptTps = [Math]::Round($Response.prompt_eval_count / ($Response.prompt_eval_duration / 1e9), 2) }
    return @{ tokensPerSecond = $Tps; promptTokensPerSecond = $PromptTps; generatedTokens = $Response.eval_count; promptTokens = $Response.prompt_eval_count; loadSeconds = [Math]::Round($Response.load_duration / 1e9,3) }
}

function Run-Stream($Model, $System, $Prompt, $Expected) {
    if ((Remaining-Time) -lt 10) { return }
    $Client=$null; $Response=$null; $Reader=$null
    $Watch=[Diagnostics.Stopwatch]::StartNew()
    $Row=@{model=$Model;category='stream latency';test='time-to-first-content';pass=$false;seconds=0;firstContentSeconds=$null;tokensPerSecond=$null;error=$null}
    try {
        Add-Type -AssemblyName System.Net.Http
        $Client=New-Object Net.Http.HttpClient
        $Client.Timeout=[TimeSpan]::FromSeconds([Math]::Min(180,(Remaining-Time)))
        $Body=@{model=$Model;stream=$true;think=$false;format='json';system=$System;prompt=$Prompt;options=@{temperature=0;seed=42;num_ctx=8192;num_predict=1024}}|ConvertTo-Json -Depth 10 -Compress
        $Content=New-Object Net.Http.StringContent($Body,[Text.Encoding]::UTF8,'application/json')
        $Request=New-Object Net.Http.HttpRequestMessage([Net.Http.HttpMethod]::Post,($Base+'/api/generate'))
        $Request.Content=$Content
        $Response=$Client.SendAsync($Request,[Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
        $Response.EnsureSuccessStatusCode()|Out-Null
        $Reader=New-Object IO.StreamReader($Response.Content.ReadAsStreamAsync().GetAwaiter().GetResult())
        $Text='';$Final=$null
        while($true){
            $Read=$Reader.ReadLineAsync()
            $Milliseconds=[Math]::Max(1,[Math]::Min(180000,[Math]::Floor((Remaining-Time)*1000)))
            if(-not $Read.Wait($Milliseconds)){throw 'Streaming timeout'}
            $Line=$Read.Result
            if($null -eq $Line){break}
            if(-not $Line){continue}
            $Part=$Line|ConvertFrom-Json
            if($Part.response){if($null -eq $Row.firstContentSeconds){$Row.firstContentSeconds=[Math]::Round($Watch.Elapsed.TotalSeconds,3)};$Text+=$Part.response}
            if($Part.done){$Final=$Part;break}
        }
        $Grade=Grade-Exact ($Text|ConvertFrom-Json) $Expected
        $Row.pass=$Grade.pass -and $null -ne $Final -and $Final.done_reason -ne 'length'
        $Row.errors=$Grade.errors
        if($Final){foreach($K in (Test-Metrics $Final).Keys){$Row[$K]=(Test-Metrics $Final)[$K]}}
    } catch { $Row.error='Streaming HTTP, timeout or output failure' }
    finally {if($Reader){$Reader.Dispose()};if($Response){$Response.Dispose()};if($Client){$Client.Dispose()}}
    $Row.seconds=[Math]::Round($Watch.Elapsed.TotalSeconds,3);$Rows.Add([pscustomobject]$Row);Save-Results
}

function Cosine($A,$B) {
    if(-not $A -or $A.Count -ne $B.Count){return $null}
    $Dot=0.0;$AA=0.0;$BB=0.0
    for($i=0;$i -lt $A.Count;$i++){$Dot+=[double]$A[$i]*[double]$B[$i];$AA+=[double]$A[$i]*[double]$A[$i];$BB+=[double]$B[$i]*[double]$B[$i]}
    if($AA -eq 0 -or $BB -eq 0){return $null};return $Dot/[Math]::Sqrt($AA*$BB)
}

function Run-Embedding($Model) {
    if((Remaining-Time) -lt 10){return}
    $Watch=[Diagnostics.Stopwatch]::StartNew();$Row=@{model=$Model;category='embedding retrieval';test='synthetic-embedding-dimensions-and-ranking';pass=$false;seconds=0;error=$null}
    try {
        $Inputs=@('credit card revolving account balance and credit limit','credit card revolving account balance and credit limit','card utilization uses revolving balance divided by credit limit','weather forecast predicts rain and snow')
        $Body=@{model=$Model;input=$Inputs;truncate=$false}|ConvertTo-Json -Compress
        $R=Invoke-RestMethod -Uri ($Base+'/api/embed') -Method Post -ContentType 'application/json' -Body $Body -TimeoutSec ([Math]::Max(1,[Math]::Min(60,[Math]::Floor((Remaining-Time)))))
        $V=@($R.embeddings);$Valid=$V.Count -eq 4
        if($Valid){$Dim=$V[0].Count;foreach($Vector in $V){if($Vector.Count -ne $Dim -or $Dim -le 0){$Valid=$false};foreach($Number in $Vector){if([double]::IsNaN($Number) -or [double]::IsInfinity($Number)){$Valid=$false}}}
            $Same=Cosine $V[0] $V[1];$Relevant=Cosine $V[0] $V[2];$Unrelated=Cosine $V[0] $V[3]
            $Row.dimensions=$Dim;$Row.identicalCosine=$Same;$Row.relevantCosine=$Relevant;$Row.unrelatedCosine=$Unrelated
            $Row.pass=$Valid -and $null -ne $Same -and $Same -gt .999 -and $null -ne $Relevant -and $Relevant -gt $Unrelated
        }
    }catch{$Row.error='Local embedding HTTP or vector failure'}
    $Row.seconds=[Math]::Round($Watch.Elapsed.TotalSeconds,3);$Rows.Add([pscustomobject]$Row);Save-Results
}

function Save-Results {
    New-Item -ItemType Directory -Path $Out -Force | Out-Null
    $Summary = @{ version = $Bundle.version; startedUtc = $Started.ToUniversalTime().ToString('o'); finishedUtc = (Get-Date).ToUniversalTime().ToString('o'); hardware = $Hardware; inventory = $Inventory; results = @($Rows.ToArray()); limitations = @('Synthetic checks are not production certification or legal review.','Exact-key checks use a benchmark prompt; advisory-shape checks use the app prompt.','Latency is wall time; token speed comes from Ollama counters.','Two-request concurrency is an isolated stress probe, not production worker behavior.','No private files, real credit reports, credentials or app jobs are read.','Power/temperature/electricity cost and real underwriting accuracy are not established.','Cold-ish timing unloads only the tested model; OS caches and other processes remain uncontrolled.','No third-party requests, downloads or model pulls are performed.') }
    $Summary | ConvertTo-Json -Depth 40 | Set-Content -LiteralPath (Join-Path $Out 'benchmark_results.json') -Encoding UTF8
    $Rows | Select-Object model,category,test,pass,seconds,tokensPerSecond,promptTokensPerSecond,generatedTokens,error | Export-Csv -LiteralPath (Join-Path $Out 'benchmark_metrics.csv') -NoTypeInformation -Encoding UTF8
    $Text = New-Object 'System.Collections.Generic.List[string]'
    $Text.Add('LOAN SCOUT SYNTHETIC LOCAL AI BENCHMARK'); $Text.Add('Not production certification. Failures require review; no model is automatically selected.'); $Text.Add('')
    foreach ($ModelGroup in ($Rows | Where-Object { $_.model -ne 'harness' } | Group-Object model)) {
        $Group = @($ModelGroup.Group)
        $Accuracy = @($Group | Where-Object { $_.category -eq 'exact-answer' })
        $Passing = @($Accuracy | Where-Object pass).Count
        $Latencies = @($Group | Where-Object { $_.seconds -gt 0 } | ForEach-Object { [double]$_.seconds } | Sort-Object)
        $P50 = $null; $P95 = $null
        if ($Latencies.Count -gt 0) { $P50 = $Latencies[[Math]::Max(0,[Math]::Ceiling($Latencies.Count * .50)-1)]; $P95 = $Latencies[[Math]::Max(0,[Math]::Ceiling($Latencies.Count * .95)-1)] }
        $Text.Add($ModelGroup.Name + ': exact-answer ' + $Passing + '/' + $Accuracy.Count + ' executed (20 planned for generation models); measured latency p50=' + $P50 + 's p95=' + $P95 + 's (mixed tests, not an SLA).')
        foreach ($Failed in @($Group | Where-Object { -not $_.pass -and $_.category -ne 'expected truncation' })) { $Text.Add('  REVIEW: ' + $Failed.test + ' / ' + ($Failed.errors -join '; ') + ' ' + $Failed.error) }
    }
    $Text.Add(''); $Text.Add('Skipped models/tests and hardware measurements are in benchmark_results.json.'); $Text.Add('Upload benchmark_results.json and benchmark_metrics.csv; synthetic responses are included, never credentials.')
    $Text | Set-Content -LiteralPath (Join-Path $Out 'README.txt') -Encoding UTF8
}

function Remaining-Time { return [Math]::Max(0, ($MaxMinutes * 60) - ((Get-Date) - $Started).TotalSeconds) }

function Run-Case($Model, $Name, $Category, $System, $Prompt, $Expected, $Source, $Context = 8192, $Tokens = 1024) {
    if ((Remaining-Time) -lt 10) { return $null }
    $Watch = [Diagnostics.Stopwatch]::StartNew()
    $Body = @{ model = $Model; stream = $false; think = $false; format = 'json'; keep_alive = '5m'; system = $System; prompt = $Prompt; options = @{ temperature = 0; seed = 42; num_ctx = $Context; num_predict = $Tokens } } | ConvertTo-Json -Depth 30 -Compress
    $Row = @{ model = $Model; test = $Name; category = $Category; pass = $false; errors = @(); seconds = 0; tokensPerSecond = $null; response = $null; error = $null; context = $Context }
    try {
        $Timeout = [Math]::Max(1,[Math]::Min(180,[Math]::Floor((Remaining-Time))))
        $R = Invoke-RestMethod -Uri ($Base + '/api/generate') -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($Body)) -TimeoutSec $Timeout
        $Row.response = $R.response
        $Metrics = Test-Metrics $R
        foreach ($K in $Metrics.Keys) { $Row[$K] = $Metrics[$K] }
        if ($Category -eq 'expected truncation') {
            $Row.pass = $R.done_reason -eq 'length'
            $Row.errors = @('Expected bounded-output probe; not an accuracy score')
        } else {
            $Answer = $R.response | ConvertFrom-Json
            if ($null -ne $Expected) { $Grade = Grade-Exact $Answer $Expected } else { $Grade = Grade-Advice $Answer $Source }
            $Row.pass = $Grade.pass -and $R.done -and $R.done_reason -ne 'length'
            $Row.errors = $Grade.errors
            if ($R.done_reason -eq 'length') { $Row.errors += 'Output token limit reached' }
            $Row.answer = $Answer
        }
    } catch { $Row.error = 'Local HTTP, timeout or JSON failure'; $Row.errors = @('Inspect Ollama locally; no external fallback') }
    $Watch.Stop(); $Row.seconds = [Math]::Round($Watch.Elapsed.TotalSeconds,3)
    $Rows.Add([pscustomobject]$Row)
    Save-Results
    Write-Host ($Model + ' | ' + $Name + ' | pass=' + $Row.pass + ' | ' + $Row.seconds + 's | ' + $Row.tokensPerSecond + ' tokens/s')
    return [pscustomobject]$Row
}

try {
    if ($MaxMinutes -lt 1 -or $MaxMinutes -gt 180) { throw 'MaxMinutes must be 1-180' }
    if ($BundleBase64 -eq '__BENCHMARK' + '_BASE64__') { throw 'Download the benchmark from Local AI so synthetic cases are embedded.' }
    $Bundle = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($BundleBase64)) | ConvertFrom-Json
    $Hardware = @{ powershell = $PSVersionTable.PSVersion.ToString(); os = [Environment]::OSVersion.VersionString; logicalProcessors = [Environment]::ProcessorCount }
    $Inventory = @()
    if ($SelfTest) {
        foreach ($Case in $Bundle.cases) {
            if (-not (Grade-Exact $Case.expected $Case.expected).pass) { throw 'Expected answer rejected by grader' }
            if ((Grade-Exact ([pscustomobject]@{}) $Case.expected).pass) { throw 'Missing answer accepted' }
        }
        if ((Grade-Exact ([pscustomobject]@{ n='600' }) ([pscustomobject]@{ n=600 })).pass) { throw 'Numeric string accepted' }
        if ((Grade-Exact ([pscustomobject]@{ n=600; extra=$true }) ([pscustomobject]@{ n=600 })).pass) { throw 'Extra field accepted' }
        $Good = [pscustomobject]@{ summary='Fictional review'; findings=@([pscustomobject]@{ statement='Minimum'; evidenceQuote='Amount 2000.' }); unknowns=@('Model unknown') }
        if (-not (Grade-Advice $Good 'Amount 2000.').pass) { throw 'Valid quote rejected' }
        if ((Grade-Advice $Good 'Amount 3000.').pass) { throw 'Fabricated quote accepted' }
        if((Cosine @(1.0,0.0) @(1.0,0.0)) -ne 1 -or (Cosine @(1.0,0.0) @(0.0,1.0)) -ne 0){throw 'Cosine calculation failed'}
        if((Test-Metrics ([pscustomobject]@{eval_count=80;eval_duration=2000000000;prompt_eval_count=100;prompt_eval_duration=1000000000;load_duration=0})).tokensPerSecond -ne 40){throw 'Token speed calculation failed'}
        $Rows.Add([pscustomobject]@{model='harness';category='self-test';test='20 expected answers + rejection checks + citations';pass=$true;seconds=0})
        Save-Results
        Write-Host ('Harness self-test passed: ' + $Bundle.cases.Count + ' synthetic cases. No model contacted.') -ForegroundColor Green
        exit 0
    }
    Write-Host 'Stop your Loan Scout worker first (Ctrl+C) and close heavy apps. This test changes no app data.' -ForegroundColor Yellow
    Write-Host ('Synthetic benchmark time budget: ' + $MaxMinutes + ' minutes. Ctrl+C stops it; intermediate results are saved.')
    try {
        $OS = Get-CimInstance Win32_OperatingSystem
        $Hardware.ramTotalGB = [Math]::Round($OS.TotalVisibleMemorySize / 1MB,2)
        $Hardware.ramFreeGB = [Math]::Round($OS.FreePhysicalMemory / 1MB,2)
        $Hardware.cpu = (Get-CimInstance Win32_Processor | Select-Object -First 1).Name
        $Hardware.gpus = @(Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion,@{n='reportedAdapterRamGB';e={[Math]::Round($_.AdapterRAM/1GB,2)}})
        $Hardware.gpuMemoryWarning = 'WMI AdapterRAM can be truncated; do not treat it as confirmed VRAM.'
        $Hardware.ollamaListen = @(Get-NetTCPConnection -LocalPort 11434 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort)
    } catch { $Hardware.inventoryNote = 'Some hardware inventory unavailable; benchmark continues.' }
    $Version = Invoke-RestMethod -Uri ($Base + '/api/version') -TimeoutSec 10
    $Hardware.ollamaVersion = $Version.version
    $Tags = Invoke-RestMethod -Uri ($Base + '/api/tags') -TimeoutSec 10
    $Inventory = @($Tags.models | Select-Object name,size,details)
    $Models = @($Tags.models | Where-Object { $_.name -notmatch '(?i)minilm|embed|nomic|bge|mxbai' -and ($IncludeLargeModels -or $_.size -le 12GB) } | Sort-Object @{e={if($_.name -eq $DefaultModel){0}else{1}}},size)
    $Hardware.selectionNote = 'Default: installed non-embedding models <=12GB file size. IncludeLargeModels adds larger installed models; no model download.'
    if (-not $Models.Count) { throw 'No suitable installed generation models found.' }
    # Missing-model probe must fail locally; never pull or install a model.
    try { Invoke-RestMethod -Uri ($Base+'/api/generate') -Method Post -ContentType 'application/json' -Body '{"model":"loan-scout-nonexistent-benchmark-model","prompt":"test","stream":false}' -TimeoutSec 10 | Out-Null; $MissingPass=$false } catch { $MissingPass=$null -ne $_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 404 }
    $Rows.Add([pscustomobject]@{model='harness';category='failure handling';test='missing-model-404';pass=$MissingPass;seconds=0})
    foreach ($M in $Models) {
        if ((Remaining-Time) -lt 10) { break }
        $Model=$M.name
        try { Invoke-RestMethod -Uri ($Base+'/api/generate') -Method Post -ContentType 'application/json' -Body (@{model=$Model;keep_alive=0;stream=$false}|ConvertTo-Json) -TimeoutSec 15 | Out-Null } catch { }
        $First=$Bundle.cases[0]
        $Prompt=@{source=$First.source;question=$First.question}|ConvertTo-Json -Compress
        $null=Run-Case $Model 'cold-ish-load' 'latency' $Bundle.system $Prompt $First.expected ''
        foreach ($Case in $Bundle.cases) {
            if ((Remaining-Time) -lt 10) { break }
            $Prompt=@{source=$Case.source;question=$Case.question}|ConvertTo-Json -Compress
            $null=Run-Case $Model $Case.id 'exact-answer' $Bundle.system $Prompt $Case.expected ''
        }
        $Repeated=@()
        for($i=1;$i -le 3;$i++) {
            $Prompt=@{source=$First.source;question=$First.question}|ConvertTo-Json -Compress
            $Row=Run-Case $Model ('repeat-'+$i) 'stability' $Bundle.system $Prompt $First.expected ''
            if($Row){$Repeated+=($Row.answer|ConvertTo-Json -Compress)}
        }
        $Rows.Add([pscustomobject]@{model=$Model;category='stability';test='repeat-answer-consistency';pass=$Repeated.Count -eq 3 -and @($Repeated|Select-Object -Unique).Count -eq 1;seconds=0})
        $Prompt=@{source=$First.source;question=$First.question}|ConvertTo-Json -Compress
        Run-Stream $Model $Bundle.system $Prompt $First.expected
        foreach($Length in @(1000,5000,10000)) { foreach($Position in @('start','middle','end')) {
            $Needle='Fictional product maturity is 36 months. Exact score model is undisclosed.'
            $Filler=('General product information. ' * 400)
            $Padding=$Filler.Substring(0,$Length-$Needle.Length-2)
            if($Position -eq 'start'){$Source=$Needle+"`n"+$Padding}
            elseif($Position -eq 'end'){$Source=$Padding+"`n"+$Needle}
            else{$Half=[int][Math]::Floor($Padding.Length/2);$Source=$Padding.Substring(0,$Half)+"`n"+$Needle+"`n"+$Padding.Substring($Half)}
            $Expected=[pscustomobject]@{termMonths=36;exactModel=$null}
            $Prompt=@{source=$Source;question='Return termMonths and exactModel.'}|ConvertTo-Json -Compress
            $null=Run-Case $Model ('context-'+$Length+'-chars-'+$Position) 'context retrieval' $Bundle.system $Prompt $Expected ''
        } }
        $Source='Fictional loan amounts are 2000 to 50000. Exact score model, bureau and APR are not disclosed. Channel is Synthetic only.'
        $InputValue=@{product=@{name='Fictional product';type='personal_loan';scope='Synthetic only';url='https://example.org';checkedAt='2026-11-20'};source=@{excerpt=$Source;sha256=('a'*64)};outcomes=$null}
        $Prompt=$InputValue|ConvertTo-Json -Depth 10 -Compress
        $null=Run-Case $Model 'app-advisory-protocol' 'advisory format/citations' $Bundle.advisorySystem $Prompt $null $Source
        $null=Run-Case $Model 'bounded-output-16-tokens' 'expected truncation' $Bundle.advisorySystem $Prompt $null $Source 8192 16
        try { $Hardware.lastRunner=@((Invoke-RestMethod -Uri ($Base+'/api/ps') -TimeoutSec 10).models | Select-Object name,size,size_vram,context_length,expires_at) } catch { }
        if(-not $SkipConcurrency -and (Remaining-Time) -gt 30) {
            $StressBody=@{model=$Model;stream=$false;think=$false;format='json';system=$Bundle.system;prompt=(@{source=$First.source;question=$First.question}|ConvertTo-Json -Compress);options=@{temperature=0;seed=42;num_ctx=8192;num_predict=256}}|ConvertTo-Json -Depth 10 -Compress
            $Jobs=@();$Stopwatch=[Diagnostics.Stopwatch]::StartNew()
            try {
                for($i=0;$i -lt 2;$i++){ $Jobs+=Start-Job -ScriptBlock {param($B,$P) try{$R=Invoke-RestMethod -Uri ($B+'/api/generate') -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($P)) -TimeoutSec 120;@{ok=$true;response=$R.response;done=$R.done;doneReason=$R.done_reason}}catch{@{ok=$false}}} -ArgumentList $Base,$StressBody }
                $null=Wait-Job -Job $Jobs -Timeout ([Math]::Max(1,[Math]::Min(130,[Math]::Floor((Remaining-Time)))))
                $Results=@($Jobs|Receive-Job)
                $Pass=$Results.Count -eq 2
                foreach($R in $Results){if(-not $R.ok -or -not $R.done -or $R.doneReason -eq 'length'){$Pass=$false}else{try{if(-not (Grade-Exact ($R.response|ConvertFrom-Json) $First.expected).pass){$Pass=$false}}catch{$Pass=$false}}}
                $Rows.Add([pscustomobject]@{model=$Model;category='concurrency';test='two-local-requests';pass=$Pass;seconds=[Math]::Round($Stopwatch.Elapsed.TotalSeconds,3)})
            } finally { if($Jobs.Count){$Jobs|Stop-Job -ErrorAction SilentlyContinue;$Jobs|Remove-Job -Force -ErrorAction SilentlyContinue} }
        }
        Save-Results
    }
    foreach($M in @($Tags.models|Where-Object{$_.name -match '(?i)minilm|embed|nomic|bge|mxbai'})){Run-Embedding $M.name}
    $Hardware.timeBudgetExhausted=(Remaining-Time) -lt 10
    Save-Results
    Write-Host 'Finished available tests; inspect failures and skipped coverage before selecting a model.' -ForegroundColor Green
} catch {
    if(-not $Hardware){$Hardware=@{}}
    $Hardware.runError='Benchmark unavailable or interrupted; check Ollama locally and the embedded download.'
    if(-not $Bundle){$Bundle=@{version='unavailable'}}
    Save-Results
    Write-Host 'Benchmark stopped safely; available results were saved. No app data changed.' -ForegroundColor Yellow
    if($SelfTest){exit 1}
} finally {
    if(-not $SelfTest){
        try { Start-Process explorer.exe -ArgumentList ('/select,"'+(Join-Path $Out 'benchmark_results.json')+'"') } catch { }
        Write-Host ('Results folder: '+$Out)
    }
}