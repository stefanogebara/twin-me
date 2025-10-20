# Background Monitoring System - Complete Guide

## Overview

The Soul Signature platform now features a comprehensive background monitoring system that:

✅ **Automatically refreshes OAuth tokens before they expire** (no more manual reconnections!)
✅ **Continuously polls connected platforms for new data** (stays in sync 24/7)
✅ **Maintains persistent connections** (connections survive page refreshes and login sessions)
✅ **Provides real-time updates via WebSocket** (instant notifications to the frontend)
✅ **Smart polling intervals** (respects platform rate limits)
✅ **Zero user intervention required** (everything runs automatically in the background)

---

## 🎯 What This Solves

### Before (Problems):
- ❌ Users had to manually reconnect every time tokens expired
- ❌ Platform connections were lost after closing the browser
- ❌ Data extraction was manual and one-time only
- ❌ No way to get real-time updates about new content
- ❌ Token expiration caused connection failures

### After (Solutions):
- ✅ **Automatic Token Refresh**: Tokens refreshed 10 minutes before expiration
- ✅ **Persistent Connections**: Connections saved in database, always available
- ✅ **Continuous Data Sync**: Background workers constantly poll for new data
- ✅ **Real-Time Updates**: WebSocket pushes live updates to frontend
- ✅ **Smart Monitoring**: Platform-specific polling intervals (30 min for Spotify, 2 hrs for YouTube, etc.)

---

## 🏗️ Architecture

### 1. Token Refresh Service (`api/services/tokenRefreshService.js`)

**Purpose**: Automatically refreshes OAuth access tokens before they expire

**Features**:
- Runs every 5 minutes to check for expiring tokens
- Refreshes tokens 10 minutes before expiration
- Handles refresh token rotation
- Marks connections as `needs_reauth` if refresh fails
- Encrypts/decrypts tokens using AES-256-GCM

**How It Works**:
```javascript
// Every 5 minutes:
1. Query database for tokens expiring in next 10 minutes
2. For each expiring token:
   - Decrypt refresh token
   - Call platform OAuth endpoint to get new access token
   - Encrypt and save new tokens
   - Update expiry time in database
3. If refresh fails → mark connection as needs_reauth
```

