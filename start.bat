@echo off
REM ============================================================
REM   Engineering Management System - Quick Start
REM   Pure-ASCII version: avoids GBK/UTF-8 console issues on Windows
REM ============================================================
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================================
echo   Engineering Management System - Database Edition
echo ============================================================
echo.

set PY=
where python >nul 2>&1 && set PY=python
if not defined PY where py >nul 2>&1 && set PY=py
if not defined PY (
  echo [ERROR] Python not found. Install Python 3.7+ from:
  echo         https://www.python.org/downloads/
  pause
  exit /b 1
)

REM Check if port 8080 is already in use
netstat -ano | findstr ":8080" | findstr LISTENING >nul
if %errorlevel%==0 (
  echo [WARN] Port 8080 is already in use.
  echo         Open http://localhost:8080 directly, or stop the running process first.
  pause
  exit /b 0
)

REM Default port 8080. Override by passing arg: start.bat 9000
set PORT=8080
if not "%1"=="" set PORT=%1

echo Starting server on port %PORT%...
echo DB file : %cd%\server\data.db
echo URL      : http://localhost:%PORT%
echo Press Ctrl+C to stop the server.
echo --------------------------------------------------------

"%PY%" server\app.py %PORT%
pause
