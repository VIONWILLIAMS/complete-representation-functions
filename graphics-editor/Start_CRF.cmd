@echo off
where node >nul 2>nul
if errorlevel 1 (
  echo CRF needs Node.js 22 or later. See README_START_HERE.md.
  pause
  exit /b 1
)
node "%~dp0tools\start.mjs" %*
if errorlevel 1 pause
