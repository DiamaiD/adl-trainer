@echo off
REM Regenerate the question database from the exam LaTeX, then check it.
REM Pass "figures" as well if you changed a TikZ picture -- it needs pdflatex
REM and dvisvgm and takes a couple of minutes, so it is not run by default.
python tools\extract.py    || exit /b 1
python tools\build_data.py || exit /b 1
if /i "%~1"=="figures" (
  python tools\figures.py  || exit /b 1
)
python tools\audit_data.py || exit /b 1
echo.
echo Done. Open index.html.
