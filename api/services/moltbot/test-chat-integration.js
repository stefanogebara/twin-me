#!/usr/bin/env node
/**
 * Test OpenClaw Chat Integration
 *
 * Tests:
 * 1. OpenClaw availability check
 * 2. Direct Claude API fallback
 * 3. Chat response handling
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env FIRST
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// Dynamic imports after env loaded
const { getMoltbotClient, removeMoltbotClient } = await import('./moltbotClient.js');

const TEST_USER_ID = 'test-chat-integration';

console.log('OpenClaw Chat Integration Test');
console.log('===============================\n');

async function testOpenClawAvailability() {
  console.log('Test 1: Checking OpenClaw availability...');

  try {
    const client = getMoltbotClient('health-check');
    await client.connect();
    const health = await client.getHealth();

    if (health?.ok) {
      console.log('  ✅ OpenClaw gateway is AVAILABLE');
      console.log(`  Server: ${client.getServerInfo()?.server?.host || 'unknown'}`);
      return true;
    } else {
      console.log('  ⚠️ OpenClaw gateway responded but not healthy');
      return false;
    }
  } catch (error) {
    console.log('  ❌ OpenClaw gateway NOT available');
    console.log(`  Reason: ${error.message}`);
    return false;
  } finally {
    removeMoltbotClient('health-check');
  }
}

async function testChatViaOpenClaw() {
  console.log('\nTest 2: Testing chat via OpenClaw...');

  try {
    const client = getMoltbotClient(TEST_USER_ID);
    await client.connect();

    const response = await client.chatSend('Hello! Can you confirm you are working?', {
      sessionKey: `test_session_${Date.now()}`,
      maxTokens: 100
    });

    console.log('  ✅ OpenClaw chat response received');
    console.log(`  Response type: ${typeof response}`);

    // Extract text from response
    let text = '';
    if (typeof response === 'string') {
      text = response;
    } else if (response?.content) {
      text = Array.isArray(response.content)
        ? response.content[0]?.text || JSON.stringify(response.content[0])
        : response.content;
    } else if (response?.message) {
      text = response.message;
    } else {
      text = JSON.stringify(response);
    }

    console.log(`  Response preview: "${text.substring(0, 100)}..."`);
    return true;
  } catch (error) {
    console.log('  ❌ OpenClaw chat failed');
    console.log(`  Error: ${error.message}`);
    return false;
  } finally {
    removeMoltbotClient(TEST_USER_ID);
  }
}

async function testDirectClaude() {
  console.log('\nTest 3: Testing direct Claude API (fallback)...');

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'Say "Direct Claude API working!" in 5 words or less.' }]
    });

    const text = response.content[0]?.text || '';
    console.log('  ✅ Direct Claude API working');
    console.log(`  Response: "${text}"`);
    return true;
  } catch (error) {
    console.log('  ❌ Direct Claude API failed');
    console.log(`  Error: ${error.message}`);
    return false;
  }
}

async function runTests() {
  const results = {
    openClawAvailable: false,
    openClawChat: false,
    directClaude: false
  };

  // Test 1: OpenClaw availability
  results.openClawAvailable = await testOpenClawAvailability();

  // Test 2: OpenClaw chat (only if available)
  if (results.openClawAvailable) {
    results.openClawChat = await testChatViaOpenClaw();
  } else {
    console.log('\nTest 2: Skipped (OpenClaw not available)');
  }

  // Test 3: Direct Claude API
  results.directClaude = await testDirectClaude();

  // Summary
  console.log('\n===============================');
  console.log('Summary:');
  console.log(`  OpenClaw Available: ${results.openClawAvailable ? '✅' : '❌'}`);
  console.log(`  OpenClaw Chat: ${results.openClawChat ? '✅' : '⏭️ skipped'}`);
  console.log(`  Direct Claude: ${results.directClaude ? '✅' : '❌'}`);

  if (results.directClaude) {
    console.log('\n✅ Chat system operational (fallback working)');
  } else {
    console.log('\n❌ Chat system has issues');
  }
}

runTests()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
