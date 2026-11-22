#Requires -Version 5.1
<#
.SYNOPSIS
  Verify Loan Scout SmartCredit HTML parser changes on Windows.
.DESCRIPTION
  Safe read-only verification: fetches isolated branch, installs locked dependencies,
  tests the new parser, runs all tests, checks TypeScript/lint and builds locally.
  Saves stdout/stderr and a sanitized complete report on Desktop, then copies it
  to Windows clipboard automatically. Never uploads reports, deploys or merges.
#>
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$branch = 'feature/credit-report-accuracy-phase1'
$repo = Join-Path $env:LOCALAPPDATA 'LoanScout\AccuracyPhase1\repository'
$out = Join-Path ([Environment]::GetFolderPath('Desktop')) ('LoanScout-Phase2-Verification-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
[IO.Directory]::CreateDirectory($out) | Out-Null
$results = New-Object 'System.Collections.Generic.List[object]'
$transcriptOn = $false
$transcript = Join-Path $out 'console.log'
try { Start-Transcript -Path $transcript -Force | Out-Null; $transcriptOn = $true } catch {}

function Find-Tool([string]$name, [string]$fallback) {
    $item = Get-Command $name -ErrorAction SilentlyContinue
    if($item) { return $item.Source }
    if($fallback -and (Test-Path $fallback)) { return $fallback }
    return $null
}
function Status([string]$name,[string]$state,[string]$detail) {
    $results.Add([pscustomobject]@{stage=$name; status=$state; detail=$detail})
    $color=if($state -eq 'PASS'){'Green'}elseif($state -eq 'FAIL'){'Red'}else{'Yellow'}
    Write-Host ("["+$state+"] "+$name+" - "+$detail) -ForegroundColor $color
}
function Run-Program([string]$stage,[string]$exe,[string[]]$arguments) {
    # "$args" is an automatic PowerShell variable. It must NEVER be used
    # as a named parameter here: Windows PowerShell 5.1 overwrites it,
    # causing Start-Process to receive an empty ArgumentList.
    if(-not $arguments -or $arguments.Count -eq 0) {
        Status $stage 'FAIL' 'Internal runner error: missing command arguments'
        return $false
    }
    $outFile = Join-Path $out ($stage + '.stdout.log')
    $errFile = Join-Path $out ($stage + '.stderr.log')
    try {
        $process = Start-Process -FilePath $exe -ArgumentList $arguments -WorkingDirectory $repo -NoNewWindow -PassThru -Wait -RedirectStandardOutput $outFile -RedirectStandardError $errFile -ErrorAction Stop
        $exit = [int]$process.ExitCode
        $tail = @(Get-Content $errFile -Tail 8 -ErrorAction SilentlyContinue)
        if($exit -eq 0) {
            Status $stage 'PASS' ("exit 0, logs: "+$stage)
            return $true
        }
        Status $stage 'FAIL' ("exit "+$exit+", stderr tail: "+(($tail -join ' ') -replace '\s+',' '))
        return $false
    } catch {
        ("PowerShell launch error: "+$_.Exception.Message) | Set-Content -Path $errFile -Encoding UTF8
        Status $stage 'FAIL' $_.Exception.Message
        return $false
    }
}
try {
    Write-Host 'Loan Scout Phase 2 | SmartCredit HTML parser verification' -ForegroundColor Cyan
    Write-Host ("Local report folder: " + $out)
    $env:Path = "$env:USERPROFILE\.bun\bin;$env:ProgramFiles\Git\cmd;$env:ProgramFiles\GitHub CLI;" + $env:Path
    $git=Find-Tool 'git' (Join-Path $env:ProgramFiles 'Git\cmd\git.exe')
    $bun=Find-Tool 'bun' (Join-Path $env:USERPROFILE '.bun\bin\bun.exe')
    $bunx=Find-Tool 'bunx' (Join-Path $env:USERPROFILE '.bun\bin\bunx.exe')
    if(-not $git){throw 'Git is unavailable. Existing Phase 1 install must be repaired.'}
    if(-not $bun){throw 'Bun is unavailable. Existing Phase 1 install must be repaired.'}
    if(-not $bunx){throw 'bunx is unavailable. Existing Phase 1 install must be repaired.'}
    if(-not (Test-Path (Join-Path $repo '.git'))){throw 'Existing isolated repository checkout was not found.'}

    $origin = (& $git -C $repo remote get-url origin | Out-String).Trim()
    if($LASTEXITCODE -ne 0 -or $origin -notmatch 'github\.com[:/]ungoy28132813/loan-scout-command-center(?:\.git)?$'){
        throw 'Unrecognized Git remote. No changes made.'
    }
    $changes = @(& $git -C $repo status --porcelain)
    if($changes.Count -gt 0){
        Status 'Git status' 'FAIL' 'Uncommitted local changes detected. Refusing to overwrite or pull.'
        throw 'Local changes require review before automated verification.'
    }
    $current = (& $git -C $repo branch --show-current | Out-String).Trim()
    if($current -ne $branch){throw ('Current branch is '+$current+'; refusing automatic switch.')}
    $null = Run-Program 'git_fetch' $git @('fetch','origin',$branch)
    if($results[$results.Count-1].status -ne 'PASS'){throw 'Git fetch failed.'}
    $null = Run-Program 'git_pull_ff_only' $git @('pull','--ff-only','origin',$branch)
    if($results[$results.Count-1].status -ne 'PASS'){throw 'Git pull failed.'}
    $hash = (& $git -C $repo rev-parse HEAD | Out-String).Trim()
    Status 'Source checkout' 'PASS' ('branch '+$branch+' at '+$hash)

    $module = Join-Path $repo 'src\lib\credit-report-parser\smartcredit-html.ts'
    $tests = Join-Path $repo 'src\lib\credit-report-parser\smartcredit-html.test.ts'
    if(!(Test-Path $module) -or !(Test-Path $tests)){throw 'Phase 2 implementation/test source is missing.'}

    $installed = Run-Program 'bun_install_frozen' $bun @('install','--frozen-lockfile')
    if(!$installed){throw 'Dependency installation failed; tests are not trustworthy.'}

    $null = Run-Program 'smartcredit_html_tests' $bun @('run','test','src/lib/credit-report-parser/smartcredit-html.test.ts')
    $null = Run-Program 'typescript' $bunx @('tsc','--noEmit')
    $null = Run-Program 'all_tests' $bun @('run','test')
    $null = Run-Program 'lint' $bun @('run','lint')
    $null = Run-Program 'local_build_no_deploy' $bun @('run','build')

    # Check dependency postinstall policy, without automatically trusting anything.
    $null = Run-Program 'bun_untrusted_inventory' $bun @('pm','untrusted')

    Write-Host 'All checks attempted. No changes to main, database or production.' -ForegroundColor Cyan
} catch {
    Status 'Execution' 'FAIL' $_.Exception.Message
} finally {
    $summaryPath = Join-Path $out 'SUMMARY.txt'
    $passed=@($results.ToArray() | Where-Object { $_.status -eq 'PASS' }).Count
    $failed=@($results.ToArray() | Where-Object { $_.status -eq 'FAIL' }).Count
    $summaryLines = @(
        'LOAN SCOUT PHASE 2 SMARTCREDIT HTML VERIFICATION',
        ('Date: '+(Get-Date -Format o)),
        'Objective: maximum real-document extraction accuracy; no guessing, local-only, evidence preserved',
        'Global backend completion: 20% PROVISIONAL until acceptance gates are tested',
        'Real client-report golden benchmark: NOT YET VERIFIED',
        ('Passed checks: '+$passed),
        ('Failed checks: '+$failed),
        'Source branch: feature/credit-report-accuracy-phase1',
        ('Local checkout: '+$repo),
        'Security note: tracked .env requires private review; never paste its values.'
    )
    $summaryLines += @($results.ToArray() | ForEach-Object {'['+$_.status+'] '+$_.stage+' '+$_.detail})
    $summaryText = $summaryLines -join [Environment]::NewLine
    $summaryText | Set-Content -Path $summaryPath -Encoding UTF8
    $jsonPath = Join-Path $out 'RESULTS.json'
    try {
        [pscustomobject]@{
            runDate=(Get-Date -Format o)
            branch=$branch
            checkout=$repo
            passed=$passed
            failed=$failed
            stages=$results.ToArray()
            currentOverallCompletionPercentProvisional=20
            independentGoldenAccuracyVerified=$false
            automaticallyDeployed=$false
        } | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath $jsonPath -Encoding UTF8
    } catch {
        Write-Host ('[WARN] Could not write RESULTS.json: '+$_.Exception.Message) -ForegroundColor Yellow
    }

    if($transcriptOn){try{Stop-Transcript|Out-Null}catch{}}

    $sections=New-Object 'System.Collections.Generic.List[string]'
    $sections.Add($summaryText)
    foreach($file in @(Get-ChildItem -LiteralPath $out -File | Where-Object {$_.Extension -in @('.log','.json') } | Sort-Object Name)){
        try{$sections.Add(('===== '+$file.Name+' =====')+[Environment]::NewLine+[IO.File]::ReadAllText($file.FullName))}
        catch{$sections.Add(('FAILED TO READ '+$file.Name+': '+$_.Exception.Message))}
    }
    $combined = $sections -join ([Environment]::NewLine+[Environment]::NewLine)
    $combined = $combined -replace '(?i)(?:ghp_|gho_|ghu_|ghs_|ghr_|github_pat_)[A-Za-z0-9_]{15,}', '[REDACTED_GITHUB_TOKEN]'
    $combined = $combined -replace '(?i)\b(?:sk-[A-Za-z0-9_-]{20,}|sb_secret_[A-Za-z0-9_-]{16,})\b', '[REDACTED_API_KEY]'
    $combinedPath = Join-Path $out 'CLIPBOARD_FULL_OUTPUT.txt'
    [IO.File]::WriteAllText($combinedPath,$combined,(New-Object System.Text.UTF8Encoding($false)))
    try{Set-Clipboard -Value $combined -ErrorAction Stop;Write-Host ('COPY COMPLETE: '+$combined.Length+' characters placed on Windows clipboard') -ForegroundColor Green}
    catch{Write-Host ('Clipboard could not be updated: '+$_.Exception.Message) -ForegroundColor Yellow}
    try{Start-Process explorer.exe -ArgumentList ('/select,"'+$combinedPath+'"')}catch{}
}