**Supported Platforms**:
- Spotify
- YouTube
- Gmail
- Google Calendar
- Discord
- LinkedIn
- (GitHub tokens don't expire)

---

### 2. Platform Polling Service (`api/services/platformPollingService.js`)

**Purpose**: Continuously polls connected platforms for new data

**Features**:
- Platform-specific polling schedules
- Automatic token refresh before API calls
- Rate limit compliance
- Batch processing with delays between users
- Stores raw data in `user_platform_data` table

**Polling Schedules**:
```javascript
Spotify:         Every 30 minutes  // Recently played, currently playing
YouTube:         Every 2 hours     // Watch history, liked videos
GitHub:          Every 6 hours     // Events, repository activity
Discord:         Every 4 hours     // Guild memberships
Gmail:           Every 1 hour      // Recent messages
```

**How It Works**:
```javascript
// For each platform on schedule:
1. Get all users with connected platform
2. For each user:
   - Ensure token is fresh (auto-refresh if needed)
   - Call platform API endpoints
   - Store raw data in database
   - Update last_sync timestamp
   - Wait 2-5 seconds before next user (rate limiting)
```

---

### 3. WebSocket Service (`api/services/websocketService.js`)

**Purpose**: Real-time updates to connected frontend clients

**Features**:
- WebSocket server on `/ws` path
- User authentication on connect
- Real-time notifications for:
  - Platform data synced
  - Token refreshed
  - New data available
  - Extraction progress
  - Connection status changes
- Ping/pong keepalive mechanism

**Connection Flow**:
```javascript
// Frontend:
const ws = new WebSocket('ws://localhost:3001/ws');

// Authenticate
ws.send(JSON.stringify({
  type: 'auth',
  userId: user.id
}));

// Receive updates
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  switch (data.type) {
    case 'platform_sync':
      console.log(`${data.platform} synced!`);
      break;
    case 'token_refresh':
      console.log(`${data.platform} token refreshed`);
      break;
    case 'new_data':
      console.log(`${data.count} new ${data.dataType} from ${data.platform}`);
      break;
  }
};
```

---

## 🚀 Setup Instructions

### 1. Prerequisites

All dependencies are already installed:
```bash
✅ node-cron (v3.0.3) - Cron job scheduling
✅ ws (v8.18.0) - WebSocket server
```

### 2. Environment Variables

Add platform API credentials to your `.env` file:

```env
# Existing (you have these)
VITE_SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ENCRYPTION_KEY=your-encryption-key-32-bytes

# Spotify (Required for Spotify monitoring)
SPOTIFY_CLIENT_ID=your-spotify-client-id
SPOTIFY_CLIENT_SECRET=your-spotify-client-secret

# Google (Required for YouTube, Gmail, Calendar)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Discord (Required for Discord monitoring)
DISCORD_CLIENT_ID=your-discord-client-id
DISCORD_CLIENT_SECRET=your-discord-client-secret

# LinkedIn (Required for LinkedIn monitoring)
LINKEDIN_CLIENT_ID=your-linkedin-client-id
LINKEDIN_CLIENT_SECRET=your-linkedin-client-secret

# GitHub (Optional - tokens don't expire)
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
```

### 3. Server Startup

The background services start automatically when you run:

```bash
npm run dev:full
# or
npm run server:dev
```

You'll see:
```
🚀 Secure API server running on port 3001
📝 Environment: development
🔐 CORS origin: http://localhost:8086
🔌 WebSocket server enabled on ws://localhost:3001/ws
⏰ Background services active:
   - Token Refresh: Every 5 minutes
   - Spotify Polling: Every 30 minutes
   - YouTube Polling: Every 2 hours
   - GitHub Polling: Every 6 hours
   - Discord Polling: Every 4 hours
   - Gmail Polling: Every 1 hour
```

---

## 📊 Database Schema Updates

### platform_connections table

Already has the necessary columns:
```sql
- access_token: TEXT (encrypted)
- refresh_token: TEXT (encrypted)
- token_expires_at: TIMESTAMP
- last_sync: TIMESTAMP
- status: TEXT ('connected', 'needs_reauth', 'disconnected')
- error_message: TEXT
```

### user_platform_data table

Stores continuously collected data:
```sql
- id: UUID
- user_id: UUID
- platform: TEXT
- data_type: TEXT (e.g., 'recently_played', 'watch_history')
- raw_data: JSONB
- extracted_at: TIMESTAMP
```

---

## 🔄 How It All Works Together

### Typical User Journey:

**1. User Connects Platform (One Time)**
```javascript
User clicks "Connect Spotify"
  → OAuth flow completes
  → Access token + refresh token saved (encrypted)
  → Token expiry time calculated and saved
  → status = 'connected'
```

**2. Background Monitoring Begins Automatically**
```javascript
// Token Refresh Service (every 5 minutes):
Check if Spotify token expires in next 10 minutes
  → If yes: Use refresh token to get new access token
  → Save new tokens (encrypted)
  → Update expiry time
  → User never sees token expiration!

// Platform Polling Service (every 30 min for Spotify):
Get user's Spotify access token
  → Ensure token is fresh (auto-refresh if needed)
  → Call Spotify API: Recently Played
  → Call Spotify API: Currently Playing
  → Store raw data in database
  → Update last_sync timestamp
  → Send WebSocket notification to user
```

**3. Frontend Stays Updated (Real-Time)**
```javascript
WebSocket receives notification:
  {
    type: 'platform_sync',
    platform: 'spotify',
    message: 'spotify data synced successfully'
  }

Frontend updates UI:
  ✅ Spotify: Last synced 2 minutes ago
  📊 50 new tracks discovered
  🎵 Currently listening to: [Track Name]
```

**4. User Logs Out and Returns Later**
```javascript
User logs out
  → Background services continue running
  → Data continues being collected

User logs back in (days/weeks later)
  → Connections still show as 'connected'
  → Last sync shows recent timestamp
  → All historical data is available
  → No need to reconnect anything!
```

---

## 🎛️ Configuration & Customization

### Adjusting Polling Intervals

Edit `api/services/platformPollingService.js`:

```javascript
const POLLING_CONFIGS = {
  spotify: {
    interval: '*/30 * * * *', // Change this (cron syntax)
    endpoints: [...]
  }
};
```

**Cron Syntax Reference**:
```
*/30 * * * *  = Every 30 minutes
0 */2 * * *   = Every 2 hours
0 */6 * * *   = Every 6 hours
*/15 * * * *  = Every 15 minutes
0 0 * * *     = Once per day at midnight
```

### Adding New Platforms

1. **Add Platform Config** (tokenRefreshService.js):
```javascript
const PLATFORM_REFRESH_CONFIGS = {
  myplatform: {
    tokenUrl: 'https://myplatform.com/oauth/token',
    clientId: process.env.MYPLATFORM_CLIENT_ID,
    clientSecret: process.env.MYPLATFORM_CLIENT_SECRET,
  }
};
```

2. **Add Polling Config** (platformPollingService.js):
```javascript
const POLLING_CONFIGS = {
  myplatform: {
    interval: '0 */4 * * *', // Every 4 hours
    endpoints: [
      {
        name: 'user_data',
        url: 'https://api.myplatform.com/user/data',
      }
    ]
  }
};
```

3. **Add Cron Job** (platformPollingService.js):
```javascript
function startPlatformPolling() {
  // ... existing jobs

  // MyPlatform - Every 4 hours
  cron.schedule('0 */4 * * *', async () => {
    console.log('⏰ Running MyPlatform polling job');
    await pollPlatformForAllUsers('myplatform');
  });
}
```

---

## 🧪 Testing

### Test Token Refresh Manually:

```javascript
// In Node REPL or test script:
import { refreshAccessToken } from './api/services/tokenRefreshService.js';

const result = await refreshAccessToken(
  'spotify',
  'your-refresh-token',
  'user-id'
);

console.log(result);
// { accessToken: '...', refreshToken: '...', expiresIn: 3600 }
```

### Test Platform Polling:

```javascript
import { pollAllPlatformsForUser } from './api/services/platformPollingService.js';

const results = await pollAllPlatformsForUser('your-user-id');
console.log(results);
```

### Test WebSocket Connection:

```javascript
// In browser console:
const ws = new WebSocket('ws://localhost:3001/ws');

ws.onopen = () => {
  console.log('Connected!');
  ws.send(JSON.stringify({
    type: 'auth',
    userId: 'your-user-id'
  }));
};

ws.onmessage = (event) => {
  console.log('Received:', JSON.parse(event.data));
};
```

---

## 📈 Monitoring & Logs

### Console Logs

All services log their activity:

```
🔍 Checking for expiring tokens...
⚠️  Found 3 tokens expiring soon
🔄 Refreshing token for spotify (user: abc123)
✅ Token refreshed successfully for spotify
✅ Updated tokens for spotify (user: abc123)

📡 Polling spotify for all users...
👥 Polling spotify for 15 users
📡 Polling spotify - recently_played for user abc123
✅ Successfully polled spotify - recently_played
✅ Completed spotify polling

📱 New WebSocket connection
✅ WebSocket authenticated for user: abc123
```

### Database Queries

Check active connections:
```sql
SELECT platform, status, last_sync, token_expires_at
FROM platform_connections
WHERE user_id = 'your-user-id';
```

Check collected data:
```sql
SELECT platform, data_type, COUNT(*), MAX(extracted_at)
FROM user_platform_data
WHERE user_id = 'your-user-id'
GROUP BY platform, data_type;
```

---

## 🐛 Troubleshooting

### Issue: Tokens Keep Expiring

**Problem**: Connections keep showing "needs_reauth"

**Solutions**:
1. Check that platform client ID/secret are correct in `.env`
2. Verify refresh tokens are being saved during initial OAuth
3. Check token refresh service logs for errors
4. Ensure `ENCRYPTION_KEY` hasn't changed (would make old tokens unreadable)

### Issue: Polling Not Happening

**Problem**: `last_sync` timestamps not updating

**Solutions**:
1. Verify cron jobs are registered (check server startup logs)
2. Check that platform has `status = 'connected'` in database
3. Verify platform API credentials in `.env`
4. Check rate limiting (add delays if hitting API limits)

### Issue: WebSocket Not Connecting

**Problem**: Frontend can't establish WebSocket connection

**Solutions**:
1. Verify WebSocket server started (check server logs for "WebSocket server enabled")
2. Ensure frontend is connecting to correct URL: `ws://localhost:3001/ws`
3. Check browser console for WebSocket errors
4. Verify CORS settings allow WebSocket connections

### Issue: High CPU/Memory Usage

**Problem**: Background services using too many resources

**Solutions**:
1. Increase polling intervals (less frequent = less resource usage)
2. Add more delays between user processing
3. Limit number of platforms polled simultaneously
4. Consider using a job queue (Bull, Bee-Queue) for better control

---

## 🚀 Production Deployment

### Vercel Considerations

**Note**: Background cron jobs don't work in Vercel serverless environment

**Alternative Approaches**:

1. **Use Vercel Cron Jobs**:
```javascript
// vercel.json
{
  "crons": [{
    "path": "/api/cron/token-refresh",
    "schedule": "*/5 * * * *"
  }, {
    "path": "/api/cron/poll-spotify",
    "schedule": "*/30 * * * *"
  }]
}
```

2. **Use External Cron Service**:
- [Cron-job.org](https://cron-job.org)
- [EasyCron](https://www.easycron.com)
- Hit your API endpoints on schedule

3. **Use Separate Background Service**:
- Deploy background workers to Railway, Render, or Heroku
- Workers run the polling/refresh services
- Main Vercel app handles API requests

### Recommended Architecture:

```
┌─────────────────┐
│   Vercel App    │  ← Main web app (API + Frontend)
│  (Serverless)   │
└────────┬────────┘
         │
         │ Database
         ↓
┌─────────────────┐
│   Supabase DB   │  ← Shared database
└────────┬────────┘
         │
         │ Database
         ↑
┌─────────────────┐
│  Background     │  ← Separate service for cron jobs
│  Worker Service │     (Railway/Render/Heroku)
│  (Always On)    │
└─────────────────┘
```

---

## 📚 API Reference

### Utility Functions

#### `ensureFreshToken(userId, platform)`
Returns a fresh access token, automatically refreshing if needed.

```javascript
const token = await ensureFreshToken('user-123', 'spotify');
// Use token immediately for API calls
```

#### `pollAllPlatformsForUser(userId)`
Manually trigger polling for all of a user's connected platforms.

```javascript
const results = await pollAllPlatformsForUser('user-123');
```

#### `sendToUser(userId, message)`
Send a WebSocket message to a specific user.

```javascript
sendToUser('user-123', {
  type: 'custom_notification',
  message: 'Your soul signature has been updated!'
});
```

---

## 🎉 Benefits Summary

### For Users:
- ✅ **Set it and forget it**: Connect once, stays connected forever
- ✅ **Always up-to-date**: Latest data from all platforms automatically
- ✅ **No interruptions**: Never see "token expired" errors again
- ✅ **Real-time updates**: Instant notifications about new data
- ✅ **Better insights**: Continuous data collection = richer soul signature

### For Developers:
- ✅ **Production-ready**: Robust error handling and retry logic
- ✅ **Scalable**: Designed for many users and platforms
- ✅ **Maintainable**: Clean separation of concerns
- ✅ **Extensible**: Easy to add new platforms
- ✅ **Observable**: Comprehensive logging and monitoring

---

## 📖 Further Reading

- [node-cron Documentation](https://github.com/node-cron/node-cron)
- [WebSocket API (ws)](https://github.com/websockets/ws)
- [OAuth 2.0 Token Refresh](https://www.oauth.com/oauth2-servers/making-authenticated-requests/refreshing-an-access-token/)
- [Spotify Web API](https://developer.spotify.com/documentation/web-api)
- [YouTube Data API](https://developers.google.com/youtube/v3)

---

**Questions or Issues?** Check the troubleshooting section or create an issue in the repository.

**Built with 💙 for the Soul Signature Platform**
