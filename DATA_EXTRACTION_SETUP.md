# Soul Signature Data Extraction - Implementation Status

## 🎉 Completed Work

### 1. ✅ Database Schema Design
Created comprehensive migration 003 with platform-specific tables for data extraction:

**Platform-Specific Tables:**
- `spotify_listening_data` & `spotify_playlists` - Music listening patterns, playlists, audio features
- `youtube_subscriptions` & `youtube_activity` - Channel subscriptions, likes, uploads, comments
- `discord_servers` & `discord_interaction_patterns` - Server membership, aggregated interactions
- `github_repositories` & `github_contributions` - Repositories, languages, contribution graphs
- `netflix_viewing_history` - Viewing history from CSV/DOM extraction
- `instagram_posts` - Posts data (limited, requires Business account)
- `twitter_tweets` & `twitter_interests` - Tweets and inferred interests (requires paid API)

**Soul Signature Aggregation Tables:**
- `soul_signature_profile` - Unified personality profile across all platforms
- `llm_training_context` - Prepared context chunks for LLM personalization
- `llm_conversation_seeds` - Example conversations for few-shot learning
- `extraction_status` - Track extraction progress per user-platform
- `platform_extraction_config` - Platform capabilities and API configurations

**Helper Functions:**
- `calculate_soul_signature_completeness()` - Calculate data completeness percentage
- `generate_llm_system_prompt()` - Generate LLM system prompt from soul signature data
- Automatic triggers for status updates and insights generation

**Location:** `supabase/migrations/003_soul_signature_platform_data.sql`

### 2. ✅ Platform Data Extraction Service
Created `platformDataExtraction.js` with complete extraction logic:

**Supported Platforms:**
- **Spotify**: Recently played, top tracks (short/medium/long term), playlists, audio features
- **YouTube**: Subscriptions, channel activities (likes, uploads, comments)
- **Discord**: Server membership, roles, categories (privacy-respecting - no individual messages)
- **GitHub**: Repositories, contribution graphs via GraphQL, languages, stats
- **Netflix**: CSV import support (DOM extraction ready to implement)
- **Instagram**: Placeholder (Basic Display API deprecated Dec 2024)
- **Twitter**: Placeholder (requires $100/month API access)

**Features:**
- Platform-specific API integrations with proper error handling
- Extraction status tracking
- Data quality metrics
- Privacy-first design (no individual message content stored)

**Location:** `api/services/platformDataExtraction.js`

### 3. ✅ Unified OAuth Callback Handler
Created comprehensive OAuth system with:

**OAuth Token Exchange:**
- Spotify OAuth 2.0 with client credentials
- Google/YouTube OAuth 2.0
- Discord OAuth 2.0
- GitHub OAuth 2.0

**Features:**
- Unified `/oauth/callback` endpoint for all platforms
- Secure token encryption and database storage
- Automatic data extraction trigger after successful OAuth
- Background processing (non-blocking)
- Manual extraction endpoint (`/oauth/extract/:provider`)
- Extraction status endpoint (`/oauth/status/:userId`)
- Disconnect endpoint (`/oauth/disconnect/:provider`)

**Location:** `api/routes/oauth-callback.js`

### 4. ✅ Server Integration
Registered new OAuth callback routes in `api/server.js`:
- Added import for `oauth-callback.js`
- Registered route at `/oauth/*`
- Server running on port 3001

---

## 🚧 Required Setup Steps

### Step 1: Apply Database Migrations

The database migrations haven't been applied yet. You need to run migrations 002 and 003:

**Option A: Using Supabase CLI (Recommended)**
```bash
# Install Supabase CLI if not installed
npm install -g supabase

# Link to your project
supabase link --project-ref lurebwaudisfilhuhmnj

# Apply migrations
supabase db push
```

**Option B: Using Supabase Dashboard**
1. Go to https://supabase.com/dashboard/project/lurebwaudisfilhuhmnj/editor
2. Copy contents of `supabase/migrations/002_data_integration_architecture.sql`
3. Run in SQL Editor
4. Copy contents of `supabase/migrations/003_soul_signature_platform_data.sql`
5. Run in SQL Editor

### Step 2: Configure OAuth Credentials

Add the following to your `.env` file:

