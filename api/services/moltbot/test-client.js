#!/usr/bin/env node
/**
 * Test MoltbotClient Integration
 *
 * Run: node api/services/moltbot/test-client.js
 */

// IMPORTANT: Load env BEFORE any other imports that depend on env vars
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env FIRST
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// Now import modules that depend on env vars
const { getMoltbotClient, removeMoltbotClient } = await import('./moltbotClient.js');

const TEST_USER_ID = 'test-user-integration';

console.log('MoltbotClient Integration Test');
console.log('================================');
console.log('');

async function runTests() {
  const client = getMoltbotClient(TEST_USER_ID);

  try {
    // Test 1: Connect
    console.log('Test 1: Connecting to gateway...');
    await client.connect();
    console.log('  PASS: Connected successfully');
    console.log(`  Server: ${client.getServerInfo()?.server?.host || 'unknown'}`);
    console.log(`  Protocol: v${client.getServerInfo()?.protocol || 'unknown'}`);
    console.log('');

    // Test 2: Get health status
    console.log('Test 2: Getting health status...');
    const health = await client.getHealth();
    console.log('  PASS: Health retrieved');
    console.log(`  Status: ${health?.ok ? 'Healthy' : 'Unhealthy'}`);
    console.log('');

    // Test 3: List cron jobs
    console.log('Test 3: Listing cron jobs...');
    const cronJobs = await client.listCronJobs();
    console.log('  PASS: Cron jobs retrieved');
    console.log(`  Count: ${Array.isArray(cronJobs) ? cronJobs.length : 'N/A'}`);
    console.log('');

    // Test 4: List sessions
    console.log('Test 4: Listing sessions...');
    const sessions = await client.listSessions();
    console.log('  PASS: Sessions retrieved');
    console.log(`  Count: ${Array.isArray(sessions) ? sessions.length : 'N/A'}`);
    console.log('');

    console.log('================================');
    console.log('All tests PASSED!');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('FAILED:', error.message);
    console.error('');
  } finally {
    // Cleanup
    removeMoltbotClient(TEST_USER_ID);
  }
}

runTests()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
