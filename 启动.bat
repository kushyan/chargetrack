@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在启动充电站监控...
echo 启动后浏览器访问: http://127.0.0.1:4175
echo 端口被占用时可改用: set PORT=4176 ^&^& node server.mjs
echo 关闭此窗口即停止服务
echo.
node server.mjs
if errorlevel 1 (
  echo.
  echo [错误] 启动失败，请确认已安装 Node.js ^(node -v 可查看版本^)
  pause
)
