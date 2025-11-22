@echo off
chcp 65001 >nul
title VET-APP Launcher
echo ================================
echo    VET-APP Launcher
echo ================================
echo.

:: Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ ERROR: Python is not installed or not in PATH
    echo Please install Python from https://python.org
    pause
    exit /b 1
)

:: Check if required dependencies are installed
echo Checking dependencies...
pip list | findstr "Flask Flask-CORS" >nul
if errorlevel 1 (
    echo Installing missing dependencies...
    pip install Flask Flask-CORS
)

:: Check if database file exists
if not exist "invoice_app.db" (
    echo ⚠️  Database file not found. It will be created automatically.
)

:: Check if data folder structure exists
if not exist "data\data" (
    echo Creating data folder structure...
    mkdir "data\data"
)

:: Check if medicines.json exists
if not exist "data\data\medicines.json" (
    echo ⚠️  medicines.json not found. Creating sample file...
    echo [] > "data\data\medicines.json"
)

:: Launch the application
echo.
echo 🚀 Starting VET-APP...
echo 📍 Server will be available at: http://127.0.0.1:5000
echo 📍 Press Ctrl+C to stop the server
echo.
python server.py

pause