# Spotify OAuth Implementation Guide

**Date:** January 18, 2025
**Platform:** Spotify Music Streaming
**Priority:** Phase 1, Day 1 (Highest Value)

---

## Step 1: Create Spotify OAuth App

1. **Navigate to Spotify Developer Dashboard:**
   https://developer.spotify.com/dashboard

2. **Create New App:**
   - App Name: `Twin Me Soul Signature`
   - App Description: `Soul signature extraction platform - analyzes musical preferences for personality insights`
   - Redirect URIs:
     - `http://localhost:8086/oauth/callback` (local development)
     - `https://twin-ai-learn.vercel.app/oauth/callback` (production)
   - APIs Used: `Web API`

3. **Copy Credentials:**
   - Client ID: (Will be added to .env as `SPOTIFY_CLIENT_ID`)
   - Client Secret: (Will be added to .env as `SPOTIFY_CLIENT_SECRET`)

---

## Step 2: Environment Variables

Add to `.env`:

```env
# Spotify OAuth
SPOTIFY_CLIENT_ID=your-spotify-client-id-here
SPOTIFY_CLIENT_SECRET=your-spotify-client-secret-here
```

---

## Step 3: Backend Platform Configuration

The Spotify config is already in `api/services/platformAPIMappings.js` but we need to add the complete OAuth configuration to a new `PLATFORM_CONFIGS` object.

Create or update `api/config/platformConfigs.js`:

```javascript
export const PLATFORM_CONFIGS = {
  spotify: {
    name: 'Spotify',
    authUrl: 'https://accounts.spotify.com/authorize',
    tokenUrl: 'https://accounts.spotify.com/api/token',
    scopes: [
      'user-read-recently-played',
      'user-top-read',
      'user-library-read',
      'user-read-playback-state',
      'playlist-read-private'
    ],
    apiBaseUrl: 'https://api.spotify.com/v1',

    endpoints: {
      userProfile: '/me',
      recentTracks: '/me/player/recently-played',
      topTracks: '/me/top/tracks',
      topArtists: '/me/top/artists',
      savedTracks: '/me/tracks'
    },

    tokenType: 'Bearer',
    refreshable: true,

    rateLimit: {
      requests: 180,
      window: 60 // per minute
    }
  }
};
```

---

## Step 4: OAuth Routes Implementation

Add to `api/routes/entertainment-connectors.js`:

```javascript
// Spotify OAuth initiation
router.get('/connect/spotify', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const config = PLATFORM_CONFIGS['spotify'];

    // Generate secure OAuth state
    const state = crypto.randomBytes(16).toString('hex');
    const stateData = {
      userId,
      platform: 'spotify',
      expiresAt: Date.now() + 600000 // 10 minutes
    };

    // Store state in database (using Supabase)
    await supabase
      .from('oauth_states')
      .insert({
        state,
        data: stateData,
        expires_at: new Date(stateData.expiresAt)
      });

    // Build authorization URL
    const authUrl = new URL(config.authUrl);
    authUrl.searchParams.append('client_id', process.env.SPOTIFY_CLIENT_ID);
    authUrl.searchParams.append('redirect_uri', `${process.env.VITE_APP_URL}/oauth/callback`);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('scope', config.scopes.join(' '));
    authUrl.searchParams.append('state', state);
    authUrl.searchParams.append('show_dialog', 'true'); // Force auth dialog for testing

    res.json({ authUrl: authUrl.toString() });
  } catch (error) {
    console.error('Spotify OAuth initiation error:', error);
    res.status(500).json({ error: 'Failed to initiate Spotify OAuth' });
  }
});

// Spotify OAuth callback
router.get('/callback/spotify', async (req, res) => {
  const { code, state, error: oauthError } = req.query;

  try {
    // Handle user denial
    if (oauthError === 'access_denied') {
      return res.redirect(`${process.env.VITE_APP_URL}/get-started?error=cancelled`);
    }

    // Verify OAuth state
    const { data: stateRecord } = await supabase
      .from('oauth_states')
      .select('*')
      .eq('state', state)
      .single();

    if (!stateRecord || new Date(stateRecord.expires_at) < new Date()) {
      throw new Error('Invalid or expired OAuth state');
    }

    const { userId } = stateRecord.data;

    // Delete used state
    await supabase
      .from('oauth_states')
      .delete()
      .eq('state', state);

    // Exchange code for tokens
    const config = PLATFORM_CONFIGS['spotify'];
    const tokenResponse = await axios.post(
      config.tokenUrl,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${process.env.VITE_APP_URL}/oauth/callback`,
        client_id: process.env.SPOTIFY_CLIENT_ID,
        client_secret: process.env.SPOTIFY_CLIENT_SECRET
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    // Encrypt tokens
    const encryptedAccessToken = encryptToken(access_token);
    const encryptedRefreshToken = refresh_token ? encryptToken(refresh_token) : null;

    // Save connection to database
    await supabase
      .from('data_connectors')
      .upsert({
        user_id: userId,
        provider: 'spotify',
        access_token: JSON.stringify(encryptedAccessToken),
        refresh_token: encryptedRefreshToken ? JSON.stringify(encryptedRefreshToken) : null,
        token_expires_at: new Date(Date.now() + expires_in * 1000),
        connected_at: new Date(),
        status: 'connected'
      });

    res.redirect(`${process.env.VITE_APP_URL}/get-started?connected=spotify`);
  } catch (error) {
    console.error('Spotify OAuth callback error:', error);
    res.redirect(`${process.env.VITE_APP_URL}/get-started?error=spotify`);
  }
});
```

---

## Step 5: Token Encryption (Already Implemented)

The token encryption functions are already in `api/services/tokenEncryption.js`:

```javascript
import crypto from 'crypto';

