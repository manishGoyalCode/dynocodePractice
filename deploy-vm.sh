#!/bin/bash

# 🚀 DynoCode FAST VM Deployment Script (No Docker)
# This script runs the services directly on your machine/VM.

echo "⏱ Starting Fast Deployment..."

# --- 0. Cleanup ---
echo "🧹 Cleaning up old processes on ports 3000 and 8000..."
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# --- 1. Backend Setup ---
echo "🐍 Setting up Python Backend..."
cd backend
if [ ! -d "venv" ]; then
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
else
    source venv/bin/activate
    echo "⏩ Backend venv found, skipping pip install."
fi

# Start Backend in background
echo "⚙️ Starting Backend API on port 8000..."
nohup uvicorn main:app --host 0.0.0.0 --port 8000 > backend.log 2>&1 &
BACKEND_PID=$!
cd ..

# --- 2. Frontend Setup ---
cd frontend
if [ ! -d "node_modules" ]; then
    echo "📦 Installing Node dependencies (this may take a minute)..."
    npm install --prefer-offline --no-audit
else
    echo "⏩ node_modules found, skipping npm install."
fi

# Start Frontend in background (using dev mode for instant start)
echo "🌐 Starting Frontend on port 3000..."
nohup npm run dev -- -p 3000 > frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

echo "------------------------------------------------"
echo "✅ Services are starting up!"
echo "⚙️ Backend (PID $BACKEND_PID): http://localhost:8000"
echo "🌐 Frontend (PID $FRONTEND_PID): http://localhost:3000"
echo "------------------------------------------------"
echo "💡 To stop them, run: kill $BACKEND_PID $FRONTEND_PID"
echo "📊 Check logs with: tail -f backend/backend.log or tail -f frontend/frontend.log"
