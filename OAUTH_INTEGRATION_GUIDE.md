# OAuth 2.0 Integration Guide - Twin AI Learn

## Overview
Complete OAuth 2.0 implementation for Spotify, Discord, and GitHub with automatic token refresh, secure token storage, and data extraction pipelines.

## Platform Status

### ✅ Fully Implemented
1. **Spotify** - Musical Soul Signature
2. **Discord** - Community & Social Engagement
3. **GitHub** - Technical Skills & Coding Patterns

### 🔄 Infrastructure Status
- ✅ Token Refresh Service (automated every 5 minutes)
- ✅ Data Extraction Service (orchestrates all extractors)
- ✅ Encrypted Token Storage (AES-256-GCM)
- ✅ CSRF Protection (state validation)
- ✅ Rate Limiting (respects platform limits)
- ✅ Error Handling & Retry Logic

---

## Architecture Overview

```
┌─────────────────┐
│   Frontend      │
│  (React App)    │
└────────┬────────┘
         │
         │ 1. User clicks "Connect Spotify"
         ▼
┌─────────────────┐
│  POST /api/     │
│ entertainment/  │
│ connect/spotify │ 2. Generate OAuth URL + State
└────────┬────────┘
         │
         │ 3. Redirect to Spotify
         ▼
┌─────────────────┐
│  Spotify OAuth  │ 4. User authorizes
│   Authorization │
└────────┬────────┘
         │
         │ 5. Callback with code
         ▼
┌─────────────────┐
│  POST /api/     │
│  entertainment/ │ 6. Exchange code for tokens
│  oauth/callback │ 7. Encrypt & store tokens
└────────┬────────┘ 8. Trigger extraction
         │
         │ 9. Background extraction
         ▼
┌─────────────────┐
│ Data Extraction │
│    Service      │ 10. Extract listening history
│ (spotifyExtractor)│ 11. Store in database
└─────────────────┘
```

---

## 1. Spotify OAuth Integration

### Configuration
- **Client ID**: `006475a46fc44212af6ae6b3f4e48c08`
- **Redirect URI**: `http://127.0.0.1:8086/oauth/callback`
- **Scopes**: `user-top-read`, `user-read-recently-played`, `playlist-read-private`, `user-library-read`, `user-read-playback-state`

### API Endpoints

#### 1.1 Initiate OAuth Flow
```http
POST /api/entertainment/connect/spotify
Content-Type: application/json

{
  "userId": "user-uuid-here"
}
```

**Response:**
```json
{
  "success": true,
  "authUrl": "https://accounts.spotify.com/authorize?client_id=...",
  "message": "Connect your musical soul - discover your authentic taste"
}
```

**Frontend Usage:**
```typescript
const connectSpotify = async (userId: string) => {
  const response = await fetch('/api/entertainment/connect/spotify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId })
  });

  const { authUrl } = await response.json();
  window.location.href = authUrl; // Redirect to Spotify
};
```

#### 1.2 OAuth Callback (Automatic)
```http
POST /api/entertainment/oauth/callback
Content-Type: application/json

{
  "code": "AQD...",
  "state": "eyJwbGF0Zm9ybSI6InNwb3RpZnkiLCJ1c2VySWQiOiIuLi4ifQ=="
}
```

**Backend Processing:**
1. Validates state (CSRF protection)
2. Exchanges authorization code for access token
3. Encrypts tokens with AES-256-GCM
4. Stores in `platform_connections` table
5. Triggers background data extraction
6. Returns success response

#### 1.3 Data Extraction (Automatic)

**Extracted Data Types:**
- Recently played tracks (last 50)
- Top tracks (short, medium, long-term)
- Top artists (short, medium, long-term)
- User playlists (up to 20)
- Saved tracks (up to 200)

**Storage:**
```sql
INSERT INTO user_platform_data (
  user_id,
  platform,
  data_type,
  raw_data,
  extracted_at
) VALUES (
  '...',
  'spotify',
  'recently_played',
  '{"track_id": "...", "track_name": "...", ...}',
  NOW()
);
```

### Rate Limiting
- **Limit**: 180 requests per minute
- **Strategy**: Sleep 100-200ms between requests
- **Pagination**: Limit to reasonable data sizes (50 tracks, 20 playlists, 200 saved tracks)

---

## 2. Discord OAuth Integration

### Configuration
- **Client ID**: `1423392139995513093`
- **Redirect URI**: `http://127.0.0.1:8086/oauth/callback`
- **Scopes**: `identify`, `email`, `guilds`, `messages.read`

### API Endpoints

