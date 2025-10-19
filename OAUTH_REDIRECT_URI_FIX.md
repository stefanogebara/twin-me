# OAuth Redirect URI Configuration Fix

**Date:** January 18, 2025
**Issue:** All 4 OAuth platforms failing to connect due to missing localhost redirect URI

---

## Problem Summary

All OAuth applications (Slack, Discord, GitHub, LinkedIn) are configured with **production redirect URIs only**:
- `https://twin-ai-learn.vercel.app/oauth/callback`
- `https://twin-ai-learn.vercel.app/api/oauth/callback/slack` (Slack)

But the **local development** app is trying to use:
- `http://localhost:8086/oauth/callback`

This causes "Invalid Redirect URI" or "redirect_uri did not match" errors.

---

## OAuth Credentials (Already Added to .env)

✅ **All credentials have been added to `C:\Users\stefa\twin-me\.env`:**

```env
# Slack OAuth
SLACK_CLIENT_ID=9624299465813.9627850179794
SLACK_CLIENT_SECRET=2d3df4a06969dd8cab12b73a62674081

# Discord OAuth
DISCORD_CLIENT_ID=1423392139995513093
DISCORD_CLIENT_SECRET=6OfE2epyUKnS8ztzInBQJPCaBXIxEuHd

# GitHub OAuth
GITHUB_CLIENT_ID=Ov23liY0gOsrEGMfcM9f
GITHUB_CLIENT_SECRET=589514b8661cd5f68d88b1fd56b4ba8533c0c908
```

✅ **Backend server restarted** and running with new credentials on port 3001

---

## Quick Start - All OAuth Tabs Now Open

✅ **All 4 OAuth configuration pages are now open in your browser:**
1. Slack: https://api.slack.com/apps/A09JFR059PC/oauth
2. Discord: https://discord.com/developers/applications/1423392139995513093/oauth2
3. GitHub: https://github.com/settings/developers
4. LinkedIn: https://www.linkedin.com/developers/apps

**Redirect URI to add to ALL platforms:** `http://localhost:8086/oauth/callback`

---

## Required Fixes

### 1. Slack OAuth App Configuration

**URL:** https://api.slack.com/apps/A09JFR059PC/oauth *(ALREADY OPEN)*

**Steps:**
1. ✅ Tab should already be open - if prompted, login to Slack
2. Navigate to **"OAuth & Permissions"** (left sidebar)
3. Scroll to **"Redirect URLs"** section
4. Click **"Add New Redirect URL"**
5. Enter: `http://localhost:8086/oauth/callback`
6. Click **"Add"** button
   - ⚠️ You'll see "Please use https (for security)" warning
   - **IGNORE** this warning - localhost HTTP is safe for development
   - The button should still be clickable
7. Click **"Save URLs"** button at the bottom
8. Existing URLs to keep:
   - `https://twin-ai-learn.vercel.app/api/oauth/callback/slack`
   - `https://twin-ai-learn.vercel.app/oauth/callback`

**Troubleshooting:**
- If "Add" button is disabled, try clicking directly on it anyway (sometimes it works)
- If still blocked, use Chrome/Edge instead of Firefox
- Alternative: Temporarily remove HTTPS URLs, add localhost, then re-add HTTPS URLs

**Note:** There's also a banner warning about scope changes requiring reinstallation - you can address this after adding the redirect URI.

---

### 2. GitHub OAuth App Configuration

**URL:** https://github.com/settings/developers

**Steps:**
1. Go to "OAuth Apps" section
2. Find the app with Client ID: `Ov23liY0gOsrEGMfcM9f`
3. Click on the app name
4. Find "Authorization callback URL" field
5. You need to ADD `http://localhost:8086/oauth/callback`
   - **Note:** GitHub might only allow ONE callback URL per app
   - **Option A:** Temporarily change it to localhost for development
   - **Option B:** Create a separate "Development" OAuth app for localhost

**Current callback URL (production):**
- Likely: `https://twin-ai-learn.vercel.app/oauth/callback`

**Recommended:** Create a **second GitHub OAuth app** for development:
1. Go to https://github.com/settings/developers
2. Click "New OAuth App"
3. Fill in:
   - **Application name:** TwinMe Soul Signature (Dev)
   - **Homepage URL:** http://localhost:8086
   - **Authorization callback URL:** http://localhost:8086/oauth/callback
4. Click "Register application"
5. Copy the new Client ID and Client Secret
6. Update `.env` with development credentials:
   ```env
   GITHUB_CLIENT_ID=<new-dev-client-id>
   GITHUB_CLIENT_SECRET=<new-dev-client-secret>
   ```

