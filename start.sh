#!/bin/bash

# Metro Service Startup Script for Remote MacBook
# This script starts the Metro service on port 3003

echo "🚀 Starting Metro Service for TheEverythingApp..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

# Navigate to the Metro Service directory
cd "$(dirname "$0")"

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Build TypeScript if dist doesn't exist or src is newer
if [ ! -d "dist" ] || [ "src" -nt "dist" ]; then
    echo "🔨 Building TypeScript..."
    npm run build
fi

# Start the service
echo "🌟 Starting Metro Service on port 3003..."
echo "🔗 Service will be available at: http://localhost:3003"
echo "📱 Ready to handle Metro requests from Railway ContainerFinal"
echo ""
npm start
