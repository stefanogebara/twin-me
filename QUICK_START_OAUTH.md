# OAuth Quick Start Guide

## 3-Step Setup

### 1. Run Diagnostic (2 minutes)
```bash
cd C:\Users\stefa\twin-ai-learn
node api/scripts/test-oauth-setup.js
```

This validates all OAuth credentials and shows what's configured.

### 2. Update Redirect URIs (5-10 minutes per platform)

Add this exact URI to each platform's developer console:
```
http://127.0.0.1:8086/oauth/callback
```

**Where to add:**

| Platform | Developer Console URL | Where to Add |
|----------|----------------------|--------------|
| **Spotify** | https://developer.spotify.com/dashboard | App → Edit Settings → Redirect URIs |
| **Discord** | https://discord.com/developers/applications | App → OAuth2 → Redirects |
| **GitHub** | https://github.com/settings/developers | App → Authorization callback URL |
| **Google** | https://console.cloud.google.com/apis/credentials | OAuth 2.0 Client → Authorized redirect URIs |
| **Slack** | https://api.slack.com/apps | App → OAuth & Permissions → Redirect URLs |
| **LinkedIn** | https://www.linkedin.com/developers/apps | App → Auth → Redirect URLs |
| **Reddit** | https://www.reddit.com/prefs/apps | App → Redirect URI |

### 3. Test OAuth Flow (5 minutes per platform)

```bash
# Start servers
npm run dev:full

# In browser, visit:
http://127.0.0.1:8086

# Or test with curl:
curl -X POST http://127.0.0.1:3001/api/entertainment/connect/spotify \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-user-id"}'
```

## Current Status

Your `.env` already has these configured:

| Platform | Client ID | Client Secret | Status |
|----------|-----------|---------------|--------|
| Spotify  | ✅ | ✅ | Ready |
| Discord  | ✅ | ✅ | Ready |
| GitHub   | ✅ | ✅ | Ready |
| Google   | ✅ | ✅ | Ready |
| Slack    | ✅ | ✅ | Ready |
| LinkedIn | ✅ | ✅ | Ready |
| Reddit   | ✅ | ✅ | Ready |

## Common Issues

### "redirect_uri_mismatch"
**Fix:** Ensure exact URI `http://127.0.0.1:8086/oauth/callback` is in platform console

### "invalid_client"
**Fix:** Verify Client ID and Secret in `.env` match platform console

### "invalid_grant"
**Normal:** Authorization codes expire in 10 minutes - try again

## Full Documentation

- **Complete Implementation**: `OAUTH_IMPLEMENTATION_SUMMARY.md`
- **Detailed Testing**: `OAUTH_TESTING_GUIDE.md`
- **Diagnostic Script**: `api/scripts/test-oauth-setup.js`

## Quick Commands

```bash
# Validate setup
node api/scripts/test-oauth-setup.js

# Start both servers
npm run dev:full

# Test Spotify
curl -X POST http://127.0.0.1:3001/api/entertainment/connect/spotify \
  -H "Content-Type: application/json" \
  -d '{"userId": "your-user-id"}'
```

## What Was Fixed

- ✅ Token refresh error handling (invalid_grant, invalid_client)
- ✅ OAuth callback error messages
- ✅ Credential validation on startup
- ✅ Comprehensive testing guide
- ✅ Diagnostic script for troubleshooting

## Need Help?

1. Check server logs for detailed errors
2. Run diagnostic: `node api/scripts/test-oauth-setup.js`
3. Review: `OAUTH_TESTING_GUIDE.md`
