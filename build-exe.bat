@echo off
cd /d "%~dp0"
title Taktaka - Build EXE
set CSC_IDENTITY_AUTO_DISCOVERY=false
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found. Installing with winget...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  echo Node.js installed. Close this window and run this file again.
  pause
  exit /b 1
)
if not exist package.json (
  echo package.json missing in this folder
  pause
  exit /b 1
)
echo [1/2] Installing libraries...
call npm install --no-audit --no-fund
call npm install-scripts approve electron realm uiohook-napi >nul 2>nul
if not exist node_modules\electron call npm install electron --save-dev --no-audit --no-fund
if not exist node_modules\realm call npm install realm --no-audit --no-fund
if not exist node_modules\uiohook-napi call npm install uiohook-napi --no-audit --no-fund
if not exist node_modules\electron (
  echo Electron install failed. Check your internet and try again.
  pause
  exit /b 1
)
call npm install electron-builder --save-dev --no-audit --no-fund
call npm run dist
if errorlevel 1 (
  pause
  exit /b 1
)
echo Done. EXE is in the dist folder.
start "" "%~dp0dist"
pause
