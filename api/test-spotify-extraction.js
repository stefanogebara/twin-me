/**
 * Test Spotify Arctic Data Extraction
 * Manually trigger extraction to verify functionality and generate proper soul_data
 */

import { createClient } from '@supabase/supabase-js';
import { extractPlatformDataDirect } from './services/arcticDataExtraction.js';
import { decryptToken } from './services/encryption.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testSpotifyExtraction() {
  console.log('🧪 Testing Arctic Data Extraction for Spotify...\n');

  const userId = 'a483a979-cf85-481d-b65b-af396c2c513a';
  const platform = 'spotify';

  try {
    // 1. Fetch Spotify connection
    console.log(`📡 Fetching ${platform} connection for user ${userId}...`);
    const { data: connection, error } = await supabase
      .from('platform_connections')
      .select('access_token, refresh_token, connected_at, token_expires_at')
      .eq('user_id', userId)
      .eq('platform', platform)
      .single();

    if (error) {
      console.error('❌ Database error:', error);
      return;
    }

    if (!connection) {
      console.error(`❌ No ${platform} connection found for user`);
      return;
    }

    if (!connection.connected_at) {
      console.error(`❌ ${platform} is disconnected`);
      return;
    }

    if (!connection.access_token) {
      console.error(`❌ No access token found for ${platform}`);
      return;
    }

    console.log(`✅ Found ${platform} connection`);
    console.log(`   Connected: ${!!connection.connected_at}`);
    console.log(`   Token expires: ${connection.token_expires_at || 'No expiration'}`);

    // 2. Decrypt access token
    console.log(`\n🔓 Decrypting access token...`);
    const accessToken = decryptToken(connection.access_token);
    console.log(`✅ Token decrypted (length: ${accessToken.length})`);

    // 3. Run extraction
    console.log(`\n🚀 Starting data extraction for ${platform}...`);
    const result = await extractPlatformDataDirect(platform, userId, accessToken);

    console.log(`\n📊 Extraction Results:`);
    console.log(`   Success: ${result.success}`);
    console.log(`   Items extracted: ${result.extractedItems}`);
    console.log(`   Errors: ${result.errors.length > 0 ? result.errors.join(', ') : 'None'}`);

    if (result.success) {
      // 4. Verify data in soul_data table
      console.log(`\n🔍 Verifying data in soul_data table...`);
      const { data: soulData, error: soulError } = await supabase
        .from('soul_data')
        .select('id, data_type, jsonb_array_length(raw_data->\'items\') as item_count, created_at')
        .eq('user_id', userId)
        .eq('platform', platform)
        .order('created_at', { ascending: false });

      if (soulError) {
        console.error('❌ Error fetching soul_data:', soulError);
      } else {
        console.log(`✅ Found ${soulData.length} ${platform} data entries in soul_data:`);
        soulData.forEach(entry => {
          console.log(`   - ${entry.data_type}: ${entry.item_count} items (created: ${new Date(entry.created_at).toLocaleString()})`);
        });
      }

      // 5. Trigger soul signature re-analysis
      console.log(`\n🧠 Triggering soul signature analysis...`);
      const { analyzeSoulSignature } = await import('./services/soulSignatureAnalysis.js');
      const analysisResult = await analyzeSoulSignature(userId);

      console.log(`\n✅ Soul Signature Analysis Results:`);
      console.log(`   Success: ${analysisResult.success}`);
      console.log(`   Insights generated: ${analysisResult.insightsGenerated}`);
      console.log(`   Platforms analyzed: ${analysisResult.platforms.join(', ')}`);

      console.log(`\n✅ Test completed successfully!`);
    } else {
      console.log(`\n❌ Extraction failed`);
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error('   Stack trace:', error.stack);
  }
}

// Run the test
testSpotifyExtraction().then(() => {
  console.log('\n✅ Test script finished');
  process.exit(0);
}).catch(error => {
  console.error('\n❌ Unhandled error:', error);
  process.exit(1);
});
