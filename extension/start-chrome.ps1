# 关闭所有 Chrome 实例
Stop-Process -Name "chrome" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# 启动 Chrome 加载扩展
$extPath = "c:\西财OJ平台\extension"
Start-Process "chrome.exe" -ArgumentList `
  "--load-extension=$extPath",
  "--no-first-run",
  "--no-default-browser-check",
  "http://127.0.0.1:3000"
