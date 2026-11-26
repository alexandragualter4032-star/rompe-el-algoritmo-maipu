@echo off
cd /d "%~dp0"
where bun >nul 2>nul
if errorlevel 1 (
  echo Instala Bun antes de iniciar el juego: https://bun.sh/
  pause
  exit /b 1
)
call bun install
if errorlevel 1 exit /b 1
call bun run build
if errorlevel 1 exit /b 1
start "" http://localhost:5173/
bun run serve
