#!/bin/bash

# Agent Diplomacy Launch Script

echo "╔════════════════════════════════════════════════════════╗"
echo "║          AGENT DIPLOMACY - Quick Launch               ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

# Check if database exists
if [ ! -f "db/games.db" ]; then
    echo "🗄️  Initializing database..."
    npm run init-db
    echo ""
fi

echo "🚀 Starting Agent Diplomacy server..."
echo ""
echo "Once started, open your browser to:"
echo "  http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop"
echo ""

npm start