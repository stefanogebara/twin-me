# OAuth Redirect URI Configuration Guide

All platform OAuth applications need to have this redirect URI whitelisted:

```
https://twin-ai-learn.vercel.app/oauth/callback
```

## Platform-Specific Instructions

### ✅ Google (Gmail, Calendar, Drive, YouTube)
**Already configured correctly**
- Console: https://console.cloud.google.com/apis/credentials
- Redirect URI: `https://twin-ai-learn.vercel.app/oauth/callback` ✅

---

### Slack
**Current Status**: ❌ Missing redirect URI

**Steps to Fix**:
1. Go to: https://api.slack.com/apps
2. Select your app: "TwinMe Soul Signature" (Client ID: 9624299465813.9627850179794)
3. Navigate to: **OAuth & Permissions** → **Redirect URLs**
4. Click **Add New Redirect URL**
5. Enter: `https://twin-ai-learn.vercel.app/oauth/callback`
6. Click **Add**
7. Click **Save URLs**

**Current redirect URI in .env**: `https://twin-ai-learn.vercel.app/api/oauth/callback/slack` (wrong)
**Correct redirect URI**: `https://twin-ai-learn.vercel.app/oauth/callback`

---

### LinkedIn
**Current Status**: ❌ Missing redirect URI

**Steps to Fix**:
1. Go to: https://www.linkedin.com/developers/apps
2. Select your app (Client ID: 7724t4uwt8cv4v)
3. Navigate to: **Auth** tab
4. Under **Authorized redirect URLs for your app**
5. Click **Add redirect URL**
6. Enter: `https://twin-ai-learn.vercel.app/oauth/callback`
7. Click **Update**

**Current redirect URI in .env**: `https://twin-ai-learn.vercel.app/api/oauth/callback/linkedin` (wrong)
**Correct redirect URI**: `https://twin-ai-learn.vercel.app/oauth/callback`

---

### Spotify
**Current Status**: ⚠️ Unknown

**Steps to Check/Fix**:
1. Go to: https://developer.spotify.com/dashboard
2. Select your app (Client ID: 006475a46fc44212af6ae6b3f4e48c08)
3. Click **Settings** or **Edit Settings**
4. Find **Redirect URIs** section
5. Add if not present: `https://twin-ai-learn.vercel.app/oauth/callback`
6. Click **Save**

**Current redirect URI in .env**: `https://twin-ai-learn.vercel.app/api/oauth/callback/spotify` (wrong)
**Correct redirect URI**: `https://twin-ai-learn.vercel.app/oauth/callback`

---

### Discord
**Current Status**: ⚠️ Unknown

**Steps to Check/Fix**:
1. Go to: https://discord.com/developers/applications
2. Select your app (Client ID: 1423392139995513093)
3. Navigate to: **OAuth2** → **General**
4. Under **Redirects**
5. Add if not present: `https://twin-ai-learn.vercel.app/oauth/callback`
6. Click **Save Changes**

**Current redirect URI in .env**: `https://twin-ai-learn.vercel.app/api/oauth/callback/discord` (wrong)
**Correct redirect URI**: `https://twin-ai-learn.vercel.app/oauth/callback`

---

### GitHub
**Current Status**: ⚠️ Unknown

**Steps to Check/Fix**:
1. Go to: https://github.com/settings/developers
2. Click **OAuth Apps**
3. Select your app (Client ID: Ov23liY0gOsrEGMfcM9f)
4. Find **Authorization callback URL**
5. Update to: `https://twin-ai-learn.vercel.app/oauth/callback`
6. Click **Update application**

**Current redirect URI in .env**: `https://twin-ai-learn.vercel.app/api/oauth/callback/github` (wrong)
**Correct redirect URI**: `https://twin-ai-learn.vercel.app/oauth/callback`

---

## Summary

**ALL platforms must use the SAME redirect URI**:
```
https://twin-ai-learn.vercel.app/oauth/callback
```

The code uses a unified callback handler at `/oauth/callback` that determines which provider based on the `state` parameter.

## After Adding Redirect URIs

Once you've added the redirect URI to each platform:
1. The `.env` file `*_REDIRECT_URI` variables are NOT used by the code
2. You can remove them or update them for documentation purposes
3. Test each connector again from https://twin-ai-learn.vercel.app/get-started

## Quick Test Checklist

After updating each platform's OAuth settings:
- [ ] Slack - Test connection
- [ ] LinkedIn - Test connection
- [ ] Spotify - Test connection
- [ ] Discord - Test connection
- [ ] GitHub - Test connection
- [ ] Google Calendar - Test connection (should already work)
- [ ] Gmail - Test connection (should already work)
