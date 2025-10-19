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

const userId = 'a483a979-cf85-481d-b65b-af396c2c513a';
let previousState = {};
let checkCount = 0;

async function getCurrentState() {
  const { data, error } = await supabase
    .from('platform_connections')
    .select('id, platform, connected, is_active, token_expires_at, last_sync_status, updated_at')
    .in('platform', ['spotify', 'youtube'])
    .eq('user_id', userId);

  if (error) {
    console.error('Query error:', error);
    return null;
  }

  return data.reduce((acc, conn) => {
    acc[conn.platform] = conn;
    return acc;
  }, {});
}

async function detectChanges(current, previous) {
  const changes = [];

  for (const platform of ['spotify', 'youtube']) {
    const curr = current[platform];
    const prev = previous[platform];

    if (!curr || !prev) continue;

    const fieldsToCheck = ['connected', 'is_active', 'token_expires_at', 'last_sync_status'];

    for (const field of fieldsToCheck) {
      if (curr[field] !== prev[field]) {
        changes.push({
          platform,
          field,
          oldValue: prev[field],
          newValue: curr[field],
          updated_at: curr.updated_at
        });
      }
    }
  }

  return changes;
}

async function monitor() {
  console.log('🔍 Starting database monitoring for YouTube and Spotify...');
  console.log('Will check every 2 seconds for changes\n');

  // Get initial state
  previousState = await getCurrentState();
  if (!previousState) return;

  console.log('📊 Initial state:');
  Object.values(previousState).forEach(conn => {
    console.log(`  ${conn.platform}: connected=${conn.connected}, is_active=${conn.is_active}, status=${conn.last_sync_status}`);
  });
  console.log('\n👀 Monitoring for changes...\n');

  // Check every 2 seconds
  setInterval(async () => {
    checkCount++;

    const currentState = await getCurrentState();
    if (!currentState) return;

    const changes = await detectChanges(currentState, previousState);

    if (changes.length > 0) {
      console.log(`\n🚨 CHANGE DETECTED at check #${checkCount}!`);
      console.log('=====================================');

      changes.forEach(change => {
        console.log(`Platform: ${change.platform}`);
        console.log(`  Field: ${change.field}`);
        console.log(`  Old Value: ${change.oldValue}`);
        console.log(`  New Value: ${change.newValue}`);
        console.log(`  Changed At: ${change.updated_at}`);
        console.log('---');
      });

      console.log('\n📸 New state snapshot:');
      Object.values(currentState).forEach(conn => {
        console.log(`  ${conn.platform}: connected=${conn.connected}, is_active=${conn.is_active}`);
      });
      console.log('\n');
    }

    // Update previous state
    previousState = currentState;

    // Print a dot every 10 checks to show it's still running
    if (checkCount % 10 === 0) {
      process.stdout.write('.');
    }
  }, 2000);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Stopping monitor...');
  console.log(`Total checks performed: ${checkCount}`);
  process.exit(0);
});

monitor().catch(console.error);