---

### 3. Discord OAuth App Configuration

**URL:** https://discord.com/developers/applications/1423392139995513093/oauth2

**Steps:**
1. Navigate to OAuth2 settings
2. Scroll to "Redirects" section
3. Click "Add Redirect"
4. Enter: `http://localhost:8086/oauth/callback`
5. Click "Save Changes"
6. Existing redirects to keep:
   - Production URLs (if any)

---

### 4. LinkedIn OAuth App Configuration

**URL:** https://www.linkedin.com/developers/apps

**Steps:**
1. Find your TwinMe Soul Signature app
2. Go to "Auth" tab
3. Under "OAuth 2.0 settings"
4. Find "Redirect URLs" section
5. Add: `http://localhost:8086/oauth/callback`
6. Click "Update"

**Note:** LinkedIn OAuth credentials were NOT found in the October 2025 configuration. You may need to create a new LinkedIn OAuth app or find existing credentials.

---

## Testing After Configuration

Once all redirect URIs are added:

### 1. Reconnect Platforms in UI

Navigate to: http://localhost:8086/get-started

**Connect these platforms:**
1. ✅ Slack (after adding redirect URI)
2. ✅ GitHub (after adding redirect URI)
3. ✅ Discord (after adding redirect URI)
4. ⏳ LinkedIn (may need OAuth app creation first)

### 2. Verify Successful Connection

After connecting each platform, check:
- ✅ Platform shows "Connected" with Disconnect button
- ✅ No error notifications
- ✅ Platform count increases

### 3. Test Data Extraction

Navigate to Dashboard or run extraction:

```bash
curl -X POST http://localhost:3001/api/extraction/extract \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "a483a979-cf85-481d-b65b-af396c2c513a",
    "platform": "slack"
  }'
```

Check extraction jobs:
```sql
SELECT
  platform,
  status,
  error_message,
  total_items,
  created_at
FROM data_extraction_jobs
WHERE user_id = 'a483a979-cf85-481d-b65b-af396c2c513a'
ORDER BY created_at DESC
LIMIT 10;
```

**Expected Results:**
- ✅ Status: "completed" (not "failed")
- ✅ No decryption errors
- ✅ total_items > 0
- ✅ Tokens encrypted with current ENCRYPTION_KEY

---

## Vercel Environment Variables (Production)

**Still TODO:** Add OAuth credentials to Vercel for production deployment

**URL:** https://vercel.com/[your-team]/twin-ai-learn/settings/environment-variables

**Variables to add:**
```
SLACK_CLIENT_ID=9624299465813.9627850179794
SLACK_CLIENT_SECRET=2d3df4a06969dd8cab12b73a62674081

DISCORD_CLIENT_ID=1423392139995513093
DISCORD_CLIENT_SECRET=6OfE2epyUKnS8ztzInBQJPCaBXIxEuHd

GITHUB_CLIENT_ID=Ov23liY0gOsrEGMfcM9f
GITHUB_CLIENT_SECRET=589514b8661cd5f68d88b1fd56b4ba8533c0c908
```

**Important:** After adding, trigger a new deployment or restart the functions.

---

## Alternative: Quick Test with One Platform

If you want to test the fix works before configuring all platforms:

**Pick Discord** (usually easiest to configure):
1. Add localhost redirect URI to Discord app
2. Reconnect Discord in UI
3. Test extraction for Discord only
4. If successful, proceed with other platforms

---

## Summary of What Was Completed

✅ Found OAuth credentials from October 2025 configuration
✅ Added credentials to local `.env` file
✅ Restarted backend server with new credentials
✅ Disconnected all 4 problematic platforms from UI
✅ Backend API health check passing

❌ **Blocked:** All OAuth apps need localhost redirect URI added
⏳ **Next:** Manually add `http://localhost:8086/oauth/callback` to each OAuth app
⏳ **Next:** Reconnect platforms in UI
⏳ **Next:** Test data extraction
⏳ **Next:** Add credentials to Vercel for production

---

## Contact & Links

**Slack App:** https://api.slack.com/apps/A09JFR059PC
**GitHub OAuth Apps:** https://github.com/settings/developers
**Discord Apps:** https://discord.com/developers/applications
**LinkedIn Developers:** https://www.linkedin.com/developers/apps

**Local App:** http://localhost:8086/get-started
**Backend API:** http://localhost:3001/api/health
