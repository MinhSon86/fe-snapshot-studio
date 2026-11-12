@echo off
setlocal
chcp 65001 >nul
title FE Snapshot Studio - Setup
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows-launch.ps1" -Mode setup %*
exit /b %errorlevel%
