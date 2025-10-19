#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function testConnections() {
  const userId = 'a483a979-cf85-481d-b65b-af396c2c513a';

  console.log('Testing database query exactly as API does...\n');

  // Query exactly as the API does
  const { data: connections, error } = await supabase
    .from('platform_connections')
    .select('platform, connected, token_expires_at, expires_at, metadata, last_sync, last_sync_status')
    .eq('user_id', userId);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Total connections found: ${connections?.length || 0}\n`);

  // Show all connections
  connections?.forEach(conn => {
    console.log(`Platform: ${conn.platform}`);
    console.log(`  connected: ${conn.connected}`);
    console.log(`  token_expires_at: ${conn.token_expires_at}`);
    console.log(`  expires_at: ${conn.expires_at}`);
    console.log(`  last_sync_status: ${conn.last_sync_status}`);
    console.log('---');
  });

  // Check specifically for YouTube and Spotify
  const youtube = connections?.find(c => c.platform === 'youtube');
  const spotify = connections?.find(c => c.platform === 'spotify');

  console.log('\n🔍 Specific checks:');
  console.log('YouTube found:', youtube ? 'YES' : 'NO');
  console.log('Spotify found:', spotify ? 'YES' : 'NO');

  if (!youtube || !spotify) {
    console.log('\n⚠️ PROBLEM: YouTube or Spotify not returned from database query!');
    console.log('This might be due to filtering conditions in the database or RLS policies.');
  }
}

testConnections().catch(console.error);