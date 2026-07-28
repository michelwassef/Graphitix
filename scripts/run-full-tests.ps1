param(
  [string]$OutputFile = "artifacts/full-test-report.txt"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repoRoot

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$runDirectory = Join-Path $repoRoot "artifacts/full-test-run-$timestamp"
New-Item -ItemType Directory -Path $runDirectory -Force | Out-Null

$reportPath = if ([System.IO.Path]::IsPathRooted($OutputFile)) {
  $OutputFile
} else {
  Join-Path $repoRoot $OutputFile
}
New-Item -ItemType Directory -Path (Split-Path $reportPath -Parent) -Force | Out-Null

$npxCommand = if (Get-Command npx.cmd -ErrorAction SilentlyContinue) { "npx.cmd" } else { "npx" }

@(
  "Graphitix full test report"
  "Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')"
  "Status: running"
  "Run artifacts: $runDirectory"
) | Set-Content -Path $reportPath -Encoding UTF8

trap {
  $message = ($_ | Out-String).Trim()
  @(
    ""
    "Runner terminated unexpectedly"
    "=============================="
    $message
  ) | Add-Content -Path $reportPath -Encoding UTF8
  Write-Host "`nTest runner stopped unexpectedly. Report written to: $reportPath" -ForegroundColor Red
  exit 1
}

function Invoke-TestCommand {
  param(
    [string[]]$Arguments,
    [string]$LogPath
  )

  $previousErrorAction = $ErrorActionPreference
  $writer = [System.IO.StreamWriter]::new(
    $LogPath,
    $false,
    [System.Text.UTF8Encoding]::new($false)
  )
  try {
    # Jest and Playwright write normal progress to stderr. PowerShell can promote
    # that stream to terminating ErrorRecord objects when the caller uses Stop.
    $ErrorActionPreference = "Continue"
    & $script:npxCommand @Arguments 2>&1 | ForEach-Object {
      $line = $_.ToString()
      $writer.WriteLine($line)
      $writer.Flush()
      Write-Host $line
    }
    $exitCode = [int]$LASTEXITCODE
  } finally {
    $writer.Dispose()
    $ErrorActionPreference = $previousErrorAction
  }
  return $exitCode
}

function Get-JestFailures {
  param([string]$JsonPath)

  $failures = @()
  if (!(Test-Path $JsonPath)) {
    return $failures
  }

  $payload = Get-Content $JsonPath -Raw | ConvertFrom-Json
  foreach ($suite in @($payload.testResults)) {
    $suiteFailures = @($suite.assertionResults | Where-Object { $_.status -eq "failed" })
    foreach ($test in $suiteFailures) {
      $messages = @($test.failureMessages | Where-Object { $_ }) -join "`n"
      $failures += [pscustomobject]@{
        Key = "jest|$($suite.name)|$($test.fullName)"
        Framework = "Jest"
        Name = $test.fullName
        Location = $suite.name
        Error = $messages
      }
    }

    if ($suite.status -eq "failed" -and $suiteFailures.Count -eq 0) {
      $failures += [pscustomobject]@{
        Key = "jest|$($suite.name)|suite"
        Framework = "Jest"
        Name = "Suite setup or execution failure"
        Location = $suite.name
        Error = [string]$suite.message
      }
    }
  }
  return $failures
}

function Add-PlaywrightSuiteFailures {
  param(
    [object]$Suite,
    [string[]]$Parents,
    [ref]$Failures
  )

  $path = @($Parents)
  if ($Suite.title) {
    $path += [string]$Suite.title
  }

  foreach ($spec in @($Suite.specs)) {
    $name = (@($path) + [string]$spec.title) -join " > "
    foreach ($test in @($spec.tests)) {
      $projectName = [string]$test.projectName
      $failedResults = @($test.results | Where-Object {
        $_.status -in @("failed", "timedOut", "interrupted")
      })
      if ($test.status -eq "unexpected" -and $failedResults.Count -eq 0) {
        $failedResults = @($test.results)
      }
      if ($failedResults.Count -eq 0) {
        continue
      }

      $errorParts = @()
      foreach ($result in $failedResults) {
        foreach ($errorItem in @($result.errors)) {
          if ($errorItem.message) { $errorParts += [string]$errorItem.message }
          if ($errorItem.stack) { $errorParts += [string]$errorItem.stack }
          if ($errorItem.snippet) { $errorParts += [string]$errorItem.snippet }
        }
        if ($result.error) {
          if ($result.error.message) { $errorParts += [string]$result.error.message }
          if ($result.error.stack) { $errorParts += [string]$result.error.stack }
        }
      }

      $location = "$($spec.file):$($spec.line)"
      $Failures.Value += [pscustomobject]@{
        Key = "playwright|$projectName|$location|$name"
        Framework = "Playwright/$projectName"
        Name = $name
        Location = $location
        Error = ($errorParts | Select-Object -Unique) -join "`n"
      }
    }
  }

  foreach ($child in @($Suite.suites)) {
    Add-PlaywrightSuiteFailures -Suite $child -Parents $path -Failures $Failures
  }
}

function Get-PlaywrightFailures {
  param([string]$JsonPath)

  $failures = @()
  if (!(Test-Path $JsonPath)) {
    return $failures
  }

  $payload = Get-Content $JsonPath -Raw | ConvertFrom-Json
  foreach ($suite in @($payload.suites)) {
    Add-PlaywrightSuiteFailures -Suite $suite -Parents @() -Failures ([ref]$failures)
  }
  return $failures
}

function Add-FailureSection {
  param(
    [System.Collections.Generic.List[string]]$Lines,
    [string]$Heading,
    [object[]]$Failures
  )

  $Lines.Add("")
  $Lines.Add($Heading)
  $Lines.Add(("=" * $Heading.Length))
  if ($Failures.Count -eq 0) {
    $Lines.Add("None.")
    return
  }

  $index = 1
  foreach ($failure in $Failures) {
    $Lines.Add("")
    $Lines.Add("$index. [$($failure.Framework)] $($failure.Name)")
    $Lines.Add("   Location: $($failure.Location)")
    $Lines.Add("   Error:")
    $errorText = if ([string]::IsNullOrWhiteSpace([string]$failure.Error)) {
      "(No structured error was reported; inspect the raw log.)"
    } else {
      [string]$failure.Error
    }
    foreach ($line in ($errorText -split "`r?`n")) {
      $Lines.Add("     $line")
    }
    $index += 1
  }
}

$jestInitialJson = Join-Path $runDirectory "jest-initial.json"
$jestInitialLog = Join-Path $runDirectory "jest-initial.log"
$jestRetryJson = Join-Path $runDirectory "jest-retry.json"
$jestRetryLog = Join-Path $runDirectory "jest-retry.log"

Write-Host "`nRunning the full Jest suite..."
$jestInitialExit = Invoke-TestCommand -Arguments @(
  "jest", "--json", "--outputFile=$jestInitialJson"
) -LogPath $jestInitialLog
$jestInitialFailures = @(Get-JestFailures $jestInitialJson)

$jestRetryExit = 0
$jestRetryFailures = @()
if ($jestInitialExit -ne 0) {
  Write-Host "`nRe-running failed Jest tests in one worker..."
  $jestRetryExit = Invoke-TestCommand -Arguments @(
    "jest", "--onlyFailures", "--runInBand", "--json", "--outputFile=$jestRetryJson"
  ) -LogPath $jestRetryLog
  $jestRetryFailures = @(Get-JestFailures $jestRetryJson)
}

$playwrightInitialJson = Join-Path $runDirectory "playwright-initial.json"
$playwrightInitialLog = Join-Path $runDirectory "playwright-initial.log"
$playwrightRetryJson = Join-Path $runDirectory "playwright-retry.json"
$playwrightRetryLog = Join-Path $runDirectory "playwright-retry.log"

Write-Host "`nRunning the full Playwright suite..."
$env:PLAYWRIGHT_JSON_OUTPUT_NAME = $playwrightInitialJson
$playwrightInitialExit = Invoke-TestCommand -Arguments @(
  "playwright", "test", "--reporter=list,json"
) -LogPath $playwrightInitialLog
$playwrightInitialFailures = @(Get-PlaywrightFailures $playwrightInitialJson)

$playwrightRetryExit = 0
$playwrightRetryFailures = @()
if ($playwrightInitialExit -ne 0) {
  Write-Host "`nRe-running failed Playwright tests in one worker..."
  $env:PLAYWRIGHT_JSON_OUTPUT_NAME = $playwrightRetryJson
  $playwrightRetryExit = Invoke-TestCommand -Arguments @(
    "playwright", "test", "--last-failed", "--workers=1", "--reporter=list,json"
  ) -LogPath $playwrightRetryLog
  $playwrightRetryFailures = @(Get-PlaywrightFailures $playwrightRetryJson)
}
Remove-Item Env:PLAYWRIGHT_JSON_OUTPUT_NAME -ErrorAction SilentlyContinue

$retryFailureKeys = @{}
foreach ($failure in @($jestRetryFailures) + @($playwrightRetryFailures)) {
  $retryFailureKeys[$failure.Key] = $true
}
$flakyFailures = @(@($jestInitialFailures) + @($playwrightInitialFailures) | Where-Object {
  !$retryFailureKeys.ContainsKey($_.Key)
})
$persistentFailures = @($jestRetryFailures) + @($playwrightRetryFailures)

$infrastructureFailures = @()
if ($jestRetryExit -ne 0 -and $jestRetryFailures.Count -eq 0) {
  $infrastructureFailures += [pscustomobject]@{
    Framework = "Jest"
    Name = "Unstructured runner failure"
    Location = $jestRetryLog
    Error = Get-Content $jestRetryLog -Raw
  }
}
if ($playwrightRetryExit -ne 0 -and $playwrightRetryFailures.Count -eq 0) {
  $infrastructureFailures += [pscustomobject]@{
    Framework = "Playwright"
    Name = "Unstructured runner failure"
    Location = $playwrightRetryLog
    Error = Get-Content $playwrightRetryLog -Raw
  }
}

$reportLines = [System.Collections.Generic.List[string]]::new()
$reportLines.Add("Graphitix full test report")
$reportLines.Add("Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')")
$reportLines.Add("Run artifacts: $runDirectory")
$reportLines.Add("")
$reportLines.Add("Jest initial exit: $jestInitialExit; retry exit: $jestRetryExit")
$reportLines.Add("Playwright initial exit: $playwrightInitialExit; retry exit: $playwrightRetryExit")
$reportLines.Add("Persistent failures: $($persistentFailures.Count + $infrastructureFailures.Count)")
$reportLines.Add("Passed on single-worker retry: $($flakyFailures.Count)")

Add-FailureSection -Lines $reportLines -Heading "Still failing after single-worker retry" -Failures @($persistentFailures)
Add-FailureSection -Lines $reportLines -Heading "Runner or setup failures" -Failures @($infrastructureFailures)
Add-FailureSection -Lines $reportLines -Heading "Failed initially, passed on retry (potentially flaky)" -Failures @($flakyFailures)

$reportLines.Add("")
$reportLines.Add("Raw logs")
$reportLines.Add("========")
$reportLines.Add("Jest initial: $jestInitialLog")
if ($jestInitialExit -ne 0) { $reportLines.Add("Jest retry: $jestRetryLog") }
$reportLines.Add("Playwright initial: $playwrightInitialLog")
if ($playwrightInitialExit -ne 0) { $reportLines.Add("Playwright retry: $playwrightRetryLog") }

$reportLines | Set-Content -Path $reportPath -Encoding UTF8

Write-Host "`nReport written to: $reportPath"
Write-Host "Raw artifacts: $runDirectory"

if (($persistentFailures.Count + $infrastructureFailures.Count) -gt 0) {
  exit 1
}
exit 0
