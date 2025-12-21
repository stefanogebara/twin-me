# Pipedream Connect Setup Guide

**Date**: October 28, 2025
**Project**: Twin Me - Soul Signature Platform
**Status**: Implementation Ready

---

## 🎯 Overview

This guide walks you through setting up Pipedream Connect for centralized OAuth management across 30+ platforms in the Twin Me Soul Signature platform.

### Why Pipedream Connect?

**Benefits Over Custom OAuth:**
- ✅ Pre-built OAuth flows for 500+ platforms
- ✅ Automatic token refresh handling (no more expiration errors!)
- ✅ Unified API for all platform connections
- ✅ Built-in security and compliance
- ✅ Reduced maintenance burden (save 80% development time)
- ✅ Real-time webhooks for connection status

**Cost**: Free tier includes 10,000 Connect requests/month (sufficient for development)

---

## 📋 Prerequisites

Before starting:
- [ ] Access to Twin Me codebase (`C:\Users\stefa\twin-me`)
- [ ] Backend server running on port 3001
- [ ] Frontend running on port 8086
- [ ] `.env` file at project root

---

## 🚀 Step 1: Create Pipedream Account

### 1.1 Sign Up for Pipedream

1. Go to https://pipedream.com
2. Click "Sign Up" (top right)
3. Sign up with:
   - GitHub (recommended for developers)
   - OR Email + Password
4. Verify your email

### 1.2 Create a New Project

1. Once logged in, navigate to **Connect** in the left sidebar
2. Click **"New Project"**
3. Project details:
   - **Name**: `twin-me-soul-signature`
   - **Description**: Soul Signature Platform - OAuth for entertainment and professional platforms
