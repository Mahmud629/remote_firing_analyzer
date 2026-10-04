@echo off
rem Starts MediaMTX (camera server) in its own window, then the analyzer, then opens the browser.
cd /d "%~dp0"
start "MediaMTX" cmd /k "cd /d %~dp0mediamtx && mediamtx.exe mediamtx.yml"
start "" cmd /c "timeout /t 8 >nul & start http://localhost:3000"
npm run dev