```env
# Spotify OAuth
SPOTIFY_CLIENT_ID=your-spotify-client-id
SPOTIFY_CLIENT_SECRET=your-spotify-client-secret

# Google/YouTube OAuth (already configured)
GOOGLE_CLIENT_ID=your-existing-google-client-id
GOOGLE_CLIENT_SECRET=your-existing-google-client-secret

# Discord OAuth
DISCORD_CLIENT_ID=your-discord-client-id
DISCORD_CLIENT_SECRET=your-discord-client-secret

# GitHub OAuth
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# Token Encryption
TOKEN_ENCRYPTION_KEY=your-32-byte-hex-key
```

**Generate encryption key:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Step 3: Register OAuth Applications

For each platform, you need to register an OAuth application:

#### Spotify OAuth App
1. Go to https://developer.spotify.com/dashboard
2. Create new app
3. Add redirect URI: `http://localhost:8086/oauth/callback`
4. Get Client ID and Client Secret
5. Add to `.env`

#### Discord OAuth App
1. Go to https://discord.com/developers/applications
2. Create new application
3. Go to OAuth2 → Add redirect: `http://localhost:8086/oauth/callback`
4. Get Client ID and Client Secret
5. Add to `.env`

#### GitHub OAuth App
1. Go to https://github.com/settings/developers
2. Create new OAuth app
3. Authorization callback URL: `http://localhost:8086/oauth/callback`
4. Get Client ID and Client Secret
5. Add to `.env`

### Step 4: Update Connector Routes

The connector routes need to use the correct OAuth redirect URIs. Update these files:
- `api/routes/entertainment-connectors.js`
- `api/routes/additional-entertainment-connectors.js`

Make sure redirect URIs point to: `${process.env.VITE_APP_URL}/oauth/callback`

---

## 📊 How It Works - Complete Flow

### 1. User Clicks "Connect Spotify"
```
Frontend (Soul Signature Dashboard)
  ↓
POST /api/entertainment/connect/spotify
  ↓
Backend generates OAuth URL with state
  ↓
User redirected to Spotify login
```

### 2. User Authorizes Application
```
Spotify OAuth page
  ↓
User grants permissions
  ↓
Spotify redirects to: /oauth/callback?code=XXX&state=YYY
```

### 3. OAuth Callback Handler Processes
```
GET /oauth/callback
  ↓
Decode state (provider, userId)
  ↓
Exchange authorization code for access token
  ↓
Encrypt and store tokens in data_connectors table
  ↓
Trigger background data extraction
  ↓
Redirect back to Soul Signature Dashboard
```

### 4. Data Extraction (Background)
```
platformDataExtraction.extractPlatformData()
  ↓
Call Spotify API with access token
  ↓
Extract recently played, top tracks, playlists
  ↓
Store in spotify_listening_data & spotify_playlists tables
  ↓
Update extraction_status table
  ↓
Generate soul signature insights (coming soon)
```

### 5. Soul Signature Generation (Planned)
```
Extract data from all connected platforms
  ↓
Analyze patterns across platforms:
  - Music taste (Spotify)
  - Content preferences (YouTube, Netflix)
  - Community involvement (Discord)
  - Technical skills (GitHub)
  ↓
Aggregate into soul_signature_profile
  ↓
Generate LLM training context
  ↓
Feed to user's digital twin for personalization
```

---

## 🔄 Manual Testing Flow

Once migrations and OAuth credentials are configured:

### 1. Connect Spotify
```bash
# Open Soul Signature Dashboard
http://localhost:8086/soul-signature

# Click "Connect" on Spotify
# Authorize on Spotify
# Should redirect back with success

# Check database
SELECT * FROM data_connectors WHERE provider = 'spotify';
SELECT * FROM extraction_status WHERE provider = 'spotify';
```

### 2. Check Extracted Data
```bash
# Wait 10-30 seconds for background extraction
SELECT COUNT(*) FROM spotify_listening_data;
SELECT COUNT(*) FROM spotify_playlists;

# Check extraction status
curl http://localhost:3001/oauth/status/YOUR_USER_ID
```

### 3. Manual Extraction Trigger
```bash
# Trigger manual extraction
curl -X POST http://localhost:3001/oauth/extract/spotify \
  -H "Content-Type: application/json" \
  -d '{"userId": "YOUR_USER_ID"}'
```

---

