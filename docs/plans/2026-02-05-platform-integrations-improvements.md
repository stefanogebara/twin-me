# Platform Integrations & Data Extraction Improvements

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix LinkedIn integration, enable new user OAuth connections, add new platform integrations (Garmin, Strava, Fitbit), and improve data extraction with better error handling and retry logic.

**Architecture:** Modular platform configuration system in `nangoService.js` with per-platform extractors, dynamic connection ID management stored in Supabase, and graceful error handling with exponential backoff retry.

**Tech Stack:** Node.js, Express, Nango SDK, Supabase, OAuth 2.0

---

## Phase 1: Fix LinkedIn API Integration

### Task 1.1: Update LinkedIn to use OpenID Connect endpoints

**Files:**
- Modify: `api/services/nangoService.js:126-136`

**Step 1: Write the failing test**

Create file `api/tests/linkedin-extraction.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractPlatformData } from '../services/nangoService.js';

describe('LinkedIn Extraction', () => {
  it('should use OpenID Connect userinfo endpoint', async () => {
    const mockProxyRequest = vi.fn().mockResolvedValue({
      success: true,
      data: { sub: '123', name: 'Test User', email: 'test@example.com' }
    });

    // This test will fail until we update the endpoint
    const result = await extractPlatformData('test-user', 'linkedin');
    expect(result.extractedData.data.profile).toBeDefined();
    expect(result.extractedData.data.profile.error).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /c/Users/stefa/twin-ai-learn && npm test -- api/tests/linkedin-extraction.test.js`
