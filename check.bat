@echo off
setlocal
chcp 65001 >nul
title FE Snapshot Studio - System Check
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows-launch.ps1" -Mode check %*
exit /b %errorlevel%
