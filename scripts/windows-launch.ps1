param(
    [ValidateSet('setup', 'check', 'start')][string]$Mode = 'setup',
    [switch]$WithDeps,
    [switch]$NoOpen,
    [switch]$NoPause
)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$exitResult = 1

function Test-StudioNode([string]$Executable) {
    if (-not $Executable) { return $false }
    try {
        $major = & $Executable -p 'parseInt(process.versions.node)' 2>$null
        if ($LASTEXITCODE -ne 0 -or [int]$major -lt 20) { return $false }
        $nodeDir = Split-Path -Parent $Executable
        return (Test-Path -LiteralPath (Join-Path $nodeDir 'npm.cmd'))
    } catch { return $false }
}

try {
    Write-Host "`n  [ FE ] SNAPSHOT STUDIO" -ForegroundColor Cyan
    Write-Host '  Local design workspace | Windows setup & launcher'
    Set-Location -LiteralPath $projectRoot
    $nodeExe = $null
    $systemNode = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($systemNode -and (Test-StudioNode $systemNode.Source)) { $nodeExe = $systemNode.Source }
    $runtimeRoot = Join-Path $projectRoot '.tools\node'
    if (-not $nodeExe -and (Test-Path -LiteralPath $runtimeRoot)) {
        $candidates = Get-ChildItem -LiteralPath $runtimeRoot -Directory | Sort-Object Name -Descending
        foreach ($candidate in $candidates) {
            $candidateNode = Join-Path $candidate.FullName 'node.exe'
            if ((Test-Path -LiteralPath $candidateNode) -and (Test-StudioNode $candidateNode)) { $nodeExe = $candidateNode; break }
        }
    }
    if (-not $nodeExe) {
        if ($Mode -eq 'check') { throw 'Node >=20 + npm is missing. Run setup.bat first.' }
        $machineArch = $env:PROCESSOR_ARCHITEW6432
        if (-not $machineArch) { $machineArch = $env:PROCESSOR_ARCHITECTURE }
        $nodeArch = switch ($machineArch.ToUpperInvariant()) { 'AMD64' { 'x64' } 'ARM64' { 'arm64' } default { throw 'Windows x64 or arm64 is required.' } }
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $baseUrl = 'https://nodejs.org/dist/latest-v24.x'
        Write-Host '[SETUP] Downloading portable Node.js 24 from nodejs.org...' -ForegroundColor Cyan
        $manifest = (Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/SHASUMS256.txt" -TimeoutSec 60).Content
        $entry = [regex]::Match($manifest, "(?m)^([a-f0-9]{64})\s+(node-v24\.\d+\.\d+-win-$nodeArch\.zip)\s*$")
        if (-not $entry.Success) { throw 'Cannot find a matching Node archive in the official checksum manifest.' }
        $archiveName = $entry.Groups[2].Value
        $folderName = [IO.Path]::GetFileNameWithoutExtension($archiveName)
        $stage = Join-Path $runtimeRoot ('download-' + [guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $stage -Force | Out-Null
        $archive = Join-Path $stage $archiveName
        Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/$archiveName" -OutFile $archive -TimeoutSec 600
        if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.Groups[1].Value) { throw 'Node archive checksum mismatch. Download was not extracted.' }
        Expand-Archive -LiteralPath $archive -DestinationPath $stage
        $destination = Join-Path $runtimeRoot $folderName
        if (Test-Path -LiteralPath $destination) { throw "Runtime directory already exists but is unusable: $destination. No files were overwritten." }
        $extracted = [IO.Path]::GetFullPath((Join-Path $stage $folderName))
        $expectedPrefix = [IO.Path]::GetFullPath($runtimeRoot) + [IO.Path]::DirectorySeparatorChar
        if (-not $extracted.StartsWith($expectedPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Runtime path escaped its expected directory.' }
        Move-Item -LiteralPath $extracted -Destination $destination
        $nodeExe = Join-Path $destination 'node.exe'
        if (-not (Test-StudioNode $nodeExe)) { throw 'Portable Node could not run on this Windows version.' }
        # Remove only the verified temporary download folder created by this run.
        $resolvedStage = [IO.Path]::GetFullPath($stage)
        if ($resolvedStage.StartsWith($expectedPrefix, [StringComparison]::OrdinalIgnoreCase)) { Remove-Item -LiteralPath $resolvedStage -Recurse -Force }
    }
    $env:PATH = (Split-Path -Parent $nodeExe) + [IO.Path]::PathSeparator + $env:PATH
    if ($Mode -ne 'check') {
        $shortcutPath = Join-Path $projectRoot 'FE Snapshot Studio.lnk'
        if (-not (Test-Path -LiteralPath $shortcutPath)) {
            $shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($shortcutPath)
            $shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
            $shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $projectRoot 'scripts\windows-launch.ps1') + '" -Mode start'
            $shortcut.WorkingDirectory = $projectRoot
            $shortcut.IconLocation = (Join-Path $projectRoot 'public\assets\app.ico') + ',0'
            $shortcut.Description = 'FE Snapshot Studio - Capture. Edit. Create.'
            $shortcut.Save()
        }
    }
    $bootstrapArgs = @((Join-Path $projectRoot 'scripts\bootstrap.mjs'), $Mode)
    if ($WithDeps) { $bootstrapArgs += '--with-deps' }
    if ($NoOpen) { $bootstrapArgs += '--no-open' }
    & $nodeExe @bootstrapArgs
    $exitResult = $LASTEXITCODE
} catch { Write-Host "`n[ERROR] $($_.Exception.Message)" -ForegroundColor Red }
finally {
    if (-not $NoPause -and ($Mode -ne 'start' -or $exitResult -ne 0)) { Read-Host 'Press Enter to close' | Out-Null }
}
exit $exitResult
