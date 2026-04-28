#!/bin/bash

# ⚙️ DynoCode BACKEND-ONLY Deployment Script
# Run this on your DigitalOcean Droplet.

echo "⏱ Starting Backend Deployment..."

# --- 1. Cleanup ---
echo "🧹 Cleaning up old processes on port 8000..."
lsof -ti:8000 | xargs kill -9 2>/dev/null || true

# --- 2. Backend Setup ---
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

# --- 3. Start Backend ---
# We use 0.0.0.0 so it is accessible from the outside (your frontend)
echo "⚙️ Starting Backend API on port 8000..."
nohup uvicorn main:app --host 0.0.0.0 --port 8000 > backend.log 2>&1 &
BACKEND_PID=$!

echo "------------------------------------------------"
echo "✅ Backend is LIVE!"
echo "⚙️ PID: $BACKEND_PID"
echo "🔗 URL: http://$(curl -s ifconfig.me):8000"
echo "------------------------------------------------"
echo "💡 To stop, run: kill $BACKEND_PID"
echo "📊 Logs: tail -f backend.log"
