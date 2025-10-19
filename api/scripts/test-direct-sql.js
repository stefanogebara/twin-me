#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../.env') });

// Use SERVICE ROLE key to bypass RLS
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testDirectSQL() {
  console.log('Testing with direct SQL to bypass any RLS policies...\n');

  // Update YouTube and Spotify directly
  const { data: updateResult, error: updateError } = await supabase
    .from('platform_connections')
    .update({
      connected: true,
      token_expires_at: '2024-01-01T00:00:00Z',
      last_sync_status: 'encryption_key_mismatch'
    })
    .in('platform', ['spotify', 'youtube'])
    .eq('user_id', 'a483a979-cf85-481d-b65b-af396c2c513a')
    .select();

  if (updateError) {
    console.error('Update error:', updateError);
    return;
  }

  console.log('✅ Updated rows:', updateResult?.length);

  // Now query them immediately
  const { data: connections, error } = await supabase
    .from('platform_connections')
    .select('*')
    .in('platform', ['spotify', 'youtube'])
    .eq('user_id', 'a483a979-cf85-481d-b65b-af396c2c513a');

  if (error) {
    console.error('Query error:', error);
    return;
  }

  console.log('\n🔍 Current state in database:');
  connections?.forEach(conn => {
    console.log(`${conn.platform}: connected=${conn.connected}, expires=${conn.token_expires_at}`);
  });

  // Test with RPC call to see if there's a database function involved
  console.log('\n📊 Checking for database triggers or functions...');

  const { data: triggers, error: triggerError } = await supabase.rpc('get_triggers', {
    table_name: 'platform_connections'
  }).single();

  if (!triggerError && triggers) {
    console.log('Found triggers:', triggers);
  }
}

testDirectSQL().catch(console.error);