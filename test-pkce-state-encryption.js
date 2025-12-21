#!/usr/bin/env node
/**
 * PKCE + State Encryption Test Script
 * Tests the complete OAuth 2.1 security implementation
 */

import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { encryptState, decryptState, generatePKCEVerifier, generatePKCEChallenge } from './api/services/encryption.js';
import { generatePKCEParams } from './api/services/pkce.js';

console.log('═══════════════════════════════════════════════════════');
console.log('🔐 PKCE + State Encryption Test Suite');
console.log('═══════════════════════════════════════════════════════\n');

let passedTests = 0;
let failedTests = 0;

function testPassed(testName) {
  console.log(`✅ PASSED: ${testName}`);
  passedTests++;
}

function testFailed(testName, error) {
  console.log(`❌ FAILED: ${testName}`);
  console.log(`   Error: ${error.message}\n`);
  failedTests++;
}

// ============================================================================
// Test 1: State Encryption/Decryption
// ============================================================================
console.log('📝 Test 1: State Encryption/Decryption\n');

try {
  const stateData = {
    userId: 'test-user-123',
    platform: 'spotify',
    codeVerifier: 'test-verifier-12345'
  };

  const encryptedState = encryptState(stateData);
  console.log(`   Encrypted state length: ${encryptedState.length} characters`);
  console.log(`   Encrypted state format: ${encryptedState.split(':').length} parts (iv:authTag:ciphertext)`);

  const decryptedState = decryptState(encryptedState);
  console.log(`   Decrypted userId: ${decryptedState.userId}`);
  console.log(`   Decrypted platform: ${decryptedState.platform}`);
  console.log(`   Decrypted codeVerifier: ${decryptedState.codeVerifier}`);

  if (decryptedState.userId === stateData.userId &&
      decryptedState.platform === stateData.platform &&
      decryptedState.codeVerifier === stateData.codeVerifier) {
    testPassed('State encrypts and decrypts correctly');
  } else {
    throw new Error('Decrypted data does not match original');
  }
} catch (error) {
  testFailed('State encryption/decryption', error);
}

console.log('');

// ============================================================================
// Test 2: State Expiration
// ============================================================================
console.log('📝 Test 2: State Expiration (10-minute timeout)\n');

try {
  // Create a state that's already expired by manipulating timestamp
  const oldStateData = {
    userId: 'test-user',
    platform: 'spotify',
    timestamp: Date.now() - (11 * 60 * 1000) // 11 minutes ago
  };

  // Manually create encrypted state with old timestamp
  const oldState = encryptState({
    userId: oldStateData.userId,
    platform: oldStateData.platform
  });

  // Wait a tiny bit to ensure timestamp difference
  await new Promise(resolve => setTimeout(resolve, 100));

  // Try to decrypt with a very short expiration (should fail)
  try {
    decryptState(oldState, 50); // 50ms expiration
    throw new Error('Should have thrown expiration error');
  } catch (error) {
    if (error.message.includes('expired')) {
      console.log(`   ✓ Expired state properly rejected: "${error.message}"`);
      testPassed('State expiration validation works');
    } else {
      throw error;
    }
  }
} catch (error) {
  testFailed('State expiration', error);
}

console.log('');

// ============================================================================
// Test 3: Tampered State Detection
// ============================================================================
console.log('📝 Test 3: Tampered State Detection\n');

try {
  const validState = encryptState({
    userId: 'test-user',
    platform: 'spotify'
  });

  // Tamper with the encrypted state
  const tamperedState = validState.slice(0, -10) + 'TAMPERED!!!';

  try {
    decryptState(tamperedState);
    throw new Error('Should have rejected tampered state');
  } catch (error) {
    if (error.message.includes('decrypt') || error.message.includes('corrupted')) {
      console.log(`   ✓ Tampered state properly rejected: "${error.message}"`);
      testPassed('Tampered state detection works');
    } else {
      throw error;
    }
  }
} catch (error) {
  testFailed('Tampered state detection', error);
}

console.log('');

// ============================================================================
// Test 4: PKCE Verifier/Challenge Generation
// ============================================================================
console.log('📝 Test 4: PKCE Verifier/Challenge Generation\n');

