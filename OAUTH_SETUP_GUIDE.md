# OAuth Setup Guide - Twin AI Learn

This guide walks you through setting up OAuth credentials for all platform connectors in your Twin AI Learn application.

## Prerequisites

- Your application URLs:
  - **Frontend**: `http://localhost:8086`
  - **Backend API**: `http://localhost:3001`
  - **OAuth Callback**: `http://localhost:8086/oauth/callback`

## Quick Start Checklist

- [ ] Apply database migrations (002 and 003)
- [ ] Configure Spotify OAuth
- [ ] Configure Discord OAuth
- [ ] Configure GitHub OAuth
- [ ] Configure Slack OAuth (optional)
- [ ] Configure Microsoft Teams OAuth (optional)
- [ ] Test each OAuth flow

---

## 1. Spotify OAuth Setup

**Goal:** Access user's listening history, playlists, and music preferences

### Steps:

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Log in with your Spotify account
3. Click **"Create App"**
4. Fill in the details:
   - **App Name**: `Twin AI Learn` (or your app name)
   - **App Description**: `Personal digital twin platform with soul signature extraction`
   - **Redirect URIs**: Add `http://localhost:8086/oauth/callback`
   - Check the terms of service agreement
5. Click **"Save"**
6. On the app page, click **"Settings"**
7. Copy your **Client ID** and **Client Secret**

### Update .env:

```env
SPOTIFY_CLIENT_ID=your-actual-client-id-here
SPOTIFY_CLIENT_SECRET=your-actual-client-secret-here
```

### Scopes Used:
- `user-read-private` - Read user's profile
- `user-read-email` - Read user's email
- `user-top-read` - Read top artists and tracks
- `user-read-recently-played` - Access recently played tracks
- `playlist-read-private` - Read private playlists
- `playlist-read-collaborative` - Read collaborative playlists
- `user-library-read` - Read saved content
- `user-follow-read` - Read following/followers

---

## 2. Discord OAuth Setup

**Goal:** Access user's servers, roles, and community interactions

### Steps:

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Log in with your Discord account
3. Click **"New Application"**
4. Enter application name: `Twin AI Learn`
5. Go to **OAuth2** tab
6. Add Redirect URL: `http://localhost:8086/oauth/callback`
7. Under **OAuth2 → General**, copy your:
   - **Client ID**
   - **Client Secret** (click "Reset Secret" if needed)

### Optional: Create Bot (for enhanced features):

1. Go to **Bot** tab
2. Click **"Add Bot"**
3. Copy the **Bot Token**
4. Enable these **Privileged Gateway Intents**:
   - Server Members Intent (if you want member data)
   - Message Content Intent (if you want message aggregates)

### Update .env:

```env
DISCORD_CLIENT_ID=your-actual-client-id
DISCORD_CLIENT_SECRET=your-actual-client-secret
DISCORD_BOT_TOKEN=your-bot-token-if-created
```

### Scopes Used:
- `identify` - Read user identity
- `email` - Read user email
- `guilds` - Read server list
- `guilds.members.read` - Read member information
- `messages.read` - Read message aggregates (privacy-respecting)

---

## 3. GitHub OAuth Setup

**Goal:** Access user's repositories, contributions, and coding patterns

### Steps:

