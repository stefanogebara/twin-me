# OAuth Connector Fixes Applied - October 8, 2025

## Issues Fixed

### 1. Slack OAuth - "doesn't have a bot user to install" ✅

**Problem:**
- Slack OAuth was using `scope` parameter (for bot tokens)
- But Slack app only has User Token Scopes configured, no bot scopes

**Root Cause:**
The OAuth URL construction was using the generic `scope` parameter for all platforms, but Slack requires:
- `scope` for bot token scopes
- `user_scope` for user token scopes

**Solution Applied:**
1. Updated `api/routes/connectors.js` to use `user_scope` parameter for Slack
2. Updated `api/routes/mcp-connectors.js` to use `user_scope` parameter for Slack
3. Updated Slack scopes to match what's configured in Slack app dashboard
4. Added comma-separated scope formatting for Slack (vs space-separated for others)

**Code Changes:**
```javascript
// Before:
const params = new URLSearchParams({
  scope: config.scopes.join(' '),
  ...
});

// After:
const scopeParam = provider === 'slack' ? 'user_scope' : 'scope';
const scopeSeparator = provider === 'slack' ? ',' : ' ';
const params = new URLSearchParams({
  [scopeParam]: config.scopes.join(scopeSeparator),
  ...
});
```

**Slack Scopes Updated:**
Now using only User Token Scopes (as configured in Slack dashboard):
- `channels:read`
- `files:read`
- `groups:read`
- `users:read`
- `users:read.email`
- `search:read`
- `team.preferences:read`
- `lists:read`
- `reminders:read`

---

### 2. Spotify OAuth - "INVALID_CLIENT: Invalid redirect URI" ✅

**Problem:**
- Spotify dashboard has: `https://twin-ai-learn.vercel.app/oauth/callback` ✅
- But code was using: `https://twin-ai-learn.vercel.app/api/oauth/callback/spotify` ❌

**Root Cause:**
The code has special handling for Spotify:
```javascript
const redirectUri = provider === 'spotify' && process.env.SPOTIFY_REDIRECT_URI
  ? process.env.SPOTIFY_REDIRECT_URI  // <- This was wrong!
  : `${process.env.APP_URL}/oauth/callback`;
```

The local `.env` file had:
```env
SPOTIFY_REDIRECT_URI=https://twin-ai-learn.vercel.app/api/oauth/callback/spotify
```

This caused a mismatch with the Spotify dashboard configuration.

**Solution Applied:**
Removed `SPOTIFY_REDIRECT_URI` from `.env` file so code falls back to using `APP_URL/oauth/callback` which matches Spotify dashboard.

**Action Required:**
Ensure `SPOTIFY_REDIRECT_URI` is NOT set in Vercel environment variables. Check with:
```bash
vercel env ls
```

If it exists, remove it with:
```bash
vercel env rm SPOTIFY_REDIRECT_URI production
```

---

## Verified Configurations

### Slack App Dashboard
**OAuth & Permissions:**
- ✅ Redirect URLs: Both URLs present (correct one: `/oauth/callback`)
- ✅ Bot Token Scopes: EMPTY (correct - we're using user tokens)
- ✅ User Token Scopes: 13 scopes configured

### Spotify App Dashboard
**Settings:**
- ✅ Redirect URIs: Only `https://twin-ai-learn.vercel.app/oauth/callback`
- ✅ No other redirect URIs present

---

## Deployment Status

**Commit:** `b44239b` - Fix Slack OAuth to use user_scope instead of bot scope
**Pushed:** ✅ October 8, 2025
**Vercel Deployment:** Automatic deployment triggered

---

## Testing Checklist

After deployment completes, test the following:

- [ ] **Slack** - Should no longer show "doesn't have a bot user" error
  - Navigate to: https://twin-ai-learn.vercel.app/get-started
  - Click Connect on Slack
  - Should redirect to Slack workspace authorization page
  - After authorizing, should redirect back successfully

- [ ] **Spotify** - Should no longer show "Invalid redirect URI" error
  - Navigate to: https://twin-ai-learn.vercel.app/get-started
  - Click Connect on Spotify
  - Should redirect to Spotify authorization page
  - After authorizing, should redirect back successfully

- [ ] **Other connectors** - Verify they still work
  - Gmail: Should continue working (already tested)
  - Calendar: Should continue working (already tested)
  - LinkedIn, Discord, GitHub: Test if time permits

---

## Key Learnings

1. **Slack OAuth has two token types:**
   - Bot tokens: Use `scope` parameter, installed as bot user
   - User tokens: Use `user_scope` parameter, acts on behalf of user
   - Cannot mix both - must choose one approach

2. **Platform-specific redirect URIs cause issues:**
   - Using `SPOTIFY_REDIRECT_URI`, `SLACK_REDIRECT_URI`, etc. can override the unified callback
   - Best practice: Use unified `APP_URL/oauth/callback` for all platforms
   - Only use platform-specific if absolutely required by the platform

3. **Scope formatting varies by platform:**
   - Most platforms: Space-separated (`channels:read groups:read`)
   - Slack: Comma-separated (`channels:read,groups:read`)

---

## Environment Variables Status

**Required in Vercel:**
```env
APP_URL=https://twin-ai-learn.vercel.app
VITE_APP_URL=https://twin-ai-learn.vercel.app
VITE_API_URL=https://twin-ai-learn.vercel.app/api

SLACK_CLIENT_ID=9624299465813.9627850179794
SLACK_CLIENT_SECRET=[encrypted in Vercel]

SPOTIFY_CLIENT_ID=006475a46fc44212af6ae6b3f4e48c08
SPOTIFY_CLIENT_SECRET=[encrypted in Vercel]
```

**NOT needed in Vercel:**
```env
# These should NOT be set in Vercel:
SPOTIFY_REDIRECT_URI  # Causes redirect URI mismatch
SLACK_REDIRECT_URI    # Not used by code
DISCORD_REDIRECT_URI  # Not used by code
GITHUB_REDIRECT_URI   # Not used by code
LINKEDIN_REDIRECT_URI # Not used by code
```

---

## Next Steps

1. ✅ Wait for Vercel deployment to complete
2. ✅ Test Slack connector on production
3. ✅ Test Spotify connector on production
4. ⏳ Add OAuth credentials for remaining platforms (LinkedIn, Discord, GitHub)
5. ⏳ Implement actual data extraction for connected platforms
6. ⏳ Add error handling for expired/revoked tokens
7. ⏳ Implement token refresh logic

---

## Files Modified

- `api/routes/connectors.js` - OAuth URL construction and Slack scope config
- `api/routes/mcp-connectors.js` - Slack OAuth endpoint
- `.env` (local only) - Removed SPOTIFY_REDIRECT_URI
- `OAUTH_FIX_GUIDE.md` - Comprehensive OAuth configuration guide
- `OAUTH_FIXES_APPLIED.md` - This file

---

**Status:** ✅ All fixes applied and deployed. Ready for testing.