#### 2.1 Initiate OAuth Flow
```http
POST /api/mcp-connectors/connect/discord
Content-Type: application/json

{
  "userId": "user-uuid-here"
}
```

**Response:**
```json
{
  "success": true,
  "authUrl": "https://discord.com/api/oauth2/authorize?client_id=...",
  "message": "Redirect user to Discord OAuth"
}
```

#### 2.2 OAuth Callback (Handled by entertainment-connectors.js)
The OAuth callback handler in `entertainment-connectors.js` now supports Discord:

```javascript
case 'discord':
  const discordTokenResponse = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.VITE_APP_URL + '/oauth/callback'
    })
  });
```

#### 2.3 Data Extraction

**Extracted Data Types:**
- User profile (username, discriminator, avatar, premium status)
- Guilds (servers) - name, icon, member count, permissions
- Connections (linked accounts like Steam, Xbox, Spotify)

**Soul Signature Insights:**
- Community involvement patterns
- Gaming circles and interests
- Social engagement level
- Communication style across servers

### Rate Limiting
- **Limit**: 50 requests per second (global)
- **Strategy**: Respect Discord's rate limit headers
- **Exponential Backoff**: 1s → 2s → 4s → 8s on rate limits

---

## 3. GitHub OAuth Integration

### Configuration
- **Client ID**: `Ov23liY0gOsrEGMfcM9f`
- **Redirect URI**: `http://127.0.0.1:8086/oauth/callback`
- **Scopes**: `user`, `repo:read`, `read:org`

### API Endpoints

#### 3.1 Initiate OAuth Flow
```http
POST /api/entertainment/connect/github
Content-Type: application/json

{
  "userId": "user-uuid-here"
}
```

**Response:**
```json
{
  "success": true,
  "authUrl": "https://github.com/login/oauth/authorize?client_id=...",
  "message": "Connect your coding soul"
}
```

#### 3.2 OAuth Callback (Handled by entertainment-connectors.js)
```javascript
case 'github':
  const githubTokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: process.env.VITE_APP_URL + '/oauth/callback'
    })
  });
```

#### 3.3 Data Extraction

**Extracted Data Types:**
- Commits (up to 50 per repo, 20 repos)
- Issues & issue comments
- Pull requests (up to 30 per repo)
- Code reviews
- Repository metadata (languages, topics, stats)

**Soul Signature Insights:**
- Technical skills & programming languages
- Collaboration patterns (commits, PRs, reviews)
- Project interests & expertise areas
- Code quality & contribution frequency

### Rate Limiting
- **Limit**: 5,000 requests per hour
- **Strategy**: Use `@octokit/rest` which handles rate limits automatically
- **Pagination**: Limit to first 100 results per query

---

## Token Management

### Token Storage
All OAuth tokens are encrypted before storage using AES-256-GCM encryption:

```javascript
import { encryptToken } from '../services/encryption.js';

const encryptedAccessToken = encryptToken(accessToken);
const encryptedRefreshToken = encryptToken(refreshToken);

await supabase
  .from('platform_connections')
  .upsert({
    user_id: userId,
    platform: 'spotify',
    access_token: encryptedAccessToken,
    refresh_token: encryptedRefreshToken,
    token_expires_at: new Date(Date.now() + expiresIn * 1000),
    status: 'connected'
  });
```

### Automatic Token Refresh
The token refresh service runs every 5 minutes:

```javascript
// api/services/tokenRefreshService.js
cron.schedule('*/5 * * * *', () => {
  checkAndRefreshExpiringTokens();
});
```

**Refresh Strategy:**
1. Query database for tokens expiring within 10 minutes
2. Decrypt refresh token
3. Exchange refresh token for new access token
4. Encrypt and update tokens in database
5. Mark connection as `connected` on success
6. Mark as `needs_reauth` on 401/400 errors

### Token Refresh API
Manually refresh a token:

```http
POST /api/token/refresh
Content-Type: application/json

{
  "userId": "user-uuid-here",
  "platform": "spotify"
}
```

---

## Security Features

### 1. CSRF Protection
- State parameter generated with timestamp and user context
- Stored in `oauth_states` table with 10-minute expiration
- Validated in callback before token exchange
- Deleted after single use

```javascript
// Generate state
const state = Buffer.from(JSON.stringify({
  platform: 'spotify',
  userId,
  timestamp: Date.now()
})).toString('base64');

await supabase
  .from('oauth_states')
  .insert({
    state,
    data: { userId, platform: 'spotify', timestamp: Date.now() },
    expires_at: new Date(Date.now() + 600000) // 10 minutes
  });
```

