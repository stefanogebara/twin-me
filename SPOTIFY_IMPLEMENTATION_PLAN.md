# Spotify Integration - Complete Implementation Plan

**Created**: January 2025
**Status**: Ready for Implementation
**Priority**: CRITICAL - Must Have (Next 2-4 Weeks)

---

## Executive Summary

This document provides a **step-by-step implementation plan** for fully integrating Spotify OAuth and data extraction into the Soul Signature Platform. Unlike the partial implementation currently in place, this plan ensures **end-to-end functionality** with real user data flowing into InsightsV2.

**Current State**: OAuth flow skeleton exists but returns placeholder data.
**Target State**: Full OAuth implementation with real Spotify listening history, personality analysis, and soul signature insights.

---

## Table of Contents

1. [Prerequisites & Setup](#prerequisites--setup)
2. [Phase 1: Spotify Developer Configuration](#phase-1-spotify-developer-configuration)
3. [Phase 2: OAuth Flow Implementation](#phase-2-oauth-flow-implementation)
4. [Phase 3: Data Extraction & Soul Analysis](#phase-3-data-extraction--soul-analysis)
5. [Phase 4: Database Schema Updates](#phase-4-database-schema-updates)
6. [Phase 5: Frontend Integration](#phase-5-frontend-integration)
7. [Phase 6: Testing & Validation](#phase-6-testing--validation)
8. [Phase 7: Error Handling & Rate Limiting](#phase-7-error-handling--rate-limiting)
9. [Reference: API Endpoints](#reference-api-endpoints)
10. [Troubleshooting Guide](#troubleshooting-guide)

---

## Prerequisites & Setup

### Required Environment Variables

Add to `.env` file:

```env
# Spotify OAuth Credentials
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REDIRECT_URI=http://localhost:8086/oauth/callback

# Application URLs (already exist)
VITE_APP_URL=http://localhost:8086
PORT=3001
```

### Required Dependencies

Already installed in package.json:
- `@supabase/supabase-js` - Database client
- `express` - Backend server
- `crypto` - For PKCE and encryption

No additional npm packages required.

---

## Phase 1: Spotify Developer Configuration

### Step 1.1: Create Spotify Developer App

1. **Navigate** to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. **Log in** with your Spotify account
3. **Click** "Create App"
4. **Fill in** app details:
   - **App Name**: `Twin AI Learn - Soul Signature`
   - **App Description**: `Platform for discovering authentic soul signatures through entertainment choices`
   - **Redirect URI**: `http://localhost:8086/oauth/callback`
   - **Which API/SDKs are you planning to use?**: Select "Web API"
   - **Terms of Service**: Check the box agreeing to Spotify's Developer Terms

5. **Click** "Save"
6. **Copy** the generated:
   - **Client ID** → Add to `.env` as `SPOTIFY_CLIENT_ID`
   - **Client Secret** (click "View client secret") → Add to `.env` as `SPOTIFY_CLIENT_SECRET`

### Step 1.2: Configure Redirect URIs

In Spotify Dashboard > App Settings > Redirect URIs:
- **Development**: `http://localhost:8086/oauth/callback`
- **Production** (when deployed): `https://yourdomain.com/oauth/callback`

**CRITICAL**: URIs must **exactly match** including protocol (http vs https), trailing slashes, and ports.

### Step 1.3: Update Platform Config

File: `api/config/platformConfigs.js` (line 10-30)

```javascript
spotify: {
  name: 'Spotify',
  authUrl: 'https://accounts.spotify.com/authorize',
  tokenUrl: 'https://accounts.spotify.com/api/token',
  scopes: [
    'user-read-recently-played',  // Last 50 tracks played
    'user-top-read',               // Top artists and tracks
    'user-library-read',           // Saved tracks and albums
    'playlist-read-private',       // Private playlists
    'user-follow-read'             // Followed artists
  ],
  apiBaseUrl: 'https://api.spotify.com/v1',
  rateLimit: {
    requestsPerSecond: 5,        // Spotify allows ~180 requests per minute
    burstLimit: 20
  }
}
```

---

## Phase 2: OAuth Flow Implementation

### Current Implementation Status

**File**: `api/routes/entertainment-connectors.js`

**What's Working**:
- ✅ POST `/api/entertainment/connect/spotify` (lines 67-135) - Generates auth URL with PKCE
- ✅ POST `/api/entertainment/oauth/callback` (lines 357-609) - Handles token exchange
- ✅ State encryption and CSRF protection
- ✅ Token storage in Supabase `platform_connections` table

**What Needs Implementation**:
- ❌ Token refresh mechanism (tokens expire after 3600 seconds)
- ❌ Token encryption at rest (currently plaintext)
- ❌ Connection status tracking

### Step 2.1: Implement Token Refresh

**File**: `api/services/spotifyTokenManager.js` (NEW FILE)

```javascript
import { createClient } from '@supabase/supabase-js';
import { encryptToken, decryptToken } from './encryption.js';
import PLATFORM_CONFIGS from '../config/platformConfigs.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Spotify Token Manager
 * Handles token refresh and validation
 */
export class SpotifyTokenManager {

  /**
   * Get valid access token for user
   * Automatically refreshes if expired
   */
  static async getValidAccessToken(userId) {
    // Fetch connection from database
    const { data: connection, error } = await supabase
      .from('platform_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', 'spotify')
      .single();

    if (error || !connection) {
      throw new Error('Spotify connection not found');
    }

    // Decrypt tokens
    const accessToken = decryptToken(connection.access_token);
    const refreshToken = connection.refresh_token ? decryptToken(connection.refresh_token) : null;
    const expiresAt = new Date(connection.token_expires_at);

    // Check if token is expired (with 5-minute buffer)
    const now = new Date();
    const bufferTime = 5 * 60 * 1000; // 5 minutes in milliseconds

    if (expiresAt - now > bufferTime) {
      // Token is still valid
      return accessToken;
    }

    // Token expired, refresh it
    if (!refreshToken) {
      throw new Error('No refresh token available. User must reconnect.');
    }

    console.log(`🔄 Refreshing Spotify token for user ${userId}`);
    const newTokens = await this.refreshAccessToken(refreshToken);

    // Update database with new tokens
    const newExpiresAt = new Date(Date.now() + newTokens.expires_in * 1000);

    await supabase
      .from('platform_connections')
      .update({
        access_token: encryptToken(newTokens.access_token),
        refresh_token: newTokens.refresh_token ? encryptToken(newTokens.refresh_token) : connection.refresh_token,
        token_expires_at: newExpiresAt.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('platform', 'spotify');

    console.log(`✅ Spotify token refreshed successfully`);
    return newTokens.access_token;
  }

  /**
   * Refresh Spotify access token using refresh token
   */
  static async refreshAccessToken(refreshToken) {
    const config = PLATFORM_CONFIGS.spotify;

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(
          `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
        ).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Spotify token refresh error:', errorData);
      throw new Error(`Failed to refresh token: ${errorData.error_description || errorData.error}`);
    }

    const tokens = await response.json();
    return tokens;
  }

  /**
   * Validate token by making test API call
   */
  static async validateToken(accessToken) {
    try {
      const response = await fetch('https://api.spotify.com/v1/me', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Revoke Spotify connection (user disconnect)
   */
  static async revokeConnection(userId) {
    const { error } = await supabase
      .from('platform_connections')
      .delete()
      .eq('user_id', userId)
      .eq('platform', 'spotify');

    if (error) {
      throw new Error('Failed to revoke Spotify connection');
    }

    console.log(`🔓 Spotify connection revoked for user ${userId}`);
    return { success: true };
  }
}
```

### Step 2.2: Test OAuth Flow

**Manual Testing Steps**:

1. Start backend server: `npm run server:dev`
2. Start frontend: `npm run dev`
3. Test connection initiation:
   ```bash
   curl -X POST http://localhost:3001/api/entertainment/connect/spotify \
     -H "Content-Type: application/json" \
     -d '{"userId":"test-user-id"}'
   ```
4. Copy `authUrl` from response
5. Open URL in browser
6. Authorize the app on Spotify
7. Verify redirect to `http://localhost:8086/oauth/callback?code=...&state=...`
8. Check Supabase `platform_connections` table for new entry

**Expected Database Entry**:
```sql
SELECT * FROM platform_connections WHERE platform = 'spotify';
-- Should show:
-- - user_id
-- - platform: 'spotify'
-- - access_token (encrypted)
-- - refresh_token (encrypted)
-- - token_expires_at (timestamp ~1 hour from now)
-- - status: 'connected'
```

---

## Phase 3: Data Extraction & Soul Analysis

### Step 3.1: Implement Spotify Data Extraction Service

**File**: `api/services/spotifyExtractor.js` (NEW FILE)

```javascript
import { SpotifyTokenManager } from './spotifyTokenManager.js';

/**
 * Spotify Data Extraction Service
 * Extracts listening history and analyzes musical soul signature
 */
export class SpotifyExtractor {

  /**
   * Extract complete Spotify data for user
   */
  static async extractUserData(userId) {
    console.log(`📊 Starting Spotify extraction for user ${userId}`);

    // Get valid access token
    const accessToken = await SpotifyTokenManager.getValidAccessToken(userId);

    // Fetch all data in parallel (where possible)
    const [
      topArtists,
      topTracks,
      recentlyPlayed,
      savedTracks,
      playlists,
      followedArtists
    ] = await Promise.all([
      this.getTopArtists(accessToken),
      this.getTopTracks(accessToken),
      this.getRecentlyPlayed(accessToken),
      this.getSavedTracks(accessToken),
      this.getUserPlaylists(accessToken),
      this.getFollowedArtists(accessToken)
    ]);

    // Get audio features for top tracks
    const audioFeatures = await this.getAudioFeatures(
      accessToken,
      topTracks.map(t => t.id)
    );

    console.log(`✅ Spotify extraction complete - ${topTracks.length} tracks analyzed`);

    return {
      topArtists,
      topTracks,
      recentlyPlayed,
      savedTracks,
      playlists,
      followedArtists,
      audioFeatures
    };
  }

  /**
   * Get user's top artists
   * Time range: medium_term (6 months)
   */
  static async getTopArtists(accessToken, timeRange = 'medium_term', limit = 50) {
    const response = await fetch(
      `https://api.spotify.com/v1/me/top/artists?time_range=${timeRange}&limit=${limit}`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch top artists: ${response.statusText}`);
    }

    const data = await response.json();
    return data.items || [];
  }

  /**
   * Get user's top tracks
   * Time range: medium_term (6 months)
   */
  static async getTopTracks(accessToken, timeRange = 'medium_term', limit = 50) {
    const response = await fetch(
      `https://api.spotify.com/v1/me/top/tracks?time_range=${timeRange}&limit=${limit}`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch top tracks: ${response.statusText}`);
    }

    const data = await response.json();
    return data.items || [];
  }

  /**
   * Get recently played tracks
   */
  static async getRecentlyPlayed(accessToken, limit = 50) {
    const response = await fetch(
      `https://api.spotify.com/v1/me/player/recently-played?limit=${limit}`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch recently played: ${response.statusText}`);
    }

    const data = await response.json();
    return data.items || [];
  }

  /**
   * Get user's saved tracks
   */
  static async getSavedTracks(accessToken, limit = 50) {
    const response = await fetch(
      `https://api.spotify.com/v1/me/tracks?limit=${limit}`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch saved tracks: ${response.statusText}`);
    }

    const data = await response.json();
    return data.items || [];
  }

  /**
   * Get user's playlists
   */
  static async getUserPlaylists(accessToken, limit = 50) {
    const response = await fetch(
      `https://api.spotify.com/v1/me/playlists?limit=${limit}`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch playlists: ${response.statusText}`);
    }

    const data = await response.json();
    return data.items || [];
  }

  /**
   * Get followed artists
   */
  static async getFollowedArtists(accessToken) {
    const response = await fetch(
      'https://api.spotify.com/v1/me/following?type=artist&limit=50',
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch followed artists: ${response.statusText}`);
    }

    const data = await response.json();
    return data.artists?.items || [];
  }

  /**
   * Get audio features for tracks
   * This reveals mood, energy, danceability, etc.
   */
  static async getAudioFeatures(accessToken, trackIds) {
    if (!trackIds || trackIds.length === 0) return [];

    // Spotify allows max 100 IDs per request
    const chunks = [];
    for (let i = 0; i < trackIds.length; i += 100) {
      chunks.push(trackIds.slice(i, i + 100));
    }

    const allFeatures = [];
    for (const chunk of chunks) {
      const response = await fetch(
        `https://api.spotify.com/v1/audio-features?ids=${chunk.join(',')}`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );

      if (!response.ok) {
        console.warn('Failed to fetch audio features for chunk');
        continue;
      }

      const data = await response.json();
      allFeatures.push(...(data.audio_features || []));
    }

    return allFeatures;
  }

  /**
   * Analyze musical soul signature from extracted data
   */
  static analyzeMusicalSoul(spotifyData) {
    const { topArtists, topTracks, audioFeatures, recentlyPlayed, playlists } = spotifyData;

    // Extract genres from top artists
    const genreCount = {};
    topArtists.forEach(artist => {
      artist.genres?.forEach(genre => {
        genreCount[genre] = (genreCount[genre] || 0) + 1;
      });
    });

    const topGenres = Object.entries(genreCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([genre, count]) => ({ genre, count }));

    // Analyze audio features for mood profile
    const avgFeatures = this.calculateAverageAudioFeatures(audioFeatures);

    // Determine music personality
    const musicPersonality = this.determineM musicPersonality(avgFeatures, topGenres);

    // Calculate discovery behavior
    const discoveryScore = this.calculateDiscoveryScore(topArtists, recentlyPlayed);

    return {
      topGenres,
      moodProfile: avgFeatures,
      musicPersonality,
      discoveryBehavior: discoveryScore,
      playlistCurator: playlists.length > 20,
      diversityScore: this.calculateDiversityScore(topGenres),
      energyLevel: avgFeatures.energy,
      emotionalValence: avgFeatures.valence,
      listeningIntensity: recentlyPlayed.length > 40 ? 'heavy' : 'moderate'
    };
  }

  /**
   * Calculate average audio features
   */
  static calculateAverageAudioFeatures(features) {
    if (!features || features.length === 0) {
      return {
        acousticness: 0,
        danceability: 0,
        energy: 0,
        valence: 0,
        tempo: 0
      };
    }

    const sum = features.reduce((acc, f) => {
      if (!f) return acc;
      return {
        acousticness: acc.acousticness + (f.acousticness || 0),
        danceability: acc.danceability + (f.danceability || 0),
        energy: acc.energy + (f.energy || 0),
        valence: acc.valence + (f.valence || 0),
        tempo: acc.tempo + (f.tempo || 0)
      };
    }, { acousticness: 0, danceability: 0, energy: 0, valence: 0, tempo: 0 });

    return {
      acousticness: sum.acousticness / features.length,
      danceability: sum.danceability / features.length,
      energy: sum.energy / features.length,
      valence: sum.valence / features.length,
      tempo: sum.tempo / features.length
    };
  }

  /**
   * Determine music personality from features
   */
  static determineMusicPersonality(avgFeatures, topGenres) {
    const { energy, valence, danceability, acousticness } = avgFeatures;

    // High energy + high valence = Energetic Explorer
    if (energy > 0.7 && valence > 0.6) {
      return {
        type: 'Energetic Explorer',
        description: 'You seek upbeat, high-energy music that lifts your mood'
      };
    }

    // Low energy + low valence = Introspective Soul
    if (energy < 0.4 && valence < 0.4) {
      return {
        type: 'Introspective Soul',
        description: 'You prefer melancholic, contemplative music for deep reflection'
      };
    }

    // High acousticness = Acoustic Appreciator
    if (acousticness > 0.6) {
      return {
        type: 'Acoustic Appreciator',
        description: 'You gravitate toward raw, organic sounds and live performances'
      };
    }

    // High danceability = Rhythm Enthusiast
    if (danceability > 0.7) {
      return {
        type: 'Rhythm Enthusiast',
        description: 'You love groovy, danceable beats that move your body'
      };
    }

    // Balanced
    return {
      type: 'Eclectic Listener',
      description: 'You have diverse musical tastes spanning multiple moods and styles'
    };
  }

  /**
   * Calculate discovery score (how much user explores new artists)
   */
  static calculateDiscoveryScore(topArtists, recentlyPlayed) {
    const topArtistIds = new Set(topArtists.map(a => a.id));
    const recentArtistIds = new Set(
      recentlyPlayed.map(item => item.track?.artists[0]?.id).filter(Boolean)
    );

    const overlap = [...topArtistIds].filter(id => recentArtistIds.has(id)).length;
    const explorationRate = 1 - (overlap / topArtistIds.size);

    return {
      rate: explorationRate,
      level: explorationRate > 0.6 ? 'high' : explorationRate > 0.3 ? 'moderate' : 'low',
      description: explorationRate > 0.6
        ? 'You actively discover new artists'
        : 'You tend to stick with familiar favorites'
    };
  }

  /**
   * Calculate genre diversity score
   */
  static calculateDiversityScore(topGenres) {
    return Math.min(10, topGenres.length); // 0-10 scale
  }
}
```

### Step 3.2: Update Data Extraction Service

**File**: `api/services/dataExtractionService.js`

Add new method:

```javascript
import { SpotifyExtractor } from './spotifyExtractor.js';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Extract platform data for user
 */
async extractPlatformData(userId, platform) {
  console.log(`📊 Extracting ${platform} data for user ${userId}`);

  try {
    let extractedData = null;

    switch (platform) {
      case 'spotify':
        const spotifyData = await SpotifyExtractor.extractUserData(userId);
        const soulAnalysis = SpotifyExtractor.analyzeMusicalSoul(spotifyData);

        extractedData = {
          rawData: spotifyData,
          analysis: soulAnalysis,
          extractedAt: new Date().toISOString(),
          dataPoints: spotifyData.topTracks.length + spotifyData.topArtists.length
        };
        break;

      // Other platforms...
      default:
        throw new Error(`Platform ${platform} not supported`);
    }

    // Store extracted data in Supabase
    await supabase
      .from('platform_data')
      .insert({
        user_id: userId,
        platform,
        data_type: 'soul_signature',
        raw_json: extractedData.rawData,
        extracted_patterns: extractedData.analysis,
        created_at: new Date().toISOString()
      });

    // Update platform connection status
    await supabase
      .from('platform_connections')
      .update({
        last_sync_status: 'success',
        last_sync_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('platform', platform);

    console.log(`✅ ${platform} extraction completed successfully`);

    return {
      success: true,
      platform,
      dataPoints: extractedData.dataPoints,
      analysis: extractedData.analysis
    };

  } catch (error) {
    console.error(`❌ ${platform} extraction failed:`, error);

    // Update failure status
    await supabase
      .from('platform_connections')
      .update({
        last_sync_status: 'error',
        last_sync_error: error.message,
        last_sync_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('platform', platform);

    throw error;
  }
}
```

---

## Phase 4: Database Schema Updates

### Step 4.1: Platform Data Table

**File**: `database/supabase/migrations/20250114_spotify_data.sql` (NEW FILE)

```sql
-- Create table for storing raw platform data
CREATE TABLE IF NOT EXISTS platform_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  data_type TEXT NOT NULL, -- 'soul_signature', 'listening_history', etc.
  raw_json JSONB NOT NULL,
  extracted_patterns JSONB,
  quality_score INT DEFAULT 0, -- 0-100
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for fast user+platform lookups
CREATE INDEX IF NOT EXISTS idx_platform_data_user_platform
  ON platform_data(user_id, platform);

-- Create index for data type queries
CREATE INDEX IF NOT EXISTS idx_platform_data_type
  ON platform_data(data_type);

-- Enable Row Level Security
ALTER TABLE platform_data ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only read their own data
CREATE POLICY "Users can read own platform data"
  ON platform_data
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: Service role can insert/update
CREATE POLICY "Service role can manage platform data"
  ON platform_data
  FOR ALL
  USING (auth.role() = 'service_role');

-- Add comments
COMMENT ON TABLE platform_data IS 'Stores raw and processed data from connected platforms';
COMMENT ON COLUMN platform_data.raw_json IS 'Raw API response from platform';
COMMENT ON COLUMN platform_data.extracted_patterns IS 'Analyzed soul signature patterns';
COMMENT ON COLUMN platform_data.quality_score IS 'Data completeness score (0-100)';
```

### Step 4.2: Update Platform Connections Table

```sql
-- Add columns for sync tracking
ALTER TABLE platform_connections
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS last_sync_status TEXT DEFAULT 'pending', -- 'pending', 'success', 'error'
  ADD COLUMN IF NOT EXISTS last_sync_error TEXT,
  ADD COLUMN IF NOT EXISTS data_quality_score INT DEFAULT 0; -- 0-100

-- Create index for sync status
CREATE INDEX IF NOT EXISTS idx_platform_connections_sync_status
  ON platform_connections(last_sync_status);

-- Add comment
COMMENT ON COLUMN platform_connections.last_sync_status IS 'Status of last data extraction: pending, success, error';
```

---

## Phase 5: Frontend Integration

### Step 5.1: Update InsightsV2 to Fetch Real Spotify Data

**File**: `src/pages/InsightsV2.tsx` (lines 50-100 - add API fetch)

```typescript
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface SpotifyInsight {
  topGenres: Array<{ genre: string; count: number }>;
  moodProfile: {
    acousticness: number;
    danceability: number;
    energy: number;
    valence: number;
    tempo: number;
  };
  musicPersonality: {
    type: string;
    description: string;
  };
  discoveryBehavior: {
    rate: number;
    level: string;
    description: string;
  };
  diversityScore: number;
}

export default function InsightsV2() {
  const { user } = useAuth();
  const [spotifyData, setSpotifyData] = useState<SpotifyInsight | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;

    fetchSpotifyInsights();
  }, [user?.id]);

  const fetchSpotifyInsights = async () => {
    try {
      setLoading(true);

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/soul-data/spotify/${user.id}`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch Spotify insights');
      }

      const data = await response.json();
      setSpotifyData(data.analysis);

    } catch (err) {
      console.error('Spotify insights error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Render insights using spotifyData...
}
```

### Step 5.2: Create Spotify Insights API Endpoint

**File**: `api/routes/soul-data.js` (NEW ROUTE)

```javascript
import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * GET /api/soul-data/spotify/:userId
 * Fetch Spotify soul signature for user
 */
router.get('/spotify/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Fetch latest Spotify data
    const { data, error } = await supabase
      .from('platform_data')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', 'spotify')
      .eq('data_type', 'soul_signature')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return res.status(404).json({
        success: false,
        error: 'No Spotify data found for user'
      });
    }

    res.json({
      success: true,
      analysis: data.extracted_patterns,
      extractedAt: data.created_at,
      dataPoints: data.raw_json?.topTracks?.length || 0
    });

  } catch (error) {
    console.error('Spotify insights fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch Spotify insights'
    });
  }
});

export default router;
```

**Register route in `api/server.js`**:

```javascript
import soulDataRoutes from './routes/soul-data.js';
app.use('/api/soul-data', soulDataRoutes);
```

---

## Phase 6: Testing & Validation

### Test Checklist

- [ ] **OAuth Flow**: User can authorize Spotify and tokens are stored
- [ ] **Token Refresh**: Expired tokens automatically refresh
- [ ] **Data Extraction**: Top tracks, artists, and audio features are fetched
- [ ] **Soul Analysis**: Musical personality is accurately determined
- [ ] **Frontend Display**: InsightsV2 shows real Spotify data
- [ ] **Error Handling**: Graceful failures with user-friendly messages
- [ ] **Rate Limiting**: API calls don't exceed Spotify's limits

### Manual Test Script

```bash
# 1. Test OAuth initiation
curl -X POST http://localhost:3001/api/entertainment/connect/spotify \
  -H "Content-Type: application/json" \
  -d '{"userId":"YOUR_USER_ID"}'

# 2. Complete OAuth in browser (use returned authUrl)

# 3. Trigger data extraction
curl -X POST http://localhost:3001/api/soul-data/extract \
  -H "Content-Type: application/json" \
  -d '{"userId":"YOUR_USER_ID","platform":"spotify"}'

# 4. Fetch insights
curl http://localhost:3001/api/soul-data/spotify/YOUR_USER_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Phase 7: Error Handling & Rate Limiting

### Common Error Scenarios

1. **Token Expired**: Automatically refresh using refresh token
2. **Invalid Credentials**: Return user-friendly error, ask to reconnect
3. **Rate Limit Hit**: Implement exponential backoff, queue remaining requests
4. **Network Failure**: Retry with backoff, store partial results
5. **User Revoked Access**: Detect 401 errors, mark connection as disconnected

### Rate Limiting Implementation

**File**: `api/services/spotifyRateLimiter.js` (NEW FILE)

```javascript
/**
 * Spotify Rate Limiter
 * Ensures compliance with Spotify API limits (~180 requests/minute)
 */
class SpotifyRateLimiter {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.requestsThisMinute = 0;
    this.maxRequestsPerMinute = 150; // Leave buffer
  }

  async execute(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;

    while (this.queue.length > 0) {
      if (this.requestsThisMinute >= this.maxRequestsPerMinute) {
        console.log('⏱️ Rate limit reached, waiting 60s...');
        await this.sleep(60000);
        this.requestsThisMinute = 0;
      }

      const { fn, resolve, reject } = this.queue.shift();

      try {
        this.requestsThisMinute++;
        const result = await fn();
        resolve(result);
      } catch (error) {
        reject(error);
      }

      // Small delay between requests
      await this.sleep(100);
    }

    this.processing = false;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const spotifyRateLimiter = new SpotifyRateLimiter();
```

---

## Reference: API Endpoints

### Spotify Web API Endpoints Used

| Endpoint | Purpose | Rate Limit |
|----------|---------|------------|
| `GET /me/top/artists` | Top 50 artists (6 months) | 180/min |
| `GET /me/top/tracks` | Top 50 tracks (6 months) | 180/min |
| `GET /me/player/recently-played` | Last 50 played tracks | 180/min |
| `GET /me/tracks` | Saved tracks (library) | 180/min |
| `GET /me/playlists` | User playlists | 180/min |
| `GET /me/following?type=artist` | Followed artists | 180/min |
| `GET /audio-features?ids=...` | Track audio features | 180/min |

### Backend API Endpoints (New)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/entertainment/connect/spotify` | Initiate OAuth |
| POST | `/api/entertainment/oauth/callback` | Handle OAuth callback |
| GET | `/api/soul-data/spotify/:userId` | Fetch Spotify insights |
| POST | `/api/soul-data/extract` | Trigger data extraction |
| POST | `/api/entertainment/refresh-token` | Refresh expired token |

---

## Troubleshooting Guide

### Issue: "Invalid redirect URI"

**Cause**: Redirect URI in Spotify Dashboard doesn't match OAuth request

**Fix**:
1. Go to Spotify Dashboard > App Settings
2. Ensure redirect URI **exactly** matches: `http://localhost:8086/oauth/callback`
3. No trailing slashes, correct protocol (http vs https)

### Issue: "Token exchange failed - invalid_grant"

**Cause**: Authorization code expired (10-minute lifetime) or already used

**Fix**:
- Codes expire after 10 minutes
- Each code can only be exchanged once
- User must re-authorize from the beginning

### Issue: "Failed to fetch top tracks - 401 Unauthorized"

**Cause**: Access token expired

**Fix**:
- Implement token refresh (Phase 2, Step 2.1)
- Check `token_expires_at` in database
- Ensure refresh token is valid

### Issue: "Rate limit exceeded - 429 Too Many Requests"

**Cause**: Exceeded Spotify's 180 requests/minute limit

**Fix**:
- Implement rate limiter (Phase 7)
- Add delays between requests
- Cache results to avoid redundant calls

---

## Next Steps After Spotify

Once Spotify is fully implemented:

1. **YouTube Integration** - Repeat process for YouTube OAuth and data extraction
2. **GitHub Integration** - Add professional soul signature from code patterns
3. **InsightsV2 Enhancement** - Create detailed insight pages for "Learn More" buttons
4. **Soul Matching Algorithm** - Use extracted data for user compatibility
5. **Real-time Sync** - WebSocket updates when new data is extracted

---

## Success Criteria

✅ **OAuth Flow Works**: User can authorize Spotify and tokens are encrypted in DB
✅ **Token Refresh Works**: Expired tokens automatically refresh without user action
✅ **Data Extraction Works**: Real top tracks, artists, and audio features are fetched
✅ **Soul Analysis Works**: Musical personality is accurately determined from data
✅ **Frontend Shows Real Data**: InsightsV2 displays actual Spotify insights, not placeholders
✅ **Error Handling Works**: Graceful failures with user-friendly error messages
✅ **Rate Limiting Works**: API calls respect Spotify's limits without 429 errors

---

**End of Implementation Plan**

*Ready to begin implementation? Start with Phase 1: Spotify Developer Configuration.*
