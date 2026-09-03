@echo off
REM Put the trainer on GitHub Pages so it works away from this PC.
REM
REM First time only:  gh auth login       (browser sign-in, once per machine)
REM Every time after: just run this file. Pages rebuilds itself on each push,
REM which takes about a minute.

setlocal
set REPO=adl-trainer
set BRANCH=master
set PATH=%PATH%;C:\Program Files\GitHub CLI

gh auth status >nul 2>&1
if errorlevel 1 (
  echo Not signed in to GitHub. Run:  gh auth login
  exit /b 1
)

git remote get-url origin >nul 2>&1
if errorlevel 1 (
  echo Creating the repository...
  gh repo create %REPO% --public --source=. --remote=origin --push ^
     --description "Advanced Deep Learning exam trainer"
  if errorlevel 1 exit /b 1
  echo Turning on GitHub Pages...
  gh api -X POST "repos/{owner}/%REPO%/pages" ^
     -f "source[branch]=%BRANCH%" -f "source[path]=/" >nul 2>&1
) else (
  git push origin %BRANCH%
  if errorlevel 1 exit /b 1
)

for /f "delims=" %%u in ('gh api user --jq .login') do set OWNER=%%u
echo.
echo Live in a minute or so at:  https://%OWNER%.github.io/%REPO%/
endlocal