### 2. Token Encryption
- AES-256-GCM encryption algorithm
- Unique IV (Initialization Vector) per token
- Encryption key stored in environment variable
- Auth tag for integrity verification

```javascript
// api/services/encryption.js
const algorithm = 'aes-256-gcm';
const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');

function encryptToken(token) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}
```

### 3. Error Handling
- 401 Unauthorized → Mark connection as `needs_reauth`
- 429 Rate Limit → Exponential backoff with jitter
- 5xx Server Errors → Retry without marking connection as failed
- Network timeouts → Retry with exponential backoff

---

## Data Extraction Pipeline

### Flow Diagram
```
OAuth Callback
     │
     │ Store encrypted tokens
     ▼
dataExtractionService.extractPlatformData(userId, platform)
     │
     │ Get valid access token (auto-refresh if needed)
     ▼
Create appropriate extractor (SpotifyExtractor, DiscordExtractor, GitHubExtractor)
     │
     │ Call extractor.extractAll(userId, connectorId)
     ▼
Extract data types (recently played, top tracks, guilds, repos, etc.)
     │
     │ Store in user_platform_data table
     ▼
Update extraction job status ('completed' or 'failed')
     │
     │ Update platform_connections.last_sync_status
     ▼
Notify frontend via WebSocket (optional)
```

### Extraction Jobs Table
```sql
CREATE TABLE data_extraction_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  connector_id UUID NOT NULL,
  platform TEXT NOT NULL,
  job_type TEXT NOT NULL, -- 'full_sync', 'incremental'
  status TEXT NOT NULL, -- 'pending', 'running', 'completed', 'failed'
  total_items INTEGER,
  processed_items INTEGER DEFAULT 0,
  failed_items INTEGER DEFAULT 0,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_message TEXT,
  results JSONB
);
```

---

## Testing OAuth Flows

### 1. Test Spotify OAuth
```bash
# Start backend
cd twin-ai-learn
npm run server:dev

# Start frontend
npm run dev

# Open browser to http://localhost:8086
# Click "Connect Spotify" button
# Authorize on Spotify
# Check backend logs for extraction progress
```

### 2. Test with cURL (Backend Only)
```bash
# Step 1: Initiate OAuth
curl -X POST http://localhost:3001/api/entertainment/connect/spotify \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-user-123"}'

# Response will include authUrl
# Copy authUrl and open in browser to authorize

# Step 2: After authorization, Spotify redirects to:
# http://localhost:8086/oauth/callback?code=AQD...&state=eyJ...

# Frontend should automatically POST to backend:
curl -X POST http://localhost:3001/api/entertainment/oauth/callback \
  -H "Content-Type: application/json" \
  -d '{
    "code": "AQD...",
    "state": "eyJ..."
  }'
```

### 3. Verify Token Storage
```sql
SELECT
  platform,
  status,
  token_expires_at,
  last_sync_status,
  connected_at
FROM platform_connections
WHERE user_id = 'test-user-123';
```

### 4. Check Extraction Jobs
```sql
SELECT
  platform,
  status,
  total_items,
  started_at,
  completed_at,
  error_message
FROM data_extraction_jobs
WHERE user_id = 'test-user-123'
ORDER BY started_at DESC;
```

### 5. Verify Extracted Data
```sql
SELECT
  platform,
  data_type,
  COUNT(*) as count,
  MAX(extracted_at) as last_extraction
FROM user_platform_data
WHERE user_id = 'test-user-123'
GROUP BY platform, data_type
ORDER BY platform, data_type;
```

---

## Common Issues & Troubleshooting

### Issue: "Invalid redirect URI"
**Cause**: Redirect URI in platform developer console doesn't match the one sent in OAuth request.

**Solution**:
1. Go to platform developer console
2. Add `http://127.0.0.1:8086/oauth/callback` as redirect URI
3. For Spotify: Use exact match (no trailing slash)
4. For Discord/GitHub: Ensure protocol and port match exactly

### Issue: "Token refresh failed"
**Cause**: Refresh token expired or revoked.

**Solution**:
1. Check `platform_connections` table for `status = 'needs_reauth'`
2. User must reconnect by clicking "Connect [Platform]" again
3. Frontend should show "Reconnect" button for platforms with this status

### Issue: "Extraction job failed with 401"
**Cause**: Access token expired during extraction.

**Solution**:
- Token refresh service automatically handles this
- If issue persists, check `tokenRefreshService.js` logs
- Verify OAuth client credentials are correct

### Issue: "Rate limit exceeded"
**Cause**: Too many API requests in short time.

