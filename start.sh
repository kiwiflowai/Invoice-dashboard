#!/bin/bash

# Start script for Invoice Processing MVP

echo "Starting Invoice Processing MVP..."
echo ""

# Check if Tesseract is installed
if ! command -v tesseract &> /dev/null; then
    echo "Error: Tesseract OCR is not installed."
    echo "Please install it using: brew install tesseract (macOS) or apt-get install tesseract-ocr (Linux)"
    exit 1
fi

# Start backend
echo "Starting backend server..."
cd backend
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

source venv/bin/activate
pip install -r requirements.txt --quiet

# Start Flask in background
python app.py &
BACKEND_PID=$!
cd ..

# Wait a moment for backend to start
sleep 3

# Start frontend
echo "Starting frontend server..."
cd frontend
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install
fi

npm start &
FRONTEND_PID=$!
cd ..

echo ""
echo "Application started!"
echo "Backend: http://localhost:5000"
echo "Frontend: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop both servers"

# Wait for user interrupt
trap "kill $BACKEND_PID $FRONTEND_PID; exit" INT
wait


