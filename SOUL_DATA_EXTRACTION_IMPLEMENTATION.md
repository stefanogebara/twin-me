# Soul Data Extraction Service - Implementation Complete

## Overview

Complete rebuild of the data extraction service focused on **entertainment/lifestyle platforms** for authentic Soul Signature discovery. This replaces the educational-focused `dataExtraction.js` with a comprehensive extraction system for 5 major platforms.

## File Created

**`api/services/soulDataExtraction.js`** (1,100+ lines)

Production-ready extraction service with:
- ✅ **5 Platform Extractors** (Spotify, YouTube, GitHub, Discord, Netflix)
- ✅ **Standardized SoulDataPoint Format**
- ✅ **API Rate Limiting & Caching**
- ✅ **Graceful Error Handling**
- ✅ **Token Expiration Detection**
- ✅ **No Fake Fallbacks** (returns null for missing data)
- ✅ **Comprehensive Pattern Analysis**

---

## Platform Implementations

### 1. **Spotify Extraction** (`extractSpotifyData`)

**API Endpoints Called:**
```javascript
GET /v1/me/top/artists?time_range=long_term&limit=50      // Musical taste
GET /v1/me/top/tracks?time_range=long_term&limit=50       // Top songs
GET /v1/me/player/recently-played?limit=50                // Recent activity
GET /v1/me/playlists?limit=50                             // Curation style
GET /v1/audio-features?ids={track_ids}                    // Energy/valence/tempo
```

**Extracted Patterns:**
```javascript
{
  // Musical Identity
  topGenres: [{ genre: 'indie', count: 45 }],
  genreDiversity: 0.85,                    // 0-1 Shannon entropy
  totalGenres: 23,

  // Mood Patterns
  moodScore: 0.67,                         // 0=sad, 1=happy (valence)
  emotionalLandscape: 'energetic-positive',

  // Energy & Tempo
  energyLevel: 0.72,                       // 0-1 scale
  danceability: 0.68,
  averageTempo: 125,                       // BPM
  acousticPreference: 0.31,                // 0=electronic, 1=acoustic

  // Discovery Patterns
  diversityScore: 0.85,
  obscurityScore: 0.42,                    // Artists with <50k followers
  discoveryVsFamiliar: 'discovery-focused',

  // Listening Habits
  temporalPattern: 'night_owl',            // morning/afternoon/evening/night
  playlistCount: 37,
  curationStyle: 'active-curator',

  // Artist Analysis
  topArtistNames: ['Artist1', 'Artist2', ...],
  artistPopularityAvg: 62
}
```

**Error Handling:**
- ✅ Rate limiting (429) → returns `{ error: 'RATE_LIMITED', retryAfter: 60 }`
- ✅ Token expiration (401) → returns `{ error: 'TOKEN_EXPIRED' }`
- ✅ API failures → returns `null`

---

### 2. **YouTube Extraction** (`extractYouTubeData`)

**API Endpoints Called:**
```javascript
GET /youtube/v3/channels?part=snippet,statistics,contentDetails&mine=true
GET /youtube/v3/subscriptions?part=snippet&mine=true&maxResults=50
GET /youtube/v3/activities?part=snippet,contentDetails&mine=true&maxResults=50
GET /youtube/v3/playlistItems?part=snippet&playlistId={likes}&maxResults=50
```

**Extracted Patterns:**
```javascript
{
  // Creator Loyalty
  subscriptionCount: 127,
  topChannels: [
    { channel: 'Creator Name', subscribedAt: '2023-01-15' }
  ],

  // Learning vs Entertainment Mix
  contentMix: {
    educational: 42,
    entertainment: 28,
    gaming: 15,
    tech: 22,
    music: 8,
    vlog: 12,
    news: 5,
    cooking: 3,
    fitness: 2,
    other: 10
  },
  learningVsEntertainment: 'balanced-learner',

  // Curiosity Profile
  topicDiversity: 0.78,                    // 0-1 scale
  categoryCount: 8,
  curiosityProfile: 'broad-curious',       // omnivorous/broad/focused/narrow

  // Content Depth
  contentDepth: 'long-form',               // long-form vs short-clips
  avgTitleLength: 67,

  // Engagement
  likesCount: 234,
  recentActivityCount: 45,
  engagementLevel: 'high'                  // high/medium/low
}
```

