<#
.SYNOPSIS
  Runs the Graphitix tab isolation / cache / preview regression suite.

.EXAMPLE
  From the root of your Graphitix project:
    .\tests\tab-isolation-regression\run-regression.ps1

.EXAMPLE
  Limit to three components while debugging:
    .\tests\tab-isolation-regression\run-regression.ps1 -Components "box,scatter,pca"

.EXAMPLE
  Put artifacts in a custom folder:
    .\tests\tab-isolation-regression\run-regression.ps1 -OutDir "C:\temp\graphitix-regression"
#>
param(
  [string]$AppRoot = (Resolve-Path ".").Path,
  [string]$OutDir = "",
  [string]$Components = "",
  [switch]$Headed,
  [switch]$KeepOpen,
  [int]$Port = 0,
  [int]$TimeoutMs = 240000,
  [int]$PhaseTimeoutMs = 0
)

$ErrorActionPreference = "Stop"

function Write-Step($Message) {
  Write-Host "[Graphitix regression] $Message" -ForegroundColor Cyan
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..\..")
Set-Location $ProjectRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is required but was not found in PATH. Install Node.js LTS, then rerun this script."
}

if (-not (Test-Path (Join-Path $ProjectRoot "node_modules"))) {
  Write-Step "Installing npm dependencies..."
  npm install
}

# Make sure Chromium is installed. This is idempotent.
Write-Step "Ensuring Playwright Chromium is installed..."
npx playwright install chromium | Out-Host

$argsList = @(
  "tests/tab-isolation-regression/run-regression.js",
  "--app-root", $AppRoot,
  "--timeout-ms", $TimeoutMs
)

if ($PhaseTimeoutMs -gt 0) {
  $argsList += @("--phase-timeout-ms", $PhaseTimeoutMs)
}

if ($OutDir -and $OutDir.Trim().Length -gt 0) {
  $argsList += @("--out-dir", $OutDir)
}
if ($Components -and $Components.Trim().Length -gt 0) {
  $argsList += @("--components", $Components)
}
if ($Headed) {
  $argsList += "--headed"
}
if ($KeepOpen) {
  $argsList += "--keep-open"
}
if ($Port -gt 0) {
  $argsList += @("--port", $Port)
}

Write-Step "Running regression suite..."
node @argsList
