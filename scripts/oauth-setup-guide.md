# OAuth Setup Guide - All 15 Platforms

## 🎯 Quick Overview

This guide will help you set up OAuth credentials for all 15 platforms that require it:
- 🎵 **Music** (7): Apple Music, Deezer, SoundCloud, Tidal, YouTube Music, Amazon Music, Pandora
- 🏃 **Health** (2): Fitbit, Whoop
- 📚 **Learning** (3): Goodreads, Coursera, Udemy
- 🍔 **Food** (1): iFood
- 💼 **Other** (2): GitHub (already set up), Letterboxd, Untappd

## 📋 Prerequisites

- Google account (for platforms that use Google sign-in)
- Email access for verification
- Redirect URI: `http://localhost:3001/api/platforms/callback/{platform}`

---

## 1️⃣ Spotify (Already Done - Reference)

✅ **Status**: Already configured
📍 **Dashboard**: https://developer.spotify.com/dashboard

Your existing credentials:
```env
SPOTIFY_CLIENT_ID=your-existing-id
SPOTIFY_CLIENT_SECRET=your-existing-secret
```

---

## 2️⃣ Apple Music API

⚠️ **Note**: Uses JWT tokens, not OAuth

📍 **Portal**: https://developer.apple.com/account
📍 **Docs**: https://developer.apple.com/documentation/applemusicapi

### Steps:
1. Go to https://developer.apple.com/account
2. Click "Certificates, Identifiers & Profiles"
3. Click "Keys" → "+" to create new key
4. Enable "MusicKit"
5. Download the .p8 file (save it!)
6. Note your:
   - **Team ID** (10 digits)
   - **Key ID** (10 digits)
   - **Private Key** (.p8 file contents)

### Add to .env:
```env
APPLE_MUSIC_TEAM_ID=your-team-id
APPLE_MUSIC_KEY_ID=your-key-id
APPLE_MUSIC_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
...your key here...
-----END PRIVATE KEY-----"
```

---

## 3️⃣ Deezer

📍 **Dashboard**: https://developers.deezer.com/myapps
📍 **Docs**: https://developers.deezer.com/api/oauth

### Steps:
1. Go to https://developers.deezer.com/myapps
2. Click "Create a new Application"
3. Fill in:
   - **App Name**: Soul Signature Platform
   - **Description**: Personal data extraction for soul signature analysis
   - **Redirect URI**: `http://localhost:3001/api/platforms/callback/deezer`
4. Submit and get credentials

### Add to .env:
```env
DEEZER_CLIENT_ID=your-app-id
DEEZER_CLIENT_SECRET=your-secret-key
```

---

## 4️⃣ SoundCloud

📍 **Dashboard**: https://soundcloud.com/you/apps
📍 **Docs**: https://developers.soundcloud.com/docs/api/guide

### Steps:
1. Go to https://soundcloud.com/you/apps
2. Click "Register a new app"
3. Fill in:
   - **App Name**: Soul Signature
   - **Redirect URI**: `http://localhost:3001/api/platforms/callback/soundcloud`
4. Save and get credentials

### Add to .env:
```env
SOUNDCLOUD_CLIENT_ID=your-client-id
SOUNDCLOUD_CLIENT_SECRET=your-client-secret
```

---

## 5️⃣ Tidal

📍 **Portal**: https://developer.tidal.com
📍 **Docs**: https://developer.tidal.com/documentation/api/api-overview

### Steps:
1. Go to https://developer.tidal.com
2. Sign up for developer account
3. Create new app:
   - **Name**: Soul Signature
   - **Redirect URI**: `http://localhost:3001/api/platforms/callback/tidal`
4. Get credentials

### Add to .env:
```env
TIDAL_CLIENT_ID=your-client-id
TIDAL_CLIENT_SECRET=your-client-secret
```

---

## 6️⃣ Amazon Music

⚠️ **No public API available** - requires browser extension

---

## 7️⃣ Pandora

⚠️ **Requires partner agreement** - may not be feasible for individual developers

---