---

### 3. **GitHub Extraction** (`extractGitHubData`)

**API Endpoints Called:**
```javascript
GET /user                                    // Profile
GET /user/repos?sort=updated&per_page=100   // Repositories
GET /user/starred?per_page=100              // Starred repos
GET /user/following?per_page=100            // Network
GET /users/{username}/events?per_page=100   // Contributions
```

**Extracted Patterns:**
```javascript
{
  // Technical Skills
  primaryLanguages: [
    { language: 'JavaScript', repoCount: 45 },
    { language: 'Python', repoCount: 32 },
    { language: 'TypeScript', repoCount: 28 }
  ],
  languageDiversity: 12,

  // Project Interests
  topTopics: [
    { topic: 'machine-learning', count: 15 },
    { topic: 'web-development', count: 12 }
  ],
  projectCategories: {
    ai_ml: 18,
    web: 35,
    mobile: 8,
    data: 12,
    devops: 5,
    security: 3,
    other: 10
  },

  // Contribution Patterns
  activityRhythm: 'night',                 // morning/afternoon/night
  avgCommitHour: 22,                       // 0-23 hour
  contributionStyle: 'collaborative',      // solo vs collaborative

  // Stats
  totalRepos: 91,
  originalRepos: 63,
  forkedRepos: 28,
  starredCount: 456,
  followingCount: 89,

  // Open Source Engagement
  publicGists: 12,
  followers: 234,
  openSourceContribution: 'active'         // active/occasional/minimal
}
```

---

### 4. **Discord Extraction** (`extractDiscordData`)

**API Endpoints Called:**
```javascript
GET /users/@me                              // Profile
GET /users/@me/guilds                       // Server memberships
```

**Extracted Patterns:**
```javascript
{
  // Community Involvement
  serverCount: 47,
  serverTypes: {
    gaming: 18,
    tech: 12,
    creative: 7,
    social: 6,
    educational: 4,
    other: 0
  },
  topServers: [
    { name: 'Server Name', memberCount: 12500, icon: 'url' }
  ],

  // Social Circles
  communityTypes: {
    gaming: 18,
    professional: 12,
    hobby: 10,
    social: 7
  },
  primaryCircle: 'gaming',

  // Engagement Level
  engagementLevel: 'very-high',            // very-high/high/moderate/low

  // User Profile
  username: 'User#1234',
  accountAge: '5 years'                    // Calculated from snowflake ID
}
```

---

### 5. **Netflix Extraction** (`extractNetflixData`)

**Input:** Browser extension sends viewing history JSON
```javascript
{
  viewingActivity: [
    { title: 'Show Name', date: '2024-01-15', duration: 3600, ... }
  ]
}
```

**Extracted Patterns:**
```javascript
{
  // Narrative Preferences
  topShows: [
    { title: 'Breaking Bad', episodes: 62, status: 'completed' },
    { title: 'Stranger Things', episodes: 15, status: 'in-progress' }
  ],

  // Binge Patterns
  avgBingeRate: 2.5,                       // Episodes per day
  bingeStyle: 'heavy-binger',              // heavy/moderate/casual
  completedSeries: 12,
  seriesCompletionRate: 0.68,              // 0-1 scale

  // Genre Distribution
  genreDistribution: {
    drama: 45,
    comedy: 28,
    documentary: 12,
    thriller: 18,
    action: 15,
    scifi: 22,
    romance: 8,
    horror: 5,
    other: 10
  },
  topGenre: 'drama',

  // Emotional Patterns
  emotionalJourney: 'seeking-intensity',   // comfort-seeking/intellectual-exploration/varied
  comfortRewatches: 3,
  rewatchTitles: ['The Office', 'Friends'],

  // Viewing Habits
  totalViewed: 487,
  viewingPattern: 'night',                 // morning/afternoon/evening/night
  avgViewingHour: 22,

  // Genre Evolution (taste changes)
  recentGenres: { drama: 25, thriller: 15, ... },
  olderGenres: { comedy: 30, romance: 12, ... }
}
```

