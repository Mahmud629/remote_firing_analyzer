@echo off
title RFA Database
rem Remote Firing Analyzer: same as "npm start". Installs and builds the first time, starts MediaMTX
rem (CCTV) and the local database, which also serves the app, and opens http://localhost:3939
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto nonode
node server\start.mjs
pause
exit /b

:nonode
echo Node.js is not installed on this PC.
echo Install Node.js 20 or newer from https://nodejs.org and run this file again.
pause
exit /b 1
