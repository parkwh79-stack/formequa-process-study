@echo off
cd /d "%~dp0"
where python >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:8000/
  python -m http.server 8000 --bind 127.0.0.1
  goto :eof
)
where npx >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:8000/
  npx -y serve -l 8000 .
  goto :eof
)
echo Python or Node.js is required. Or use VS Code + Live Server.
pause