---

## Architecture Features

### Standardized `SoulDataPoint` Format

Every extraction returns:
```javascript
{
  platform: 'spotify',                     // Platform identifier
  category: 'entertainment',               // entertainment/productivity/social
  dataType: 'musical_taste',               // Specific data type
  rawData: { ... },                        // Original API responses (subset)
  extractedPatterns: { ... },              // Computed patterns
  timestamp: 1234567890,                   // Extraction time
  quality: 'high'                          // high/medium/low data quality
}
```

### Error Handling Pattern

```javascript
// Rate Limiting
if (error.response?.status === 429) {
  return {
    platform: 'spotify',
    error: 'RATE_LIMITED',
    retryAfter: parseInt(retryAfter) || 60,
    timestamp: Date.now()
  };
}

// Token Expiration
if (error.response?.status === 401) {
  return {
    platform: 'spotify',
    error: 'TOKEN_EXPIRED',
    timestamp: Date.now()
  };
}

// Other Failures
return null;  // No fake fallbacks!
```

### API Response Caching

```javascript
const apiCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

function getCachedOrFetch(cacheKey, fetchFn) {
  const cached = apiCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return Promise.resolve(cached.data);
  }

  return fetchFn().then(data => {
    apiCache.set(cacheKey, { data, timestamp: Date.now() });
    return data;
  });
}
```

### Main Orchestrator

```javascript
extractPlatformSoulData(platform, userId, accessToken, extensionData)
```

Routes to appropriate extractor and saves to `soul_data` table:
```sql
INSERT INTO soul_data (
  user_id,
  platform,
  data_type,
  raw_data,
  extracted_patterns,
  extraction_quality,
  extracted_at
)
```

---

## Helper Functions (15 Total)

### Diversity & Analysis
- `calculateDiversity(frequencies)` - Shannon entropy for variety measurement
- `classifyEmotionalLandscape(features)` - Spotify audio features → mood
- `analyzeListeningTimes(recentTracks)` - Morning/night preference detection

### Categorization Functions
- `categorizeYouTubeChannels(subscriptions)` - Educational vs entertainment
- `categorizeGitHubProjects(topics)` - AI/web/mobile/data/devops/security
- `categorizeDiscordServers(guilds)` - Gaming/tech/creative/social
- `categorizeNetflixContent(viewingActivity)` - Drama/comedy/thriller/etc

### Pattern Detection
- `determineCurationStyle(playlists)` - Obsessive/active/casual curator
- `calculateLearningRatio(categories)` - Learning vs entertainment focus
- `determineCuriosityProfile(categories, diversity)` - Curiosity archetype
- `determineSocialCircles(guilds)` - Gaming/professional/hobby circles
- `detectEmotionalJourney(viewingActivity)` - Comfort-seeking vs intensity

### Utility Functions
- `calculateAccountAge(userId)` - Discord snowflake → account age
- `getCachedOrFetch(cacheKey, fetchFn)` - API caching layer
- `getSupabaseClient()` - Lazy Supabase initialization

---

## Integration with Existing Routes

### Update `api/routes/soul-extraction.js`

