# OAuth Redirect URI Configuration Guide
**Date**: October 8, 2025
**Issue**: Platform connectors failing with "redirect_uri does not match" errors

## Problem Summary

Your code uses a **unified callback URL**: `https://twin-ai-learn.vercel.app/oauth/callback`

However, this URL needs to be properly configured in each platform's OAuth settings. Currently, LinkedIn is failing with "The redirect_uri does not match the registered value."

## Required Redirect URI for ALL Platforms

```
https://twin-ai-learn.vercel.app/oauth/callback
```

⚠️ **Important**: This URL must be **exactly** as shown above (no trailing slash, HTTPS protocol).

---

## Platform-Specific Fix Instructions

### 1. LinkedIn OAuth ❌ (Currently Failing - Priority Fix)

**Error**: "The redirect_uri does not match the registered value"

**Steps to Fix**:
1. Go to: https://www.linkedin.com/developers/apps
2. Click on your app (Client ID: `7724t4uwt8cv4v`)
3. Navigate to **Auth** tab
4. Under **OAuth 2.0 settings**, find **Authorized redirect URLs for your app**
5. Click **Add redirect URL**
6. Enter: `https://twin-ai-learn.vercel.app/oauth/callback`
7. Click **Update** to save

**Additional Tips**:
- Ensure exact match (no extra characters, spaces, or trailing slashes)
- Protocol must be HTTPS
- You may also add `https://twin-ai-learn.vercel.app/oauth/callback/` (with trailing slash) for redundancy
- Changes may take a few minutes to propagate

**Current Scopes**: `openid`, `profile`, `email`

---

### 2. Slack OAuth ⚠️ (Working, but Verify Configuration)

**Current Status**: Redirects correctly to workspace sign-in page

**Steps to Verify**:
1. Go to: https://api.slack.com/apps
2. Click on **TwinMe Soul Signature** (Client ID: `9624299465813.9627850179794`)
3. Navigate to **OAuth & Permissions** in the left sidebar
4. Scroll to **Redirect URLs** section
5. Verify `https://twin-ai-learn.vercel.app/oauth/callback` is listed
6. If not, click **Add New Redirect URL** and add it
7. Click **Save URLs**

