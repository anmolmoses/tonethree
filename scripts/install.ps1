[CmdletBinding()]
param(
    [switch]$SkipCliInstall,
    [string]$ExtensionId = "cilhgeekjpbjhjembnemdnomnmdfmplk"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$hostProject = Join-Path $projectRoot "native-host\ToneThree.NativeHost.csproj"
$schemaSource = Join-Path $projectRoot "native-host\variation-schema.json"
$installRoot = Join-Path $env:LOCALAPPDATA "ToneThree"
$hostInstall = Join-Path $installRoot "NativeHost"
$publishDir = Join-Path $projectRoot "native-host\bin\Release\net8.0\win-x64\publish"
$hostExe = Join-Path $hostInstall "ToneThree.NativeHost.exe"
$nativeManifest = Join-Path $installRoot "com.tonethree.codex.json"

Write-Host "ToneThree installer" -ForegroundColor Green

$callableCodex = $null
$codexCandidates = @(
    (Join-Path $env:LOCALAPPDATA "Programs\OpenAI\Codex\bin\codex.exe"),
    (Join-Path $env:APPDATA "npm\codex.cmd")
)
$codexCommands = @(
    Get-Command codex.exe,codex.cmd -All -ErrorAction SilentlyContinue |
        ForEach-Object { $_.Source }
)
$codexCandidates += $codexCommands

foreach ($candidate in ($codexCandidates | Select-Object -Unique)) {
    if (-not (Test-Path -LiteralPath $candidate)) { continue }
    if ($candidate -like "*\WindowsApps\OpenAI.Codex_*") { continue }
    try {
        & $candidate --version *> $null
        if ($LASTEXITCODE -eq 0) {
            $callableCodex = $candidate
            break
        }
    } catch {}
}

if (-not $callableCodex -and -not $SkipCliInstall) {
    Write-Host "Installing the supported Codex CLI with npm..."
    & npm.cmd install --global @openai/codex
    if ($LASTEXITCODE -ne 0) {
        throw "Codex CLI installation failed. Install it manually with: npm install --global @openai/codex"
    }
    $npmCodex = Join-Path $env:APPDATA "npm\codex.cmd"
    if (Test-Path -LiteralPath $npmCodex) {
        $callableCodex = $npmCodex
    }
}

if (-not $callableCodex) {
    throw "No callable Codex CLI found. Run: npm install --global @openai/codex"
}

Write-Host "Using Codex CLI: $callableCodex"

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    throw ".NET 8 SDK is required to build the native companion. Install it from https://dotnet.microsoft.com/download"
}

Write-Host "Building the local companion..."
& dotnet publish $hostProject -c Release -r win-x64 --self-contained false /p:PublishSingleFile=true
if ($LASTEXITCODE -ne 0) { throw "Native companion build failed." }

New-Item -ItemType Directory -Force -Path $hostInstall | Out-Null
Copy-Item -LiteralPath (Join-Path $publishDir "ToneThree.NativeHost.exe") -Destination $hostExe -Force
Copy-Item -LiteralPath $schemaSource -Destination (Join-Path $hostInstall "variation-schema.json") -Force

$manifestObject = [ordered]@{
    name = "com.tonethree.codex"
    description = "Local Codex CLI bridge for ToneThree"
    path = $hostExe
    type = "stdio"
    allowed_origins = @("chrome-extension://$ExtensionId/")
}
$manifestJson = $manifestObject | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText(
    $nativeManifest,
    $manifestJson,
    [System.Text.UTF8Encoding]::new($false)
)

$registryTargets = @(
    "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.tonethree.codex",
    "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.tonethree.codex"
)
foreach ($target in $registryTargets) {
    New-Item -Path $target -Force | Out-Null
    Set-Item -Path $target -Value $nativeManifest
}

[Environment]::SetEnvironmentVariable("TONETHREE_CODEX_PATH", $callableCodex, "User")

Write-Host ""
Write-Host "Installed successfully." -ForegroundColor Green
Write-Host "1. If needed, sign in with:"
Write-Host "   & `"$callableCodex`" login"
Write-Host "2. Open chrome://extensions or edge://extensions"
Write-Host "3. Enable Developer mode, choose Load unpacked, and select:"
Write-Host "   $(Join-Path $projectRoot 'extension')"
Write-Host "4. Pin ToneThree to the toolbar."