const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
const ALGORITHM = 'aes-256-gcm';

export function encryptToken(token) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
}

export function decryptToken(encryptedData) {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    ENCRYPTION_KEY,
    Buffer.from(encryptedData.iv, 'hex')
  );

  decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));

  let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
```

---

## Step 6: Data Extraction Service

Add to `api/services/spotifyExtraction.js` (NEW FILE):

```javascript
import axios from 'axios';
import { supabase } from '../database/supabase.js';
import { decryptToken } from './tokenEncryption.js';
import { PLATFORM_CONFIGS } from '../config/platformConfigs.js';

export async function extractSpotifyData(userId) {
  // Get platform connection
  const { data: connection } = await supabase
    .from('data_connectors')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'spotify')
    .single();

  if (!connection || !connection.access_token) {
    throw new Error('Spotify not connected');
  }

  try {
    // Decrypt access token
    const accessToken = decryptToken(JSON.parse(connection.access_token));
    const config = PLATFORM_CONFIGS['spotify'];

    const headers = {
      'Authorization': `${config.tokenType} ${accessToken}`
    };

    // Extract multiple data types in parallel
    const [
      profileResponse,
      recentTracksResponse,
      topTracksResponse,
      topArtistsResponse,
      savedTracksResponse
    ] = await Promise.all([
      axios.get(`${config.apiBaseUrl}${config.endpoints.userProfile}`, { headers }),
      axios.get(`${config.apiBaseUrl}${config.endpoints.recentTracks}?limit=50`, { headers }),
      axios.get(`${config.apiBaseUrl}${config.endpoints.topTracks}?time_range=medium_term&limit=50`, { headers }),
      axios.get(`${config.apiBaseUrl}${config.endpoints.topArtists}?time_range=medium_term&limit=50`, { headers }),
      axios.get(`${config.apiBaseUrl}${config.endpoints.savedTracks}?limit=50`, { headers })
    ]);

    // Transform to soul signature format
    const soulData = transformSpotifyToSoulSignature({
      profile: profileResponse.data,
      recentTracks: recentTracksResponse.data.items,
      topTracks: topTracksResponse.data.items,
      topArtists: topArtistsResponse.data.items,
      savedTracks: savedTracksResponse.data.items
    });

    // Save extracted data
    const totalItems =
      soulData.recentTracks.length +
      soulData.topTracks.length +
      soulData.topArtists.length +
      soulData.savedTracks.length;

    await supabase
      .from('soul_data')
      .insert({
        user_id: userId,
        platform: 'spotify',
        data_type: 'comprehensive_music_profile',
        raw_data: {
          profile: profileResponse.data,
          recentTracks: recentTracksResponse.data,
          topTracks: topTracksResponse.data,
          topArtists: topArtistsResponse.data,
          savedTracks: savedTracksResponse.data
        },
        extracted_patterns: soulData,
        extracted_at: new Date()
      });

    // Update connection status
    await supabase
      .from('data_connectors')
      .update({
        last_synced_at: new Date(),
        status: 'active'
      })
      .eq('user_id', userId)
      .eq('provider', 'spotify');

    return {
      success: true,
      itemsExtracted: totalItems,
      platform: 'spotify',
      insights: soulData.insights
    };

  } catch (error) {
    // Handle token expiration
    if (error.response?.status === 401) {
      await supabase
        .from('data_connectors')
        .update({ status: 'requires_reauth' })
        .eq('user_id', userId)
        .eq('provider', 'spotify');

      return {
        success: false,
        requiresReauth: true,
        error: 'Token expired - reconnection required'
      };
    }

    // Handle rate limiting
    if (error.response?.status === 429) {
      const retryAfter = error.response.headers['retry-after'];
      return {
        success: false,
        rateLimited: true,
        retryAfter: parseInt(retryAfter) || 60
      };
    }

    throw error;
  }
}

