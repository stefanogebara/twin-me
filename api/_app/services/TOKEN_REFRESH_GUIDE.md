# Token Refresh Service - Production Guide

## Overview

The Token Refresh Service automatically manages OAuth access tokens for all connected platforms in the Soul Signature system. It prevents token expiration issues by proactively refreshing tokens before they expire.

## Features

✅ **Automatic Token Refresh** - Refreshes tokens 5 minutes before expiry
✅ **Platform-Specific Logic** - Handles Spotify (Basic Auth), Discord, Google OAuth
✅ **Retry with Exponential Backoff** - 3 attempts with jitter to avoid thundering herd
✅ **Rate Limit Handling** - Detects and waits for rate limits (429 errors)
✅ **Comprehensive Error States** - Tracks `connected`, `needs_reauth`, `error`, `expired`
✅ **Privacy-Safe Logging** - User IDs hashed in logs
✅ **Encrypted Storage** - All tokens encrypted with AES-256-GCM
✅ **Database Transaction Safety** - Atomic updates with proper error handling

## Supported Platforms

| Platform | Token Expiry | Auth Type | Status |
|----------|--------------|-----------|--------|
| **Spotify** | 1 hour | Basic Auth | ✅ Implemented |
| **Discord** | 7 days | Standard OAuth2 | ✅ Implemented |
| **YouTube** | 1 hour | Google OAuth2 | ✅ Implemented |
| **Gmail** | 1 hour | Google OAuth2 | ✅ Implemented |
| **Google Calendar** | 1 hour | Google OAuth2 | ✅ Implemented |
| **GitHub** | Never | Personal Access Token | ⏭️ No refresh needed |

## Installation

### 1. Install Dependencies

```bash
npm install node-cron @supabase/supabase-js axios
```

### 2. Environment Variables

Add these to your `.env` file:

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Encryption
ENCRYPTION_KEY=your-64-character-hex-key

# Platform OAuth Credentials
SPOTIFY_CLIENT_ID=your-spotify-client-id
SPOTIFY_CLIENT_SECRET=your-spotify-client-secret

DISCORD_CLIENT_ID=your-discord-client-id
DISCORD_CLIENT_SECRET=your-discord-client-secret

GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

**Generate Encryption Key:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Database Schema

Ensure your `platform_connections` table has these columns:

```sql
CREATE TABLE platform_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,

  -- Encrypted OAuth tokens
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMP,

  -- Connection status
  status TEXT DEFAULT 'connected'
    CHECK (status IN ('connected', 'token_expired', 'needs_reauth', 'disconnected', 'error')),

  -- Sync tracking
  last_sync_status TEXT DEFAULT 'pending',
  last_sync_error TEXT,

  -- Timestamps
  connected_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(user_id, platform)
);

-- Indexes for performance
CREATE INDEX idx_platform_connections_status
  ON platform_connections(status)
  WHERE status IN ('connected', 'token_expired');

CREATE INDEX idx_platform_connections_expiry
  ON platform_connections(token_expires_at)
  WHERE token_expires_at IS NOT NULL;
```

## Usage

### Basic Usage (Recommended)

The primary function to use in your API routes:

```javascript
import { getValidAccessToken } from './services/tokenRefreshService.js';

// In your API route
const token = await getValidAccessToken(userId, 'spotify');

if (!token) {
  return res.status(401).json({ error: 'Platform not connected' });
}

// Make API call with valid token
const response = await fetch('https://api.spotify.com/v1/me', {
  headers: { Authorization: `Bearer ${token}` }
});
```

**What it does:**
1. Checks if token exists in database
2. Checks if token is expiring within 5 minutes
3. If expiring, automatically refreshes token
4. Returns decrypted, valid access token
5. Handles all errors gracefully

### Manual Token Refresh

For admin endpoints or testing:

```javascript
import { refreshPlatformToken } from './services/tokenRefreshService.js';

const result = await refreshPlatformToken(userId, 'spotify');

if (result) {
  console.log('Token refreshed:', result.accessToken);
  console.log('Expires in:', result.expiresIn, 'seconds');
} else {
  console.log('Refresh failed - check connection status');
}
```

