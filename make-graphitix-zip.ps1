$ErrorActionPreference = 'Stop'

$SourceFolder = $PSScriptRoot
$FinalZip = Join-Path $SourceFolder 'graphitix-current.zip'
$SevenZip = 'C:\Program Files\7-Zip\7z.exe'

if (-not (Test-Path -LiteralPath $SevenZip)) {
    throw "7-Zip was not found at: $SevenZip"
}

$TempZip = Join-Path $env:TEMP (
    'graphitix-current-{0}.zip' -f ([guid]::NewGuid().ToString('N'))
)

Write-Host ''
Write-Host 'Creating Graphitix archive...'
Write-Host "Source: $SourceFolder"
Write-Host ''

try {
    Push-Location $SourceFolder

    try {
        & $SevenZip a `
            -tzip `
            $TempZip `
            '.\*' `
            '-xr!_site' `
            '-xr!prism files' `
            '-xr!node_modules' `
            '-xr!test-results' `
            '-xr!.git' `
            '-x!graphitix-current.zip' `
            '-mx=5'

        if ($LASTEXITCODE -ne 0) {
            throw "7-Zip failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }

    if (Test-Path -LiteralPath $FinalZip) {
        Remove-Item -LiteralPath $FinalZip -Force
    }

    Move-Item -LiteralPath $TempZip -Destination $FinalZip -Force

    $sizeMB = (Get-Item -LiteralPath $FinalZip).Length / 1MB

    Write-Host ''
    Write-Host 'Graphitix archive successfully updated.'
    Write-Host ("Archive size : {0:N1} MB" -f $sizeMB)
    Write-Host ("Archive      : {0}" -f $FinalZip)
    Write-Host ''
}
catch {
    if (Test-Path -LiteralPath $TempZip) {
        Remove-Item -LiteralPath $TempZip -Force -ErrorAction SilentlyContinue
    }

    Write-Host ''
    Write-Host 'ERROR: The Graphitix archive was NOT replaced.' -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ''

    exit 1
}