@echo off
title Cartoon City Tycoon Online V2
echo.
echo ============================================
echo   Cartoon City Tycoon Online V2
echo ============================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed.
  echo Install Node.js 18 or newer, then run this file again.
  pause
  exit /b 1
)
echo Installing dependencies...
call npm install
if errorlevel 1 (
  echo npm install failed.
  pause
  exit /b 1
)
echo.
echo Starting multiplayer server...
echo Open: http://localhost:3000
echo.
call npm start
pause
