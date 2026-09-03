@echo off
REM Regenerate the question database from the exam LaTeX, then check it.
python tools\extract.py    || exit /b 1
python tools\build_data.py || exit /b 1
python tools\audit_data.py || exit /b 1
echo.
echo Done. Open index.html.
