@echo off
chcp 65001 >nul
title FE Snapshot Studio
cd /d "%~dp0"
if not exist "node_modules" (
  echo [1/2] Đang cài đặt thư viện lần đầu...
  call npm install
)
echo Đang khởi động FE Snapshot Studio...
node server/index.js
pause
