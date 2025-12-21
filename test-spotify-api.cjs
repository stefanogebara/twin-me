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
    .eq('user_id', 'a483a979-cf85-481d-b65b-af396c2c513a')
    .single();

  if (error) {
    console.error('Database error:', error);
    return;
  }

  // Decrypt the token (format: iv:authTag:ciphertext)
  const [ivHex, authTagHex, ciphertext] = data.access_token.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    Buffer.from(process.env.ENCRYPTION_KEY, 'hex'),
    iv
  );
  decipher.setAuthTag(authTag);

  let accessToken = decipher.update(ciphertext, 'hex', 'utf8');
  accessToken += decipher.final('utf8');

  console.log('✅ Decrypted token:', accessToken.substring(0, 30) + '...');

  // Test what metadata we CAN get from tracks
  console.log('\n🔍 Testing available track metadata from /tracks endpoint...');

  const trackIds = '3n3Ppam7vgaVa1iaRUc9Lp,7qiZfU4dY1lWllzX7mPBIz';
  const tracksUrl = `https://api.spotify.com/v1/tracks?ids=${trackIds}`;

  const tracksResponse = await fetch(tracksUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  console.log('  Status:', tracksResponse.status);

  if (tracksResponse.ok) {
    const tracksData = await tracksResponse.json();
    console.log('\n📊 Available metadata for energy detection:');

    tracksData.tracks.forEach((track, i) => {
      if (!track) {
        console.log(`\n  Track ${i + 1}: NULL (invalid track ID)`);
        return;
      }
      console.log(`\n  Track ${i + 1}: "${track.name}" by ${track.artists[0].name}`);
      console.log('    - Popularity:', track.popularity, '(0-100)');
      console.log('    - Duration:', track.duration_ms, 'ms');
      console.log('    - Explicit:', track.explicit);
      console.log('    - Artist ID:', track.artists[0].id);

      // Note: Track object doesn't include genres directly
      console.log('    - Genres: Not available in /tracks (need /artists endpoint)');
    });

    // Now fetch artist data to get genres
    const validTrack = tracksData.tracks.find(t => t !== null);
    if (!validTrack) {
      console.log('\n❌ No valid tracks found');
      return;
    }

    const artistId = validTrack.artists[0].id;
    console.log(`\n🎤 Fetching artist data for genre information...`);

    const artistResponse = await fetch(`https://api.spotify.com/v1/artists/${artistId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (artistResponse.ok) {
      const artistData = await artistResponse.json();
      console.log(`  Artist: ${artistData.name}`);
      console.log('  Genres:', artistData.genres.join(', ') || 'None');
      console.log('  Popularity:', artistData.popularity);
      console.log('  Followers:', artistData.followers.total);
    }

    console.log('\n✅ SOLUTION: Use genres + popularity for energy level mapping');
    console.log('   - Calm: jazz, classical, ambient, acoustic');
    console.log('   - Focused: indie, alternative, folk, singer-songwriter');
    console.log('   - Energizing: pop, rock, hip hop, r&b');
    console.log('   - Power: edm, dance, metal, punk, electronic');
  } else {
    console.log('  Error:', await tracksResponse.text());
  }
}

testSpotifyAPI().catch(console.error);
