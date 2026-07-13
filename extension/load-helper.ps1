Write-Host "=======================================" -ForegroundColor Cyan
Write-Host " OJ Helper 扩展安装工具" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""

$regPath = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe"
$chromePath = (Get-ItemProperty -Path $regPath -ErrorAction SilentlyContinue).'(Default)'
if (-not $chromePath) {
    $chromePath = "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe"
}
if (-not (Test-Path $chromePath)) {
    $chromePath = "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
}
if (-not (Test-Path $chromePath)) {
    $chromePath = "${env:LOCALAPPDATA}\Google\Chrome\Application\chrome.exe"
}

if (Test-Path $chromePath) {
    Write-Host "Chrome 路径: $chromePath" -ForegroundColor Green
    
    $extPath = "c:\西财OJ平台\extension"
    Write-Host "扩展路径: $extPath" -ForegroundColor Green
    Write-Host ""
    Write-Host "正在启动 Chrome..." -ForegroundColor Yellow
    
    & $chromePath --load-extension="$extPath" --no-first-run "http://127.0.0.1:3000"
    
    Write-Host ""
    Write-Host "Chrome 已启动!" -ForegroundColor Green
    Write-Host ""
    Write-Host "如扩展未自动加载, 请手动操作:" -ForegroundColor Yellow
    Write-Host "  1. 打开 chrome://extensions/" -ForegroundColor White
    Write-Host "  2. 开启右上角「开发者模式」" -ForegroundColor White
    Write-Host "  3. 点击「加载已解压的扩展程序」" -ForegroundColor White
    Write-Host "  4. 选择文件夹: $extPath" -ForegroundColor White
} else {
    Write-Host "未找到 Chrome, 请手动安装扩展:" -ForegroundColor Red
    Write-Host "  1. 打开 Chrome → chrome://extensions/" -ForegroundColor Yellow
    Write-Host "  2. 开启「开发者模式」" -ForegroundColor Yellow
    Write-Host "  3. 点击「加载已解压的扩展程序」" -ForegroundColor Yellow
    Write-Host "  4. 选择文件夹: c:\西财OJ平台\extension" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "按任意键退出..." 
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
