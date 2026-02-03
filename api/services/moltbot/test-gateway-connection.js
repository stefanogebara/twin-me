#!/usr/bin/env node
/**
 * Test OpenClaw Gateway Connection
 *
 * Run: node api/services/moltbot/test-gateway-connection.js
 */

import WebSocket from 'ws';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const GATEWAY_URL = process.env.MOLTBOT_WS_URL || 'ws://127.0.0.1:18789';
const GATEWAY_TOKEN = process.env.MOLTBOT_API_KEY;

// OpenClaw protocol version (from their schema)
const PROTOCOL_VERSION = 3;

console.log('OpenClaw Gateway Connection Test');
console.log('====================================');
console.log(`Gateway URL: ${GATEWAY_URL}`);
console.log(`Token configured: ${GATEWAY_TOKEN ? 'Yes (' + GATEWAY_TOKEN.substring(0, 8) + '...)' : 'No'}`);
console.log('');

async function testConnection() {
  return new Promise((resolve, reject) => {
    console.log('Connecting to gateway...');

    // Include token in URL for gateway auth
    const wsUrl = GATEWAY_TOKEN
      ? `${GATEWAY_URL}?token=${GATEWAY_TOKEN}`
      : GATEWAY_URL;

    const ws = new WebSocket(wsUrl, {
      headers: {
        'Authorization': `Bearer ${GATEWAY_TOKEN}`,
        'User-Agent': 'twinme-api/1.0.0'
      },
      // Accept self-signed certificates for development
      rejectUnauthorized: false
    });

    const timeout = setTimeout(() => {
      ws.terminate();
      reject(new Error('Connection timeout (10 seconds)'));
    }, 10000);

    ws.on('open', () => {
      clearTimeout(timeout);
      console.log('WebSocket connected!');
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        console.log('Received:', JSON.stringify(msg, null, 2));

        // Handle OpenClaw challenge-response authentication
        // Protocol: Gateway sends event "connect.challenge" with nonce
        // Client responds with type:"req", method:"connect", params:{...}
        if (msg.type === 'event' && msg.event === 'connect.challenge') {
          console.log('Responding to challenge with connect request...');

          // Generate a unique request ID
          const requestId = crypto.randomUUID();

          // Build the correct OpenClaw connect request frame
          // Based on: https://docs.openclaw.ai/gateway/protocol
          // Valid client.id values: "cli", "openclaw-control-ui"
          // Valid client.mode values: "cli", "webchat"
          const connectRequest = {
            type: 'req',
            id: requestId,
            method: 'connect',
            params: {
              minProtocol: PROTOCOL_VERSION,
              maxProtocol: PROTOCOL_VERSION,
              client: {
                id: 'cli',
                version: '1.0.0',
                platform: 'Win32',
                mode: 'cli'
              },
              role: 'operator',
              scopes: ['operator.read', 'operator.write'],
              caps: [],
              commands: [],
              permissions: {},
              auth: {
                token: GATEWAY_TOKEN
              },
              locale: 'en-US',
              userAgent: 'twinme-api/1.0.0 Windows'
              // Note: device identity omitted - requires allowInsecureAuth on gateway
            }
          };

          console.log('Sending:', JSON.stringify(connectRequest, null, 2));
          ws.send(JSON.stringify(connectRequest));
        }

        // Handle successful connection response
        // Gateway responds with type:"res" containing hello-ok data
        if (msg.type === 'res' && msg.ok === true) {
          console.log('Gateway authenticated successfully!');
          if (msg.payload) {
            console.log(`   Protocol: ${msg.payload.protocol || 'unknown'}`);
            console.log(`   Device Token: ${msg.payload.auth?.deviceToken ? 'Received' : 'None'}`);
          }
          ws.close(1000, 'Test complete');
          resolve({ success: true, message: 'Gateway connection successful', payload: msg.payload });
        }

        // Handle error response
        if (msg.type === 'res' && msg.ok === false) {
          console.log('Gateway rejected connection:', msg.error);
          ws.close(1000, 'Error received');
          reject(new Error(msg.error?.message || msg.error || 'Gateway rejected connection'));
        }

        // Handle health events (after connection)
        if (msg.type === 'event' && msg.event === 'health') {
          console.log(`Gateway healthy (clients: ${msg.payload?.clients || 0})`);
        }

        // Handle legacy error format
        if (msg.type === 'error') {
          console.log('Gateway error:', msg.payload?.message || msg);
          ws.close(1000, 'Error received');
          reject(new Error(msg.payload?.message || 'Gateway error'));
        }
      } catch (e) {
        console.log('Raw message:', data.toString().substring(0, 500));
      }
    });

    ws.on('error', (error) => {
      clearTimeout(timeout);
      console.log('❌ Connection error:', error.message);
      reject(error);
    });

    ws.on('close', (code, reason) => {
      clearTimeout(timeout);
      console.log(`🔒 Connection closed: ${code} - ${reason}`);
      if (code !== 1000) {
        reject(new Error(`Connection closed unexpectedly: ${code}`));
      }
    });
  });
}

// Run test
testConnection()
  .then((result) => {
    console.log('');
    console.log('✅ TEST PASSED:', result.message);
    process.exit(0);
  })
  .catch((error) => {
    console.log('');
    console.log('❌ TEST FAILED:', error.message);
    console.log('');
    console.log('Troubleshooting:');
    console.log('1. Verify OpenClaw gateway is running on the VPS');
    console.log(`2. Check if ${GATEWAY_URL} is accessible`);
    console.log('3. Verify firewall allows port 18789');
    console.log('4. Check MOLTBOT_API_KEY matches gateway token');
    process.exit(1);
  });
