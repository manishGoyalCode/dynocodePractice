#!/bin/bash

# DynoCode Deployment Script
# Usage: ./deploy.sh

echo "🚀 Starting DynoCode Deployment..."

# 1. Check for Docker
if ! [ -x "$(command -v docker-compose)" ]; then
  echo '❌ Error: docker-compose is not installed.' >&2
  exit 1
fi

# 2. Build and Start
echo "🏗 Building and starting containers..."
docker-compose up -d --build

echo "✅ Deployment successful!"
echo "🌐 Frontend: http://localhost:3000"
echo "⚙️ Backend API: http://localhost:8000"
echo "📊 Run 'docker-compose logs -f' to see the logs."
