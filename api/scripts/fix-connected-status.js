#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../.env') });

// Initialize Supabase client with service role key
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function fixConnectedStatus() {
  console.log('🔧 Fixing connected status for YouTube and Spotify...\n');

  // First, let's see the current state
  const { data: before, error: beforeError } = await supabase
    .from('platform_connections')
    .select('platform, connected, token_expires_at, last_sync_status')
    .in('platform', ['spotify', 'youtube']);

  if (beforeError) {
    console.error('Error fetching before state:', beforeError);
    return;
  }

  console.log('Before update:');
  before?.forEach(conn => {
    console.log(`  ${conn.platform}: connected=${conn.connected}, expires=${conn.token_expires_at}, status=${conn.last_sync_status}`);
  });

  // Now update to set connected = true AND is_active = true
  const { data: updated, error: updateError } = await supabase
    .from('platform_connections')
    .update({
      connected: true,
      is_active: true,  // IMPORTANT: Must be active for API to return it
      token_expires_at: '2024-01-01T00:00:00Z',
      last_sync_status: 'encryption_key_mismatch'
    })
    .in('platform', ['spotify', 'youtube'])
    .select();

  if (updateError) {
    console.error('❌ Update error:', updateError);
    return;
  }

  console.log('\n✅ Update successful! Rows affected:', updated?.length || 0);

  // Verify the update
  const { data: after, error: afterError } = await supabase
    .from('platform_connections')
    .select('platform, connected, token_expires_at, last_sync_status')
    .in('platform', ['spotify', 'youtube']);

  if (afterError) {
    console.error('Error fetching after state:', afterError);
    return;
  }

  console.log('\nAfter update:');
  after?.forEach(conn => {
    console.log(`  ${conn.platform}: connected=${conn.connected}, expires=${conn.token_expires_at}, status=${conn.last_sync_status}`);
  });

  // Double check by fetching with the API pattern (without is_active filter)
  console.log('\n🔍 Testing API query pattern (no is_active filter):');
  const { data: apiCheck, error: apiError } = await supabase
    .from('platform_connections')
    .select('*')
    .eq('user_id', 'a483a979-cf85-481d-b65b-af396c2c513a');

  if (apiError) {
    console.error('API check error:', apiError);
    return;
  }

  console.log('API query found', apiCheck?.length || 0, 'active connections');
  apiCheck?.forEach(conn => {
    console.log(`  ${conn.platform}: connected=${conn.connected}`);
  });
}

fixConnectedStatus().catch(console.error);