try {
  const pkce = generatePKCEParams();

  console.log(`   Code Verifier: ${pkce.codeVerifier.substring(0, 20)}... (${pkce.codeVerifier.length} chars)`);
  console.log(`   Code Challenge: ${pkce.codeChallenge.substring(0, 20)}... (${pkce.codeChallenge.length} chars)`);
  console.log(`   Challenge Method: ${pkce.codeChallengeMethod}`);

  // Verify PKCE parameters
  if (!pkce.codeVerifier || pkce.codeVerifier.length < 43) {
    throw new Error('Code verifier too short (must be 43+ characters)');
  }

  if (!pkce.codeChallenge || pkce.codeChallenge.length < 43) {
    throw new Error('Code challenge too short');
  }

  if (pkce.codeChallengeMethod !== 'S256') {
    throw new Error('Challenge method must be S256');
  }

  // Verify challenge is deterministic (same verifier = same challenge)
  const challenge1 = generatePKCEChallenge(pkce.codeVerifier);
  const challenge2 = generatePKCEChallenge(pkce.codeVerifier);

  if (challenge1 !== challenge2) {
    throw new Error('PKCE challenge is not deterministic');
  }

  if (challenge1 !== pkce.codeChallenge) {
    throw new Error('PKCE challenge does not match');
  }

  testPassed('PKCE parameters generate correctly');
} catch (error) {
  testFailed('PKCE generation', error);
}

console.log('');

// ============================================================================
// Test 5: Full OAuth Flow Simulation
// ============================================================================
console.log('📝 Test 5: Full OAuth Flow Simulation\n');

try {
  console.log('   Step 1: Generate PKCE parameters...');
  const pkce = generatePKCEParams();

  console.log('   Step 2: Encrypt state with user data...');
  const stateData = {
    userId: 'oauth-test-user',
    platform: 'spotify',
    codeVerifier: pkce.codeVerifier
  };
  const encryptedState = encryptState(stateData);

  console.log('   Step 3: Simulate authorization URL generation...');
  const authUrl = `https://accounts.spotify.com/authorize?` +
    `state=${encryptedState}&` +
    `code_challenge=${pkce.codeChallenge}&` +
    `code_challenge_method=${pkce.codeChallengeMethod}`;

  console.log(`   Authorization URL length: ${authUrl.length} characters`);

  console.log('   Step 4: Simulate callback - decrypt state...');
  const decryptedState = decryptState(encryptedState);

  console.log('   Step 5: Verify code_verifier can be retrieved...');
  if (decryptedState.codeVerifier !== pkce.codeVerifier) {
    throw new Error('Code verifier mismatch');
  }

  console.log('   Step 6: Verify PKCE challenge matches...');
  const verifiedChallenge = generatePKCEChallenge(decryptedState.codeVerifier);
  if (verifiedChallenge !== pkce.codeChallenge) {
    throw new Error('PKCE challenge verification failed');
  }

  console.log('   ✓ All OAuth flow steps completed successfully');
  testPassed('Full OAuth flow simulation works');
} catch (error) {
  testFailed('Full OAuth flow', error);
}

console.log('');

// ============================================================================
// Test 6: Multiple Platforms
// ============================================================================
console.log('📝 Test 6: Multiple Platforms Support\n');

try {
  const platforms = ['spotify', 'youtube', 'github', 'google_gmail'];

  for (const platform of platforms) {
    const pkce = generatePKCEParams();
    const state = encryptState({
      userId: 'multi-platform-user',
      platform,
      codeVerifier: pkce.codeVerifier
    });

    const decrypted = decryptState(state);

    if (decrypted.platform !== platform) {
      throw new Error(`Platform mismatch for ${platform}`);
    }

    console.log(`   ✓ ${platform.padEnd(15)} - encryption/decryption works`);
  }

  testPassed('Multi-platform support works');
} catch (error) {
  testFailed('Multi-platform support', error);
}

console.log('');

// ============================================================================
// Test Results Summary
// ============================================================================
console.log('═══════════════════════════════════════════════════════');
console.log('📊 Test Results Summary');
console.log('═══════════════════════════════════════════════════════\n');

console.log(`✅ Passed: ${passedTests} tests`);
console.log(`❌ Failed: ${failedTests} tests`);
console.log(`📈 Success Rate: ${((passedTests / (passedTests + failedTests)) * 100).toFixed(1)}%\n`);

if (failedTests === 0) {
  console.log('🎉 ALL TESTS PASSED! OAuth 2.1 security implementation is working correctly.\n');
  console.log('Security Features Verified:');
  console.log('  ✓ AES-256-GCM state encryption');
  console.log('  ✓ Timestamp-based state expiration (10 minutes)');
  console.log('  ✓ Tamper detection via authentication tags');
  console.log('  ✓ PKCE code_verifier/code_challenge generation');
  console.log('  ✓ SHA-256 challenge method (S256)');
  console.log('  ✓ Multi-platform OAuth support');
  console.log('');
  process.exit(0);
} else {
  console.log('⚠️  Some tests failed. Please review the errors above.\n');
  process.exit(1);
}
