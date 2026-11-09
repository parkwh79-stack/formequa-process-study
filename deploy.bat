@echo off
rem FORMEQUA Process Study - build + Firebase Hosting deploy (run on this PC; credentials stay here)
cd /d "%~dp0"
where firebase >nul 2>nul
if errorlevel 1 (
  echo Firebase CLI not found. Install once:  npm install -g firebase-tools  then  firebase login
  pause
  goto :eof
)
call npm test
if errorlevel 1 (
  echo Tests failed - deploy cancelled.
  pause
  goto :eof
)
call npm run build
if errorlevel 1 goto :fail
call firebase deploy --project formequa-process-study --only hosting:study
if errorlevel 1 goto :fail
echo.
echo Deployed: https://formequa-process-study.web.app
pause
goto :eof
:fail
echo Deploy failed.
pause
