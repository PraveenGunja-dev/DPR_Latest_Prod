# build-deploy-zips.ps1
# Produces the two Azure ZIP-deploy artifacts:
#
#   deploy\backend.zip   -> App Service az10lappdprp02  (FastAPI)
#   deploy\frontend.zip  -> App Service az10lappdprp01  (built SPA)
#
# Run from the repository root:  .\build-deploy-zips.ps1
# Skip the npm build (reuse frontend\dist as-is):  .\build-deploy-zips.ps1 -SkipBuild

param(
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.IO.Compression.FileSystem

# Compress-Archive on Windows PowerShell 5.1 writes backslash path separators
# into the archive. The ZIP spec mandates forward slashes, so a Linux App
# Service unpacks "app\main.py" as one file with a literal backslash in its
# name instead of app/main.py - uvicorn then dies with ModuleNotFoundError.
# Building the entry list by hand keeps the same ZIP valid on Linux and Windows.
function New-DeployZip {
    param([string]$SourceDir, [string]$DestinationPath)

    if (Test-Path $DestinationPath) { Remove-Item -Force $DestinationPath }

    $src = (Resolve-Path $SourceDir).Path.TrimEnd('\')
    $zip = [System.IO.Compression.ZipFile]::Open($DestinationPath, 'Create')
    try {
        foreach ($file in Get-ChildItem -Path $src -Recurse -File -Force) {
            $entryName = $file.FullName.Substring($src.Length + 1).Replace('\', '/')
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $zip, $file.FullName, $entryName, 'Optimal') | Out-Null
        }
    } finally {
        $zip.Dispose()
    }
}

$root     = $PSScriptRoot
$frontend = Join-Path $root 'frontend'
$backend  = Join-Path $root 'backend-fastapi'
$outDir   = Join-Path $root 'deploy'
$stage    = Join-Path $env:TEMP 'dpr-deploy-stage'

New-Item -ItemType Directory -Force -Path $outDir | Out-Null
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }

# ── Frontend ──────────────────────────────────────────────────────────────
# VITE_* variables are inlined at BUILD time from frontend\.env.production,
# so the bundle must be rebuilt after any change to that file. Setting
# VITE_API_BASE_URL as an Azure App Setting has no effect on a built SPA.
if (-not $SkipBuild) {
    Write-Host '==> Building frontend (vite)...' -ForegroundColor Cyan
    Push-Location $frontend
    npm run build
    if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'Frontend build failed' }
    Pop-Location
}

$feDist = Join-Path $frontend 'dist'
if (-not (Test-Path (Join-Path $feDist 'index.html'))) { throw "Missing $feDist\index.html - run without -SkipBuild" }

$feStage = Join-Path $stage 'frontend'
New-Item -ItemType Directory -Force -Path $feStage | Out-Null
Copy-Item -Path (Join-Path $feDist '*') -Destination $feStage -Recurse -Force
# server.js + package.json make the same ZIP deployable on a Linux App Service;
# web.config (copied from public/ by vite) covers Windows/IIS. Harmless on both.
Copy-Item -Path (Join-Path $frontend 'azure\*') -Destination $feStage -Force

$fePath = Join-Path $outDir 'frontend.zip'
New-DeployZip -SourceDir $feStage -DestinationPath $fePath

# ── Backend ───────────────────────────────────────────────────────────────
# Staged with robocopy so the ZIP root is app/ + run.py + requirements.txt,
# never a nested backend-fastapi/ folder. .env is excluded on purpose: Azure
# App Settings are the only source of production configuration, and shipping
# the local .env would risk a DB_HOST=127.0.0.1 fallback.
Write-Host '==> Staging backend...' -ForegroundColor Cyan
$beStage = Join-Path $stage 'backend'
New-Item -ItemType Directory -Force -Path $beStage | Out-Null
# tests/ is excluded deliberately: those scripts create and delete user
# accounts against whichever database they are pointed at, so they must never
# sit on a production host. outbox/ is excluded because the development SMTP
# outbox can contain live verification codes.
robocopy $backend $beStage /E `
    /XD venv .venv __pycache__ scratch tests outbox .git node_modules dist `
    /XF .env *.pyc *.zip *.db | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit code $LASTEXITCODE" }
# robocopy uses 0-7 for success (1 = files copied). Clear it so the script does
# not inherit a non-zero exit code from a successful copy.
$global:LASTEXITCODE = 0

$bePath = Join-Path $outDir 'backend.zip'
New-DeployZip -SourceDir $beStage -DestinationPath $bePath

Remove-Item -Recurse -Force $stage

# ── Summary ───────────────────────────────────────────────────────────────
Write-Host ''
Write-Host 'Artifacts:' -ForegroundColor Green
Get-ChildItem $outDir -Filter *.zip |
    ForEach-Object { '{0,-14} {1,8:N1} MB' -f $_.Name, ($_.Length / 1MB) }
Write-Host ''
Write-Host 'Deploy:' -ForegroundColor Green
Write-Host '  az webapp deploy -g <RG> -n az10lappdprp02 --src-path deploy/backend.zip  --type zip'
Write-Host '  az webapp deploy -g <RG> -n az10lappdprp01 --src-path deploy/frontend.zip --type zip'

exit 0