### Automatic Background Refresh (Cron)

Add this to your `api/server.js`:

```javascript
import { refreshExpiringTokens } from './services/tokenRefreshService.js';
import cron from 'node-cron';

// Run immediately on startup
await refreshExpiringTokens();

// Schedule to run every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  const results = await refreshExpiringTokens();
  console.log('Token refresh:', results);
});
```

**Cron Schedule Options:**
- `*/5 * * * *` - Every 5 minutes (recommended)
- `*/10 * * * *` - Every 10 minutes
- `0 * * * *` - Every hour
- `0 */4 * * *` - Every 4 hours

## Error Handling

### Error Classifications

The service automatically classifies errors and takes appropriate action:

| Error Type | HTTP Status | Action | Status Update |
|------------|-------------|--------|---------------|
| **Invalid Grant** | 400 | Stop, don't retry | `needs_reauth` |
| **Invalid Client** | 401 | Stop, log error | `error` |
| **Rate Limited** | 429 | Wait 60s, retry | (keep connected) |
| **Server Error** | 5xx | Exponential backoff, retry | (keep connected) |
| **Network Error** | N/A | Exponential backoff, retry | (keep connected) |
| **Unknown Error** | Other | Stop, mark needs reauth | `needs_reauth` |

### Retry Logic

**Exponential Backoff with Jitter:**
- Attempt 1: Wait 1-1.3 seconds
- Attempt 2: Wait 2-2.6 seconds
- Attempt 3: Wait 4-5.2 seconds
- Max delay: 30 seconds

**Rate Limit Handling:**
- Waits 60 seconds before retry
- Does not count against retry attempts

### Database Status Tracking

The service updates these fields in `platform_connections`:

```javascript
{
  status: 'connected' | 'needs_reauth' | 'error' | 'token_expired',
  last_sync_status: 'success' | 'error',
  last_sync_error: 'Error message or null',
  updated_at: '2025-01-20T10:30:00Z'
}
```

## Security

### Token Encryption

All tokens are encrypted before storage using AES-256-GCM:

```javascript
// Encrypted format: iv:authTag:ciphertext (all hex)
const encryptedToken = encryptToken(plainAccessToken);
// Example: "a1b2c3d4...e5f6:g7h8i9j0...k1l2:m3n4o5p6..."

// Decryption only when needed
const plainToken = decryptToken(encryptedToken);
```

### Privacy-Safe Logging

User IDs are hashed before logging:

```javascript
// Instead of: console.log('Refreshing token for user:', userId)
// We use:     console.log('Refreshing token for user:', hashUserId(userId))

// Example output:
// ✅ [spotify][a1b2c3d4] Token refreshed successfully
```

### Never Logs Plain Tokens

❌ **NEVER DO THIS:**
```javascript
console.log('Access token:', accessToken); // NEVER LOG PLAIN TOKENS!
```

✅ **INSTEAD DO THIS:**
```javascript
console.log('Access token length:', accessToken.length);
console.log('Access token prefix:', accessToken.substring(0, 8) + '...');
```

## Integration Examples

### Example 1: Spotify API Route

```javascript
// api/routes/spotify.js
import { getValidAccessToken } from '../services/tokenRefreshService.js';

router.get('/spotify/profile', async (req, res) => {
  const token = await getValidAccessToken(req.user.id, 'spotify');

  if (!token) {
    return res.status(401).json({
      error: 'Spotify not connected',
      reconnectUrl: '/connect/spotify'
    });
  }

  const response = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${token}` }
  });

  res.json(await response.json());
});
```

### Example 2: YouTube Data Extraction

```javascript
// api/services/youtubeExtraction.js
import { getValidAccessToken } from './tokenRefreshService.js';