## 8️⃣ YouTube Music

📍 **Console**: https://console.cloud.google.com
📍 **Docs**: https://developers.google.com/youtube/v3

### Steps:
1. Go to https://console.cloud.google.com
2. Create new project or select existing
3. Enable "YouTube Data API v3"
4. Go to "Credentials" → "Create Credentials" → "OAuth client ID"
5. Configure consent screen if needed
6. Create Web application credentials:
   - **Redirect URI**: `http://localhost:3001/api/platforms/callback/youtube_music`
7. Copy Client ID and Secret

### Add to .env:
```env
YOUTUBE_MUSIC_CLIENT_ID=your-client-id
YOUTUBE_MUSIC_CLIENT_SECRET=your-client-secret
```

---

## 9️⃣ Fitbit

📍 **Dashboard**: https://dev.fitbit.com/apps
📍 **Docs**: https://dev.fitbit.com/build/reference/web-api/

### Steps:
1. Go to https://dev.fitbit.com/apps
2. Click "Register An App"
3. Fill in:
   - **Application Name**: Soul Signature
   - **Description**: Personal health data extraction
   - **Application Website**: http://localhost:3001
   - **Organization**: Personal
   - **OAuth 2.0 Application Type**: Server
   - **Callback URL**: `http://localhost:3001/api/platforms/callback/fitbit`
   - **Default Access Type**: Read-Only
4. Agree to terms and submit
5. Copy OAuth 2.0 Client ID and Client Secret

### Add to .env:
```env
FITBIT_CLIENT_ID=your-client-id
FITBIT_CLIENT_SECRET=your-client-secret
```

---

## 🔟 Whoop

📍 **Portal**: https://developer.whoop.com
📍 **Docs**: https://developer.whoop.com/docs/developing

### Steps:
1. Go to https://developer.whoop.com
2. Sign up for developer account
3. Create new app:
   - **Name**: Soul Signature
   - **Redirect URI**: `http://localhost:3001/api/platforms/callback/whoop`
   - **Scopes**: `read:recovery`, `read:cycles`, `read:workout`, `read:sleep`, `read:profile`
4. Get Client ID and Secret

### Add to .env:
```env
WHOOP_CLIENT_ID=your-client-id
WHOOP_CLIENT_SECRET=your-client-secret
```

---

## 1️⃣1️⃣ Peloton

⚠️ **Unofficial API** - no official OAuth

---

## 1️⃣2️⃣ MyFitnessPal

📍 **API**: https://www.myfitnesspal.com/api
📍 **Docs**: Available to partners only

⚠️ **Requires partnership** - may use unofficial API or browser extension instead

---

## 1️⃣3️⃣ Goodreads

⚠️ **API Deprecated** - Amazon shut down the API in 2020
**Alternative**: Use Open Library or browser extension

---

## 1️⃣4️⃣ Coursera

📍 **Portal**: https://www.coursera.org/api/
📍 **Docs**: https://tech.coursera.org/app-platform/catalog/

### Steps:
1. Go to https://www.coursera.org/api/
2. Request API access (may require approval)
3. Create OAuth application
4. Get credentials

### Add to .env:
```env
COURSERA_CLIENT_ID=your-client-id
COURSERA_CLIENT_SECRET=your-client-secret
```

---

## 1️⃣5️⃣ Udemy

📍 **Portal**: https://www.udemy.com/developers/
📍 **Docs**: https://www.udemy.com/developers/affiliate/

⚠️ **Note**: Mainly for instructors and affiliates - personal API access limited

---

## 1️⃣6️⃣ iFood (Brazil)

📍 **Portal**: https://developer.ifood.com.br
📍 **Docs**: https://developer.ifood.com.br/docs

### Steps:
1. Go to https://developer.ifood.com.br
2. Create developer account
3. Register new application:
   - **Name**: Soul Signature
   - **Redirect URI**: `http://localhost:3001/api/platforms/callback/ifood`
4. Get Client ID and Secret

