# Token Refresh Service - Integration Checklist

## Quick Start (5 Minutes)

### 1. Verify Environment Variables

```bash
# Check your .env file has these set:
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
ENCRYPTION_KEY=...

SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...

DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

**Generate encryption key if missing:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Update Your Server Startup (`api/server.js`)

Add automatic token refresh to your server:

```javascript
// api/server.js
import { refreshExpiringTokens } from './services/tokenRefreshService.js';
import cron from 'node-cron';

// ... your existing server setup ...

// Add this AFTER express app is created but BEFORE app.listen()

// Run initial token refresh on startup
console.log('🔄 Running initial token refresh...');
refreshExpiringTokens()
  .then(results => {
    console.log('✅ Initial token refresh complete:', results);
  })
  .catch(error => {
    console.error('⚠️  Initial token refresh failed:', error.message);
  });

// Schedule token refresh every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  console.log('⏰ Running scheduled token refresh...');
  try {
    const results = await refreshExpiringTokens();
    console.log('✅ Token refresh complete:', results);

    // Optional: Send alerts if many failures
    if (results.failed > 5) {
      console.error(`⚠️  HIGH FAILURE RATE: ${results.failed} tokens failed to refresh`);
      // TODO: Send alert to monitoring service (Slack, PagerDuty, etc.)
    }
  } catch (error) {
    console.error('❌ Scheduled token refresh failed:', error.message);
  }
});

console.log('✅ Automatic token refresh enabled (runs every 5 minutes)');

// ... rest of your server setup ...
```

### 3. Update Your API Routes

Replace manual token retrieval with automatic refresh:

**Before:**
```javascript
// ❌ OLD WAY - No automatic refresh
import { createClient } from '@supabase/supabase-js';

router.get('/spotify/profile', async (req, res) => {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: connection } = await supabase
    .from('platform_connections')
    .select('access_token')
    .eq('user_id', req.user.id)
    .eq('platform', 'spotify')
    .single();

  if (!connection) {
    return res.status(401).json({ error: 'Not connected' });
  }

  const token = decryptToken(connection.access_token);

  // Make API call...
});
```

**After:**
```javascript
// ✅ NEW WAY - Automatic token refresh
import { getValidAccessToken } from '../services/tokenRefreshService.js';

router.get('/spotify/profile', async (req, res) => {
  // This automatically refreshes if token is expiring within 5 minutes
  const token = await getValidAccessToken(req.user.id, 'spotify');

  if (!token) {
    return res.status(401).json({
      error: 'Spotify not connected',
      reconnectUrl: '/connect/spotify'
    });
  }

  // Make API call...
});
```

### 4. Test the Integration

```bash
# Option 1: Use the test script
node api/services/tokenRefreshService.test.js

# Option 2: Test manually via API
curl http://localhost:3001/api/spotify/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Option 3: Check logs for automatic refresh
# Look for: ✅ [spotify][user_hash] Token refreshed successfully
```

## Migration Guide

### Migrating from Old Token Refresh Service

If you have an existing `tokenRefreshService.js`, here's how to migrate:

#### Step 1: Backup Old File

```bash
cd api/services
cp tokenRefreshService.js tokenRefreshService.old.js
```

#### Step 2: Update Database References

The new service expects these columns in `platform_connections`:
- `access_token` (TEXT, encrypted)
- `refresh_token` (TEXT, encrypted)
- `token_expires_at` (TIMESTAMP)
- `status` (TEXT: connected|needs_reauth|error|token_expired)
- `last_sync_status` (TEXT: success|error)
- `last_sync_error` (TEXT, nullable)

**Migration SQL:**
```sql
-- Add missing columns if needed
ALTER TABLE platform_connections
ADD COLUMN IF NOT EXISTS last_sync_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS last_sync_error TEXT;

-- Update status values to new format
UPDATE platform_connections
SET status = CASE
  WHEN status = 'active' THEN 'connected'
  WHEN status = 'expired' THEN 'token_expired'
  WHEN status = 'inactive' THEN 'disconnected'
  ELSE status
