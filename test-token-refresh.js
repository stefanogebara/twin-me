/**
 * Test Token Refresh After Encryption Consolidation
 *
 * This script:
 * 1. Creates a test access token and refresh token
 * 2. Encrypts them using the consolidated encryption service
 * 3. Inserts into database with 5-minute expiry
 * 4. Monitors the automatic refresh service
 */

import { encryptToken } from './api/services/encryption.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const USER_ID = 'a483a979-cf85-481d-b65b-af396c2c513a'; // Stefano's user ID
const PLATFORM = 'spotify';

async function testTokenRefresh() {
  console.log('🧪 Testing Token Refresh with Consolidated Encryption\n');

  // Step 1: Create test tokens
  const testAccessToken = `test_access_token_${Date.now()}`;
  const testRefreshToken = `test_refresh_token_${Date.now()}`;

  console.log('1️⃣  Created test tokens:');
  console.log(`   Access Token: ${testAccessToken.substring(0, 30)}...`);
  console.log(`   Refresh Token: ${testRefreshToken.substring(0, 30)}...\n`);

  // Step 2: Encrypt using consolidated service
  let encryptedAccessToken, encryptedRefreshToken;

  try {
    encryptedAccessToken = encryptToken(testAccessToken);
    encryptedRefreshToken = encryptToken(testRefreshToken);
    console.log('2️⃣  ✅ Tokens encrypted successfully using consolidated encryption.js');
    console.log(`   Encrypted format: iv:authTag:ciphertext`);
    console.log(`   Example: ${encryptedAccessToken.substring(0, 50)}...\n`);
  } catch (error) {
    console.error('❌ Encryption failed:', error.message);
    process.exit(1);
  }

  // Step 3: Set expiry to 5 minutes from now
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
  console.log(`3️⃣  Setting token expiry: ${expiresAt.toISOString()}`);
  console.log(`   (5 minutes from now)\n`);

  // Step 4: Update database
  const { data, error } = await supabase
    .from('platform_connections')
    .update({
      access_token: encryptedAccessToken,
      refresh_token: encryptedRefreshToken,
      token_expires_at: expiresAt.toISOString(),
      status: 'connected',
      last_sync_status: 'test_token_inserted',
      updated_at: new Date().toISOString()
    })
    .eq('user_id', USER_ID)
    .eq('platform', PLATFORM)
    .select();

  if (error) {
    console.error('❌ Database update failed:', error);
    process.exit(1);
  }

  console.log('4️⃣  ✅ Test token inserted into database');
  console.log(`   Platform: ${PLATFORM}`);
  console.log(`   User: ${USER_ID}`);
  console.log(`   Status: connected`);
  console.log(`   Expires: ${expiresAt.toISOString()}\n`);

  // Step 5: Instructions for monitoring
  console.log('5️⃣  MONITORING INSTRUCTIONS:\n');
  console.log('   The token refresh service runs every 5 minutes and checks for tokens');
  console.log('   expiring in the next 10 minutes.\n');
  console.log('   Watch the server logs for:');
  console.log('   ✅ "🔍 Checking for expiring tokens..."');
  console.log('   ✅ "⚠️  Found X tokens expiring soon"');
  console.log('   ✅ Successful decryption (no "Token decryption error")');
  console.log('   ✅ "✅ Updated tokens for spotify"\n');

  console.log('   If encryption consolidation works:');
  console.log('   ✅ Token will decrypt successfully');
  console.log('   ✅ Refresh service will attempt to refresh (will fail since test token is fake)');
  console.log('   ✅ No "Unsupported state or unable to authenticate data" errors\n');

  console.log('   If encryption consolidation is broken:');
  console.log('   ❌ "Token decryption error: Unsupported state or unable to authenticate data"');
  console.log('   ❌ "Could not decrypt refresh token"\n');

  console.log('🎯 Test setup complete! Monitor your server logs in the next 5 minutes.');
}

testTokenRefresh().catch(console.error);
