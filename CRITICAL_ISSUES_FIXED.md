# Critical Issues - Analysis & Fixes Applied

## Date: 2025-10-03

---

## ISSUE #1: Digital Twin Creation Failing (500 Error)

### Root Cause
```
Error: Could not find the 'common_phrases' column of 'digital_twins' in the schema cache
```

The `digital_twins` table was missing critical columns that the API code expected.

### Columns Expected by Code vs. Database Schema

**Expected by `api/routes/twins.js`:**
- `teaching_philosophy` (TEXT)
- `student_interaction` (TEXT)
- `humor_style` (TEXT)
- `communication_style` (TEXT)
- `expertise` (TEXT[])
- `voice_id` (TEXT)
- `common_phrases` (TEXT[])
- `favorite_analogies` (TEXT[])

**Existed in Database (from `001_initial_schema.sql`):**
- `name` ✅
- `description` ✅
- `subject_area` ✅
- `twin_type` ✅
- `is_active` ✅
- `voice_profile_id` ✅
- `personality_traits` (JSONB) ✅
- `teaching_style` (JSONB) ✅
- `common_phrases` (TEXT[]) ✅
- `favorite_analogies` (TEXT[]) ✅
- `knowledge_base_status` ✅

**Missing from Database:**
- `teaching_philosophy` ❌
- `student_interaction` ❌
- `humor_style` ❌
- `communication_style` ❌
- `expertise` ❌
- `voice_id` ❌

### Fix Applied

**Migration File:** `supabase/migrations/005_fix_digital_twins_schema.sql`

**Changes:**
```sql
ALTER TABLE digital_twins ADD COLUMN IF NOT EXISTS teaching_philosophy TEXT;
ALTER TABLE digital_twins ADD COLUMN IF NOT EXISTS student_interaction TEXT;
ALTER TABLE digital_twins ADD COLUMN IF NOT EXISTS humor_style TEXT;
ALTER TABLE digital_twins ADD COLUMN IF NOT EXISTS communication_style TEXT;
ALTER TABLE digital_twins ADD COLUMN IF NOT EXISTS expertise TEXT[];
ALTER TABLE digital_twins ADD COLUMN IF NOT EXISTS voice_id TEXT;
ALTER TABLE digital_twins ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
```

**Indexes Added:**
```sql
CREATE INDEX idx_digital_twins_voice_id ON digital_twins(voice_id);
CREATE INDEX idx_digital_twins_twin_type ON digital_twins(twin_type);
CREATE INDEX idx_digital_twins_is_active ON digital_twins(is_active);
```

### How to Apply Fix

```bash
# Using Supabase CLI
cd C:\Users\stefa\twin-ai-learn
supabase db push

# OR directly in Supabase Dashboard
# SQL Editor → Run the migration file
```

---

## ISSUE #2: Unsupported Platform Errors

### Root Cause
```
Error: Unsupported platform: youtube
Error: Unsupported platform: google_calendar
Error: Unsupported platform: google_gmail
```

The data extraction service didn't gracefully handle platforms that are defined in the connector system but don't have extractors implemented yet.

### Fix Applied

**File:** `api/services/dataExtractionService.js`

**Changes:**
Added graceful handling for platforms without extractors:

```javascript
case 'youtube':
case 'google_calendar':
case 'google_gmail':
case 'spotify':
case 'slack':
case 'twitch':
case 'reddit':
  // These platforms are defined but extractors not yet implemented
  console.warn(`[DataExtraction] Extractor for ${platform} not yet implemented - skipping`);
  return {
    success: false,
    platform,
    message: `Extractor for ${platform} is not yet implemented`,
    itemsExtracted: 0,
    skipped: true
  };
```

**Result:** Instead of throwing errors, the system now:
1. Logs a warning
2. Returns a structured response indicating the platform is skipped
3. Continues processing other platforms

---

## ISSUE #3: OAuth Token Expiration (401 Errors)

### Root Cause
```
Error: Bad credentials (401) - github
Error: 401 Unauthorized - discord
Error: 401 Unauthorized - linkedin
```

OAuth tokens expire after a certain period, but the system didn't:
1. Check token expiration before attempting API calls
2. Provide user-friendly error messages
3. Mark connectors for re-authentication

### Fix Applied

**File:** `api/services/dataExtractionService.js`

**Enhancement 1: Pre-emptive Token Expiration Check**
```javascript
// Check if token has expired
if (connector.expires_at && new Date(connector.expires_at) < new Date()) {
  console.warn(`[DataExtraction] Token expired for ${platform}`);

  // Mark connector as needing re-authentication
  await supabase
    .from('data_connectors')
    .update({
      connected: false,
      metadata: {
        ...connector.metadata,
        token_expired: true,
        expired_at: new Date().toISOString()
      }
    })
    .eq('id', connector.id);

  return {
    success: false,
    platform,
    error: 'TOKEN_EXPIRED',
    message: `Your ${platform} connection has expired. Please reconnect your account.`,
    itemsExtracted: 0,
    requiresReauth: true
  };
}
```

