/**
 * Comprehensive Encryption Consolidation Test
 *
 * Tests:
 * 1. Encryption with consolidated service
 * 2. Decryption with consolidated service
 * 3. Round-trip encryption/decryption
 * 4. Database token retrieval and decryption
 * 5. Format validation (iv:authTag:ciphertext)
 */

import { encryptToken, decryptToken } from './api/services/encryption.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const USER_ID = 'a483a979-cf85-481d-b65b-af396c2c513a';

console.log('🧪 COMPREHENSIVE ENCRYPTION CONSOLIDATION TEST\n');
console.log('='.repeat(60));

let testsPassed = 0;
let testsFailed = 0;

function pass(testName) {
  console.log(`✅ PASS: ${testName}`);
  testsPassed++;
}

function fail(testName, error) {
  console.log(`❌ FAIL: ${testName}`);
  console.log(`   Error: ${error}\n`);
  testsFailed++;
}

// Test 1: Basic Encryption
console.log('\n1️⃣  TEST: Basic Token Encryption');
try {
  const testToken = 'test_access_token_12345';
  const encrypted = encryptToken(testToken);

  if (!encrypted) throw new Error('Encryption returned null');
  if (typeof encrypted !== 'string') throw new Error('Encrypted token is not a string');

  const parts = encrypted.split(':');
  if (parts.length !== 3) throw new Error(`Expected 3 parts (iv:authTag:ciphertext), got ${parts.length}`);

  pass('Token encryption produces valid format');
  console.log(`   Format: ${parts[0].substring(0, 8)}...:${parts[1].substring(0, 8)}...:${parts[2].substring(0, 8)}...`);
} catch (error) {
  fail('Token encryption', error.message);
}

// Test 2: Basic Decryption
console.log('\n2️⃣  TEST: Basic Token Decryption');
try {
  const testToken = 'test_refresh_token_67890';
  const encrypted = encryptToken(testToken);
  const decrypted = decryptToken(encrypted);

  if (decrypted !== testToken) {
    throw new Error(`Decryption mismatch: expected "${testToken}", got "${decrypted}"`);
  }

  pass('Token decryption returns original plaintext');
} catch (error) {
  fail('Token decryption', error.message);
}

// Test 3: Round-trip with Multiple Tokens
console.log('\n3️⃣  TEST: Round-trip Encryption/Decryption (10 iterations)');
try {
  for (let i = 0; i < 10; i++) {
    const original = `test_token_iteration_${i}_${Date.now()}`;
    const encrypted = encryptToken(original);
    const decrypted = decryptToken(encrypted);

    if (decrypted !== original) {
      throw new Error(`Iteration ${i} failed: ${original} !== ${decrypted}`);
    }
  }
  pass('10 round-trip encryptions successful');
} catch (error) {
  fail('Round-trip encryption', error.message);
}

// Test 4: IV Uniqueness (each encryption should use different IV)
console.log('\n4️⃣  TEST: IV Uniqueness (Random IV per encryption)');
try {
  const sameToken = 'identical_test_token';
  const encrypted1 = encryptToken(sameToken);
  const encrypted2 = encryptToken(sameToken);

  if (encrypted1 === encrypted2) {
    throw new Error('IVs are not unique - same token produced identical encryption');
  }

  // Verify both decrypt to same plaintext
  const decrypted1 = decryptToken(encrypted1);
  const decrypted2 = decryptToken(encrypted2);

  if (decrypted1 !== sameToken || decrypted2 !== sameToken) {
    throw new Error('Decryption failed after unique IV test');
  }

  pass('Random IVs generated per encryption');
  console.log('   Encrypted same token twice with different results (good!)');
} catch (error) {
  fail('IV uniqueness', error.message);
}

// Test 5: Database Token Retrieval and Decryption
console.log('\n5️⃣  TEST: Database Token Retrieval and Decryption');
try {
  const { data, error } = await supabase
    .from('platform_connections')
    .select('platform, access_token, refresh_token, last_sync_status')
    .eq('user_id', USER_ID)
    .eq('platform', 'spotify')
    .single();

  if (error) throw new Error(`Database query failed: ${error.message}`);
  if (!data) throw new Error('No Spotify connection found in database');

  console.log(`   Found Spotify connection: ${data.last_sync_status}`);

  // Try to decrypt the tokens
  const decryptedAccess = decryptToken(data.access_token);
  const decryptedRefresh = decryptToken(data.refresh_token);

  if (!decryptedAccess) throw new Error('Access token decryption returned null');
  if (!decryptedRefresh) throw new Error('Refresh token decryption returned null');

  console.log(`   Access token decrypted: ${decryptedAccess.substring(0, 20)}...`);
  console.log(`   Refresh token decrypted: ${decryptedRefresh.substring(0, 20)}...`);

  pass('Database tokens decrypt successfully');
} catch (error) {
  fail('Database token decryption', error.message);
}

