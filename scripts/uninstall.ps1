$ErrorActionPreference = "Stop"
$installRoot = Join-Path $env:LOCALAPPDATA "ToneThree"
$registryTargets = @(
    "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.tonethree.codex",
    "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.tonethree.codex"
)

foreach ($target in $registryTargets) {
    if (Test-Path -LiteralPath $target) {
        Remove-Item -LiteralPath $target -Recurse -Force
    }
}

if (Test-Path -LiteralPath $installRoot) {
    $resolved = (Resolve-Path -LiteralPath $installRoot).Path
    $expected = [System.IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA "ToneThree"))
    if ($resolved -eq $expected) {
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}

[Environment]::SetEnvironmentVariable("TONETHREE_CODEX_PATH", $null, "User")
Write-Host "ToneThree local companion removed. Remove the unpacked extension from your browser separately."
