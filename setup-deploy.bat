@echo off
rem One-time setup on this PC: Firebase CLI login + GitHub Actions secret for auto deploy.
rem Credentials stay on this PC and in GitHub Secrets - never in the repository.
cd /d "%~dp0"
where npm >nul 2>nul || (echo Node.js is required: https://nodejs.org & pause & goto :eof)
where firebase >nul 2>nul || call npm install -g firebase-tools
call firebase login
call firebase use formequa-process-study
echo.
echo Next: connect GitHub. Choose repo parkwh79-stack/formequa-process-study,
echo answer NO to "build script" and NO to "deploy on merge" - our own workflow does both.
echo The command creates the FIREBASE_SERVICE_ACCOUNT_FORMEQUA_PROCESS_STUDY secret for you.
call firebase init hosting:github
rem init writes its own workflow files; this repo already has .github\workflows\firebase-hosting.yml
if exist .github\workflows\firebase-hosting-pull-request.yml del .github\workflows\firebase-hosting-pull-request.yml
if exist .github\workflows\firebase-hosting-merge.yml del .github\workflows\firebase-hosting-merge.yml
rem install this repo's workflow (kept in github-workflow\ because remote tools cannot write .github)
if not exist .github\workflows mkdir .github\workflows
copy /Y github-workflow\firebase-hosting.yml .github\workflows\firebase-hosting.yml >nul
echo Workflow installed: .github\workflows\firebase-hosting.yml
echo.
echo Done. Push to main to deploy, or run deploy.bat to deploy from this PC.
pause
