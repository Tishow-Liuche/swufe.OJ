@echo off
echo ===========================================
echo  OJ Remote Submit Helper - 安装助手
echo ===========================================
echo.
echo 请按以下步骤操作:
echo.
echo 1. 打开 Chrome，地址栏输入 chrome://extensions/
echo 2. 右上角开启「开发者模式」
echo 3. 点击「加载已解压的扩展程序」
echo 4. 选择文件夹: %~dp0
echo 5. 安装后会自动连接
echo.
echo 按任意键打开 Chrome...
pause > nul

start chrome.exe chrome://extensions
