#!/bin/bash
# Start SSH tunnel to OpenClaw on Oracle VPS
# Usage: ./start-openclaw-tunnel.sh

SSH_KEY="$HOME/.ssh/oracle_vps"
VPS_HOST="opc@80.225.184.207"
LOCAL_PORT=28789
REMOTE_PORT=18789

# Check if tunnel already exists
if netstat -an 2>/dev/null | grep -q ":$LOCAL_PORT.*LISTEN" || ss -tlnp 2>/dev/null | grep -q ":$LOCAL_PORT"; then
    echo "Tunnel already running on port $LOCAL_PORT"
    exit 0
fi

# Start the tunnel
echo "Starting SSH tunnel: localhost:$LOCAL_PORT -> VPS:$REMOTE_PORT"
ssh -i "$SSH_KEY" -f -N -L ${LOCAL_PORT}:localhost:${REMOTE_PORT} $VPS_HOST

if [ $? -eq 0 ]; then
    echo "Tunnel established successfully"
    echo "OpenClaw now accessible at ws://localhost:$LOCAL_PORT"
else
    echo "Failed to establish tunnel"
    exit 1
fi
