# OAuth Setup Status & Next Steps

## ✅ Completed Platforms

### 1. Spotify
**Status:** Credentials extracted and saved to .env
**Client ID:** `006475a46fc44212af6ae6b3f4e48c08`
**Client Secret:** `306028e25a3c44448bfcfbd53bf71e16`
**Redirect URI (Production):** `https://twin-ai-learn.vercel.app/oauth/callback`
**⚠️ Action Required:** Add `http://localhost:3001/api/platforms/callback/spotify` to Redirect URIs for local development

## 🔄 In Progress

### 2. Deezer
**Status:** Login attempted, encountered popup authentication issues
**Dashboard:** https://developers.deezer.com/myapps
**Action Required:** Manual setup recommended

## 📋 Remaining Platforms (Priority Order)

### High Priority (Quick Setup Available)

#### 3. SoundCloud
**Dashboard:** https://soundcloud.com/you/apps
**Steps:**
1. Click "Register a new app"
2. App Name: `Soul Signature`
3. Redirect URI: `http://localhost:3001/api/platforms/callback/soundcloud`
4. Copy Client ID and Client Secret

#### 4. Fitbit
**Dashboard:** https://dev.fitbit.com/apps
**Steps:**
1. Click "Register An App"
2. Application Name: `Soul Signature`
3. OAuth 2.0 Application Type: **Server**
4. Callback URL: `http://localhost:3001/api/platforms/callback/fitbit`
5. Default Access Type: **Read-Only**
6. Copy OAuth 2.0 Client ID and Client Secret

#### 5. YouTube Music (Google Cloud)
**Console:** https://console.cloud.google.com
**Steps:**
1. Create new project or select existing
2. Enable "YouTube Data API v3"
3. Go to Credentials → Create OAuth client ID
4. Application type: **Web application**
5. Redirect URI: `http://localhost:3001/api/platforms/callback/youtube_music`
6. Copy Client ID and Secret

### Medium Priority (Requires Account Setup)

#### 6. Deezer (Manual Setup)
**Dashboard:** https://developers.deezer.com/myapps
**Steps:**
1. Log in with Google or Deezer account
2. Click "Create a new Application"
3. App Name: `Soul Signature Platform`
4. Redirect URI: `http://localhost:3001/api/platforms/callback/deezer`
5. Copy Application ID and Secret Key

#### 7. Whoop
**Portal:** https://developer.whoop.com
**Steps:**
1. Sign up for developer account
2. Create new app: `Soul Signature`
3. Redirect URI: `http://localhost:3001/api/platforms/callback/whoop`
4. Scopes: `read:recovery`, `read:cycles`, `read:workout`, `read:sleep`, `read:profile`
5. Copy Client ID and Secret

#### 8. Tidal
**Portal:** https://developer.tidal.com
**Steps:**
1. Sign up for developer account (may require approval)
2. Create new app: `Soul Signature`
3. Redirect URI: `http://localhost:3001/api/platforms/callback/tidal`
4. Copy Client ID and Secret

### Special Cases

#### 9. Apple Music (JWT - Not OAuth)
**Portal:** https://developer.apple.com/account
**Requirements:**
- Requires Apple Developer account ($99/year)
- Uses JWT tokens instead of OAuth
- Need: Team ID, Key ID, Private Key (.p8 file)

**Steps:**
1. Go to Certificates, Identifiers & Profiles
2. Click Keys → + to create new key
3. Enable MusicKit
4. Download .p8 file (save securely!)
5. Note Team ID (10 digits) and Key ID (10 digits)

#### 10. iFood (Brazil Only)
**Portal:** https://developer.ifood.com.br
**Note:** Requires Brazilian business registration

### Platforms Without Public APIs

❌ **Not Available:**
- Amazon Music (no public API)
- Pandora (requires partner agreement)
- Goodreads (API deprecated in 2020 - use Open Library)
- MyFitnessPal (partner-only API)
- Peloton (unofficial API only)

## 🛠️ Automated Setup Script

Use the interactive CLI wizard for quick setup:

```bash
# Setup specific platform
node scripts/oauth-auto-setup.js spotify
node scripts/oauth-auto-setup.js deezer
node scripts/oauth-auto-setup.js fitbit

# Or run wizard for all platforms
node scripts/oauth-auto-setup.js
```

## 📝 Manual Setup Template

For each platform, you'll need to add to `.env`:

```env
# Platform Name OAuth
PLATFORM_CLIENT_ID=your-client-id
PLATFORM_CLIENT_SECRET=your-client-secret
```

## 🔐 Current .env Status

```env
# ✅ Completed
SPOTIFY_CLIENT_ID=006475a46fc44212af6ae6b3f4e48c08
SPOTIFY_CLIENT_SECRET=306028e25a3c44448bfcfbd53bf71e16

# ⏳ Pending
# DEEZER_CLIENT_ID=
# DEEZER_CLIENT_SECRET=
# SOUNDCLOUD_CLIENT_ID=
# SOUNDCLOUD_CLIENT_SECRET=
# TIDAL_CLIENT_ID=
# TIDAL_CLIENT_SECRET=
# YOUTUBE_MUSIC_CLIENT_ID=
# YOUTUBE_MUSIC_CLIENT_SECRET=
# FITBIT_CLIENT_ID=
# FITBIT_CLIENT_SECRET=
# WHOOP_CLIENT_ID=
# WHOOP_CLIENT_SECRET=
```

## 🎯 Recommended Workflow

1. **Quick Wins (15 min each):**
   - SoundCloud
   - Fitbit
   - YouTube Music (if you have Google Cloud project)

2. **Account Setup Required (30 min each):**
   - Deezer
   - Whoop
   - Tidal

3. **Advanced/Paid:**
   - Apple Music (requires paid developer account)

## 🔗 All Dashboard Links

Quick access to all developer portals:

- [Spotify Dashboard](https://developer.spotify.com/dashboard) ✅
- [Deezer My Apps](https://developers.deezer.com/myapps)
- [SoundCloud Apps](https://soundcloud.com/you/apps)
- [Fitbit Apps](https://dev.fitbit.com/apps)
- [Whoop Developer](https://developer.whoop.com)
- [Tidal Developer](https://developer.tidal.com)
- [Google Cloud Console](https://console.cloud.google.com)
- [Apple Developer](https://developer.apple.com/account)

---

**Next Action:** Start with SoundCloud, Fitbit, or YouTube Music for quick wins!
