# OAuth Setup Guide - Twin AI Platform (2025)

## 🚨 CRITICAL: 2025 OAuth Security Requirements

Starting April 2025, OAuth providers enforce **loopback IP literals** instead of `localhost`:
- ✅ Use: `http://127.0.0.1:3001/api/oauth/callback/{provider}`
- ❌ Don't use: `http://localhost:3001/api/oauth/callback/{provider}`

---

## 📋 Quick Setup Checklist

### Current Status
- ✅ Google OAuth (Gmail, Calendar, YouTube)
- ✅ Spotify
- ✅ Discord
- ✅ GitHub
- ✅ LinkedIn
- ✅ Slack
- ⏳ Need to update redirect URIs

---

## Step-by-Step Platform Setup

### 1️⃣ Spotify
1. Go to https://developer.spotify.com/dashboard
2. Create app with redirect: `http://127.0.0.1:3001/api/oauth/callback/spotify`
3. Required scopes: user-top-read, user-read-recently-played, playlist-read-private

### 2️⃣ GitHub  
1. Go to https://github.com/settings/developers
2. New OAuth App with callback: `http://127.0.0.1:3001/api/oauth/callback/github`
3. Required scopes: user, user:email

### 3️⃣ Discord
1. Go to https://discord.com/developers/applications
2. OAuth2 tab → Add redirect: `http://127.0.0.1:3001/api/oauth/callback/discord`
3. Required scopes: identify, email, guilds

### 4️⃣ YouTube (Google)
1. Go to https://console.cloud.google.com
2. Enable YouTube Data API v3
3. Create OAuth client with redirect: `http://127.0.0.1:3001/api/oauth/callback/youtube`

### 5️⃣ LinkedIn
1. Go to https://www.linkedin.com/developers/apps
2. Create app with redirect: `http://127.0.0.1:3001/api/oauth/callback/linkedin`
3. Request "Sign In with LinkedIn" product access

---

## Update .env File

Replace `localhost` with `127.0.0.1` in all redirect URIs:

```env
SPOTIFY_REDIRECT_URI=http://127.0.0.1:3001/api/oauth/callback/spotify
GITHUB_REDIRECT_URI=http://127.0.0.1:3001/api/oauth/callback/github
DISCORD_REDIRECT_URI=http://127.0.0.1:3001/api/oauth/callback/discord
LINKEDIN_REDIRECT_URI=http://127.0.0.1:3001/api/oauth/callback/linkedin
```

---

## Testing

1. Restart backend: `npm run server:dev`
2. Open: `http://127.0.0.1:8086/get-started`
3. Click "Connect" on each platform
4. Complete OAuth flow
5. Verify connection in dashboard