export async function extractYouTubeData(userId) {
  const token = await getValidAccessToken(userId, 'youtube');

  if (!token) {
    throw new Error('YouTube not connected');
  }

  // Fetch subscriptions
  const subscriptions = await fetch(
    'https://www.googleapis.com/youtube/v3/subscriptions?mine=true&part=snippet',
    { headers: { Authorization: `Bearer ${token}` } }
  );

  return await subscriptions.json();
}
```

### Example 3: Platform Health Check

```javascript
// api/routes/platforms.js
import { getValidAccessToken } from '../services/tokenRefreshService.js';

router.get('/platforms/health', async (req, res) => {
  const platforms = ['spotify', 'youtube', 'discord'];

  const health = await Promise.all(
    platforms.map(async (platform) => {
      const token = await getValidAccessToken(req.user.id, platform);
      return {
        platform,
        connected: !!token,
        status: token ? 'healthy' : 'needs_reconnect'
      };
    })
  );

  res.json({ health });
});
```

### Example 4: Scheduled Background Jobs

```javascript
// api/server.js
import { refreshExpiringTokens } from './services/tokenRefreshService.js';
import cron from 'node-cron';

// Start server
const app = express();

// ... middleware and routes ...

// Token refresh service
cron.schedule('*/5 * * * *', async () => {
  console.log('⏰ Running scheduled token refresh...');
  const results = await refreshExpiringTokens();

  if (results.failed > 0) {
    console.error(`⚠️  ${results.failed} tokens failed to refresh`);
    // TODO: Send alert to monitoring service
  }
});

app.listen(3001, () => {
  console.log('✅ Server running on port 3001');
  console.log('✅ Automatic token refresh enabled');
});
```

## Monitoring & Observability

### Log Patterns

```bash
# Successful refresh
✅ [spotify][a1b2c3d4] Token refreshed successfully (expires in 3600s)

# Token expiring soon
🔄 [spotify][a1b2c3d4] Token expiring soon, refreshing...

# Retry with backoff
⏳ [spotify][a1b2c3d4] Temporary error, retrying in 2150ms

# Rate limited
⏳ [spotify][a1b2c3d4] Rate limited, waiting 60000ms before retry

# Needs reauth
🔐 [spotify][a1b2c3d4] Refresh token invalid/expired - user must re-authenticate

# Scheduled job
⏰ Running scheduled token refresh...
✅ [Scheduled] Token refresh complete: 5 refreshed, 0 failed
```

### Metrics to Track

```javascript
// Example metrics (use your monitoring service)
metrics.increment('token.refresh.success', { platform: 'spotify' });
metrics.increment('token.refresh.failed', { platform: 'spotify', reason: 'invalid_grant' });
metrics.histogram('token.refresh.duration_ms', durationMs);
metrics.gauge('tokens.expiring_soon', count);
```

### Database Queries for Monitoring

```sql
-- Tokens expiring in next hour
SELECT platform, COUNT(*)
FROM platform_connections
WHERE token_expires_at < NOW() + INTERVAL '1 hour'
GROUP BY platform;

-- Connections needing reauth
SELECT platform, COUNT(*)
FROM platform_connections
WHERE status = 'needs_reauth'
GROUP BY platform;

-- Failed refresh attempts
SELECT platform, last_sync_error, COUNT(*)
FROM platform_connections
WHERE last_sync_status = 'error'
GROUP BY platform, last_sync_error;
```

## Troubleshooting

### Problem: Tokens not refreshing automatically

**Causes:**
- Cron job not started
- Environment variables missing
- Database connection issues

**Solutions:**
```javascript
// 1. Verify cron is running
cron.schedule('*/5 * * * *', async () => {
  console.log('⏰ Cron triggered at:', new Date().toISOString());
  await refreshExpiringTokens();
});

// 2. Check environment variables
console.log('SPOTIFY_CLIENT_ID:', !!process.env.SPOTIFY_CLIENT_ID);
console.log('SPOTIFY_CLIENT_SECRET:', !!process.env.SPOTIFY_CLIENT_SECRET);

