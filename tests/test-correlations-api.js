/**
 * Test script for Correlations API
 *
 * Tests the cross-platform correlation detection engine
 *
 * Usage:
 *   1. Start the server: npm run server:dev
 *   2. Run: node tests/test-correlations-api.js
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
console.log('CORRELATION ENGINE API TESTS');
console.log('='.repeat(60));
console.log(`API Base: ${API_BASE}`);
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

async function testGetStats() {
  console.log('\n2. Testing GET /api/correlations/stats...');
  try {
    const response = await fetch(`${API_BASE}/api/correlations/stats`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (response.ok && data.success) {
      console.log('   [OK] Stats retrieved successfully');
      console.log('   Stats:', JSON.stringify(data.stats, null, 2));
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

async function testGetCorrelations() {
  console.log('\n3. Testing GET /api/correlations...');
  try {
    const response = await fetch(`${API_BASE}/api/correlations?limit=10`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (response.ok && data.success) {
      console.log('   [OK] Correlations retrieved successfully');
      console.log('   Count:', data.count);
      if (data.correlations && data.correlations.length > 0) {
        console.log('   Sample correlation:', JSON.stringify(data.correlations[0], null, 2));
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

async function testAnalyze(dryRun = true) {
  console.log(`\n4. Testing POST /api/correlations/analyze (dryRun=${dryRun})...`);
  try {
    const response = await fetch(`${API_BASE}/api/correlations/analyze`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        days: 30,
        dryRun: dryRun
      })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      console.log('   [OK] Analysis completed successfully');
      console.log('   Message:', data.message);
      if (data.correlations) {
        console.log('   Correlations found:', data.correlations.length);
      }
      if (data.summary) {
        console.log('   Summary:', JSON.stringify(data.summary, null, 2));
      }
      return true;
    } else {
      console.log('   [FAIL] Error:', data.error || response.status);
      console.log('   Response:', JSON.stringify(data, null, 2));
      return false;
    }
  } catch (error) {
    console.log('   [FAIL] Request error:', error.message);
    return false;
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

  // Test 2: Get stats
  if (await testGetStats()) passed++; else failed++;

  // Test 3: Get correlations
  if (await testGetCorrelations()) passed++; else failed++;

  // Test 4: Analyze (dry run first)
  if (await testAnalyze(true)) passed++; else failed++;

  // Test 5: Real analysis (only if dry run passed)
  console.log('\n5. Running REAL analysis (not dry run)...');
  if (await testAnalyze(false)) passed++; else failed++;

  // Final stats after real analysis
  console.log('\n6. Final stats after analysis:');
  await testGetStats();

  console.log('\n' + '='.repeat(60));
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(60));
}

runTests().catch(console.error);
