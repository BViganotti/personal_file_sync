#!/bin/bash

# This script checks if the frontend and backend servers are already running before starting them.
# It uses lsof to check if the required ports (backend on 8080 and frontend on 5173) are in use.
# If a port is in use, it kills the process and restarts the server.
# Otherwise, it launches the server in the background.

# Define the ports.
BACKEND_PORT=8080
FRONTEND_PORT=5173

# Function to kill process using PID file or lsof if PID file not present
kill_process() {
    local pidfile=$1
    local port=$2
    if [ -f "$pidfile" ]; then
        PID=$(cat "$pidfile")
        if ps -p $PID > /dev/null 2>&1; then
            echo "Killing process from $pidfile (PID: $PID) running on port $port..."
            kill -9 $PID
        fi
        rm -f "$pidfile"
    else
        PID=$(lsof -ti :"$port")
        if [ -n "$PID" ]; then
            echo "Killing process (PID: $PID) running on port $port..."
            kill -9 $PID
        fi
    fi
}

# Kill and restart backend
if lsof -i :"$BACKEND_PORT" | grep -q LISTEN; then
    kill_process "backend.pid" "$BACKEND_PORT"
fi

echo "Starting backend..."
nohup go run main.go > backend.log 2>&1 &
echo $! > backend.pid

# Kill and restart frontend
if lsof -i :"$FRONTEND_PORT" | grep -q LISTEN; then
    kill_process "frontend.pid" "$FRONTEND_PORT"
fi

echo "Starting frontend..."
nohup npm run dev --prefix frontend > frontend.log 2>&1 &
echo $! > frontend.pid

echo "Frontend is running at: http://localhost:$FRONTEND_PORT"

exit 0