END;
```

#### Step 3: Update Import Statements

Find all files importing the old service:

```bash
# Find all imports
grep -r "tokenRefreshService" api/routes/
grep -r "tokenRefreshService" api/services/
```

Update imports to use the new function names:

**Old:**
```javascript
import { ensureFreshToken, startTokenRefreshService } from './tokenRefreshService.js';
```

**New:**
```javascript
import { getValidAccessToken, refreshExpiringTokens } from './tokenRefreshService.js';
```

#### Step 4: Update Function Calls

| Old Function | New Function | Notes |
|--------------|--------------|-------|
| `ensureFreshToken(userId, platform)` | `getValidAccessToken(userId, platform)` | Same behavior |
| `startTokenRefreshService()` | Use `cron.schedule()` directly | See server.js example above |
| `checkAndRefreshExpiringTokens()` | `refreshExpiringTokens()` | Returns results object |
| `refreshAccessToken(platform, token, userId)` | `refreshPlatformToken(userId, platform)` | Note: parameter order changed |

#### Step 5: Test Migration

```bash
# Run tests
node api/services/tokenRefreshService.test.js

# Start server and check logs
npm run server:dev

# Look for:
# ✅ Initial token refresh complete
# ✅ Automatic token refresh enabled (runs every 5 minutes)
```

### Migrating from No Token Refresh

If you don't have automatic token refresh yet:

#### Step 1: Install Dependencies

```bash
npm install node-cron
```

#### Step 2: Add to Server Startup

See "Quick Start" section above for `server.js` integration.

#### Step 3: Update All Platform API Calls

Replace manual token retrieval with `getValidAccessToken()`:

```javascript
// Before
const { data } = await supabase
  .from('platform_connections')
  .select('access_token')
  .eq('user_id', userId)
  .eq('platform', 'spotify')
  .single();

const token = decryptToken(data.access_token);

// After
import { getValidAccessToken } from './services/tokenRefreshService.js';
const token = await getValidAccessToken(userId, 'spotify');
```

## Common Integration Patterns

### Pattern 1: API Route with Token Refresh

```javascript
import { getValidAccessToken } from '../services/tokenRefreshService.js';

router.get('/platforms/:platform/data', async (req, res) => {
  const { platform } = req.params;
  const userId = req.user.id;

  const token = await getValidAccessToken(userId, platform);

  if (!token) {
    return res.status(401).json({
      error: `${platform} not connected`,
      message: 'Please connect your account to continue',
      reconnectUrl: `/connect/${platform}`
    });
  }

  try {
    // Make platform API call with token
    const data = await fetchPlatformData(platform, token);
    res.json({ success: true, data });
  } catch (error) {
    // Handle 401 errors (token might be invalid)
    if (error.response?.status === 401) {
      return res.status(401).json({
        error: 'Token invalid',
        message: 'Please reconnect your account',
        reconnectUrl: `/connect/${platform}`
      });
    }
    throw error;
  }
});
```

### Pattern 2: Background Data Extraction

```javascript
import { getValidAccessToken } from './services/tokenRefreshService.js';

export async function extractUserData(userId, platforms) {
  const results = {};

  for (const platform of platforms) {
    try {
      const token = await getValidAccessToken(userId, platform);

      if (!token) {
        results[platform] = {
          success: false,
          error: 'Not connected or token refresh failed'
        };
        continue;
      }

      // Extract data with valid token
      const data = await extractPlatformData(platform, token);
      results[platform] = { success: true, data };

    } catch (error) {
      results[platform] = {
        success: false,
        error: error.message
      };
    }
  }

  return results;
}
```

### Pattern 3: Health Check Endpoint

```javascript
import { getValidAccessToken } from '../services/tokenRefreshService.js';
import { createClient } from '@supabase/supabase-js';

router.get('/health/tokens', async (req, res) => {
  const userId = req.user.id;
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: connections } = await supabase
    .from('platform_connections')
    .select('platform, status, token_expires_at')
    .eq('user_id', userId);

  const health = await Promise.all(
    connections.map(async (conn) => {
      const token = await getValidAccessToken(userId, conn.platform);
      const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at) : null;
      const minutesUntilExpiry = expiresAt
        ? Math.round((expiresAt - new Date()) / 1000 / 60)
        : null;

      return {
        platform: conn.platform,
        status: conn.status,
        tokenValid: !!token,
        expiresAt: conn.token_expires_at,
        minutesUntilExpiry,
        healthy: !!token && conn.status === 'connected'
      };
    })
  );

  res.json({
    healthy: health.every(h => h.healthy),
    connections: health
  });
});
```

### Pattern 4: Manual Refresh Endpoint (Admin)

```javascript
import { refreshPlatformToken } from '../services/tokenRefreshService.js';