**Important Requirements**:
- Redirect URL must use **HTTPS** (required by Slack)
- No anchors (#) allowed in URL
- For multiple redirect URLs, the first one listed is used by default

**Current Scopes**:
- `channels:history`, `channels:read`
- `groups:history`, `groups:read`
- `im:history`, `im:read`
- `users:read`, `users.profile:read`

---

### 3. Spotify OAuth 🎵 (Requires HTTPS)

**New 2025 Security Requirements**:
- HTTP redirect URIs are **no longer supported** (except loopback addresses)
- All apps must use HTTPS or loopback IP addresses

**Steps to Configure**:
1. Go to: https://developer.spotify.com/dashboard
2. Click on your app (Client ID: `006475a46fc44212af6ae6b3f4e48c08`)
3. Click **Settings** or **Edit Settings**
4. Find **Redirect URIs** section
5. Add: `https://twin-ai-learn.vercel.app/oauth/callback`
6. Click **Add** button
7. Click **Save** at the bottom

**Migration Notes**:
- If you have any old HTTP redirect URIs (non-loopback), remove them
- Ensure no `localhost` URIs - use `127.0.0.1` if needed for local development
- Spotify enforces exact match (including protocol, path, and trailing slash)

**Current Scopes**:
- `user-read-private`, `user-read-email`
- `user-top-read`, `user-read-recently-played`
- `playlist-read-private`, `playlist-read-collaborative`
- `user-library-read`, `user-follow-read`

---

### 4. Discord OAuth 💬 (Simple Configuration)

**Steps to Configure**:
1. Go to: https://discord.com/developers/applications
2. Select your app (Client ID: `1423392139995513093`)
3. Navigate to **OAuth2** tab (left sidebar)
4. Scroll to **Redirects** section
5. Click **Add Redirect**
6. Enter: `https://twin-ai-learn.vercel.app/oauth/callback`
7. Click **Save Changes**

**Requirements**:
- Must begin with `http://` or `https://`
- Must be a valid website/web server URL
- No custom schemes allowed (Discord only accepts http(s))

**Current Scopes**: `identify`, `email`, `guilds`, `guilds.members.read`

---

### 5. GitHub OAuth 🐙 (OAuth Apps Limitation)

**Important Note**: GitHub OAuth Apps support only **ONE** callback URL (unlike GitHub Apps which support up to 10).

**Steps to Configure**:
1. Go to: https://github.com/settings/developers
2. Click **OAuth Apps** tab
3. Select **TwinMe Soul Signature** (Client ID: `Ov23liY0gOsrEGMfcM9f`)
4. Find **Authorization callback URL** field
5. Update to: `https://twin-ai-learn.vercel.app/oauth/callback`
6. Click **Update application**

**Key Points**:
- GitHub OAuth Apps can only have **one** callback URL
- Loopback URLs (127.0.0.1, ::1) are always allowed without registration
- For multiple environments, you'd need separate OAuth apps

**Current Scopes**: `user`, `repo`, `read:org`

---

## Verification Checklist

After configuring each platform, test the OAuth flow:

- [ ] **LinkedIn** - Should no longer show "redirect_uri does not match" error
- [ ] **Slack** - Should continue to redirect to workspace sign-in page
- [ ] **Spotify** - Should redirect to Spotify authorization page
- [ ] **Discord** - Should redirect to Discord authorization page
- [ ] **GitHub** - Should redirect to GitHub authorization page

---

## Testing the Fixed Configuration

1. Navigate to: https://twin-ai-learn.vercel.app/get-started
2. Click **Connect** on each platform
3. You should be redirected to the platform's OAuth authorization page
4. After authorization, you should be redirected back to: `https://twin-ai-learn.vercel.app/oauth/callback`
5. The callback handler should process the OAuth code and display success

---

## Common Issues & Troubleshooting

### Issue: "redirect_uri does not match"
**Cause**: The redirect URI in the OAuth app settings doesn't match what your code is sending.
**Solution**: Double-check the exact URL (including protocol, domain, path, and trailing slash).

### Issue: "Invalid redirect_uri" or "Bad redirect_uri"
**Cause**: The redirect URI hasn't been registered or is malformed.
**Solution**: Add the redirect URI to the platform's OAuth settings.

### Issue: OAuth works locally but fails in production
**Cause**: Different redirect URIs for different environments.
**Solution**: Ensure production redirect URI (`https://twin-ai-learn.vercel.app/oauth/callback`) is registered on all platforms.

### Issue: Changes don't take effect immediately
**Cause**: OAuth platforms may cache settings.
**Solution**: Wait 5-10 minutes, clear browser cache, or try in incognito mode.

---

## Environment Variables Status

Your `.env` file contains platform-specific redirect URIs (e.g., `LINKEDIN_REDIRECT_URI`), but these are **NOT used by the code**. The code uses a unified callback at:

```javascript
const appUrl = process.env.APP_URL || process.env.VITE_APP_URL || 'http://localhost:8086';
const redirectUri = encodeURIComponent(`${appUrl}/oauth/callback`);
```

**Current values**:
- `APP_URL=https://twin-ai-learn.vercel.app`
- `VITE_APP_URL=https://twin-ai-learn.vercel.app`

These environment variables are correct. The issue is on the platform side (developer console configuration).

---

## Summary of Actions Required

### Immediate (Blocking LinkedIn)
1. ✅ **LinkedIn**: Add `https://twin-ai-learn.vercel.app/oauth/callback` to OAuth settings

### Verification (Ensure Other Platforms Work)
2. ✅ **Slack**: Verify redirect URL is registered
3. ✅ **Spotify**: Add redirect URL and remove any HTTP URIs
4. ✅ **Discord**: Add redirect URL
5. ✅ **GitHub**: Update callback URL

### Testing
6. ✅ Test each connector from production site
7. ✅ Verify successful OAuth flow completion

---

## Next Steps After Fixing OAuth

Once all OAuth connectors are working:
1. Implement real data extraction from connected platforms
2. Replace hardcoded soul signature data with actual extracted patterns
3. Build loading UI for data extraction progress
4. Test full end-to-end flow: connect → extract → generate soul signature

---

**Questions?** Check the OAUTH_REDIRECT_URI_SETUP.md file for additional details on each platform's OAuth flow.
