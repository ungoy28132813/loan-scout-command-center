#Requires -Version 5.1
<#
.SYNOPSIS
  Phase 1 setup and read-only verification of Loan Scout's existing extraction backend.
.DESCRIPTION
  Uses a separate private-repository checkout and synthetic tests.
  Never uploads reports, edits production databases, deploys, or changes main.
  The only repository-side change is a local working copy plus ignored dependencies.
#>
[CmdletBinding()]
param(
    [string]$RepoPath = "",
    [switch]$SkipInstall,
    [switch]$SkipBuild
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$repoName = "ungoy28132813/loan-scout-command-center"
$branch = "feature/credit-report-accuracy-phase1"
$checkout = if ($RepoPath) { $RepoPath } else { Join-Path $env:LOCALAPPDATA "LoanScout\AccuracyPhase1\repository" }
$desktop = [Environment]::GetFolderPath("Desktop")
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$out = Join-Path $desktop ("LoanScout-Accuracy-Audit-" + $stamp)
New-Item -ItemType Directory -Force -Path $out | Out-Null
$steps = New-Object System.Collections.Generic.List[object]
$note = New-Object System.Collections.Generic.List[string]
$success = $false
$repoReady = $false

function Record([string]$name,[string]$status,[string]$detail) {
    $steps.Add([pscustomobject]@{ step=$name; status=$status; detail=$detail })
    $color = if ($status -eq "PASS") {"Green"} elseif ($status -eq "FAIL") {"Red"} else {"Yellow"}
    Write-Host ("[{0}] {1}: {2}" -f $status,$name,$detail) -ForegroundColor $color
}
function Refresh-Path {
    $env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User") + ";" + $env:Path
    foreach($extra in @((Join-Path $env:USERPROFILE ".bun\bin"),(Join-Path $env:ProgramFiles "Git\cmd"),(Join-Path $env:ProgramFiles "GitHub CLI"))) {
        if(Test-Path $extra){ $env:Path = $extra + ";" + $env:Path }
    }
}
function ToolPath([string]$name) {
    $c = Get-Command $name -ErrorAction SilentlyContinue
    if($c){ return $c.Source }
    return $null
}
function Ensure-WingetTool([string]$name,[string]$package) {
    Refresh-Path
    $found = ToolPath $name
    if($found) { Record $name "PASS" $found; return $found }
    if($SkipInstall){ throw ("Required tool missing: " + $name) }
    if(-not (ToolPath "winget")){ throw ("Windows Package Manager (winget) is required to install " + $name) }
    Write-Host ("Installing " + $package + " with winget...") -ForegroundColor Cyan
    & winget install --id $package --exact --source winget --accept-source-agreements --accept-package-agreements --silent
    Refresh-Path
    $found = ToolPath $name
    if(-not $found){ throw ("Could not locate " + $name + " after installation. Start a fresh PowerShell window and rerun.") }
    Record $name "PASS" $found
    return $found
}
function Run-Check([string]$name,[scriptblock]$run) {
    $safe = $name -replace '[^a-zA-Z0-9_-]','_'
    $dest = Join-Path $out ($safe + ".log")
    try {
        $global:LASTEXITCODE = 0
        & $run 2>&1 | Out-File -FilePath $dest -Encoding utf8 -Width 300
        $code = $LASTEXITCODE
        if($null -eq $code){ $code = 0 }
        if($code -eq 0){ Record $name "PASS" ("Log: " + $dest); return $true }
        Record $name "FAIL" ("Exit " + $code + "; log: " + $dest)
        return $false
    } catch {
        Record $name "FAIL" ($_.Exception.Message + "; log: " + $dest)
        return $false
    }
}
try {
    Write-Host "Loan Scout Phase 1 | local backend accuracy baseline" -ForegroundColor Cyan
    Write-Host ("Output directory: " + $out)
    $git = Ensure-WingetTool "git" "Git.Git"
    $gh = Ensure-WingetTool "gh" "GitHub.cli"
    # GitHub CLI writes unauthenticated status to stderr. In Windows PowerShell 5.1,
    # that can become a terminating error under ErrorActionPreference=Stop.
    # Probe auth with Continue, restore strict errors, and open browser sign-in if needed.
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        $null = & $gh auth status 2>&1
        $authExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    if($authExitCode -ne 0) {
        Write-Host "One-time GitHub browser sign-in is required for the private repository." -ForegroundColor Yellow
        & $gh auth login --hostname github.com --web --git-protocol https
        if($LASTEXITCODE -ne 0){ throw "GitHub authentication was not completed." }
    }
    Record "GitHub authentication" "PASS" "Connected without storing credentials in audit files"
    if(-not (Test-Path (Join-Path $checkout ".git"))) {
        if(Test-Path $checkout){ throw ("Checkout path exists but is not a Git repository: " + $checkout) }
        New-Item -ItemType Directory -Force -Path (Split-Path $checkout -Parent) | Out-Null
        & $gh repo clone $repoName $checkout -- --branch $branch --single-branch
        if($LASTEXITCODE -ne 0){ throw "Could not clone the private accuracy branch." }
        Record "Isolated checkout" "PASS" $checkout
    } else {
        $origin = (& $git -C $checkout remote get-url origin | Out-String).Trim()
        if($LASTEXITCODE -ne 0 -or $origin -notmatch '^(https://github\.com/|git@github\.com:|https://[^/]+@github\.com/)ungoy28132813/loan-scout-command-center(\.git)?$'){
            throw "Existing checkout has an unexpected remote. Refusing to modify it."
        }
        $dirty = @(& $git -C $checkout status --porcelain)
        if($dirty.Count -gt 0) {
            Record "Existing checkout" "WARN" "Local changes found; not pulling or switching branches"
        } else {
            & $git -C $checkout fetch origin $branch
            if($LASTEXITCODE -ne 0){ throw "Git fetch failed" }
            & $git -C $checkout switch $branch
            if($LASTEXITCODE -ne 0){ throw "Git branch switch failed" }
            & $git -C $checkout pull --ff-only origin $branch
            if($LASTEXITCODE -ne 0){ throw "Fast-forward pull failed; no force operation attempted" }
        }
        Record "Isolated checkout" "PASS" $checkout
    }
    $repoReady = $true
    $currentBranch = (& $git -C $checkout branch --show-current | Out-String).Trim()
    Record "Working branch" $(if($currentBranch -eq $branch){"PASS"}else{"WARN"}) $currentBranch
    $head = (& $git -C $checkout rev-parse HEAD | Out-String).Trim()
    $required = @("AGENTS.md","docs/CODEX_HANDOFF.md","docs/BUILD_QUEUE.md","roadmap.md","package.json","bun.lock","bunfig.toml","src/lib/credit-report-parser/pdf.ts","src/lib/credit-report-parser/parse.ts")
    $missing = @($required | Where-Object { -not (Test-Path (Join-Path $checkout $_)) })
    if($missing.Count){ Record "Required sources" "FAIL" ($missing -join ", ") }
    else { Record "Required sources" "PASS" ("All " + $required.Count + " files present") }

    $trackedEnv = @(& $git -C $checkout ls-files -- ".env")
    if($trackedEnv.Count -gt 0){
        Record "Security: tracked .env" "WARN" ".env is version controlled. Review whether keys need rotation. No values read."
        $note.Add("Tracked .env found. Do not publish or paste its content. Review credentials and rotate any private secrets.")
    } else { Record "Security: tracked .env" "PASS" "No root .env tracked" }
    $trackedReports = @(& $git -C $checkout ls-files -- "*.pdf" "*.html" "*.htm" | Where-Object { $_ -notmatch '(^public/|^tests/|^src/lib/credit-report-parser/fixtures/)' })
    Record "Potential report files" $(if($trackedReports.Count){"WARN"}else{"PASS"}) ("Tracked PDFs/HTML outside known fixture paths: " + $trackedReports.Count + "; inspect privately if any")
    $testPaths = @(& $git -C $checkout ls-files -- "src/lib/credit-report-parser/*test.ts" "src/lib/credit-report-parser/*test.tsx")
    Record "Parser tests discovered" "PASS" ("Files: " + $testPaths.Count + "; existence is not proof of accuracy")

    $bun = ToolPath "bun"
    if(-not $bun -and -not $SkipInstall) {
        $bunInstaller = Join-Path $out "bun-install.ps1"
        Invoke-WebRequest -Uri "https://bun.sh/install.ps1" -OutFile $bunInstaller -UseBasicParsing
        $bunInstallerHash = (Get-FileHash $bunInstaller -Algorithm SHA256).Hash
        $note.Add("Bun installer SHA256: " + $bunInstallerHash)
        & $bunInstaller
        Refresh-Path
        $bun = ToolPath "bun"
    }
    if(-not $bun) {
        Record "Bun" "FAIL" "Bun missing. See https://bun.com/docs/installation"
    } else {
        Record "Bun" "PASS" $bun
        Push-Location $checkout
        try {
            $installed = Run-Check "bun_install_frozen" { & $bun install --frozen-lockfile }
            if($installed) {
                $bunx = ToolPath "bunx"
                if($bunx) { $null = Run-Check "typescript" { & $bunx tsc --noEmit } }
                else { Record "typescript" "WARN" "bunx not found in PATH" }
                $null = Run-Check "vitest" { & $bun run test }
                $null = Run-Check "lint" { & $bun run lint }
                if(-not $SkipBuild){ $null = Run-Check "production_build_local_only" { & $bun run build } }
                else { Record "production_build_local_only" "SKIP" "Skipped by switch; no deployment performed" }
            } else {
                Record "Validation stages" "SKIP" "Dependencies could not be installed using checked-in lockfile"
            }
        } finally { Pop-Location }
    }
    $note.Add("No real client PDF/HTML was included or uploaded. Golden-label accuracy remains NOT VERIFIED.")
    $note.Add("No production deployment, data migration, or MCP remote endpoint was created.")
    $success = $true
} catch {
    Record "Setup" "FAIL" $_.Exception.Message
    $note.Add("See failed stage above. Resolve authentication or tool installation and rerun; no force/reset was attempted.")
} finally {
    $summary = @()
    $summary += "LOAN SCOUT BACKEND - PHASE 1 AUDIT"
    $summary += "Run: $(Get-Date -Format o)"
    $summary += "Repository: $repoName"
    $summary += "Branch: $branch"
    $summary += "Checkout: $checkout"
    if($repoReady){ $summary += "Commit: $head" }
    $summary += "Overall build: provisional 20 percent; independent end-to-end accuracy certification: NOT YET VERIFIED."
    $summary += ""
    $summary += ($steps | ForEach-Object { "[{0}] {1}: {2}" -f $_.status,$_.step,$_.detail })
    $summary += ""
    $summary += $note
    $summaryFile = Join-Path $out "SUMMARY.txt"
    $summary -join [Environment]::NewLine | Set-Content -Path $summaryFile -Encoding UTF8
    [pscustomobject]@{ date=(Get-Date).ToString("o"); repo=$repoName; branch=$branch; commit=$(if($repoReady){$head}else{$null}); stages=@($steps); notes=@($note); goldenBenchmarkPassed=$false } |
      ConvertTo-Json -Depth 6 | Set-Content -Path (Join-Path $out "RESULTS.json") -Encoding UTF8
    try { ($summary -join [Environment]::NewLine) | Set-Clipboard } catch {}
    Write-Host ""
    Write-Host ("Audit summary: " + $summaryFile) -ForegroundColor Cyan
    Start-Process explorer.exe -ArgumentList ("/select," + '"' + $summaryFile + '"')
}