```javascript
import {
  extractSpotifyData,
  extractYouTubeData,
  extractGitHubData,
  extractDiscordData,
  extractNetflixData,
  extractPlatformSoulData
} from '../services/soulDataExtraction.js';

// Route: POST /api/soul-extraction/extract
router.post('/extract', authenticateUser, async (req, res) => {
  const { platform } = req.body;
  const userId = req.user.id;

  const result = await extractPlatformSoulData(platform, userId);

  if (!result) {
    return res.status(500).json({ error: 'Extraction failed' });
  }

  if (result.error === 'TOKEN_EXPIRED') {
    return res.status(401).json({
      error: 'Token expired',
      requiresReauth: true
    });
  }

  if (result.error === 'RATE_LIMITED') {
    return res.status(429).json({
      error: 'Rate limited',
      retryAfter: result.retryAfter
    });
  }

  res.json({
    success: true,
    platform: result.platform,
    quality: result.quality,
    patterns: result.extractedPatterns
  });
});
```

### Browser Extension Integration (Netflix)

```javascript
// Chrome Extension sends viewing history
chrome.runtime.sendMessage({
  action: 'extractNetflix',
  data: {
    viewingActivity: netflixHistory
  }
});

// Backend receives extension data
router.post('/extract-netflix', authenticateUser, async (req, res) => {
  const { viewingActivity } = req.body;
  const userId = req.user.id;

  const result = await extractNetflixData({ viewingActivity });

  // Save to database
  await supabase.from('soul_data').insert({
    user_id: userId,
    platform: 'netflix',
    data_type: 'viewing_history',
    raw_data: result.rawData,
    extracted_patterns: result.extractedPatterns,
    extraction_quality: result.quality
  });

  res.json({ success: true, quality: result.quality });
});
```

---

## Data Quality Indicators

Each extraction calculates quality based on data volume:

```javascript
// Spotify
quality: topTracks.length > 30 ? 'high' :
         topTracks.length > 10 ? 'medium' : 'low'

// YouTube
quality: subscriptions.length > 20 ? 'high' :
         subscriptions.length > 5 ? 'medium' : 'low'

// GitHub
quality: repos.length > 10 ? 'high' :
         repos.length > 3 ? 'medium' : 'low'

// Discord
quality: guilds.length > 10 ? 'high' :
         guilds.length > 3 ? 'medium' : 'low'

// Netflix
quality: viewingActivity.length > 50 ? 'high' :
         viewingActivity.length > 20 ? 'medium' : 'low'
```

---

## Testing Guide

### Unit Testing

```javascript
// Test Spotify extraction
import { extractSpotifyData } from './soulDataExtraction.js';

const mockToken = 'BQA...'; // Valid Spotify token
const result = await extractSpotifyData(mockToken);

assert(result.platform === 'spotify');
assert(result.extractedPatterns.topGenres.length > 0);
assert(result.quality === 'high');
```

### Integration Testing

```bash
# Test extraction endpoint
curl -X POST http://localhost:3001/api/soul-extraction/extract \
  -H "Authorization: Bearer {jwt_token}" \
  -H "Content-Type: application/json" \
  -d '{"platform": "spotify"}'

# Expected response
{
  "success": true,
  "platform": "spotify",
  "quality": "high",
  "patterns": {
    "topGenres": [...],
    "moodScore": 0.67,
    "diversityScore": 0.85,
    ...
  }
}
```

### Rate Limit Testing

```javascript
// Simulate rate limit
const results = await Promise.all(
  Array(20).fill(0).map(() => extractSpotifyData(token))
);

// Should return RATE_LIMITED error after threshold
const rateLimited = results.find(r => r.error === 'RATE_LIMITED');
assert(rateLimited !== undefined);
assert(rateLimited.retryAfter > 0);
```

---

## Database Schema Requirements

Ensure `soul_data` table exists:

```sql
CREATE TABLE IF NOT EXISTS soul_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  data_type TEXT NOT NULL,
  raw_data JSONB,
  extracted_patterns JSONB,
  extraction_quality TEXT CHECK (extraction_quality IN ('high', 'medium', 'low')),
  extracted_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_soul_data_user_platform ON soul_data(user_id, platform);
CREATE INDEX idx_soul_data_quality ON soul_data(extraction_quality);
```

