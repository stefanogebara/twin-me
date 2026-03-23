#!/usr/bin/env node

/**
 * Platform Sync Script
 * Manually triggers data extraction for all connected platforms
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function syncPlatforms() {
  console.log('=== PLATFORM SYNC SCRIPT ===\n');

  // Get all connected platforms
  const { data: connections, error } = await supabase
    .from('platform_connections')
    .select('*')
    .eq('status', 'connected');

  if (error) {
    console.error('Error fetching connections:', error);
    return;
  }

  if (!connections || connections.length === 0) {
    console.log('No connected platforms found.');
    return;
  }

  console.log(`Found ${connections.length} connected platform(s):\n`);

  for (const conn of connections) {
    console.log(`\n--- Syncing ${conn.platform} for user ${conn.user_id.substring(0, 8)}... ---`);

    try {
      // Call the extraction API
      const response = await fetch(`http://localhost:3001/api/soul/trigger-extraction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: conn.user_id,
          platform: conn.platform
        })
      });

      const result = await response.json();

      if (result.success) {
        console.log(`✅ ${conn.platform}: Extraction triggered successfully`);
        if (result.itemsExtracted) {
          console.log(`   Items extracted: ${result.itemsExtracted}`);
        }
      } else {
        console.log(`❌ ${conn.platform}: ${result.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error(`❌ ${conn.platform}: Failed to trigger extraction - ${err.message}`);
    }
  }

  console.log('\n=== SYNC COMPLETE ===');
}

syncPlatforms().catch(console.error);
