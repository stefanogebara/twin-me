#!/usr/bin/env node
/**
 * Test Token Refresh Service
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { createClient } from '@supabase/supabase-js';
import { getValidAccessToken } from '../tokenRefresh.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function test() {
  console.log('Token Refresh Test');
  console.log('==================\n');

  // Get user with Spotify
  const { data } = await supabase.from('platform_connections')
    .select('user_id')
    .eq('platform', 'spotify')
    .single();

  if (!data) {
    console.log('No Spotify user found');
    return;
  }

  console.log('User ID:', data.user_id);
  console.log('Getting valid access token...\n');

  const result = await getValidAccessToken(data.user_id, 'spotify');
  console.log('Token result:');
  console.log('  Success:', result.success);
  console.log('  Has token:', !!result.accessToken);
  console.log('  Token length:', result.accessToken?.length);
  if (result.error) console.log('  Error:', result.error);

  if (result.success && result.accessToken) {
    // Test the token
    console.log('\nTesting token with Spotify API...');
    const response = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${result.accessToken}` }
    });
    console.log('Spotify /me response:', response.status);

    if (response.ok) {
      const me = await response.json();
      console.log('User:', me.display_name || me.id);
      console.log('\n✅ Token is valid!');
    } else {
      const error = await response.text();
      console.log('Error:', error);
      console.log('\n❌ Token is invalid');
    }
  }
}

test()
  .then(() => process.exit(0))
  .catch(e => {
    console.error('Error:', e);
    process.exit(1);
  });