**Solution**:
- Extractors already have rate limiting built in
- Check for multiple simultaneous extraction jobs
- Increase sleep time between requests in extractor

---

## Environment Variables Reference

```env
# Platform OAuth Credentials
SPOTIFY_CLIENT_ID=006475a46fc44212af6ae6b3f4e48c08
SPOTIFY_CLIENT_SECRET=306028e25a3c44448bfcfbd53bf71e16

DISCORD_CLIENT_ID=1423392139995513093
DISCORD_CLIENT_SECRET=6OfE2epyUKnS8ztzInBQJPCaBXIxEuHd

GITHUB_CLIENT_ID=Ov23liY0gOsrEGMfcM9f
GITHUB_CLIENT_SECRET=9d1cd23738f0b5ea2ac8c72072700db6a8063539

# App URLs (IMPORTANT: Use 127.0.0.1 for local dev)
VITE_APP_URL=http://127.0.0.1:8086
APP_URL=http://127.0.0.1:8086
VITE_API_URL=http://127.0.0.1:3001/api

# Security
ENCRYPTION_KEY=d6a89050da093a7d10c4d23318e196d9ff9380322d04ad74141d33a072c21cc7
JWT_SECRET=d1NBxa_7PbQzbgejr5tsBhwRk9sZB-f58gKSmjs0qvo

# Database
SUPABASE_URL=https://lurebwaudisfilhuhmnj.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
```

---

## API Route Summary

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/entertainment/connect/spotify` | POST | Initiate Spotify OAuth |
| `/api/entertainment/connect/github` | POST | Initiate GitHub OAuth |
| `/api/mcp-connectors/connect/discord` | POST | Initiate Discord OAuth |
| `/api/entertainment/oauth/callback` | POST | Handle OAuth callbacks (Spotify, GitHub) |
| `/api/mcp-connectors/oauth/callback` | POST | Handle OAuth callbacks (Discord, Slack, Teams) |
| `/api/entertainment/extract/spotify` | POST | Manual Spotify extraction |
| `/api/mcp-connectors/extract/discord` | POST | Manual Discord extraction |
| `/api/mcp-connectors/extract/github` | POST | Manual GitHub extraction |

---

## File Structure

```
twin-ai-learn/
├── api/
│   ├── routes/
│   │   ├── entertainment-connectors.js  # Spotify, GitHub OAuth
│   │   ├── mcp-connectors.js           # Discord, Slack, Teams OAuth
│   │   └── webhooks.js                 # Platform webhooks (future)
│   ├── services/
│   │   ├── tokenRefreshService.js      # Auto token refresh (runs every 5min)
│   │   ├── dataExtractionService.js    # Orchestrates extractors
│   │   ├── encryption.js               # AES-256-GCM token encryption
│   │   └── extractors/
│   │       ├── spotifyExtractor.js     # Spotify data extraction
│   │       ├── discordExtractor.js     # Discord data extraction
│   │       └── githubExtractor.js      # GitHub data extraction
│   └── config/
│       └── platformConfigs.js          # OAuth configs for all platforms
├── .env                                # OAuth credentials & secrets
└── OAUTH_INTEGRATION_GUIDE.md         # This file
```

---

## Next Steps

### Immediate
1. ✅ Test Spotify OAuth flow end-to-end
2. ✅ Test Discord OAuth flow end-to-end
3. ✅ Test GitHub OAuth flow end-to-end
4. ✅ Verify token refresh works automatically
5. ✅ Verify data extraction stores data correctly

### Future Enhancements
1. Add incremental sync (only fetch new data)
2. Implement webhook receivers for real-time updates
3. Add data polling schedules (every 24 hours)
4. Build soul signature analysis from extracted data
5. Create privacy controls for data revelation levels
6. Implement data export for GDPR compliance
7. Add platform connection status dashboard

---

## Support & Resources

### Platform Documentation
- [Spotify Web API](https://developer.spotify.com/documentation/web-api)
- [Discord API](https://discord.com/developers/docs/intro)
- [GitHub REST API](https://docs.github.com/rest)

### OAuth 2.0 Resources
- [OAuth 2.0 RFC](https://datatracker.ietf.org/doc/html/rfc6749)
- [OAuth 2.0 Security Best Practices](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics)

### Internal Resources
- Token Refresh Service: `api/services/tokenRefreshService.js`
- Data Extraction Service: `api/services/dataExtractionService.js`
- Encryption Service: `api/services/encryption.js`
- Platform Configs: `api/config/platformConfigs.js`

---

**Last Updated**: January 2025
**Maintainer**: Twin AI Learn Development Team
