param([string]$TemplatePath = (Join-Path $PSScriptRoot '../../public/local-ai/benchmark.ps1'))
$ErrorActionPreference = 'Stop'

# Load only trusted helper definitions: no model requests or benchmark execution.
$Tokens = $null; $ParseErrors = $null
$Ast = [Management.Automation.Language.Parser]::ParseFile((Resolve-Path $TemplatePath), [ref]$Tokens, [ref]$ParseErrors)
if ($ParseErrors.Count) { throw 'Benchmark PowerShell syntax is invalid' }
foreach ($Name in @('Get-FailureCode','Get-RecoverySteps','Show-Troubleshooting','Save-Results')) {
    $Function = $Ast.Find({ param($Node) $Node -is [Management.Automation.Language.FunctionDefinitionAst] -and $Node.Name -eq $Name }, $true)
    if (-not $Function) { throw ('Missing helper: ' + $Name) }
    Invoke-Expression $Function.Extent.Text
}

function Assert-Code($Exception, $Expected, [int]$Status = 0) {
    $Actual = Get-FailureCode ([pscustomobject]@{Exception=$Exception}) $Status
    if ($Actual -ne $Expected) { throw ('Expected ' + $Expected + ', got ' + $Actual) }
}
Assert-Code ([TimeoutException]::new('private sentinel')) 'timeout'
Assert-Code ([OperationCanceledException]::new('private sentinel')) 'timeout'
Assert-Code ([Exception]::new('wrapper',[TimeoutException]::new('private sentinel'))) 'timeout'
Assert-Code ([Net.WebException]::new('private sentinel',[Net.WebExceptionStatus]::Timeout)) 'timeout'
Assert-Code ([Net.WebException]::new('private sentinel',[Net.WebExceptionStatus]::ConnectFailure)) 'ollama_offline'
Assert-Code ([Net.Sockets.SocketException]::new(10061)) 'ollama_offline'
Assert-Code ([Exception]::new('No suitable installed generation models found.')) 'model_unavailable'
Assert-Code ([Exception]::new('private sentinel')) 'model_unavailable' 404
Assert-Code ([Exception]::new('private sentinel')) 'local_http_failure' 500
Assert-Code ([Exception]::new('private sentinel')) 'output_or_request_failure'
Assert-Code ([Exception]::new('Invalid embedded benchmark download')) 'download_or_command'

$DefaultModel = 'hf.co/unsloth/Qwen3.5-9B-GGUF:Q5_K_M'
$Troubleshooting = New-Object 'System.Collections.Generic.List[object]'
$Rows = New-Object 'System.Collections.Generic.List[object]'
$Started = Get-Date
$Bundle = @{version='synthetic-test'}
$Hardware = @{runError='ollama_offline'}
$Inventory = @()
$Out = Join-Path ([IO.Path]::GetTempPath()) ('loan-scout-troubleshooting-' + [Guid]::NewGuid())
try {
    Show-Troubleshooting 'timeout'
    Show-Troubleshooting 'timeout'
    Show-Troubleshooting 'model_unavailable'
    Show-Troubleshooting 'ollama_offline'
    if ($Troubleshooting.Count -ne 3) { throw 'Troubleshooting must be deduplicated by failure code' }
    Save-Results
    $ReportText = Get-Content -LiteralPath (Join-Path $Out 'benchmark_results.json') -Raw
    $Report = $ReportText | ConvertFrom-Json
    if ($Report.hardware.runError -ne 'ollama_offline' -or $Report.troubleshooting.Count -ne 3 -or $Report.results.Count -ne 0) { throw 'Preflight failures must persist without fabricated passing rows' }
    foreach ($Entry in $Report.troubleshooting) {
        if ($Entry.steps.Count -lt 1) { throw 'Failure recovery must persist in saved JSON' }
    }
    if ($ReportText.Contains('private sentinel')) { throw 'Exception contents leaked to report' }
    if (-not (Test-Path -LiteralPath (Join-Path $Out 'README.txt'))) { throw 'Human-readable recovery report missing' }
    Write-Host 'PASS: 11 failure classifications, duplicate suppression, sanitized preflight persistence and saved recovery report.'
} finally {
    if (Test-Path -LiteralPath $Out) { Remove-Item -LiteralPath $Out -Recurse -Force }
}