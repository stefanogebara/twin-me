#!/usr/bin/env node
/**
 * Test Extraction Agent
 *
 * Tests the Spotify extraction agent directly
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env FIRST
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// Get a real user ID from the database
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('Extraction Agent Test');
console.log('=====================\n');

async function getTestUser() {
  // Find a user with Spotify connected
  const { data, error } = await supabase
    .from('platform_connections')
    .select('user_id, platform, status')
    .eq('platform', 'spotify')
    .eq('status', 'connected')
    .limit(1)
    .single();

  if (error || !data) {
    console.log('No users with Spotify connected found');
    return null;
  }

  console.log(`Found user with Spotify: ${data.user_id}`);
  return data.user_id;
}

async function testSpotifyExtraction(userId) {
  console.log('\nTest: Spotify Extraction Agent');
  console.log('--------------------------------');

  try {
    const { getExtractionAgent } = await import('./extractionAgents.js');
    const agent = getExtractionAgent(userId, 'spotify');

    console.log('Starting extraction...');
    const result = await agent.extract();

    console.log('\n✅ Extraction completed!');
    console.log(`  Currently playing: ${result.currentlyPlaying ? result.currentlyPlaying.track_name : 'Nothing'}`);
    console.log(`  Recent tracks: ${result.recentlyPlayed?.length || 0}`);
    console.log(`  Audio features: ${result.audioFeatures?.length || 0}`);

    if (result.recentlyPlayed?.length > 0) {
      console.log('\n  Recent tracks:');
      result.recentlyPlayed.slice(0, 3).forEach(t => {
        console.log(`    - "${t.track_name}" by ${t.artist_name}`);
      });
    }

    return true;
  } catch (error) {
    console.log(`\n❌ Extraction failed: ${error.message}`);
    return false;
  }
}

async function testSchedulerStatus(userId) {
  console.log('\nTest: Scheduler Status');
  console.log('----------------------');

  try {
    const { getAgentScheduler } = await import('./agentScheduler.js');
    const scheduler = getAgentScheduler(userId);

    const status = await scheduler.getStatus();
    console.log(`\n✅ Scheduler status retrieved`);
    console.log(`  Total jobs: ${status.totalJobs}`);
    console.log(`  Enabled jobs: ${status.enabledJobs}`);

    if (Object.keys(status.platforms).length > 0) {
      console.log('  Platforms:');
      Object.entries(status.platforms).forEach(([platform, info]) => {
        console.log(`    - ${platform}: ${info.enabled ? 'enabled' : 'disabled'} (${info.schedule})`);
      });
    }

    return true;
  } catch (error) {
    console.log(`\n❌ Scheduler status failed: ${error.message}`);
    return false;
  }
}

async function runTests() {
  const userId = await getTestUser();

  if (!userId) {
    console.log('\n⚠️ No test user available. Connect Spotify to test extraction.');
    return;
  }

  await testSpotifyExtraction(userId);
  await testSchedulerStatus(userId);

  console.log('\n=====================');
  console.log('Tests complete!');
}

runTests()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
