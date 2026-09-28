@echo off
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe (
  py -3 -m venv .venv
  if errorlevel 1 goto fail
)
if not exist .venv\better-exl-installed (
  .venv\Scripts\python.exe -m pip install -r requirements.txt
  if errorlevel 1 goto fail
  echo installed>.venv\better-exl-installed
)
.venv\Scripts\python.exe run.py %*
if errorlevel 1 goto fail
exit /b
:fail
echo Setup or startup failed. Install Python 3.11 or newer and check the error above.
pause
