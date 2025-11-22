#!/bin/bash

echo "🚀 Starting both applications..."

# Start Flask app (app1) in background
echo "📊 Starting Flask app on port 5000..."
cd app1
python server.py &
FLASK_PID=$!
cd ..

# Wait a moment
sleep 2

# Start Node.js app (app2) in background
echo "💊 Starting Node.js app on port 3000..."
cd app2
node server.js &
NODE_PID=$!
cd ..

echo "✅ Both apps started!"
echo "Flask (app1) PID: $FLASK_PID - http://localhost:5000"
echo "Node.js (app2) PID: $NODE_PID - http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop both applications"

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping both applications..."
    kill $FLASK_PID $NODE_PID 2>/dev/null
    exit 0
}

# Set trap to catch Ctrl+C
trap cleanup INT

# Wait indefinitely
wait