Expected: FAIL (test file doesn't exist yet or LinkedIn returns 403)

**Step 3: Update LinkedIn configuration**

In `api/services/nangoService.js`, replace lines 126-136:

```javascript
  linkedin: {
    providerConfigKey: 'linkedin',
    name: 'LinkedIn',
    category: 'professional',
    // LinkedIn v2 API requires Marketing Developer Platform access
    // Use OpenID Connect userinfo endpoint which works with basic OAuth
    baseUrl: 'https://api.linkedin.com',
    endpoints: {
      // OpenID Connect userinfo - works with basic Sign In with LinkedIn
      profile: '/v2/userinfo'
    },
    soulDataPoints: ['professional_identity', 'career_context'],
    note: 'Full LinkedIn API access requires Marketing Developer Platform approval'
  },
```

**Step 4: Test the extraction manually**

Run: `curl -s -X GET "http://localhost:3004/api/nango/extract/linkedin" -H "Authorization: Bearer <JWT>"`
Expected: Either profile data or clear error message about API access

**Step 5: Commit**

```bash
git add api/services/nangoService.js
git commit -m "fix(linkedin): use OpenID Connect userinfo endpoint for basic profile access"
```

---

### Task 1.2: Add LinkedIn API access documentation

**Files:**
- Create: `docs/platform-setup/linkedin-api-setup.md`

**Step 1: Create documentation file**

```markdown
# LinkedIn API Setup Guide

## Current Status
LinkedIn's API has become increasingly restrictive. The platform currently supports:

### What Works (OpenID Connect)
- Basic profile info via `/v2/userinfo` endpoint
- Requires: `openid`, `profile`, `email` scopes

### What Requires Approval
Full LinkedIn API access (posts, connections, company data) requires:
1. LinkedIn Marketing Developer Platform membership
2. App review and approval (can take 2-4 weeks)
3. Specific use case justification

## How to Get Full API Access

1. Go to https://www.linkedin.com/developers/
2. Create an app or select existing app
3. Request access to Marketing Developer Platform
4. Complete the app review process
5. Once approved, update Nango integration with new scopes

## Nango Configuration
After approval, update the LinkedIn integration in Nango dashboard:
- Add scopes: `r_liteprofile`, `r_emailaddress`, `w_member_social`
- Update redirect URI if needed
```

**Step 2: Commit**

```bash
git add docs/platform-setup/linkedin-api-setup.md
git commit -m "docs: add LinkedIn API setup guide explaining access requirements"
```

---

## Phase 2: Dynamic Connection Management (Fix Nango Plan Limit)

### Task 2.1: Create database table for connection mappings

**Files:**
- Create: `database/migrations/20260205_connection_mappings.sql`

**Step 1: Write the migration SQL**

```sql
-- Create table to store Nango connection ID mappings per user
CREATE TABLE IF NOT EXISTS nango_connection_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL,
  nango_connection_id VARCHAR(100) NOT NULL,
  provider_config_key VARCHAR(50) NOT NULL,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'active',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, platform)
);

-- Index for fast lookups
CREATE INDEX idx_connection_mappings_user_platform
ON nango_connection_mappings(user_id, platform);

-- RLS policies
ALTER TABLE nango_connection_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own connections" ON nango_connection_mappings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own connections" ON nango_connection_mappings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own connections" ON nango_connection_mappings
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own connections" ON nango_connection_mappings
  FOR DELETE USING (auth.uid() = user_id);
```

**Step 2: Apply migration via Supabase**

Run in Supabase SQL Editor or via CLI:
```bash
supabase db push
```

**Step 3: Commit**

```bash
git add database/migrations/20260205_connection_mappings.sql
git commit -m "feat(db): add nango_connection_mappings table for dynamic connection management"
```

---

### Task 2.2: Create connection mapping service

**Files:**
- Create: `api/services/connectionMappingService.js`

**Step 1: Write the service**

```javascript
/**
 * Connection Mapping Service
 * Manages Nango connection ID mappings per user in Supabase
 */

import { supabaseAdmin } from './database.js';

export async function getConnectionId(userId, platform) {
  const { data, error } = await supabaseAdmin
    .from('nango_connection_mappings')
    .select('nango_connection_id')
    .eq('user_id', userId)
    .eq('platform', platform)
    .eq('status', 'active')
    .single();

  if (error || !data) {
    console.log(`[ConnectionMapping] No mapping found for ${platform} (user: ${userId})`);
    return null;
  }

  return data.nango_connection_id;
}

export async function saveConnectionMapping(userId, platform, nangoConnectionId, providerConfigKey) {
  const { data, error } = await supabaseAdmin
    .from('nango_connection_mappings')
    .upsert({
      user_id: userId,
      platform,
      nango_connection_id: nangoConnectionId,
      provider_config_key: providerConfigKey,
      connected_at: new Date().toISOString(),
      status: 'active'
    }, {
      onConflict: 'user_id,platform'
    })
    .select()
    .single();

  if (error) {
    console.error(`[ConnectionMapping] Error saving mapping:`, error);
    throw error;
  }

  console.log(`[ConnectionMapping] Saved mapping for ${platform} (user: ${userId})`);
  return data;
}

export async function deleteConnectionMapping(userId, platform) {
  const { error } = await supabaseAdmin
    .from('nango_connection_mappings')
    .update({ status: 'disconnected' })
    .eq('user_id', userId)
    .eq('platform', platform);

  if (error) {
    console.error(`[ConnectionMapping] Error deleting mapping:`, error);
    throw error;
  }

  console.log(`[ConnectionMapping] Disconnected ${platform} for user ${userId}`);
}

export async function getAllUserConnections(userId) {
  const { data, error } = await supabaseAdmin
    .from('nango_connection_mappings')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (error) {
    console.error(`[ConnectionMapping] Error getting connections:`, error);
    return [];
  }

  return data || [];
}

export async function updateLastSynced(userId, platform) {
  await supabaseAdmin
    .from('nango_connection_mappings')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('platform', platform);
}

export default {
  getConnectionId,
  saveConnectionMapping,
  deleteConnectionMapping,
  getAllUserConnections,
  updateLastSynced
};
```

**Step 2: Commit**

```bash
git add api/services/connectionMappingService.js
git commit -m "feat: add connectionMappingService for dynamic Nango connection management"
```

---

### Task 2.3: Update nangoService to use dynamic mappings

**Files:**
- Modify: `api/services/nangoService.js:24-49`

**Step 1: Update the imports and getConnectionId function**

Replace lines 24-49 in `api/services/nangoService.js`:

```javascript
import { getConnectionId as getDbConnectionId, updateLastSynced } from './connectionMappingService.js';

// Fallback connection IDs (for backwards compatibility during migration)
const FALLBACK_CONNECTION_IDS = {
  'spotify': '3e7a5d77-4e87-4af4-bdac-c9c817955037',
  'google-calendar': 'a8902250-3d55-4aca-8f5e-e5dbd54cd2c5',
  'whoop': '21d7e76c-41e9-4119-b953-7f9872f3db62',
  'discord': '74263fd1-b2e2-4a31-b4b3-c6917dcebff1',
  'github': 'd983f21d-0648-462d-8168-ade982c0d4d3',
  'github-getting-started': 'd983f21d-0648-462d-8168-ade982c0d4d3',
  'linkedin': 'f2c0b934-10d9-4aaf-ae22-6010762c90be',
  'youtube': 'aa34e681-f825-432f-954f-c400ce6f6597',
  'reddit': 'd0ff07a2-437d-4ee2-a073-c097682809ac',
  'google-mail': 'bedc8ec1-4c7a-44ca-8e73-e0b62d50fdd9',
  'twitch': 'a1e97928-3191-4a2c-98a2-e0433356942a',
  'outlook': 'e4ed0f1b-c626-496a-8cbf-83f5f3635358'
};

// Helper to get connection ID - checks database first, falls back to hardcoded
async function getConnectionId(platform, userId) {
  // Try database first (for new users)
  const dbConnectionId = await getDbConnectionId(userId, platform);
  if (dbConnectionId) {
    return dbConnectionId;
  }

  // Fall back to hardcoded IDs (for existing test user)
  if (FALLBACK_CONNECTION_IDS[platform]) {
    return FALLBACK_CONNECTION_IDS[platform];
  }

  // Last resort: use userId
  return userId;
}
```

**Step 2: Update proxyRequest to be async-aware**

The `proxyRequest` function needs to await `getConnectionId`. Update line 333:

```javascript
const connectionId = options.connectionId || await getConnectionId(platform, userId);
```

**Step 3: Test extraction still works**

Run: `curl -s -X GET "http://localhost:3004/api/nango/extract/spotify" -H "Authorization: Bearer <JWT>"`
Expected: Spotify data returned successfully

**Step 4: Commit**

```bash
git add api/services/nangoService.js
git commit -m "feat: update nangoService to use dynamic connection mappings with fallback"
```

---

### Task 2.4: Update Nango webhook to save connection mappings

**Files:**
- Modify: `api/routes/nango.js` (add webhook handler or update existing)

**Step 1: Add webhook endpoint for new connections**

Add to `api/routes/nango.js`:

```javascript
import { saveConnectionMapping } from '../services/connectionMappingService.js';

/**
 * POST /api/nango/webhook - Handle Nango connection webhooks
 */
router.post('/webhook', async (req, res) => {
  try {
    const { type, connectionId, providerConfigKey, endUser } = req.body;

    console.log(`[Nango Webhook] Received: ${type} for ${providerConfigKey}`);

    if (type === 'connection.created' || type === 'connection.updated') {
      // Extract user ID from endUser object
      const userId = endUser?.id;

      if (userId && connectionId && providerConfigKey) {
        // Map provider config key to our platform key
        const platform = providerConfigKey.replace('-getting-started', '');

        await saveConnectionMapping(userId, platform, connectionId, providerConfigKey);
        console.log(`[Nango Webhook] Saved connection mapping for ${platform}`);
      }
    }

    if (type === 'connection.deleted') {
      const userId = endUser?.id;
      const platform = providerConfigKey.replace('-getting-started', '');

      if (userId && platform) {
        await deleteConnectionMapping(userId, platform);
        console.log(`[Nango Webhook] Deleted connection mapping for ${platform}`);
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[Nango Webhook] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
```

**Step 2: Configure webhook in Nango dashboard**

1. Go to Nango Dashboard > Settings > Webhooks
2. Add webhook URL: `https://your-domain.com/api/nango/webhook`
3. Enable events: `connection.created`, `connection.updated`, `connection.deleted`

**Step 3: Commit**

```bash
git add api/routes/nango.js
git commit -m "feat: add Nango webhook handler to save connection mappings"
```

---

## Phase 3: Add New Platform Integrations

### Task 3.1: Add Garmin Connect configuration

**Files:**
- Modify: `api/services/nangoService.js` (add to PLATFORM_CONFIGS)

**Step 1: Add Garmin configuration**

Add after the `outlook` config in `PLATFORM_CONFIGS`:

```javascript
  garmin: {
    providerConfigKey: 'garmin',
    name: 'Garmin Connect',
    category: 'health',
    baseUrl: 'https://apis.garmin.com',
    endpoints: {
      // Garmin Health API endpoints
      userProfile: '/wellness-api/rest/user/id',
      dailySummary: '/wellness-api/rest/dailies',
      activities: '/wellness-api/rest/activities',
      sleepData: '/wellness-api/rest/sleepData',
      heartRate: '/wellness-api/rest/heartRate/latest'
    },
    soulDataPoints: ['fitness_activities', 'sleep_patterns', 'heart_rate_trends', 'training_load']
  },
```

**Step 2: Add Garmin convenience methods**

Add after the `outlook` convenience methods:

```javascript
export const garmin = {
  getUserProfile: (userId) => proxyRequest(userId, 'garmin', '/wellness-api/rest/user/id'),
  getDailySummary: (userId) => proxyRequest(userId, 'garmin', '/wellness-api/rest/dailies'),
  getActivities: (userId) => proxyRequest(userId, 'garmin', '/wellness-api/rest/activities'),
  getSleepData: (userId) => proxyRequest(userId, 'garmin', '/wellness-api/rest/sleepData'),
  getHeartRate: (userId) => proxyRequest(userId, 'garmin', '/wellness-api/rest/heartRate/latest')
};
```

**Step 3: Commit**

```bash
git add api/services/nangoService.js
git commit -m "feat: add Garmin Connect platform configuration"
```

---

### Task 3.2: Add Strava configuration

**Files:**
- Modify: `api/services/nangoService.js`

**Step 1: Add Strava configuration**

```javascript
  strava: {
    providerConfigKey: 'strava',
    name: 'Strava',
    category: 'health',
    baseUrl: 'https://www.strava.com/api/v3',
    endpoints: {
      athlete: '/athlete',
      activities: '/athlete/activities?per_page=50',
      stats: '/athletes/{athleteId}/stats',
      zones: '/athlete/zones'
    },
    soulDataPoints: ['running_patterns', 'cycling_habits', 'training_consistency', 'social_fitness']
  },
```

**Step 2: Add Strava convenience methods**

```javascript
export const strava = {
  getAthlete: (userId) => proxyRequest(userId, 'strava', '/athlete'),
  getActivities: (userId, page = 1) => proxyRequest(userId, 'strava', `/athlete/activities?per_page=50&page=${page}`),
  getStats: (userId, athleteId) => proxyRequest(userId, 'strava', `/athletes/${athleteId}/stats`),
  getZones: (userId) => proxyRequest(userId, 'strava', '/athlete/zones')
};
```

**Step 3: Commit**

```bash
git add api/services/nangoService.js
git commit -m "feat: add Strava platform configuration"
```

---

### Task 3.3: Add Fitbit configuration

**Files:**
- Modify: `api/services/nangoService.js`

**Step 1: Add Fitbit configuration**

```javascript
  fitbit: {
    providerConfigKey: 'fitbit',
    name: 'Fitbit',
    category: 'health',
    baseUrl: 'https://api.fitbit.com',
    endpoints: {
      profile: '/1/user/-/profile.json',
      activities: '/1/user/-/activities/date/today.json',
      sleep: '/1.2/user/-/sleep/date/today.json',
      heartRate: '/1/user/-/activities/heart/date/today/1d.json',
      weight: '/1/user/-/body/log/weight/date/today.json'
    },
    soulDataPoints: ['daily_activity', 'sleep_quality', 'heart_health', 'weight_trends']
  },
```

**Step 2: Add Fitbit convenience methods**

```javascript
export const fitbit = {
  getProfile: (userId) => proxyRequest(userId, 'fitbit', '/1/user/-/profile.json'),
  getActivities: (userId, date = 'today') => proxyRequest(userId, 'fitbit', `/1/user/-/activities/date/${date}.json`),
  getSleep: (userId, date = 'today') => proxyRequest(userId, 'fitbit', `/1.2/user/-/sleep/date/${date}.json`),
  getHeartRate: (userId, date = 'today') => proxyRequest(userId, 'fitbit', `/1/user/-/activities/heart/date/${date}/1d.json`)
};
```

**Step 3: Commit**

```bash
git add api/services/nangoService.js
git commit -m "feat: add Fitbit platform configuration"
```

---

### Task 3.4: Configure new platforms in Nango dashboard

**Files:**
- Documentation only (Nango dashboard configuration)

**Step 1: Configure Garmin in Nango**

1. Go to Nango Dashboard > Integrations
2. Add new integration: `garmin`
3. Set OAuth credentials (from Garmin Developer Portal)
4. Scopes: `GARMIN_HEALTH_API_WELLNESS_READ`

**Step 2: Configure Strava in Nango**

1. Add new integration: `strava`
2. Set OAuth credentials (from Strava API Settings)
3. Scopes: `read,activity:read_all,profile:read_all`

**Step 3: Configure Fitbit in Nango**

1. Add new integration: `fitbit`
2. Set OAuth credentials (from Fitbit Developer Portal)
3. Scopes: `activity`, `heartrate`, `profile`, `sleep`, `weight`

**Step 4: Document the setup**

Create `docs/platform-setup/health-platforms-setup.md` with setup instructions for each platform.

**Step 5: Commit documentation**

```bash
git add docs/platform-setup/health-platforms-setup.md
git commit -m "docs: add setup guide for Garmin, Strava, and Fitbit integrations"
```

---

## Phase 4: Improve Data Extraction

### Task 4.1: Add retry logic with exponential backoff

**Files:**
- Create: `api/services/retryService.js`

**Step 1: Create retry utility**

```javascript
/**
 * Retry Service
 * Provides exponential backoff retry logic for API calls
 */

export async function withRetry(fn, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    retryableStatuses = [408, 429, 500, 502, 503, 504],
    onRetry = null
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const status = error.response?.status || error.status;
      const isRetryable = retryableStatuses.includes(status) || !status;

      if (attempt === maxRetries || !isRetryable) {
        throw error;
      }

      // Calculate delay with exponential backoff + jitter
      const delay = Math.min(
        baseDelay * Math.pow(2, attempt) + Math.random() * 1000,
        maxDelay
      );

      console.log(`[Retry] Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${delay}ms`);

      if (onRetry) {
        onRetry(attempt, error, delay);
      }

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

export default { withRetry };
```

**Step 2: Commit**

```bash
git add api/services/retryService.js
git commit -m "feat: add retryService with exponential backoff for API calls"
```

---

### Task 4.2: Update proxyRequest to use retry logic

**Files:**
- Modify: `api/services/nangoService.js:325-358`

**Step 1: Import retry service**

Add to imports at top of file:

```javascript
import { withRetry } from './retryService.js';
```

**Step 2: Update proxyRequest function**

Replace the `proxyRequest` function:

```javascript
export async function proxyRequest(userId, platform, endpoint, options = {}) {
  const config = PLATFORM_CONFIGS[platform];
  const providerConfigKey = config?.providerConfigKey || platform;
  const connectionId = options.connectionId || await getConnectionId(platform, userId);

  const requestConfig = {
    providerConfigKey,
    connectionId,
    endpoint,
    method: options.method || 'GET',
    retries: 0, // We handle retries ourselves
    ...(options.params && { params: options.params }),
    ...(options.data && { data: options.data }),
    ...(options.headers && { headers: options.headers }),
    ...((options.baseUrl || config?.baseUrl) && { baseUrlOverride: options.baseUrl || config.baseUrl })
  };

  const makeRequest = async () => {
    console.log(`[Nango] Proxy request to ${platform}: ${endpoint} (connectionId: ${connectionId})`);
    const response = await nango.proxy(requestConfig);
    return { success: true, data: response.data };
  };

  try {
    return await withRetry(makeRequest, {
      maxRetries: options.maxRetries || 3,
      baseDelay: 1000,
      onRetry: (attempt, error) => {
        console.log(`[Nango] Retry ${attempt + 1} for ${platform}:${endpoint} after error: ${error.message}`);
      }
    });
  } catch (error) {
    console.error(`[Nango] Proxy request failed for ${platform}:`, error.message);
    return {
      success: false,
      error: error.message,
      status: error.response?.status
    };
  }
}
```

**Step 3: Test retry behavior**

Run extraction and verify retries work:
```bash
curl -s -X GET "http://localhost:3004/api/nango/extract/spotify" -H "Authorization: Bearer <JWT>"
```

**Step 4: Commit**

```bash
git add api/services/nangoService.js
git commit -m "feat: add retry logic with exponential backoff to proxyRequest"
```

---

### Task 4.3: Add comprehensive error categorization

**Files:**
- Create: `api/services/extractionErrorHandler.js`

**Step 1: Create error handler**

```javascript
/**
 * Extraction Error Handler
 * Categorizes and handles platform-specific errors
 */

export const ErrorCategory = {
  AUTH_EXPIRED: 'auth_expired',
  RATE_LIMITED: 'rate_limited',
  PERMISSION_DENIED: 'permission_denied',
  NOT_FOUND: 'not_found',
  SERVER_ERROR: 'server_error',
  NETWORK_ERROR: 'network_error',
  UNKNOWN: 'unknown'
};

export function categorizeError(error, platform) {
  const status = error.status || error.response?.status;
  const message = error.message?.toLowerCase() || '';

  // Auth errors
  if (status === 401 || message.includes('unauthorized') || message.includes('token')) {
    return {
      category: ErrorCategory.AUTH_EXPIRED,
      userMessage: `Your ${platform} connection has expired. Please reconnect.`,
      action: 'reconnect',
      retryable: false
    };
  }

  // Rate limiting
  if (status === 429 || message.includes('rate limit')) {
    return {
      category: ErrorCategory.RATE_LIMITED,
      userMessage: `${platform} rate limit reached. We'll retry automatically.`,
      action: 'wait',
      retryable: true,
      retryAfter: error.response?.headers?.['retry-after'] || 60
    };
  }

  // Permission errors
  if (status === 403 || message.includes('forbidden') || message.includes('permission')) {
    return {
      category: ErrorCategory.PERMISSION_DENIED,
      userMessage: `${platform} requires additional permissions. Please reconnect with full access.`,
      action: 'reconnect_with_scopes',
      retryable: false
    };
  }

  // Not found
  if (status === 404) {
    return {
      category: ErrorCategory.NOT_FOUND,
      userMessage: `Data not available from ${platform}.`,
      action: 'skip',
      retryable: false
    };
  }

  // Server errors
  if (status >= 500 && status < 600) {
    return {
      category: ErrorCategory.SERVER_ERROR,
      userMessage: `${platform} is temporarily unavailable.`,
      action: 'retry',
      retryable: true
    };
  }

  // Network errors
  if (message.includes('network') || message.includes('econnrefused') || message.includes('timeout')) {
    return {
      category: ErrorCategory.NETWORK_ERROR,
      userMessage: `Could not connect to ${platform}.`,
      action: 'retry',
      retryable: true
    };
  }

  // Unknown
  return {
    category: ErrorCategory.UNKNOWN,
    userMessage: `An error occurred with ${platform}.`,
    action: 'log',
    retryable: false
  };
}