function transformSpotifyToSoulSignature(spotifyData) {
  const { profile, recentTracks, topTracks, topArtists, savedTracks } = spotifyData;

  // Extract genres from top artists
  const genres = topArtists.flatMap(artist => artist.genres || []);
  const genreFrequency = genres.reduce((acc, genre) => {
    acc[genre] = (acc[genre] || 0) + 1;
    return acc;
  }, {});

  // Extract moods from audio features (would need additional API calls)
  const trackIds = topTracks.map(track => track.id);

  // Soul signature insights
  return {
    profile: {
      spotifyId: profile.id,
      displayName: profile.display_name,
      country: profile.country,
      product: profile.product
    },

    recentTracks: recentTracks.map(item => ({
      trackName: item.track.name,
      artistName: item.track.artists[0].name,
      playedAt: item.played_at
    })),

    topTracks: topTracks.map(track => ({
      name: track.name,
      artist: track.artists[0].name,
      popularity: track.popularity,
      duration: track.duration_ms
    })),

    topArtists: topArtists.map(artist => ({
      name: artist.name,
      genres: artist.genres,
      popularity: artist.popularity,
      followers: artist.followers.total
    })),

    savedTracks: savedTracks.map(item => ({
      trackName: item.track.name,
      artistName: item.track.artists[0].name,
      addedAt: item.added_at
    })),

    insights: {
      totalGenres: Object.keys(genreFrequency).length,
      topGenres: Object.entries(genreFrequency)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([genre, count]) => ({ genre, count })),

      averagePopularity: topTracks.reduce((sum, t) => sum + t.popularity, 0) / topTracks.length,

      musicalDiversity: Object.keys(genreFrequency).length / genres.length,

      // Big Five trait correlations
      traits: {
        openness: calculateOpenness(genreFrequency, topArtists),
        extraversion: calculateExtraversion(topTracks, topArtists),
        agreeableness: calculateAgreeableness(topTracks),
        conscientiousness: calculateConscientiousness(savedTracks),
        neuroticism: calculateNeuroticism(genres)
      }
    }
  };
}

// Big Five Trait Calculations
function calculateOpenness(genreFrequency, topArtists) {
  const genreDiversity = Object.keys(genreFrequency).length;
  const obscureArtistRatio = topArtists.filter(a => a.popularity < 50).length / topArtists.length;
  return Math.min(((genreDiversity / 20) * 50) + (obscureArtistRatio * 50), 100);
}

function calculateExtraversion(topTracks, topArtists) {
  const averagePopularity = topTracks.reduce((sum, t) => sum + t.popularity, 0) / topTracks.length;
  const followedArtists = topArtists.filter(a => a.followers.total > 1000000).length;
  return Math.min((averagePopularity * 0.6) + (followedArtists * 2), 100);
}

function calculateAgreeableness(topTracks) {
  const mainstreamRatio = topTracks.filter(t => t.popularity > 70).length / topTracks.length;
  return mainstreamRatio * 100;
}

function calculateConscientiousness(savedTracks) {
  // Library organization indicates conscientiousness
  const librarySize = savedTracks.length;
  return Math.min((librarySize / 50) * 100, 100);
}

function calculateNeuroticism(genres) {
  const sadGenres = ['sad', 'melancholic', 'emo', 'blues'];
  const sadGenreCount = genres.filter(g => sadGenres.some(sad => g.includes(sad))).length;
  return Math.min((sadGenreCount / genres.length) * 100, 100);
}
```

---

## Step 7: Frontend Platform Card

Update `src/pages/GetStarted.tsx` to include Spotify card:

```tsx
{
  id: 'spotify',
  name: 'Spotify',
  icon: Music, // From lucide-react
  description: 'Reveals your musical soul - taste, mood patterns, and emotional landscape through your listening habits',
  setupTime: '10 seconds setup',
  category: 'essential', // High-value platform
  insights: [
    'Musical Taste Profile',
    'Mood Patterns',
    'Emotional Landscape',
    'Discovery Behavior',
    '+3 more'
  ],
  color: '#1DB954', // Spotify green
  connected: connections?.spotify?.connected || false
}
```

---

## Step 8: Database Table (Already Exists)

The `data_connectors` table already supports Spotify:

```sql
CREATE TABLE data_connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMP,
  connected_at TIMESTAMP DEFAULT NOW(),
  last_synced_at TIMESTAMP,
  status TEXT DEFAULT 'connected',
  UNIQUE(user_id, provider)
);
```

We need to add an `oauth_states` table:

```sql
CREATE TABLE oauth_states (
  state TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Step 9: Testing Checklist

- [ ] OAuth flow initiates correctly at `/api/entertainment/connect/spotify`
- [ ] Spotify authorization page shows correct scopes
- [ ] Callback redirects to frontend with success
- [ ] Tokens encrypted and saved to database
- [ ] Platform shows "Connected" in UI
- [ ] Data extraction endpoint works: `/api/soul/trigger-extraction/spotify/{userId}`
- [ ] Soul data saved with insights
- [ ] No token decryption errors in logs

---

## Expected Outcome

After implementation:
- Users can connect Spotify in one click
- Musical preferences extracted automatically
- Big Five personality traits calculated from listening habits
- Soul signature confidence increases by 15-20%
- Musical taste cluster populated in privacy dashboard

---

## Next Steps

After Spotify is complete, proceed to:
1. YouTube (learning interests, creator loyalty)
2. Reddit (community interests, discussion style)
3. Twitch (live engagement, gaming preferences)

**Estimated Time:** 15-20 minutes for complete implementation
