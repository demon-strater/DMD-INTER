@echo off
rem Double-click to open the exhibition in the browser (the pages need http, not file://).
cd /d "%~dp0"
node serve.cjs --open
pause