export function formatExtractionResult(platform, data, errors) {
  return {
    platform,
    success: errors.length === 0,
    data,
    errors: errors.map(e => ({
      endpoint: e.endpoint,
      ...categorizeError(e.error, platform)
    })),
    extractedAt: new Date().toISOString()
  };
}

export default {
  ErrorCategory,
  categorizeError,
  formatExtractionResult
};
```

**Step 2: Commit**

```bash
git add api/services/extractionErrorHandler.js
git commit -m "feat: add extractionErrorHandler for comprehensive error categorization"
```

---

### Task 4.4: Update extractPlatformData to use error handler

**Files:**
- Modify: `api/services/nangoService.js` (extractPlatformData function)

**Step 1: Import error handler**

```javascript
import { formatExtractionResult, categorizeError } from './extractionErrorHandler.js';
```

**Step 2: Update extractPlatformData to track errors**

Update the `extractPlatformData` function to collect and categorize errors:

```javascript
export async function extractPlatformData(userId, platform) {
  const config = PLATFORM_CONFIGS[platform];
  if (!config) {
    return { success: false, error: `Unknown platform: ${platform}` };
  }

  console.log(`[Nango] Extracting data from ${platform} for user ${userId}`);

  const extractedData = {};
  const errors = [];

  // Platform-specific options
  const platformOptions = {};
  if (platform === 'twitch') {
    platformOptions.headers = { 'Client-Id': process.env.TWITCH_CLIENT_ID };
  }

  // Handle platforms that need preliminary data
  let redditUsername = null;
  let twitchUserId = null;

  if (platform === 'reddit') {
    const profileResult = await proxyRequest(userId, platform, '/api/v1/me', platformOptions);
    if (profileResult.success && profileResult.data?.name) {
      redditUsername = profileResult.data.name;
      extractedData.profile = profileResult.data;
    } else {
      errors.push({ endpoint: 'profile', error: profileResult });
    }
  }

  if (platform === 'twitch') {
    const userResult = await proxyRequest(userId, platform, '/users', platformOptions);
    if (userResult.success && userResult.data?.data?.[0]?.id) {
      twitchUserId = userResult.data.data[0].id;
      extractedData.user = userResult.data;
    } else {
      errors.push({ endpoint: 'user', error: userResult });
    }
  }

  // Fetch all endpoints
  for (const [key, endpoint] of Object.entries(config.endpoints)) {
    // Skip already fetched
    if (platform === 'reddit' && key === 'profile') continue;
    if (platform === 'twitch' && key === 'user') continue;

    try {
      let finalEndpoint = endpoint.replace('{now}', new Date().toISOString());

      // Handle placeholders
      if (platform === 'reddit' && endpoint.includes('{username}')) {
        if (!redditUsername) {
          errors.push({ endpoint: key, error: { message: 'Could not get Reddit username' } });
          continue;
        }
        finalEndpoint = finalEndpoint.replace('{username}', redditUsername);
      }

      if (platform === 'twitch' && endpoint.includes('{userId}')) {
        if (!twitchUserId) {
          errors.push({ endpoint: key, error: { message: 'Could not get Twitch user ID' } });
          continue;
        }
        finalEndpoint = finalEndpoint.replace('{userId}', twitchUserId);
      }

      const result = await proxyRequest(userId, platform, finalEndpoint, platformOptions);

      if (result.success) {
        extractedData[key] = result.data;
      } else {
        errors.push({ endpoint: key, error: result });
      }
    } catch (error) {
      errors.push({ endpoint: key, error: { message: error.message } });
    }
  }

  // Update last synced timestamp
  await updateLastSynced(userId, platform).catch(() => {});

  return formatExtractionResult(platform, extractedData, errors);
}
```

**Step 3: Test improved error handling**

```bash
curl -s -X GET "http://localhost:3004/api/nango/extract/linkedin" -H "Authorization: Bearer <JWT>" | jq '.errors'
```

Expected: Structured error with category, userMessage, and action

**Step 4: Commit**

```bash
git add api/services/nangoService.js
git commit -m "feat: update extractPlatformData with comprehensive error handling and categorization"
```

---

## Verification Checklist

After completing all tasks, verify:

- [ ] LinkedIn extraction returns meaningful error or data (not raw 403)
- [ ] New platform configurations are in PLATFORM_CONFIGS
- [ ] Connection mappings table exists in Supabase
- [ ] Dynamic connection lookup works for new users
- [ ] Retry logic triggers on transient failures
- [ ] Error messages are user-friendly and actionable
- [ ] All commits have been pushed

Run full test suite:
```bash
cd /c/Users/stefa/twin-ai-learn
npm test
curl -s -X GET "http://localhost:3004/api/nango/platforms" | jq '.count'
# Should show 14+ platforms (original 11 + garmin, strava, fitbit)
```

---

**Plan complete and saved to `docs/plans/2026-02-05-platform-integrations-improvements.md`.**

Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
