param(
  [string]$OutputFile = "artifacts/full-test-report.txt"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repoRoot

$reportPath = if ([System.IO.Path]::IsPathRooted($OutputFile)) {
  $OutputFile
} else {
  Join-Path $repoRoot $OutputFile
}
$reportParent = Split-Path $reportPath -Parent
New-Item -ItemType Directory -Path $reportParent -Force | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$runDirectory = Join-Path $repoRoot "artifacts/full-test-run-$timestamp"
New-Item -ItemType Directory -Path $runDirectory -Force | Out-Null
$runnerJson = Join-Path $runDirectory "runner.json"
$runnerLog = Join-Path $runDirectory "runner.log"
$laneReport = Join-Path $runDirectory "lane-report.json"

try {
  & node scripts/run-test-lane.cjs --lane full --json --report-file $laneReport 1> $runnerJson 2> $runnerLog
  $exitCode = [int]$LASTEXITCODE
  $runner = Get-Content $runnerJson -Raw | ConvertFrom-Json
  $initialStatus = [int]$runner.initialStatus
  $diagnosticStatus = if ($null -eq $runner.diagnosticStatus) { "not run" } else { [string]$runner.diagnosticStatus }
  @(
    "Graphitix full test report"
    "Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')"
    "Lane: full (shared Node runner)"
    "Initial status: $initialStatus"
    "Diagnostic status: $diagnosticStatus"
    "Runner exit: $exitCode"
    "Run artifacts: $runDirectory"
    "Runner JSON: $runnerJson"
    "Runner log: $runnerLog"
    "Lane report: $laneReport"
    ""
    "The initial lane result is authoritative. Diagnostic reruns, when used on"
    "a narrower lane, never convert an initial failure into success."
  ) | Set-Content -Path $reportPath -Encoding UTF8
  if (Test-Path $runnerLog) {
    Get-Content $runnerLog | Write-Host
  }
  Write-Host "`nReport written to: $reportPath"
  exit $initialStatus
} catch {
  @(
    "Graphitix full test report"
    "Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')"
    "Status: runner failed before producing a report"
    "Run artifacts: $runDirectory"
    "Error: $($_.Exception.Message)"
  ) | Set-Content -Path $reportPath -Encoding UTF8
  Write-Host "`nFull test runner failed. Report written to: $reportPath" -ForegroundColor Red
  exit 1
}
