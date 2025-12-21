# 🚀 Pipedream Connect Setup Guide for Twin Me

This guide walks you through setting up Pipedream Connect to solve the Spotify 403 quota issue and enable OAuth for 30+ platforms.

---

## 📋 What You'll Get

- **Pre-approved OAuth apps** for Spotify, YouTube, GitHub, Discord, Reddit, LinkedIn, Gmail, etc.
- **No more Spotify 403 errors** - bypass the 25-user Development Mode limit
- **Managed authentication** - automatic token refresh, secure storage
- **SOC 2 & GDPR compliant** infrastructure

---

## Step 1: Create Pipedream Account

1. Go to [pipedream.com](https://pipedream.com)
2. Click "Sign Up" (free to start)
3. Verify your email
4. You'll start on the **Free Tier** (good for testing)

---

## Step 2: Create a Connect Project

1. In Pipedream dashboard, click **"Connect"** in the left sidebar
2. Click **"Create Project"**
3. Name your project: **"Twin Me"**
4. Description: **"Soul Signature Platform - Personal data extraction and analysis"**
5. Click **"Create"**

---

## Step 3: Generate OAuth Credentials

1. In your Twin Me Connect project, go to **"Settings"**
2. Under **"OAuth Credentials"**, click **"Generate Client Credentials"**
3. You'll see:
   - **Client ID** (public key)
   - **Client Secret** (private key - keep secure!)
   - **Publishable Key** (for frontend)

4. **Copy these values** - you'll need them for your `.env` file

---

## Step 4: Configure Environment Variables

Add these to your `.env` file:

```env
# Pipedream Connect (Add these)
PIPEDREAM_CLIENT_ID=your-client-id-here
PIPEDREAM_CLIENT_SECRET=your-client-secret-here
PIPEDREAM_PUBLISHABLE_KEY=your-publishable-key-here
PIPEDREAM_ENV=development  # or 'production'

# Frontend (Add this to .env too)
VITE_PIPEDREAM_PUBLISHABLE_KEY=your-publishable-key-here
VITE_PIPEDREAM_ENV=development
```

---

## Step 5: Add Platforms (Apps) to Your Project

1. In your Connect project, go to **"Apps"**
2. Click **"Add App"**
3. Search and add these platforms (in priority order):

**Top Priority (Entertainment/Personal):**
- ✅ Spotify
- ✅ YouTube Data API
- ✅ Discord
- ✅ Reddit
- ✅ GitHub

**Secondary (Communication):**
- ✅ Gmail (Google)
- ✅ Google Calendar
- ✅ Slack
- ✅ Microsoft Teams (via Microsoft Graph API)

**Additional (if needed):**
- LinkedIn
- Twitch
- Twitter/X

4. For each app, Pipedream will prompt you to:
   - Review requested permissions (scopes)
   - Authorize Pipedream's OAuth app
   - This is a one-time setup

---

## Step 6: Configure OAuth Redirect URIs

1. In Connect project settings, go to **"OAuth"**
2. Add these redirect URIs:
   - `http://127.0.0.1:8086/oauth/callback` (local dev)
   - `http://localhost:8086/oauth/callback` (local dev)
   - `https://your-production-domain.com/oauth/callback` (production)

3. Save changes

---

## Step 7: Set Up Webhooks (Optional but Recommended)

Webhooks notify your backend when users connect/disconnect accounts:

1. In Connect project, go to **"Webhooks"**
2. Add webhook URL: `https://your-api-domain.com/api/pipedream/webhooks/account-connected`
3. Select events:
   - `account.connected`
   - `account.disconnected`
4. Save

For local testing, use ngrok:
```bash
ngrok http 3001
# Copy the https URL and use it as your webhook URL
```

---

## Step 8: Test the Integration

1. Restart your dev servers:
   ```bash
   npm run dev:full
   ```

2. Navigate to `http://localhost:8086/platform-hub`

3. Click "Connect Spotify"

4. You should see Pipedream's OAuth modal

5. Authorize with Spotify

6. Success! Your backend should receive the connection webhook

---

## 🎯 How It Works

### User Flow:
```
User clicks "Connect Spotify"
    ↓
Frontend calls your backend for Connect Token
    ↓
Backend generates token via Pipedream API
    ↓
Frontend opens Pipedream Connect modal
    ↓
User authorizes Spotify (via Pipedream's pre-approved app)
    ↓
Pipedream securely stores tokens
    ↓
Pipedream sends webhook to your backend
    ↓
Your backend saves connection in Supabase
    ↓
Your backend triggers data extraction workflow
    ↓
Workflow fetches Spotify data using user's token
    ↓
Workflow POSTs data to your backend
    ↓
Soul Signature analysis begins!
```

---

## 📊 Pricing Considerations

### Free Tier (Development)
- **Cost:** $0/month
- **Limitations:**
  - 100 credits/month
  - 3 active workflows
  - 3 connected accounts
  - **NOT for production**

**Verdict:** Good for testing, but move to paid plans before launch

### Connect Plan (Recommended for MVP)
- **Cost:** $99/month
- **Includes:**
  - 100 external users (your users)
  - 10,000 workflow credits
  - Unlimited workflows
  - Production OAuth
  - SOC 2 compliance
- **Additional:** $2 per user/month beyond 100

**Verdict:** Best for launching with beta users

### Cost Example for 500 Users:
- Base: $99/month (100 users)
- Additional: 400 × $2 = $800/month
- **Total: $899/month**

**Pro Tip:** Once you have 500+ users, consider applying for Spotify Extended Quota Mode and migrating to direct API to reduce costs.

---

## 🛠️ Troubleshooting

### Issue: "Invalid redirect URI"
**Solution:** Make sure you added `http://127.0.0.1:8086/oauth/callback` to Pipedream's allowed URIs

### Issue: "Client ID not found"
**Solution:** Check that `PIPEDREAM_CLIENT_ID` and `VITE_PIPEDREAM_PUBLISHABLE_KEY` are in your `.env` file

### Issue: "Account connection failed"
**Solution:** Check browser console for errors. Ensure popup blockers are disabled.

### Issue: "Webhook not receiving events"
**Solution:**
- Verify webhook URL is correct
- Test with ngrok for local dev
- Check webhook logs in Pipedream dashboard

---

## 📚 Additional Resources

- **Pipedream Docs:** https://pipedream.com/docs/connect
- **SDK Reference:** https://www.npmjs.com/package/@pipedream/sdk
- **Community:** https://pipedream.com/community
- **Spotify API:** https://developer.spotify.com/documentation/web-api

---

## 🎉 Next Steps

Once Pipedream is configured:

1. ✅ Users can connect Spotify without 403 errors
2. ✅ Create extraction workflows for each platform
3. ✅ Build Soul Signature analysis pipeline
4. ✅ Launch MVP with beta users
5. ✅ Apply for Spotify Extended Quota Mode (parallel track)
6. ✅ Optionally migrate high-volume platforms later

---

## ❓ Questions?

If you need help with setup, check:
1. Pipedream dashboard "Logs" for detailed error messages
2. Your browser console (F12) for frontend errors
3. Your backend logs for API issues

**The code integration is already done** - just follow this guide to get your Pipedream credentials, and you're ready to go! 🚀
