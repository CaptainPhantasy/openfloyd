#!/bin/bash
# Start OpenFloyd with MCP Gateway

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "[Startup] Starting MCP Gateway..."
node dist/gateway/mcp-gateway.js &
GATEWAY_PID=$!

echo "[Startup] Waiting for gateway to initialize..."
sleep 2

echo "[Startup] Starting OpenFloyd..."
npm start &
FLOYD_PID=$!

echo "[Startup] OpenFloyd started"
echo "[Startup] Gateway PID: $GATEWAY_PID"
echo "[Startup] Floyd PID: $FLOYD_PID"

# Handle shutdown
trap "kill $GATEWAY_PID $FLOYD_PID 2>/dev/null" EXIT

wait
