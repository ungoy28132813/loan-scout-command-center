$BootstrapToken = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('__TOKEN_BASE64__'))
$BootstrapApp = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('__APP_BASE64__'))
# WORKER_BODY
# Loan Scout local AI worker. No administrator rights, firewall rules, tunnel or public Ollama port.
# Keep the initial paired download private. Credentials are encrypted for this Windows user on first run.
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Root = Join-Path $env:LOCALAPPDATA 'LoanScoutAI'
$ConfigPath = Join-Path $Root 'connection.json'
$WorkerPath = Join-Path $Root 'worker.ps1'
$Lock = $null

function Read-Token($Encrypted) {
    $Secure = ConvertTo-SecureString $Encrypted
    $Pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Pointer) }
}

function Check-Advice($Value, $Excerpt) {
    $Keys = @($Value.PSObject.Properties.Name | Sort-Object)
    if (($Keys -join ',') -ne 'findings,summary,unknowns') { throw 'invalid_output' }
    if ($Value.summary -isnot [string] -or $Value.summary.Length -lt 1 -or $Value.summary.Length -gt 2000) { throw 'invalid_output' }
    if ($Value.findings -isnot [array] -or $Value.findings.Count -gt 8 -or $Value.unknowns -isnot [array] -or $Value.unknowns.Count -gt 10) { throw 'invalid_output' }
    $Normalized = ($Excerpt -replace '\s+', ' ').Trim()
    foreach ($Finding in $Value.findings) {
        if ((@($Finding.PSObject.Properties.Name | Sort-Object) -join ',') -ne 'evidenceQuote,statement') { throw 'invalid_output' }
        if ($Finding.statement -isnot [string] -or $Finding.statement.Length -lt 1 -or $Finding.statement.Length -gt 800) { throw 'invalid_output' }
        if ($Finding.evidenceQuote -isnot [string] -or $Finding.evidenceQuote.Trim().Length -lt 1 -or $Finding.evidenceQuote.Length -gt 600) { throw 'invalid_output' }
        if (-not $Normalized.Contains(($Finding.evidenceQuote -replace '\s+', ' ').Trim())) { throw 'invalid_output' }
    }
    foreach ($Unknown in $Value.unknowns) {
        if ($Unknown -isnot [string] -or $Unknown.Length -lt 1 -or $Unknown.Length -gt 400) { throw 'invalid_output' }
    }
}

function Exchange($Payload) {
    return Invoke-RestMethod -Method Post -Uri ($Config.app.TrimEnd('/') + '/api/public/local-ai') -Headers @{ Authorization = "Bearer $Token" } -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes(($Payload | ConvertTo-Json -Depth 20 -Compress))) -TimeoutSec 45
}

function Generate($Model, $System, $InputValue, $TokenLimit = 1024, $TimeoutSeconds = 180) {
    $Body = @{ model = $Model; stream = $false; think = $false; format = 'json'; keep_alive = '5m'; system = $System; prompt = ($InputValue | ConvertTo-Json -Depth 20 -Compress); options = @{ temperature = 0; num_ctx = 8192; num_predict = $TokenLimit; seed = 42 } } | ConvertTo-Json -Depth 25 -Compress
    $Response = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:11434/api/generate' -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($Body)) -TimeoutSec $TimeoutSeconds
    if (-not $Response.done -or $Response.done_reason -eq 'length') { throw 'invalid_output' }
    $Answer = $Response.response | ConvertFrom-Json
    Check-Advice $Answer $InputValue.source.excerpt
    return $Answer
}