## 📋 Next Steps (Prioritized)

### High Priority
1. **Apply Database Migrations** - Required for everything to work
2. **Configure OAuth Credentials** - Need real credentials for testing
3. **Test End-to-End Flow** - Verify OAuth → Token Storage → Data Extraction

### Medium Priority
4. **Implement Soul Signature Aggregation Service**
   - Analyze patterns across all connected platforms
   - Generate unified personality profile
   - Store in `soul_signature_profile` table

5. **Create LLM Context Generation Service**
   - Transform soul signature data into LLM-ready prompts
   - Generate conversation seeds
   - Store in `llm_training_context` and `llm_conversation_seeds`

6. **Add Scheduled Background Sync**
   - Periodic data refresh (hourly/daily)
   - Token refresh handling
   - Rate limit management

### Low Priority
7. **Handle Instagram & Twitter Limitations**
   - Document Instagram Business account requirement
   - Document Twitter API pricing
   - Implement manual data import alternatives

8. **Netflix DOM Extraction**
   - Research browser automation approach
   - Implement Playwright-based extraction
   - Store in `netflix_viewing_history`

---

## 🛠️ Development Tools

### View Extraction Logs
```bash
# Watch backend server logs
npm run server:dev

# Look for these log messages:
# 📊 Starting spotify data extraction...
# ✅ spotify extraction complete: 50 items extracted
```

### Database Queries
```sql
-- Check connected platforms
SELECT user_id, provider, connected_at, last_sync, total_synced
FROM data_connectors
WHERE is_active = true;

-- Check extraction status
SELECT provider, extraction_stage, total_items_extracted, last_error_message
FROM extraction_status;

-- Check Spotify data
SELECT track_name, artist_name, played_at
FROM spotify_listening_data
ORDER BY played_at DESC
LIMIT 10;

-- Check soul signature completeness
SELECT user_id,
       calculate_soul_signature_completeness(user_id) as completeness
FROM data_connectors
GROUP BY user_id;
```

---

## 🎯 Architecture Decisions

### Why This Approach?

1. **Privacy-First**: No individual message content stored, only aggregated patterns
2. **Incremental**: Users can connect platforms one at a time
3. **Transparent**: Full visibility into what data is collected
4. **Scalable**: Background processing prevents blocking
5. **Secure**: Token encryption, RLS policies, proper OAuth flows

### Data Extraction Philosophy

**"We search in the branches for what we only find in the roots"**

The platform focuses on extracting soul signature data - the authentic patterns that reveal who someone truly is:
- **Not** just what you post publicly
- **But** what you consume privately
- **Not** just your professional achievements
- **But** your genuine curiosities and interests

---

## 📚 Key Files Reference

| File | Purpose |
|------|---------|
| `supabase/migrations/003_soul_signature_platform_data.sql` | Database schema for all platform data |
| `api/services/platformDataExtraction.js` | Core extraction logic for all platforms |
| `api/routes/oauth-callback.js` | Unified OAuth callback handler |
| `api/routes/entertainment-connectors.js` | Platform connection initiators |
| `api/routes/additional-entertainment-connectors.js` | Additional platform connectors |
| `src/pages/SoulSignatureDashboard.tsx` | Frontend UI for connecting platforms |

---

## 🐛 Troubleshooting

### Error: "Could not find the table 'public.data_connectors'"
**Fix**: Apply database migrations (see Step 1 above)

### Error: "Spotify credentials not configured"
**Fix**: Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to .env (see Step 2)

### Error: "Token expired"
**Fix**: Reconnect the platform - token refresh not yet implemented

### Error: "Rate limit exceeded"
**Fix**: Wait and retry - rate limiting is per platform's API limits

---

## ✅ Success Criteria

You'll know the system is working when:
1. ✅ User can click "Connect Spotify" and complete OAuth flow
2. ✅ User sees "Connected" status in dashboard
3. ✅ Database has records in `data_connectors` and `extraction_status`
4. ✅ Platform data appears in platform-specific tables (e.g., `spotify_listening_data`)
5. ✅ Manual extraction endpoint returns insights
6. ✅ No errors in server logs

---

**Implementation Status**: 🟡 Ready for Testing (pending migrations + OAuth credentials)

**Estimated Time to Complete Setup**: 1-2 hours (mostly OAuth app registration)
