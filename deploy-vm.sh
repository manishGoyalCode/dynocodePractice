#!/bin/bash

# 🚀 DynoCode FAST VM Deployment Script (No Docker)
# This script runs the services directly on your machine/VM.

echo "⏱ Starting Fast Deployment..."

# --- 1. Backend Setup ---
echo "🐍 Setting up Python Backend..."
cd backend
python3 -m venv venv
source venv/bin/venv/activate || source venv/bin/activate
pip install -r requirements.txt

# Start Backend in background
echo "⚙️ Starting Backend API on port 8000..."
nohup uvicorn main:app --host 0.0.0.0 --port 8000 > backend.log 2>&1 &
BACKEND_PID=$!
cd ..

# --- 2. Frontend Setup ---
echo "📦 Setting up Node Frontend..."
cd frontend
npm install

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
