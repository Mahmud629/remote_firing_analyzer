@echo off
title MediaMTX - camera server for Remote Firing Analyzer
cd /d "%~dp0"
echo.
echo  MediaMTX is starting. KEEP THIS WINDOW OPEN while you use CCTV cameras.
echo  If Windows asks about the firewall, choose "Allow access".
echo.
mediamtx.exe mediamtx.yml
echo.
echo  MediaMTX stopped. Press any key to close this window.
pause >nul
