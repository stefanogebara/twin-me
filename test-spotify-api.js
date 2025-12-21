require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function testSpotifyAPI() {
  // Get the Spotify token from database
  const { data, error } = await supabase
    .from('platform_connections')
    .select('access_token, metadata')
    .eq('platform', 'spotify')
    .eq('user_id', 'b3a8d18b-0d01-4e1c-a1ef-cc7cf67e86a5')
    .single();

  if (error) {
    console.error('Database error:', error);
    return;
  }

  // Decrypt the token
  const [ivHex, encryptedHex, authTagHex] = data.access_token.split(':');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    Buffer.from(process.env.TOKEN_ENCRYPTION_KEY, 'hex'),
    Buffer.from(ivHex, 'hex')
  );
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const accessToken = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final()
  ]).toString('utf8');

  console.log('✅ Decrypted token:', accessToken.substring(0, 30) + '...');

  // Test the /audio-features endpoint
  const trackIds = '3n3Ppam7vgaVa1iaRUc9Lp,7qiZfU4dY1lWllzX7mPBIz';
  const url = `https://api.spotify.com/v1/audio-features?ids=${trackIds}`;

  console.log('\n🎵 Testing Spotify API:', url);
  console.log('📋 Authorization header:', `Bearer ${accessToken.substring(0, 30)}...`);

  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  console.log('\n📊 Response status:', response.status);
  console.log('📊 Response headers:', Object.fromEntries(response.headers.entries()));

  const text = await response.text();
  console.log('\n📄 Response body:', text);

  if (!response.ok) {
    try {
      const errorJson = JSON.parse(text);
      console.log('\n🔍 Parsed error:', JSON.stringify(errorJson, null, 2));
    } catch (e) {
      console.log('\n⚠️  Could not parse as JSON');
    }
  }
}

testSpotifyAPI().catch(console.error);