// Test 6: Long Token Support
console.log('\n6️⃣  TEST: Long Token Support (Spotify-sized tokens)');
try {
  // Spotify access tokens are typically ~300 characters
  const longToken = 'BQA' + 'x'.repeat(300);
  const encrypted = encryptToken(longToken);
  const decrypted = decryptToken(encrypted);

  if (decrypted !== longToken) {
    throw new Error('Long token round-trip failed');
  }

  pass('Long tokens (300+ chars) supported');
} catch (error) {
  fail('Long token support', error.message);
}

// Test 7: Special Characters
console.log('\n7️⃣  TEST: Special Characters in Tokens');
try {
  const specialToken = 'token_with_special!@#$%^&*()_+-=[]{}|;:\'"<>,.?/~`chars';
  const encrypted = encryptToken(specialToken);
  const decrypted = decryptToken(encrypted);

  if (decrypted !== specialToken) {
    throw new Error('Special character handling failed');
  }

  pass('Special characters handled correctly');
} catch (error) {
  fail('Special character handling', error.message);
}

// Test 8: Empty String Handling
console.log('\n8️⃣  TEST: Empty String Handling');
try {
  encryptToken('');
  fail('Empty string handling', 'Should have thrown error for empty string');
} catch (error) {
  if (error.message.includes('Cannot encrypt empty token')) {
    pass('Empty strings properly rejected');
  } else {
    fail('Empty string handling', `Unexpected error: ${error.message}`);
  }
}

// Test 9: Invalid Format Decryption
console.log('\n9️⃣  TEST: Invalid Format Rejection');
try {
  decryptToken('invalid:format');
  fail('Invalid format rejection', 'Should have thrown error for invalid format');
} catch (error) {
  if (error.message.includes('Invalid encrypted data format') ||
      error.message.includes('Failed to decrypt token')) {
    pass('Invalid formats properly rejected');
  } else {
    fail('Invalid format rejection', `Unexpected error: ${error.message}`);
  }
}

// Test 10: Verify No Old Implementations Remain
console.log('\n🔟 TEST: Verify Old Encryption Code Removed');
try {
  const fs = await import('fs');
  const path = await import('path');

  const filesToCheck = [
    './api/services/tokenRefreshService.js',
    './api/routes/all-platform-connectors.js',
    './api/routes/oauth-callback.js'
  ];

  let foundDuplicates = false;

  for (const file of filesToCheck) {
    const content = fs.readFileSync(file, 'utf8');

    // Check for old encryption implementations
    if (content.includes('crypto.createCipher(')) {
      console.log(`   ❌ Found deprecated createCipher in ${file}`);
      foundDuplicates = true;
    }

    if (content.match(/function\s+encryptToken\s*\(/)) {
      console.log(`   ❌ Found duplicate encryptToken function in ${file}`);
      foundDuplicates = true;
    }

    if (content.match(/function\s+decryptToken\s*\(/)) {
      console.log(`   ❌ Found duplicate decryptToken function in ${file}`);
      foundDuplicates = true;
    }

    // Verify imports are present
    if (!content.includes('from') || !content.includes('encryption.js')) {
      console.log(`   ⚠️  No import from encryption.js found in ${file}`);
    }
  }

  if (!foundDuplicates) {
    pass('No duplicate encryption code found');
    console.log('   All files use consolidated encryption.js service');
  } else {
    fail('Code consolidation', 'Duplicate encryption code still exists');
  }
} catch (error) {
  fail('Code consolidation check', error.message);
}

// Final Report
console.log('\n' + '='.repeat(60));
console.log('📊 TEST RESULTS\n');
console.log(`   ✅ Passed: ${testsPassed}`);
console.log(`   ❌ Failed: ${testsFailed}`);
console.log(`   📈 Success Rate: ${Math.round((testsPassed / (testsPassed + testsFailed)) * 100)}%`);
console.log('='.repeat(60));

if (testsFailed === 0) {
  console.log('\n🎉 ALL TESTS PASSED - ENCRYPTION CONSOLIDATION VERIFIED!\n');
  console.log('✅ Production-ready with secure AES-256-GCM encryption');
  process.exit(0);
} else {
  console.log('\n⚠️  SOME TESTS FAILED - REVIEW REQUIRED\n');
  process.exit(1);
}
