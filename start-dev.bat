@echo off
title RFA developer mode
rem For changing the code: database in its own window, the app with live reload at http://localhost:3000
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto nonode
start "RFA Database" /d "%~dp0" cmd /k node server\server.mjs
if exist "mediamtx\mediamtx.exe" start "MediaMTX" /min /d "%~dp0mediamtx" mediamtx.exe mediamtx.yml
start "" cmd /c "timeout /t 10 /nobreak >nul & start http://localhost:3000"
call npm run dev
pause
exit /b

:nonode
echo Node.js is not installed. Install Node.js 20 or newer from https://nodejs.org
pause
exit /b 1