### Add to .env:
```env
IFOOD_CLIENT_ID=your-client-id
IFOOD_CLIENT_SECRET=your-client-secret
```

---

## 1️⃣7️⃣ Letterboxd

📍 **API**: https://api-docs.letterboxd.com
📍 **Request**: https://letterboxd.com/api-beta/

### Steps:
1. Request API access at https://letterboxd.com/api-beta/
2. Wait for approval (can take several weeks)
3. Once approved, create OAuth app
4. Get credentials

### Add to .env:
```env
LETTERBOXD_CLIENT_ID=your-client-id
LETTERBOXD_CLIENT_SECRET=your-client-secret
```

---

## 1️⃣8️⃣ Untappd

📍 **API**: https://untappd.com/api/docs
📍 **Register**: https://untappd.com/api/register

### Steps:
1. Go to https://untappd.com/api/register
2. Request API key
3. Fill in application details
4. Wait for approval
5. Get API key (not OAuth - uses API key)

### Add to .env:
```env
UNTAPPD_CLIENT_ID=your-client-id
UNTAPPD_CLIENT_SECRET=your-client-secret
```

---

## ✅ Final .env Configuration

After completing all setups, your `.env` should have:

```bash
# Encryption
ENCRYPTION_KEY="your-32-character-secret-key!!"

# Music Platforms
SPOTIFY_CLIENT_ID=existing-id
SPOTIFY_CLIENT_SECRET=existing-secret
APPLE_MUSIC_TEAM_ID=your-team-id
APPLE_MUSIC_KEY_ID=your-key-id
APPLE_MUSIC_PRIVATE_KEY="your-private-key"
DEEZER_CLIENT_ID=your-client-id
DEEZER_CLIENT_SECRET=your-client-secret
SOUNDCLOUD_CLIENT_ID=your-client-id
SOUNDCLOUD_CLIENT_SECRET=your-client-secret
TIDAL_CLIENT_ID=your-client-id
TIDAL_CLIENT_SECRET=your-client-secret
YOUTUBE_MUSIC_CLIENT_ID=your-client-id
YOUTUBE_MUSIC_CLIENT_SECRET=your-client-secret

# Health & Fitness
FITBIT_CLIENT_ID=your-client-id
FITBIT_CLIENT_SECRET=your-client-secret
WHOOP_CLIENT_ID=your-client-id
WHOOP_CLIENT_SECRET=your-client-secret

# Learning
COURSERA_CLIENT_ID=your-client-id
COURSERA_CLIENT_SECRET=your-client-secret

# Food
IFOOD_CLIENT_ID=your-client-id
IFOOD_CLIENT_SECRET=your-client-secret

# Other
LETTERBOXD_CLIENT_ID=your-client-id
LETTERBOXD_CLIENT_SECRET=your-client-secret
UNTAPPD_CLIENT_ID=your-client-id
UNTAPPD_CLIENT_SECRET=your-client-secret
```

---

## 🤖 Automated Setup Script

Run this script to automatically set up some platforms:

```bash
npm run oauth:setup
```

Or use the interactive wizard:

```bash
npm run oauth:wizard
```

---

## 🔒 Security Notes

1. **Never commit** .env to git
2. **Rotate credentials** periodically
3. **Use encryption** key for production
4. **Enable 2FA** on all developer accounts
5. **Monitor usage** for unexpected activity

---

## 🆘 Troubleshooting

### "Redirect URI mismatch"
- Ensure URI exactly matches: `http://localhost:3001/api/platforms/callback/{platform}`
- Some platforms require HTTPS in production

### "Invalid client credentials"
- Double-check Client ID and Secret
- Ensure no extra spaces or quotes
- Some platforms use different field names (App ID, Consumer Key, etc.)

### "API access denied"
- Some platforms require manual approval
- Check if you need a developer/partner account
- May need to provide app review documentation

---

## 📞 Support

For platform-specific issues:
- Check platform's developer forums
- Review API status pages
- Contact platform support if needed

For Soul Signature issues:
- Check logs: `npm run logs`
- Test connection: `npm run test:oauth {platform}`