router.post('/admin/refresh-token', async (req, res) => {
  const { userId, platform } = req.body;

  // Verify admin access
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const result = await refreshPlatformToken(userId, platform);

    if (result) {
      res.json({
        success: true,
        message: 'Token refreshed successfully',
        expiresIn: result.expiresIn
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Token refresh failed - check logs for details'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```

## Monitoring Integration

### Add Custom Logging

```javascript
// Create a wrapper for monitoring
import { getValidAccessToken as _getValidAccessToken } from './tokenRefreshService.js';

export async function getValidAccessToken(userId, platform) {
  const startTime = Date.now();
  const token = await _getValidAccessToken(userId, platform);
  const duration = Date.now() - startTime;

  // Log to monitoring service
  if (process.env.NODE_ENV === 'production') {
    logMetric('token.refresh.duration', duration, { platform });
    logMetric('token.refresh.success', token ? 1 : 0, { platform });
  }

  return token;
}
```

### Add Slack Alerts

```javascript
import { refreshExpiringTokens } from './services/tokenRefreshService.js';
import axios from 'axios';

cron.schedule('*/5 * * * *', async () => {
  const results = await refreshExpiringTokens();

  // Send alert if high failure rate
  if (results.failed > 5) {
    await axios.post(process.env.SLACK_WEBHOOK_URL, {
      text: `⚠️ Token Refresh Alert: ${results.failed} tokens failed to refresh`,
      attachments: [{
        color: 'danger',
        fields: [
          { title: 'Checked', value: results.checked, short: true },
          { title: 'Refreshed', value: results.refreshed, short: true },
          { title: 'Failed', value: results.failed, short: true }
        ]
      }]
    });
  }
});
```

## Troubleshooting Integration Issues

### Issue: Tokens not refreshing automatically

**Check:**
1. Is cron job running? Add `console.log()` in cron callback
2. Are environment variables set? Check `process.env.SPOTIFY_CLIENT_ID`
3. Is Supabase connection working? Test with manual query

**Solution:**
```javascript
// Add debugging to cron job
cron.schedule('*/5 * * * *', async () => {
  console.log('⏰ CRON TRIGGERED at', new Date().toISOString());
  const results = await refreshExpiringTokens();
  console.log('📊 Results:', JSON.stringify(results, null, 2));
});
```

### Issue: "Missing OAuth credentials" error

**Check:**
```bash
# Verify .env file
cat .env | grep SPOTIFY_CLIENT_ID
cat .env | grep SPOTIFY_CLIENT_SECRET

# Check if loaded
node -e "require('dotenv').config(); console.log(process.env.SPOTIFY_CLIENT_ID)"
```

**Solution:**
1. Add credentials to `.env`
2. Restart server
3. Run test script to verify

### Issue: Database errors

**Check:**
```sql
-- Verify table structure
\d platform_connections

-- Check for missing columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'platform_connections';
```

**Solution:**
Run migration SQL from "Migration Guide" section above.

## Rollback Plan

If you need to rollback the integration:

### Step 1: Stop Cron Job

```javascript
// Comment out in server.js
// cron.schedule('*/5 * * * *', ...);
```

### Step 2: Restore Old Service

```bash
cp api/services/tokenRefreshService.old.js api/services/tokenRefreshService.js
```

### Step 3: Revert Route Changes

```bash
git checkout api/routes/spotify.js
git checkout api/routes/youtube.js
# etc...
```

### Step 4: Restart Server

```bash
npm run server:dev
```

## Support Checklist

Before asking for help, verify:

- [ ] All environment variables are set in `.env`
- [ ] Encryption key is 64 hex characters (32 bytes)
- [ ] OAuth credentials are correct (verify in platform dashboards)
- [ ] Database has required columns
- [ ] Test script runs without errors
- [ ] Server logs show cron job running
- [ ] At least one platform is connected for test user

## Next Steps

After successful integration:

1. ✅ Monitor logs for first 24 hours
2. ✅ Set up alerts for high failure rates
3. ✅ Add health check endpoint to monitoring dashboard
4. ✅ Document any platform-specific quirks
5. ✅ Consider adding metrics to analytics service

---

**Need Help?**
- Check logs: `tail -f logs/server.log`
- Run tests: `node api/services/tokenRefreshService.test.js`
- Review guide: `cat api/services/TOKEN_REFRESH_GUIDE.md`