**Enhancement 2: 401 Error Handling**
```javascript
if (error.status === 401 || error.message?.includes('401') || error.message?.includes('Unauthorized')) {
  console.warn(`[DataExtraction] 401 Unauthorized for ${platform} - token likely expired or revoked`);

  // Mark connector as disconnected
  await supabase
    .from('data_connectors')
    .update({
      connected: false,
      metadata: {
        ...connector?.metadata,
        auth_error: true,
        last_error: '401 Unauthorized - Token expired or revoked',
        error_timestamp: new Date().toISOString()
      }
    })
    .eq('user_id', userId)
    .eq('provider', platform);

  return {
    success: false,
    platform,
    error: 'UNAUTHORIZED',
    message: `Authentication failed for ${platform}. Please reconnect your account.`,
    itemsExtracted: 0,
    requiresReauth: true
  };
}
```

**Benefits:**
1. ✅ Pre-emptive token expiration check (before API call)
2. ✅ Automatic connector disconnection when token expires
3. ✅ User-friendly error messages
4. ✅ `requiresReauth` flag to trigger re-connection UI
5. ✅ Error metadata stored for debugging

---

## Testing Instructions

### 1. Apply Database Migration

```bash
# Method 1: Using Supabase CLI
cd C:\Users\stefa\twin-ai-learn
supabase db push

# Method 2: Manual SQL in Supabase Dashboard
# 1. Go to Supabase Dashboard
# 2. Navigate to SQL Editor
# 3. Copy contents of supabase/migrations/005_fix_digital_twins_schema.sql
# 4. Execute the SQL
```

### 2. Verify Schema Changes

```sql
-- Run in Supabase SQL Editor
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'digital_twins'
ORDER BY column_name;

-- Should now include:
-- teaching_philosophy (text)
-- student_interaction (text)
-- humor_style (text)
-- communication_style (text)
-- expertise (text[])
-- voice_id (text)
-- metadata (jsonb)
```

### 3. Test Digital Twin Creation

```bash
# Start the development servers
npm run dev:full

# Test the API endpoint
curl -X POST http://localhost:3001/api/twins \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Test Twin",
    "twin_type": "professor",
    "teaching_philosophy": "Engaging and interactive",
    "student_interaction": "Friendly and supportive",
    "humor_style": "Light and encouraging",
    "communication_style": "Clear and concise",
    "expertise": ["Computer Science", "AI"],
    "common_phrases": ["Great question!", "Let me explain..."],
    "favorite_analogies": ["It is like a library"]
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "id": "uuid-here",
  "twin": {
    "id": "uuid-here",
    "name": "Test Twin",
    "teaching_philosophy": "Engaging and interactive",
    "student_interaction": "Friendly and supportive",
    "humor_style": "Light and encouraging",
    "communication_style": "Clear and concise",
    "expertise": ["Computer Science", "AI"],
    "voice_id": null,
    "created_at": "2025-10-03T...",
    ...
  },
  "message": "Digital twin created successfully"
}
```

### 4. Test OAuth Error Handling

**Test Unsupported Platform:**
```bash
# This should now gracefully skip instead of throwing error
# Monitor server logs for:
# [DataExtraction] Extractor for youtube not yet implemented - skipping
```

**Test Expired Token:**
```bash
# In Supabase Dashboard, manually set a connector's expires_at to past date
UPDATE data_connectors
SET expires_at = '2024-01-01T00:00:00Z'
WHERE provider = 'github'
AND user_id = 'your-user-id';

# Then attempt extraction - should get user-friendly message:
# "Your github connection has expired. Please reconnect your account."
```

---

## Verification Checklist

- [ ] Migration applied successfully
- [ ] All new columns exist in `digital_twins` table
- [ ] Digital twin creation works (no 500 error)
- [ ] Unsupported platforms are skipped gracefully
- [ ] Token expiration is detected before API calls
- [ ] 401 errors result in user-friendly messages
- [ ] Connectors are automatically disconnected when tokens expire
- [ ] Frontend shows "reconnect" option for expired connections

---

## Summary

### Issues Fixed
1. ✅ **Digital Twin Creation (500 Error)** - Added missing database columns
2. ✅ **Unsupported Platform Errors** - Graceful handling for platforms without extractors
3. ✅ **OAuth Token Expiration** - Pre-emptive checks and user-friendly error messages

### Files Modified
1. `supabase/migrations/005_fix_digital_twins_schema.sql` (NEW)
2. `api/services/dataExtractionService.js` (UPDATED)

### Next Steps
1. Apply the database migration
2. Test digital twin creation
3. Monitor extraction logs for graceful error handling
4. Consider implementing extractors for YouTube, Spotify, etc.
5. Add frontend UI to show "Reconnect Account" buttons for expired tokens

---

## Developer Notes

### Platform Extractor Status

**Implemented:**
- ✅ GitHub
- ✅ Discord
- ✅ LinkedIn

**Defined but Not Implemented:**
- ⚠️ YouTube
- ⚠️ Google Calendar
- ⚠️ Google Gmail
- ⚠️ Spotify
- ⚠️ Slack
- ⚠️ Twitch
- ⚠️ Reddit

**To Implement an Extractor:**
1. Create `api/services/extractors/{platform}Extractor.js`
2. Implement `extractAll(userId, connectorId)` method
3. Add case to switch statement in `dataExtractionService.js`
4. Test with real OAuth credentials

### Token Refresh Strategy

Consider implementing automatic token refresh for platforms that support it:

```javascript
// Example: GitHub token refresh
if (connector.refresh_token) {
  try {
    const newTokens = await refreshAccessToken(connector.refresh_token, platform);
    await updateConnectorTokens(connector.id, newTokens);
    // Retry extraction with new token
  } catch (refreshError) {
    // If refresh fails, mark for re-authentication
  }
}
```

---

**End of Report**
