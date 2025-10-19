#!/usr/bin/env node

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

async function checkPlatforms() {
  console.log('Checking YouTube and Spotify connections...\n');

  const { data: connections, error } = await supabase
    .from('platform_connections')
    .select('*')
    .in('platform', ['spotify', 'youtube']);

  if (error) {
    console.error('Error:', error);
    return;
  }

  if (!connections || connections.length === 0) {
    console.log('No YouTube or Spotify connections found at all.');
    return;
  }

  console.log(`Found ${connections.length} connection(s):\n`);

  connections.forEach(conn => {
    console.log(`Platform: ${conn.platform}`);
    console.log(`  User ID: ${conn.user_id?.substring(0, 8)}...`);
    console.log(`  Connected: ${conn.connected}`);
    console.log(`  Token expires at: ${conn.token_expires_at || conn.expires_at || 'not set'}`);
    console.log(`  Last sync status: ${conn.last_sync_status}`);
    console.log(`  Metadata:`, conn.metadata);
    console.log('---');
  });
}

checkPlatforms().catch(console.error);