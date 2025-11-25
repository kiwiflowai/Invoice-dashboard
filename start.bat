@echo off
echo Starting Invoice Processing MVP...
echo.

REM Check if Tesseract is installed
where tesseract >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Error: Tesseract OCR is not installed.
    echo Please install it from: https://github.com/UB-Mannheim/tesseract/wiki
    pause
    exit /b 1
)

REM Start backend
echo Starting backend server...
cd backend
if not exist venv (
    echo Creating virtual environment...
    python -m venv venv
)

call venv\Scripts\activate.bat
pip install -r requirements.txt --quiet

REM Start Flask in background
start "Backend Server" python app.py
cd ..

REM Wait a moment for backend to start
timeout /t 3 /nobreak >nul

REM Start frontend
echo Starting frontend server...
cd frontend
if not exist node_modules (
    echo Installing frontend dependencies...
    call npm install
)

start "Frontend Server" npm start
cd ..

echo.
echo Application started!
echo Backend: http://localhost:5000
echo Frontend: http://localhost:3000
echo.
echo Close this window to stop the servers
pause


