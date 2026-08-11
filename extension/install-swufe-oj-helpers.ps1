param(
    [string]$BaseUrl = "http://127.0.0.1:5173",
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

function Write-Section {
    param([string]$Text)
    Write-Host ""
    Write-Host "==== $Text ====" -ForegroundColor Cyan
}

function Join-Url {
    param(
        [string]$Base,
        [string]$Path
    )
    return $Base.TrimEnd("/") + "/" + $Path.TrimStart("/")
}

$repoRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$frontendPublic = Join-Path $repoRoot "packages\frontend\public"
$requiredFiles = @(
    "install-oj-helpers.html",
    "cf-helper.user.js",
    "luogu-helper.user.js",
    "qoj-helper.user.js"
)

Write-Host "SWUFE Singularity OJ auto-submit helper one-click installer" -ForegroundColor Green
Write-Host "BaseUrl: $BaseUrl" -ForegroundColor Yellow
Write-Host "Repo: $repoRoot" -ForegroundColor DarkGray

Write-Section "Checking local helper files"
foreach ($file in $requiredFiles) {
    $fullPath = Join-Path $frontendPublic $file
    if (-not (Test-Path -LiteralPath $fullPath)) {
        throw "Missing file: $fullPath"
    }
    Write-Host "OK $file" -ForegroundColor Green
}

Write-Section "Install URLs"
$urls = @(
    (Join-Url $BaseUrl "install-oj-helpers.html"),
    (Join-Url $BaseUrl "cf-helper.user.js"),
    (Join-Url $BaseUrl "luogu-helper.user.js"),
    (Join-Url $BaseUrl "qoj-helper.user.js")
)

foreach ($url in $urls) {
    Write-Host $url -ForegroundColor White
}

if ($NoBrowser) {
    Write-Section "Browser launch skipped"
    Write-Host "Share the install-oj-helpers.html URL with teammates, or open each .user.js URL manually." -ForegroundColor Yellow
    exit 0
}

Write-Section "Opening browser"
foreach ($url in $urls) {
    Start-Process $url -WindowStyle Hidden
    Start-Sleep -Milliseconds 450
}

Write-Host ""
Write-Host "Opened the unified installer and three direct helper install URLs." -ForegroundColor Green
Write-Host "Tampermonkey will ask for confirmation in each tab. Click Install or Update." -ForegroundColor Yellow
Write-Host ""
Write-Host "Server usage example:" -ForegroundColor Cyan
Write-Host 'powershell -ExecutionPolicy Bypass -File .\extension\install-swufe-oj-helpers.ps1 -BaseUrl "https://your-server-domain"' -ForegroundColor White
