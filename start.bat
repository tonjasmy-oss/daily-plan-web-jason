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

REM Default port 8080. Override by passing arg: start.bat 9000
set PORT=8080
if not "%1"=="" set PORT=%1

REM ---- Locate a REAL python interpreter ----------------------
REM WARNING: `where python` often hits the 0-byte Microsoft Store
REM   alias (WindowsApps\python.exe). Running it opens Microsoft
REM   Store and exits silently, so the server never starts.
REM   Hence we probe real install locations first.
set PY=
if not defined PY if exist "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" set "PY=%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
if not defined PY if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" set "PY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
if not defined PY if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" set "PY=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
if not defined PY if exist "%LOCALAPPDATA%\Programs\Python\Python310\python.exe" set "PY=%LOCALAPPDATA%\Programs\Python\Python310\python.exe"
if not defined PY if exist "%LOCALAPPDATA%\Programs\Python\Python39\python.exe"  set "PY=%LOCALAPPDATA%\Programs\Python\Python39\python.exe"
if not defined PY if exist "%PROGRAMFILES%\Python313\python.exe" set "PY=%PROGRAMFILES%\Python313\python.exe"
if not defined PY if exist "%PROGRAMFILES%\Python312\python.exe" set "PY=%PROGRAMFILES%\Python312\python.exe"
if not defined PY if exist "%PROGRAMFILES%\Python311\python.exe" set "PY=%PROGRAMFILES%\Python311\python.exe"
if not defined PY if exist "%PROGRAMFILES%\Python310\python.exe" set "PY=%PROGRAMFILES%\Python310\python.exe"
if not defined PY if exist "%SystemRoot%\py.exe" set "PY=%SystemRoot%\py.exe"
if not defined PY if exist "%USERPROFILE%\.workbuddy\binaries\python\versions\3.13.12\python.exe" set "PY=%USERPROFILE%\.workbuddy\binaries\python\versions\3.13.12\python.exe"
if not defined PY (
  echo [ERROR] Python not found. Install Python 3.7+ from:
  echo         https://www.python.org/downloads/
  pause
  exit /b 1
)

echo Python    : %PY%
echo.

REM ---- Port check --------------------------------------------
netstat -ano | findstr ":%PORT%" | findstr LISTENING >nul
if %errorlevel%==0 (
  echo [WARN] Port %PORT% is already in use.
  echo         Open http://localhost:%PORT% directly, or stop the process below.
  netstat -ano | findstr ":%PORT%" | findstr LISTENING
  echo         The last column is the PID. Stop it with: taskkill /F /PID ^<pid^>
  pause
  exit /b 0
)

echo Starting server on port %PORT%...
echo DB file : %cd%\server\data.db
echo URL      : http://localhost:%PORT%
echo Press Ctrl+C to stop the server.
echo --------------------------------------------------------

"%PY%" server\app.py %PORT%
pause
