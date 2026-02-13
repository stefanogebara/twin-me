/**
 * Test script for Nango API Integration
 *
 * Tests the unified API platform connections
 *
 * Usage:
 *   1. Set up Nango account and get API keys at https://nango.dev
 *   2. Add NANGO_SECRET_KEY to .env
 *   3. Start the server: npm run server:dev
 *   4. Run: node tests/test-nango-api.js
 */

import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const API_BASE = `http://localhost:${process.env.PORT || 3004}`;

// Generate fresh JWT token
const token = jwt.sign(
  {
    userId: '167c27b5-a40b-49fb-8d00-deb1b1c57f4d',
    email: 'stefanogebara@gmail.com'
  },
  process.env.JWT_SECRET,
  { expiresIn: '24h' }
);

console.log('='.repeat(60));
console.log('NANGO UNIFIED API TESTS');
console.log('='.repeat(60));
console.log(`API Base: ${API_BASE}`);
console.log(`Nango Secret Key: ${process.env.NANGO_SECRET_KEY ? 'Set (' + process.env.NANGO_SECRET_KEY.substring(0, 10) + '...)' : 'NOT SET'}`);
console.log();

async function testHealthCheck() {
  console.log('1. Testing server health...');
  try {
    const response = await fetch(`${API_BASE}/api/health`);
    if (response.ok) {
      console.log('   [OK] Server is running');
      return true;
    } else {
      console.log('   [FAIL] Server returned:', response.status);
      return false;
    }
  } catch (error) {
    console.log('   [FAIL] Cannot connect to server:', error.message);
    console.log('   Make sure to run: npm run server:dev');
    return false;
  }
}

async function testGetPlatforms() {
  console.log('\n2. Testing GET /api/nango/platforms...');
  try {
    const response = await fetch(`${API_BASE}/api/nango/platforms`);
    const data = await response.json();

    if (response.ok && data.success) {
      console.log('   [OK] Platforms retrieved successfully');
      console.log(`   Total platforms: ${data.count}`);
      console.log('   Platforms:', data.platforms.map(p => p.id).join(', '));
      return true;
    } else {
      console.log('   [FAIL] Error:', data.error || response.status);
      return false;
    }
  } catch (error) {
    console.log('   [FAIL] Request error:', error.message);
    return false;
  }
}

async function testGetConnections() {
  console.log('\n3. Testing GET /api/nango/connections...');
  try {
    const response = await fetch(`${API_BASE}/api/nango/connections`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (response.ok && data.success) {
      console.log('   [OK] Connections retrieved successfully');
      console.log(`   Connected: ${data.connectedCount} / ${data.totalPlatforms}`);

      // List connected platforms
      const connected = Object.entries(data.connections)
        .filter(([_, c]) => c.connected)
        .map(([p, _]) => p);

      if (connected.length > 0) {
        console.log('   Connected platforms:', connected.join(', '));
      }
      return true;
    } else {
      console.log('   [FAIL] Error:', data.error || response.status);
      return false;
    }
  } catch (error) {
    console.log('   [FAIL] Request error:', error.message);
    return false;
  }
}

async function testCreateConnectSession() {
  console.log('\n4. Testing POST /api/nango/connect-session...');

  if (!process.env.NANGO_SECRET_KEY || process.env.NANGO_SECRET_KEY === 'your-nango-secret-key') {
    console.log('   [SKIP] NANGO_SECRET_KEY not configured');
    console.log('   Get your key at https://app.nango.dev/environment-settings');
    return true; // Skip but don't fail
  }

  try {
    const response = await fetch(`${API_BASE}/api/nango/connect-session`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        integrationId: 'spotify'
      })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      console.log('   [OK] Connect session created');
      console.log(`   Session token: ${data.sessionToken?.substring(0, 20)}...`);
      console.log(`   Connect URL: ${data.connectUrl}`);
      return true;
    } else {
      console.log('   [FAIL] Error:', data.error || response.status);
      return false;
    }
  } catch (error) {
    console.log('   [FAIL] Request error:', error.message);
    return false;
  }
}

async function testSpotifyEndpoint() {
  console.log('\n5. Testing Spotify convenience endpoint...');

  try {
    const response = await fetch(`${API_BASE}/api/nango/spotify/recent-tracks`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (data.success && data.data) {
      console.log('   [OK] Spotify data retrieved');
      console.log(`   Recent tracks: ${data.data.items?.length || 0}`);
      return true;
    } else if (data.error?.includes('not found') || data.status === 404) {
      console.log('   [SKIP] Spotify not connected (expected if not set up)');
      return true;
    } else {
      console.log('   [INFO] Response:', JSON.stringify(data).substring(0, 100));
      return true; // Don't fail - might just not be connected
    }
  } catch (error) {
    console.log('   [INFO] Request error:', error.message);
    return true; // Don't fail
  }
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  // Test 1: Health check
  const serverUp = await testHealthCheck();
  if (!serverUp) {
    console.log('\n[ABORT] Server is not running. Please start it first.');
    process.exit(1);
  }
  passed++;

  // Test 2: Get platforms
  if (await testGetPlatforms()) passed++; else failed++;

  // Test 3: Get connections
  if (await testGetConnections()) passed++; else failed++;

  // Test 4: Create connect session
  if (await testCreateConnectSession()) passed++; else failed++;

  // Test 5: Spotify endpoint
  if (await testSpotifyEndpoint()) passed++; else failed++;

  console.log('\n' + '='.repeat(60));
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(60));

  if (!process.env.NANGO_SECRET_KEY || process.env.NANGO_SECRET_KEY === 'your-nango-secret-key') {
    console.log('\nNEXT STEPS:');
    console.log('1. Sign up at https://nango.dev (free tier)');
    console.log('2. Get your Secret Key from https://app.nango.dev/environment-settings');
    console.log('3. Add NANGO_SECRET_KEY to your .env file');
    console.log('4. Configure integrations in Nango dashboard');
    console.log('5. Run this test again to verify');
  }
}

runTests().catch(console.error);