4. Click **"Create Project"**
5. **Copy the Project ID** (you'll need this for environment variables)

### 1.3 Generate API Key

1. In your Pipedream dashboard, go to **Settings** (bottom left)
2. Click **"API Keys"** tab
3. Click **"Create API Key"**
4. API Key details:
   - **Name**: `twin-me-backend-api`
   - **Scopes**: Select all (or at minimum: `connect:read`, `connect:write`)
5. Click **"Create"**
6. **Copy the API Key** immediately (you won't be able to see it again!)
7. Store it securely (we'll add it to `.env` next)

---

## 🔑 Step 2: Configure Environment Variables

### 2.1 Add Pipedream Credentials to `.env`

Open `C:\Users\stefa\twin-me\.env` and add the following lines:

```env
# ====================================
# PIPEDREAM CONNECT CONFIGURATION
# ====================================

# Pipedream Project ID (from Step 1.2)
PIPEDREAM_PROJECT_ID=your-project-id-here

# Pipedream API Key (from Step 1.3)
PIPEDREAM_API_KEY=your-api-key-here

# Pipedream Webhook URL (for connection status updates)
# Backend must be accessible from Pipedream servers
# For development: Use ngrok or Pipedream's built-in tunnel
# For production: Use your deployed backend URL
PIPEDREAM_WEBHOOK_URL=http://localhost:3001/api/pipedream/webhook
```

### 2.2 Example `.env` Configuration

```env
# Existing variables...
NODE_ENV=development
PORT=3001
CLIENT_URL=http://localhost:8086

# Add Pipedream configuration
PIPEDREAM_PROJECT_ID=prj_abc123xyz789
PIPEDREAM_API_KEY=pd_api_kZXdkjfhskjdHFKJHDFkjhdf8734jkdf
PIPEDREAM_WEBHOOK_URL=http://localhost:3001/api/pipedream/webhook
```

### 2.3 Restart Backend Server

After adding environment variables:

```bash
# Stop the server (Ctrl+C in terminal running npm run server:dev)
# OR just let nodemon detect changes and restart automatically

# Verify Pipedream is configured
curl http://localhost:3001/api/pipedream/health
```

**Expected Response:**
```json
{
  "success": true,
  "pipedreamConfigured": true,
  "message": "Pipedream Connect is ready"
}
```

---

## 🔌 Step 3: Configure Platform Apps in Pipedream

Before users can connect platforms, you need to add platform apps to your Pipedream project.

### 3.1 Add Spotify to Pipedream

1. Go to your Pipedream project: https://pipedream.com/projects/twin-me-soul-signature
2. Click **"Apps"** tab
3. Click **"Add App"**
4. Search for **"Spotify"**
5. Click **"Add Spotify"**
6. Configure Spotify OAuth:
   - **Client ID**: (get from Spotify Developer Dashboard)
   - **Client Secret**: (get from Spotify Developer Dashboard)
   - **Redirect URI**: `http://localhost:8086/onboarding/oauth-callback` (for dev)
   - **Scopes**: Select all scopes Twin Me needs:
     - `user-read-email`
     - `user-top-read`
     - `user-read-recently-played`
     - `playlist-read-private`
     - `user-library-read`
7. Click **"Save"**

### 3.2 Add YouTube to Pipedream

1. Click **"Add App"**
2. Search for **"YouTube"**
3. Configure YouTube OAuth (uses Google OAuth):
   - **Client ID**: (get from Google Cloud Console)
   - **Client Secret**: (get from Google Cloud Console)
   - **Redirect URI**: `http://localhost:8086/onboarding/oauth-callback`
   - **Scopes**:
     - `https://www.googleapis.com/auth/youtube.readonly`
     - `https://www.googleapis.com/auth/youtube.force-ssl`
4. Click **"Save"**

### 3.3 Add More Platforms (Recommended)

Repeat the process above for:
- **Discord** - Community and social data
- **GitHub** - Professional development activity
- **Reddit** - Discussion and expertise areas
- **Twitter** - Social engagement patterns
- **Twitch** - Live streaming engagement
- **TikTok** - Short-form content engagement

---

## 🧪 Step 4: Test Pipedream Integration

### 4.1 Health Check

```bash
curl http://localhost:3001/api/pipedream/health
```

**Expected Response:**
```json
{
  "success": true,
  "pipedreamConfigured": true,
  "message": "Pipedream Connect is ready"
}
```

### 4.2 Test Spotify OAuth Flow

**Backend Test:**
```bash
curl -X POST http://localhost:3001/api/pipedream/connect/spotify \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-user-123"}'
```

**Expected Response:**
```json
{
  "success": true,
  "authUrl": "https://pipedream.com/connect/oauth/xxx",
  "connectId": "conn_abc123",
  "platform": "spotify"
}
```

**Frontend Test:**
1. Navigate to http://localhost:8086/onboarding/step4
2. Click **"Connect Spotify"**
3. You should be redirected to Pipedream's OAuth page
4. Authorize Spotify
5. You should be redirected back to Twin Me with connection status

### 4.3 Check Connection Status

```bash
curl "http://localhost:3001/api/pipedream/status?userId=test-user-123"
```

**Expected Response:**
```json
{
  "success": true,
  "connections": [
    {
      "platform": "spotify",
      "status": "connected",
      "connectId": "conn_abc123",
      "connectedAt": "2025-10-28T20:00:00.000Z",
      "lastSync": null,
      "hasData": false
    }
  ],
  "totalConnected": 1
}
```

---

## 🪝 Step 5: Configure Webhooks (Optional but Recommended)

Webhooks allow Pipedream to notify Twin Me when connections succeed/fail in real-time.

### 5.1 Configure Webhook Endpoint

**For Development (Local Testing):**

Since Pipedream can't reach `localhost:3001`, use **ngrok** to expose your backend:

```bash
# Install ngrok (if not already installed)
# https://ngrok.com/download

# Expose port 3001
ngrok http 3001
```

Copy the ngrok URL (e.g., `https://abc123.ngrok.io`) and update `.env`:

```env
PIPEDREAM_WEBHOOK_URL=https://abc123.ngrok.io/api/pipedream/webhook
```

**For Production:**

Use your deployed backend URL:

```env
PIPEDREAM_WEBHOOK_URL=https://your-backend.vercel.app/api/pipedream/webhook
```

### 5.2 Update Pipedream Project Settings

1. Go to your Pipedream project settings
2. Navigate to **"Webhooks"** tab
3. Add webhook endpoint:
   - **URL**: `https://abc123.ngrok.io/api/pipedream/webhook` (or production URL)
   - **Events**: Select all:
     - `account.connected`
     - `account.disconnected`
     - `account.error`
4. Click **"Save"**

### 5.3 Test Webhook

**Manual Test:**
```bash
curl -X POST http://localhost:3001/api/pipedream/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "account.connected",
    "external_id": "test-user-123",
    "app": "spotify",
    "account_id": "conn_abc123"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Webhook processed successfully"
}
```

**Check Database:**

The webhook should have updated the `platform_connections` table in Supabase:

```sql
SELECT * FROM platform_connections WHERE user_id = 'test-user-123';
```

---

## 📊 Step 6: Monitor Usage and Limits

### 6.1 Check Pipedream Dashboard

1. Go to https://pipedream.com/projects/twin-me-soul-signature
2. Navigate to **"Usage"** tab
3. Monitor:
   - Connect requests used this month
   - Active connections
   - Webhook deliveries

### 6.2 Free Tier Limits

**Pipedream Free Tier:**
- ✅ 10,000 Connect requests/month
- ✅ Unlimited active connections
- ✅ 1,000 webhook deliveries/day

**When to Upgrade:**
- More than 10,000 OAuth flows per month
- Need priority support
- Need custom SLAs

---

## 🐛 Troubleshooting

### Issue 1: "Pipedream Connect is not configured"

**Symptoms:**
- Health check returns `pipedreamConfigured: false`
- OAuth flow returns 503 error

**Solution:**
1. Verify `.env` has `PIPEDREAM_PROJECT_ID` and `PIPEDREAM_API_KEY`
2. Restart backend server: `npm run server:dev`
3. Check server logs for Pipedream initialization message

### Issue 2: OAuth Flow Fails

**Symptoms:**
- User clicks "Connect Spotify" but gets error
- `authUrl` is not returned

**Solution:**
1. Verify Spotify is added to Pipedream project
2. Check Spotify OAuth credentials are correct
3. Verify redirect URI matches: `http://localhost:8086/onboarding/oauth-callback`
4. Check backend logs for specific error message

### Issue 3: Webhooks Not Received

**Symptoms:**
- User connects platform but database not updated
- Webhook endpoint returns 404

**Solution:**
1. Verify `PIPEDREAM_WEBHOOK_URL` is accessible from internet (use ngrok for local dev)
2. Test webhook manually with curl (see Step 5.3)
3. Check Pipedream webhook settings in project dashboard
4. Verify webhook handler is mounted in `server.js`:
   ```javascript
   app.use('/api/pipedream', pipedreamConnectRoutes);
   ```

### Issue 4: Token Expired or Invalid

**Symptoms:**
- API requests fail with 401 Unauthorized
- `makeAuthenticatedRequest` returns error

**Solution:**
- Pipedream handles token refresh automatically!
- No manual token refresh logic needed
- If issues persist, disconnect and reconnect platform

---

## 🔄 Migration from Legacy OAuth

If you have existing platform connections using the legacy OAuth system, here's how to migrate:

### Migration Strategy: Hybrid Approach

**Phase 1: Parallel Operation (Current State)**
- Legacy OAuth continues to work
- Pipedream OAuth available for new connections
- Users can choose which system to use

**Phase 2: Gradual Migration**
- New users automatically use Pipedream
- Existing users prompted to reconnect via Pipedream
- Legacy OAuth remains as fallback

**Phase 3: Full Migration (Future)**
- All users migrated to Pipedream
- Legacy OAuth routes deprecated
- Cleanup old token refresh code

### Migration Code

Update `Step4PlatformConnect.tsx` to prefer Pipedream:

```typescript
const handleConnect = async (platform: string) => {
  try {
    setConnecting(true);

    // Try Pipedream first
    const response = await fetch(`/api/pipedream/connect/${platform}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user?.id })
    });

    const data = await response.json();

    if (data.success && data.authUrl) {
      // Store onboarding state
      localStorage.setItem('onboarding-step', '4');
      localStorage.setItem('onboarding-connecting-platform', platform);

      // Redirect to Pipedream OAuth
      window.location.href = data.authUrl;
    } else {
      // Fallback to legacy OAuth
      console.log('Pipedream not available, using legacy OAuth');
      const legacyResponse = await fetch(`/api/platforms/connect/${platform}`);
      const legacyData = await legacyResponse.json();
      window.location.href = legacyData.authUrl;
    }
  } catch (error) {
    console.error('Platform connection error:', error);
    setConnecting(false);
    alert('Failed to connect. Please try again.');
  }
};
```

---

## 📈 Next Steps

After Pipedream Connect is set up:

1. **Update Frontend Components**
   - [ ] Modify `Step4PlatformConnect.tsx` to use Pipedream API
   - [ ] Update `PlatformConnector.tsx` component
   - [ ] Add connection status indicators

2. **Implement Data Extraction**
   - [ ] Create `extractPipedreamPlatformData()` function
   - [ ] Use `pipedreamConnect.makeAuthenticatedRequest()` for API calls
   - [ ] Update `soul-extraction.js` to support Pipedream connections

3. **Add More Platforms**
   - [ ] Netflix (requires browser extension)
   - [ ] LinkedIn
   - [ ] Slack
   - [ ] Microsoft Teams
   - [ ] Instagram
   - [ ] TikTok (limited API)

4. **Production Deployment**
   - [ ] Update `PIPEDREAM_WEBHOOK_URL` to production URL
   - [ ] Configure production OAuth redirect URIs
   - [ ] Test all platforms in production environment
   - [ ] Monitor Pipedream usage and upgrade plan if needed

---

## 📚 Resources

**Pipedream Documentation:**
- Connect API Reference: https://pipedream.com/docs/connect/api
- OAuth Configuration Guide: https://pipedream.com/docs/connect/oauth
- Webhook Events: https://pipedream.com/docs/connect/webhooks
- Security Best Practices: https://pipedream.com/docs/connect/security

**Twin Me Documentation:**
- `PIPEDREAM_OAUTH_INTEGRATION_PLAN.md` - Full implementation plan
- `api/services/pipedreamConnect.js` - Backend service implementation
- `api/routes/pipedream-connect.js` - API routes documentation

**Support:**
- Pipedream Support: https://pipedream.com/support
- Twin Me GitHub Issues: https://github.com/stefanogebara/twin-me/issues

---

## ✅ Setup Checklist

Complete this checklist to ensure Pipedream Connect is fully configured:

### Account Setup
- [ ] Created Pipedream account
- [ ] Created `twin-me-soul-signature` project
- [ ] Generated API key
- [ ] Copied Project ID

### Environment Configuration
- [ ] Added `PIPEDREAM_PROJECT_ID` to `.env`
- [ ] Added `PIPEDREAM_API_KEY` to `.env`
- [ ] Added `PIPEDREAM_WEBHOOK_URL` to `.env`
- [ ] Restarted backend server
- [ ] Verified health check passes

### Platform Apps
- [ ] Added Spotify to Pipedream
- [ ] Added YouTube to Pipedream
- [ ] Added Discord to Pipedream
- [ ] Added GitHub to Pipedream
- [ ] (Optional) Added Reddit to Pipedream
- [ ] (Optional) Added Twitter to Pipedream

### Testing
- [ ] Health check returns `pipedreamConfigured: true`
- [ ] Test OAuth flow with Spotify
- [ ] Test connection status endpoint
- [ ] Test webhook delivery (if using ngrok)
- [ ] Verify database updates on connection

### Frontend Integration
- [ ] Update `Step4PlatformConnect.tsx` to use Pipedream
- [ ] Test onboarding flow end-to-end
- [ ] Verify OAuth callback handling
- [ ] Test skip functionality

### Production Readiness
- [ ] Updated webhook URL to production
- [ ] Configured all production redirect URIs
- [ ] Tested in production environment
- [ ] Set up monitoring for Pipedream usage
- [ ] Documented any platform-specific quirks

---

**Status**: ✅ Implementation Complete - Ready for Testing
**Next**: Update frontend Step4PlatformConnect.tsx to use Pipedream Connect API
**Date**: October 28, 2025