// 3. Test manual refresh
const result = await refreshPlatformToken(userId, 'spotify');
console.log('Manual refresh result:', result);
```

### Problem: "Invalid client credentials" error

**Causes:**
- Missing `SPOTIFY_CLIENT_ID` or `SPOTIFY_CLIENT_SECRET`
- Wrong credentials in `.env`
- OAuth app not configured correctly

**Solutions:**
1. Verify `.env` file has correct credentials
2. Check Spotify Developer Dashboard for client ID/secret
3. Ensure redirect URIs match OAuth app configuration
4. Restart server after updating `.env`

### Problem: "Refresh token invalid" error

**Causes:**
- User revoked access
- Refresh token expired (rare)
- Refresh token was used on another server

**Solutions:**
- User must reconnect platform
- Update UI to show "Reconnect required" badge
- Send email notification to user

### Problem: Rate limit errors (429)

**Causes:**
- Too many refresh requests
- Shared IP with high usage
- Platform API rate limits

**Solutions:**
```javascript
// Service automatically waits 60 seconds and retries
// But you can adjust the delay:
const RATE_LIMIT_RETRY_DELAY_MS = 120000; // 2 minutes instead of 1

// Or add delay between bulk refreshes:
for (const connection of connections) {
  await refreshPlatformToken(connection.user_id, connection.platform);
  await sleep(500); // Wait 500ms between each refresh
}
```

## Testing

### Manual Testing

```javascript
// Test token refresh for a specific user and platform
import { refreshPlatformToken } from './services/tokenRefreshService.js';

const userId = 'your-test-user-id';
const platform = 'spotify';

const result = await refreshPlatformToken(userId, platform);
console.log('Refresh result:', result);
```

### Unit Testing

```javascript
// Example test with Jest
describe('Token Refresh Service', () => {
  it('should refresh Spotify token successfully', async () => {
    const result = await refreshPlatformToken(testUserId, 'spotify');
    expect(result).toBeTruthy();
    expect(result.accessToken).toBeTruthy();
    expect(result.expiresIn).toBeGreaterThan(0);
  });

  it('should handle invalid grant error', async () => {
    // Mock invalid refresh token
    const result = await refreshPlatformToken(testUserId, 'spotify');
    expect(result).toBeNull();

    // Check status was updated
    const connection = await getConnection(testUserId, 'spotify');
    expect(connection.status).toBe('needs_reauth');
  });
});
```

## Performance Considerations

### Token Refresh Timing

- **Buffer: 5 minutes** - Tokens are refreshed 5 minutes before expiry
- **Scheduled job: Every 5 minutes** - Checks all connections for expiring tokens
- **On-demand refresh: Immediate** - When `getValidAccessToken()` detects expiry

### Database Load

With 1000 users and 3 platforms each (3000 connections):
- **Scheduled job queries:** 1 query every 5 minutes (12/hour)
- **Individual refreshes:** ~10-20 per 5 minutes (24-48/hour)
- **Total database updates:** ~30-40 per 5 minutes (360-480/hour)

This is negligible load for PostgreSQL.

### Memory Usage

- **Service singleton:** ~1-2 MB
- **Per refresh operation:** ~10-50 KB
- **Total memory impact:** Negligible

## Future Enhancements

### Planned Features

- [ ] Token refresh webhook notifications
- [ ] Slack/Discord alerts for failed refreshes
- [ ] Admin dashboard for token health
- [ ] Bulk token refresh API endpoint
- [ ] Platform-specific refresh strategies (Twitter, LinkedIn)
- [ ] Token refresh metrics dashboard
- [ ] Automated user reconnection emails

### Platform Roadmap

- [ ] Twitter/X OAuth 2.0
- [ ] LinkedIn OAuth 2.0
- [ ] Reddit OAuth 2.0
- [ ] Twitch OAuth 2.0
- [ ] GitHub OAuth App (instead of PAT)

## License

This service is part of the Soul Signature platform and follows the project's license.

## Support

For issues or questions:
1. Check logs for error messages
2. Verify environment variables
3. Test manual refresh
4. Check platform connection status in database
5. Review this documentation

**Common Log Prefixes:**
- ✅ Success
- 🔄 Refresh in progress
- ❌ Error
- ⚠️ Warning
- 🔐 Authentication required
- ⏳ Waiting/retrying
- 📧 Notification sent