---

## Performance Optimizations

### Parallel API Calls

All extractors use `Promise.all()` for concurrent requests:

```javascript
const [topArtists, topTracks, recentTracks, playlists] = await Promise.all([
  axios.get('/top/artists'),
  axios.get('/top/tracks'),
  axios.get('/recently-played'),
  axios.get('/playlists')
]);
```

### Response Caching

API responses cached for 5 minutes to prevent redundant calls:

```javascript
getCachedOrFetch('spotify-top-artists', fetchFunction)
```

### Payload Optimization

Only stores subsets in `raw_data` to avoid huge payloads:

```javascript
rawData: {
  topArtists: topArtists.slice(0, 20),  // Not all 50
  topTracks: topTracks.slice(0, 20)
}
```

---

## Next Steps

### Immediate Integration

1. **Import in `soul-extraction.js`**
   ```javascript
   import { extractPlatformSoulData } from '../services/soulDataExtraction.js';
   ```

2. **Update extraction route** to use new service

3. **Test each platform** with real OAuth tokens

### Future Enhancements

1. **Add More Platforms**
   - Reddit (discussion style, subreddit interests)
   - LinkedIn (professional trajectory, skills)
   - Goodreads (reading preferences, book genres)

2. **Enhanced Pattern Detection**
   - Temporal trend analysis (taste evolution over time)
   - Cross-platform correlations (gaming + music patterns)
   - Personality trait inference (Big Five from combined data)

3. **Real-Time Updates**
   - WebSocket support for live extraction progress
   - Incremental updates (only fetch new data since last sync)
   - Background job scheduling with Bull/Redis

4. **Advanced Caching**
   - Redis integration for distributed caching
   - Configurable cache TTL per platform
   - Smart cache invalidation on token refresh

---

## Key Differentiators

### From Old `dataExtraction.js`

**Old (Educational Focus):**
- Gmail analysis for teaching style
- Calendar patterns for schedule preferences
- Teams/Slack for collaboration
- Focus: "How does this person teach?"

**New (Soul Signature Focus):**
- Spotify for authentic musical taste
- YouTube for genuine curiosity profile
- Netflix for narrative preferences
- Discord for community involvement
- GitHub for technical passions
- Focus: "What makes this person uniquely themselves?"

### Production-Ready Features

✅ **No Fake Fallbacks** - Returns `null` instead of placeholder data
✅ **Comprehensive Error Handling** - Rate limits, token expiration, network errors
✅ **API Caching** - Prevents redundant calls and rate limit exhaustion
✅ **Standardized Format** - Consistent `SoulDataPoint` structure
✅ **Quality Scoring** - Data quality indicators (high/medium/low)
✅ **Graceful Degradation** - Partial data extraction when some endpoints fail
✅ **Detailed Logging** - Progress tracking for debugging
✅ **TypeScript-Ready** - Clear interfaces for type definitions

---

## Summary

This implementation provides a **production-grade soul data extraction service** that:

1. **Extracts from 5 platforms** (Spotify, YouTube, GitHub, Discord, Netflix)
2. **Returns standardized patterns** for personality analysis
3. **Handles failures gracefully** (rate limits, expired tokens)
4. **Caches API responses** to avoid rate limit issues
5. **Provides quality indicators** for data completeness
6. **Uses no fake fallbacks** - authentic data only
7. **Integrates with existing architecture** (Supabase, encryption, OAuth)

The service is ready to be integrated into `api/routes/soul-extraction.js` and used by the Soul Signature Dashboard for authentic personality discovery.

**Total Lines of Code:** 1,100+
**Functions:** 20+ (5 extractors + 15 helpers)
**API Endpoints:** 15+ across 5 platforms
**Error Handling:** Comprehensive (rate limits, token expiration, network failures)
**Quality:** Production-ready with caching, logging, and graceful degradation
