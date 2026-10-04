MediaMTX for Remote Firing Analyzer
===================================

What it is
  Browsers cannot play a CCTV camera's RTSP stream. MediaMTX (a free program) pulls the
  camera's stream and re-serves it in a form the browser can play. The analyzer talks to
  it for you: you only add the camera's IP, username and password in the app
  (Settings > CCTV cameras > Add camera).

How to run it (Windows)
  1. Double-click  start-mediamtx.bat  in this folder.
  2. A black window opens. KEEP IT OPEN while you use CCTV cameras.
  3. If Windows asks about the firewall, choose "Allow access" (private network).
  4. In the app, Settings > CCTV cameras should now say "MediaMTX running".

  Shortcut: start-app.bat in the main project folder starts MediaMTX and the analyzer
  together and opens the browser.

  Stop it by closing the black window (or pressing Ctrl+C in it).

Files
  mediamtx.exe  MediaMTX v1.21.1, Windows 64-bit (official release from
                github.com/bluenviron/mediamtx, SHA-256
                faa97974861eb75a68b5aa326c78e7e7a6f670b5ef191bace78e715130381f23 for the zip).
                MIT licence: see LICENSE.
  mediamtx.yml  Settings used by the analyzer (control API on port 9997, camera video on
                port 8888). Cameras are added from the app, you do not need to edit it.

Other computers
  On Linux or macOS download the matching build from
  https://github.com/bluenviron/mediamtx/releases and start it with:  ./mediamtx mediamtx.yml

Notes
  - Run the analyzer and MediaMTX on the SAME computer. The control API only answers
    requests from that computer, so cameras cannot be added from another machine.
  - Open the analyzer at http://localhost:3000 (npm run dev) or from the built "out"
    folder served locally. A copy hosted on the internet cannot reach MediaMTX.
  - Cameras added from the app are forgotten when MediaMTX restarts; the app adds them
    again when you press Start live.
  - Camera not showing a picture (amber dot)? Check the IP address, username, password and
    channel, and that the camera is on the same network as this computer.