try {
    New-Item -ItemType Directory -Path $Root -Force | Out-Null
    if ($BootstrapToken) {
        $Uri = [Uri]$BootstrapApp
        if ($Uri.Scheme -ne 'https' -or $Uri.UserInfo -or $Uri.AbsolutePath -ne '/') { throw 'Invalid app address' }
        $Secure = ConvertTo-SecureString $BootstrapToken -AsPlainText -Force
        @{ app = $BootstrapApp; encryptedToken = (ConvertFrom-SecureString $Secure) } | ConvertTo-Json | Set-Content -LiteralPath $ConfigPath -Encoding UTF8
        $SourceScript = Get-Content -LiteralPath $PSCommandPath -Raw
        $Marker = '# WORKER' + '_BODY'
        $MarkerIndex = $SourceScript.IndexOf($Marker)
        if ($MarkerIndex -lt 0) { throw 'Installer body missing' }
        $Body = $SourceScript.Substring($MarkerIndex + $Marker.Length)
        if (-not $Body) { throw 'Installer body missing' }
        ('$BootstrapToken = ""' + "`r`n" + '$BootstrapApp = ""' + "`r`n# WORKER_BODY" + $Body) | Set-Content -LiteralPath $WorkerPath -Encoding UTF8
        $Sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
        & icacls.exe $Root /inheritance:r /grant:r "*${Sid}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Unable to protect local setup folder' }
        $Shell = New-Object -ComObject WScript.Shell
        $Shortcut = $Shell.CreateShortcut((Join-Path $Root 'Start Loan Scout AI.lnk'))
        $Shortcut.TargetPath = Join-Path $PSHOME 'powershell.exe'
        $Shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $WorkerPath + '"'
        $Shortcut.WorkingDirectory = $Root
        $Shortcut.Save()
        if ($PSCommandPath -ne $WorkerPath) { Remove-Item -LiteralPath $PSCommandPath -Force }
        $BootstrapToken = ''
        Start-Process explorer.exe -ArgumentList ('"' + $Root + '"')
    }
    if (-not (Test-Path -LiteralPath $ConfigPath)) { throw 'Download a paired setup from Loan Scout first' }
    $Config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
    $AppUri = [Uri]$Config.app
    if ($AppUri.Scheme -ne 'https' -or $AppUri.UserInfo -or $AppUri.AbsolutePath -ne '/') { throw 'Invalid app address' }
    $Token = Read-Token $Config.encryptedToken
    $Lock = [IO.File]::Open((Join-Path $Root 'worker.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    Write-Host 'Loan Scout AI connected locally. Keep this window open; Ctrl+C stops it.' -ForegroundColor Green
    Write-Host 'Only owner-requested public lender text and privacy-gated outcome totals are processed. No credit reports.'
    Write-Host 'No hosted AI fallback, no automatic publication, no model training.'
    $TestedModels = @{}
    $Delay = 30
    while ($true) {
        try {
            $Tags = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 10
            $Poll = Exchange @{ action = 'poll' }
            if ($null -eq $Poll.job) { Start-Sleep -Seconds 30; continue }
            $Job = $Poll.job
            try {
                if (@($Tags.models.name) -notcontains $Job.model) { throw 'model_unavailable' }
                if (-not $TestedModels.ContainsKey($Job.model)) {
                    Write-Host 'Checking model output with fictional evidence...'
                    $Fixture = @{ product = @{ name = 'Fictional pilot product'; type = 'personal_loan'; scope = 'Synthetic test only'; url = 'https://example.org'; checkedAt = '2026-11-20' }; source = @{ excerpt = 'Only Note Channel applicants are covered. The documented score is TransUnion FICO 08 at least 600. No Experian or VantageScore requirement is documented.'; sha256 = ('a' * 64) }; outcomes = $null }
                    $TestResult = Generate $Job.model $Poll.system $Fixture 512 60
                    if ($TestResult.summary -match '(?i)guaranteed approval|approval probability') { throw 'invalid_output' }
                    $TestedModels[$Job.model] = $true
                    Write-Host 'Synthetic format/evidence check passed; human accuracy review is still required.' -ForegroundColor Green
                }
                Write-Host 'Analyzing requested public source...'
                $Answer = Generate $Job.model $Poll.system $Job.input
                Exchange @{ action = 'complete'; jobId = $Job.id; leaseId = $Job.leaseId; result = $Answer } | Out-Null
                Write-Host 'Advice returned for owner review. Nothing activated or published.' -ForegroundColor Green
            } catch {
                $Failure = 'local_error'
                if ($_.Exception.Message -match 'model_unavailable') { $Failure = 'model_unavailable' }
                elseif ($_.Exception.Message -match 'invalid_output') { $Failure = 'invalid_output' }
                elseif ($_.Exception.Message -match '(?i)timed out|timeout') { $Failure = 'local_timeout' }
                try { Exchange @{ action = 'failed'; jobId = $Job.id; leaseId = $Job.leaseId; errorCode = $Failure } | Out-Null } catch { }
                Write-Host ('Analysis paused: ' + $Failure + '. Check Loan Scout; no automatic retry or paid fallback.') -ForegroundColor Yellow
            }
            $Delay = 30
        } catch {
            $Status = 0
            if ($_.Exception.Response) { $Status = [int]$_.Exception.Response.StatusCode }
            if ($Status -eq 401) { Write-Host 'Connection revoked. Download a new paired setup in Loan Scout.' -ForegroundColor Yellow; break }
            Write-Host 'Ollama or Loan Scout is unavailable. Retrying connection only; no paid fallback.' -ForegroundColor Yellow
            Start-Sleep -Seconds $Delay
            $Delay = [Math]::Min(60, $Delay * 2)
        }
    }
} catch {
    Write-Host 'Local setup could not start. Check Ollama is running and only one worker window is open.' -ForegroundColor Red
    Write-Host 'Reconnect from Loan Scout if needed. Never share the paired installer or connection file.'
} finally {
    if ($Lock) { $Lock.Dispose() }
    $Token = ''
}