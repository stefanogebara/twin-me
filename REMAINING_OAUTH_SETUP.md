# Remaining OAuth Configuration Required

## ✅ Completed
- Spotify: Credentials added to Vercel, redirect URI already configured
- Slack: Credentials added to Vercel, redirect URI already configured, token exchange handler added

## ⚠️ Requires Configuration

### 1. LinkedIn OAuth

**Credentials:** ✅ Added to Vercel
**Redirect URI:** ❌ Needs to be added

**Steps:**
1. Go to: https://www.linkedin.com/developers/apps
2. Click on your app (Client ID: `7724t4uwt8cv4v`)
3. Navigate to **Auth** tab
4. Under **Authorized redirect URLs for your app**
5. Click **Add redirect URL**
6. Enter: `https://twin-ai-learn.vercel.app/oauth/callback`
7. Click **Update**

**Required Scopes:**
- `openid`
- `profile`
- `email`

---

### 2. Discord OAuth

**Credentials:** ✅ Added to Vercel
**Redirect URI:** ❌ Needs to be added

**Steps:**
1. Go to: https://discord.com/developers/applications
2. Select your app (Client ID: `1423392139995513093`)
3. Navigate to **OAuth2** tab (left sidebar)
4. Scroll to **Redirects** section
5. Click **Add Redirect**
6. Enter: `https://twin-ai-learn.vercel.app/oauth/callback`
7. Click **Save Changes**

**Required Scopes:**
- `identify`
- `email`
- `guilds`
- `guilds.members.read`

**Note:** Token exchange handler needs to be added to oauth-callback.js

---

### 3. GitHub OAuth

**Credentials:** ✅ Added to Vercel
**Redirect URI:** ❌ Needs to be added

**Steps:**
1. Go to: https://github.com/settings/developers
2. Click **OAuth Apps** tab
3. Select **TwinMe Soul Signature** (Client ID: `Ov23liY0gOsrEGMfcM9f`)
4. Find **Authorization callback URL** field
5. Update to: `https://twin-ai-learn.vercel.app/oauth/callback`
6. Click **Update application**

**Required Scopes:**
- `user`
- `repo`
- `read:org`

**Important:** GitHub OAuth Apps support only ONE callback URL

**Note:** Token exchange handler needs to be added to oauth-callback.js

---

## Deployment Status

**Latest Commit:** `b9eab34` - Add Slack token exchange handler and missing OAuth credentials
**Status:** Pushed, awaiting Vercel deployment

---

## Testing Priority

After deployment completes:

1. **Test Slack** - Should now complete full OAuth flow without 500 error
2. **Test Spotify** - Should now work with credentials in Vercel
3. **Configure LinkedIn** - Add redirect URI, then test
4. **Configure Discord** - Add redirect URI, add token handler, then test
5. **Configure GitHub** - Add redirect URI, add token handler, then test

---

## Environment Variables Status

All OAuth credentials now set in Vercel:
- ✅ SPOTIFY_CLIENT_ID
- ✅ SPOTIFY_CLIENT_SECRET
- ✅ SLACK_CLIENT_ID
- ✅ SLACK_CLIENT_SECRET
- ✅ DISCORD_CLIENT_ID
- ✅ DISCORD_CLIENT_SECRET
- ✅ GITHUB_CLIENT_ID
- ✅ GITHUB_CLIENT_SECRET
- ✅ LINKEDIN_CLIENT_ID
- ✅ LINKEDIN_CLIENT_SECRET

---

## Next Steps

1. Wait for Vercel deployment to complete (~2-3 minutes)
2. Test Slack OAuth flow on production
3. Test Spotify OAuth flow on production
4. Configure remaining platforms (LinkedIn, Discord, GitHub)
5. Add token exchange handlers for Discord and GitHub
6. Test all connectors end-to-end
