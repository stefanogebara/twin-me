#!/usr/bin/env node

/**
 * Force Re-authentication Script for YouTube and Spotify
 *
 * Purpose: Mark YouTube and Spotify connections as requiring re-authentication
 * due to encryption key mismatch from previous implementation.
 *
 * This implements Option A from Priority 3: Clean, simple solution that
 * prompts users to reconnect with the current encryption key.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../.env') });

// Initialize Supabase client with service role key for admin access
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// Platforms affected by encryption key mismatch
const AFFECTED_PLATFORMS = ['spotify', 'youtube'];

/**
 * Mark platforms as requiring re-authentication
 */
async function forceReauthentication() {
  console.log('🔄 Starting force re-authentication process...\n');
  console.log('Affected platforms:', AFFECTED_PLATFORMS.join(', '));
  console.log('Reason: Encryption key mismatch from previous implementation\n');
  console.log('─'.repeat(60));

  try {
    // Get all affected platform connections (including disconnected ones)
    // We need to handle both connected=true and connected=false cases
    const { data: connections, error: fetchError } = await supabase
      .from('platform_connections')
      .select('id, user_id, platform, metadata, connected, token_expires_at, last_sync_status')
      .in('platform', AFFECTED_PLATFORMS);

    if (fetchError) {
      console.error('❌ Error fetching connections:', fetchError);
      return;
    }

    if (!connections || connections.length === 0) {
      console.log('ℹ️  No active YouTube or Spotify connections found.');
      console.log('   Users who connect these platforms going forward will use the correct encryption key.');
      return;
    }

    console.log(`📊 Found ${connections.length} connection(s) to update:\n`);

    // Group by platform for summary
    const platformCounts = {};
    connections.forEach(conn => {
      platformCounts[conn.platform] = (platformCounts[conn.platform] || 0) + 1;
    });

    Object.entries(platformCounts).forEach(([platform, count]) => {
      console.log(`   • ${platform}: ${count} connection(s)`);
    });
    console.log('');

    // Update each connection
    let successCount = 0;
    let errorCount = 0;

    for (const connection of connections) {
      try {
        // Prepare metadata update
        const metadata = connection.metadata || {};
        metadata.encryption_key_mismatch = true;
        metadata.requires_reauth = true;
        metadata.reauth_reason = 'Encryption key changed - tokens cannot be decrypted';
        metadata.marked_for_reauth_at = new Date().toISOString();

        // Update the connection to mark it as requiring re-authentication
        const { error: updateError } = await supabase
          .from('platform_connections')
          .update({
            // Set connected to true so it shows in UI
            connected: true,

            // Set token expiry to past date to trigger reconnect UI
            token_expires_at: new Date('2024-01-01').toISOString(),

            // Update metadata with details
            metadata: metadata,

            // Set last sync status to indicate issue
            last_sync_status: 'encryption_key_mismatch',

            // Note: We set connected = true so the connection shows in UI
            // but the past token_expires_at will make it show as "Token Expired"
          })
          .eq('id', connection.id);

        if (updateError) {
          console.error(`   ❌ Failed to update ${connection.platform} for user ${connection.user_id.substring(0, 8)}...`);
          console.error(`      Error: ${updateError.message}`);
          errorCount++;
        } else {
          console.log(`   ✅ Marked ${connection.platform} for re-auth (user: ${connection.user_id.substring(0, 8)}...)`);
          successCount++;
        }
      } catch (error) {
        console.error(`   ❌ Unexpected error updating connection ${connection.id}:`, error);
        errorCount++;
      }
    }

    console.log('\n' + '─'.repeat(60));
    console.log('📈 Update Summary:');
    console.log(`   ✅ Successfully updated: ${successCount} connection(s)`);
    if (errorCount > 0) {
      console.log(`   ❌ Failed to update: ${errorCount} connection(s)`);
    }

    // Provide instructions for users
    console.log('\n📝 Next Steps for Users:');
    console.log('   1. Users will see a red "Token Expired" badge on affected platforms');
    console.log('   2. They can click "Reconnect" to initiate fresh OAuth flow');
    console.log('   3. New tokens will be encrypted with the current key');
    console.log('   4. Data extraction will work normally after reconnection');

    // Technical details
    console.log('\n🔧 Technical Details:');
    console.log('   • Old tokens remain in database but cannot be decrypted');
    console.log('   • token_expired flag triggers reconnect UI');
    console.log('   • metadata.encryption_key_mismatch documents the issue');
    console.log('   • After reconnection, new tokens use current ENCRYPTION_KEY');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Add verification step
async function verifyUpdate() {
  console.log('\n' + '═'.repeat(60));
  console.log('🔍 Verification Check:');

  const { data: flaggedConnections, error } = await supabase
    .from('platform_connections')
    .select('platform, token_expires_at, last_sync_status, connected')
    .in('platform', AFFECTED_PLATFORMS)
    .eq('last_sync_status', 'encryption_key_mismatch')
    .eq('connected', true);

  if (error) {
    console.error('❌ Could not verify update:', error);
    return;
  }

  if (flaggedConnections && flaggedConnections.length > 0) {
    console.log(`✅ Successfully flagged ${flaggedConnections.length} connection(s) for re-authentication`);

    const platformSummary = {};
    flaggedConnections.forEach(conn => {
      platformSummary[conn.platform] = (platformSummary[conn.platform] || 0) + 1;
    });

    console.log('\n   Platform breakdown:');
    Object.entries(platformSummary).forEach(([platform, count]) => {
      console.log(`   • ${platform}: ${count} flagged for re-auth`);
    });
  } else {
    console.log('ℹ️  No connections currently flagged (they may have already been reconnected)');
  }
}

// Main execution
async function main() {
  console.log('═'.repeat(60));
  console.log('🚀 Force Re-authentication Script (Priority 3 - Option A)');
  console.log('═'.repeat(60));
  console.log('');

  await forceReauthentication();
  await verifyUpdate();

  console.log('\n' + '═'.repeat(60));
  console.log('✨ Script execution complete!');
  console.log('═'.repeat(60));
  process.exit(0);
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});