1. Go to [GitHub Settings → Developer Settings → OAuth Apps](https://github.com/settings/developers)
2. Click **"New OAuth App"**
3. Fill in the details:
   - **Application Name**: `Twin AI Learn`
   - **Homepage URL**: `http://localhost:8086`
   - **Authorization callback URL**: `http://localhost:8086/oauth/callback`
   - **Application description**: `Personal digital twin with soul signature extraction`
4. Click **"Register application"**
5. Copy your **Client ID**
6. Click **"Generate a new client secret"**
7. Copy your **Client Secret** (you won't see it again!)

### Update .env:

```env
GITHUB_CLIENT_ID=your-actual-client-id
GITHUB_CLIENT_SECRET=your-actual-client-secret
```

### Scopes Used:
- `read:user` - Read user profile
- `user:email` - Read user email
- `repo` - Access repositories
- `read:org` - Read organization memberships

### Note:
GitHub has built-in MCP (Model Context Protocol) support, so data extraction will use Claude's GitHub MCP tools.

---

## 4. Slack OAuth Setup (Optional)

**Goal:** Access workspace messages and communication patterns

### Steps:

1. Go to [Slack API Apps](https://api.slack.com/apps)
2. Click **"Create New App"**
3. Choose **"From scratch"**
4. Enter app name: `Twin AI Learn`
5. Select a development workspace
6. Go to **OAuth & Permissions**
7. Add Redirect URL: `http://localhost:8086/oauth/callback`
8. Scroll to **Scopes** and add these **User Token Scopes**:
   - `channels:history` - View messages in public channels
   - `channels:read` - View channels
   - `users:read` - View users
   - `chat:write` - Send messages (optional)
9. Install the app to your workspace
10. Copy the **User OAuth Token**

### Update .env:

```env
SLACK_CLIENT_ID=your-client-id
SLACK_CLIENT_SECRET=your-client-secret
SLACK_USER_TOKEN=xoxp-your-user-token
```

### Note:
MCP server available: `@korotovsky/slack-mcp-server`

---

## 5. Microsoft Teams OAuth Setup (Optional)

**Goal:** Access Teams messages, meetings, and collaboration patterns

### Steps:

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory → App registrations**
3. Click **"New registration"**
4. Fill in:
   - **Name**: `Twin AI Learn`
   - **Supported account types**: Accounts in any organizational directory and personal Microsoft accounts
   - **Redirect URI**: Web - `http://localhost:8086/oauth/callback`
5. Click **"Register"**
6. Copy **Application (client) ID**
7. Go to **Certificates & secrets**
8. Click **"New client secret"**
9. Copy the secret **value** (not the ID!)
10. Go to **API permissions**
11. Click **"Add a permission" → Microsoft Graph**
12. Add these **Delegated permissions**:
    - `User.Read`
    - `Chat.Read`
    - `Channel.ReadBasic.All`
    - `Files.Read.All`

### Update .env:

```env
TEAMS_CLIENT_ID=your-application-client-id
TEAMS_CLIENT_SECRET=your-client-secret-value
TEAMS_TENANT_ID=common
```

---

## 6. YouTube Data API (Uses Google OAuth)

**Goal:** Access watch history, subscriptions, and video preferences

### Steps:

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your project (or create one)
3. Go to **APIs & Services → Library**
4. Search for **"YouTube Data API v3"**
5. Click **"Enable"**
6. Go to **APIs & Services → Credentials**
7. Your existing Google OAuth credentials will work
8. Create an **API Key** for direct API access:
   - Click **"Create Credentials" → API Key**
   - Copy the API key

### Update .env:

```env
YOUTUBE_API_KEY=your-youtube-api-key
```

### Scopes Used (via Google OAuth):
- `https://www.googleapis.com/auth/youtube.readonly`

---

## Testing Your OAuth Setup

### 1. Start Your Development Servers

```bash
cd twin-ai-learn
npm run dev:full
```

This starts:
- Frontend: `http://localhost:8086`
- Backend: `http://localhost:3001`

### 2. Test Spotify OAuth

```bash
# In another terminal, test the Spotify connector
curl -X POST http://localhost:3001/api/entertainment/connect/spotify \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-user-123"}'
```

Expected response:
```json
{
  "success": true,
  "authUrl": "https://accounts.spotify.com/authorize?client_id=...",
  "message": "Redirect user to Spotify OAuth"
}
```

### 3. Test in Browser

1. Open `http://localhost:8086/soul-signature`
2. Find the Spotify connector
3. Click **"Connect"**
4. You should be redirected to Spotify OAuth
5. Authorize the application
6. You should be redirected back with success

### 4. Verify Database

Check that tokens were stored:

```sql
-- In Supabase SQL Editor
SELECT provider, connected_at, is_active
FROM data_connectors
WHERE user_id = 'your-user-id';
```

### 5. Check Extraction Status

```sql
SELECT provider, extraction_stage, total_items_extracted
FROM extraction_status
WHERE user_id = 'your-user-id';
```

---

## Common Issues & Solutions

### Issue: "redirect_uri_mismatch"

**Solution:** Ensure the redirect URI in your OAuth app settings exactly matches:
```
http://localhost:8086/oauth/callback
```

No trailing slashes, exact protocol (http vs https).

### Issue: "invalid_client"

**Solution:**
- Double-check your Client ID and Client Secret in `.env`
- Make sure there are no extra spaces or quotes
- Restart your backend server after changing `.env`

### Issue: "Token expired"

**Solution:** The OAuth callback handler should automatically store refresh tokens. If you see this:
1. Reconnect the platform
2. Check that `refresh_token` is being stored in database
3. Implement token refresh logic (see `api/routes/oauth-callback.js`)

### Issue: "Rate limit exceeded"

**Solution:**
- Each platform has different rate limits
- Spotify: 180 requests per minute
- GitHub: 5000 requests per hour
- Discord: 50 requests per second
- Implement exponential backoff in extraction service

---

## Production Deployment Checklist

When deploying to production:

- [ ] Update all redirect URIs to production URLs
- [ ] Use HTTPS for all OAuth redirect URIs
- [ ] Store secrets in environment variables (never commit)
- [ ] Enable token encryption with strong encryption key
- [ ] Implement token refresh logic for all platforms
- [ ] Add rate limiting to your API endpoints
- [ ] Set up proper error logging and monitoring
- [ ] Review and minimize OAuth scopes (principle of least privilege)
- [ ] Implement proper RLS (Row Level Security) in Supabase
- [ ] Add CORS restrictions to your backend

---

## MCP Server Configuration

Some platforms use Model Context Protocol (MCP) servers for enhanced data extraction:

### Available MCP Servers:

1. **Spotify**: `@open-mcp/spotify` (v0.0.14)
2. **Discord**: `discord-mcp`
3. **YouTube**: `vidcap-youtube-mcp`
4. **Slack**: `@korotovsky/slack-mcp-server`
5. **GitHub**: Built-in Claude MCP tools

### MCP vs Direct OAuth:

- **MCP**: More sophisticated extraction, better privacy, Claude-optimized
- **Direct OAuth**: Simpler, more control, works without MCP infrastructure

Your platform automatically falls back to Direct OAuth if MCP is not available.

---

## Security Best Practices

1. **Never commit `.env` file** - Add to `.gitignore`
2. **Rotate secrets regularly** - Especially if exposed
3. **Use token encryption** - Encrypt OAuth tokens in database
4. **Implement RLS** - Row Level Security in Supabase
5. **Limit token scopes** - Only request necessary permissions
6. **Audit data access** - Log all data extractions
7. **User consent** - Always show what data you're collecting
8. **Data retention** - Delete old data based on retention policies

---

## Need Help?

- **Spotify API Docs**: https://developer.spotify.com/documentation/web-api
- **Discord API Docs**: https://discord.com/developers/docs
- **GitHub API Docs**: https://docs.github.com/en/rest
- **Slack API Docs**: https://api.slack.com/docs
- **Microsoft Graph**: https://learn.microsoft.com/en-us/graph/

---

## Next Steps

After completing OAuth setup:

1. ✅ Apply database migrations
2. ✅ Configure OAuth credentials
3. ⏭️ Test each platform connector
4. ⏭️ Build Soul Signature Dashboard UI
5. ⏭️ Implement data extraction services
6. ⏭️ Create LLM context generation
7. ⏭️ Build privacy controls interface

---

**Your Turn!** Start with Spotify OAuth since it's the most commonly used and well-documented platform. Once Spotify works, the others follow the same pattern.
