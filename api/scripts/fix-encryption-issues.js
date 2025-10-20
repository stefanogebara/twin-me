/**
 * Script to fix token encryption issues
 * Marks platforms with decryption errors for re-authentication
 */

import { createClient } from '@supabase/supabase-js';
import { decryptToken } from '../services/encryption.js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixEncryptionIssues() {
  console.log('🔧 Fixing encryption issues for platforms...\n');

  try {
    // Get all platform connections
    const { data: connections, error: fetchError } = await supabase
      .from('platform_connections')
      .select('*')
      .not('access_token', 'is', null);

    if (fetchError) {
      console.error('❌ Error fetching connections:', fetchError);
      return;
    }

    console.log(`Found ${connections.length} connections to check\n`);

    const issuesFound = [];
    const fixedConnections = [];

    for (const connection of connections) {
      try {
        // Try to decrypt the token
        if (connection.access_token) {
          decryptToken(connection.access_token);
          console.log(`✅ ${connection.platform} - Token OK`);
        }
      } catch (error) {
        console.log(`❌ ${connection.platform} - Decryption failed: ${error.message}`);
        issuesFound.push(connection);

        // Mark connection as needing re-authentication
        const { error: updateError } = await supabase
          .from('platform_connections')
          .update({
            connected: false,
            last_sync_status: 'token_invalid',
            metadata: {
              ...connection.metadata,
              encryption_key_mismatch: true,
              marked_for_reauth_at: new Date().toISOString(),
              error_message: 'Token encryption key mismatch - please reconnect'
            }
          })
          .eq('id', connection.id);

        if (updateError) {
          console.error(`  Failed to update ${connection.platform}:`, updateError.message);
        } else {
          console.log(`  ✅ Marked ${connection.platform} for re-authentication`);
          fixedConnections.push(connection.platform);
        }
      }
    }

    console.log('\n📊 Summary:');
    console.log(`- Total connections checked: ${connections.length}`);
    console.log(`- Connections with issues: ${issuesFound.length}`);
    console.log(`- Connections marked for reauth: ${fixedConnections.length}`);

    if (fixedConnections.length > 0) {
      console.log('\n🔄 Platforms needing reconnection:', fixedConnections.join(', '));
      console.log('\n💡 Users will need to reconnect these platforms through the UI');
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the fix
fixEncryptionIssues().then(() => {
  console.log('\n🎯 Fix complete');
  process.exit(0);
});