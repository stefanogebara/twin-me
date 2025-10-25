# Gmail OAuth Connection Fix Guide

## Problem
Gmail OAuth is opening a new Chrome window instead of redirecting back to the app, causing "connection failed" errors.

## Root Cause
The Google OAuth app needs to have **both local development and production redirect URIs** registered.

## Solution: Add Redirect URIs to Google Console

### Step 1: Access Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials?project=twin-me-soul-signature)
2. Sign in with your Google account (stefanogebara@gmail.com)
3. Make sure you're viewing the project: **twin-me-soul-signature**

### Step 2: Find Your OAuth Client

1. Click on **Credentials** in the left sidebar (under APIs & Services)
2. Find the OAuth 2.0 Client ID: **`298873888709-eq7rid9tib30m97r94qaasi3ohpaq52q.apps.googleusercontent.com`**
3. Click on it to edit

### Step 3: Add Authorized Redirect URIs

In the "Authorized redirect URIs" section, you need to add **BOTH** of these:

#### For Local Development:
```
http://localhost:8086/oauth/callback
```

#### For Production:
```
https://twin-ai-learn.vercel.app/oauth/callback
```

### Step 4: Save Changes

1. Click **SAVE** at the bottom of the page
2. Wait a few minutes for the changes to propagate (Google can take 5-10 minutes)

---

## Current Configuration

### Your Client ID (from .env):
```
GOOGLE_CLIENT_ID=298873888709-eq7rid9tib30m97r94qaasi3ohpaq52q.apps.googleusercontent.com
```

### URLs that should be in Google Console:
- ✅ `http://localhost:8086/oauth/callback` (local development)
- ✅ `https://twin-ai-learn.vercel.app/oauth/callback` (production)

---

## Testing the Fix

### Test Locally:
1. Make sure your local dev server is running: `npm run dev:full`
2. Navigate to: `http://localhost:8086/get-started`
3. Click "Connect Gmail"
4. OAuth popup should open and redirect back after authorization
5. Popup should close and show "Connected Successfully"

### Test in Production:
1. Navigate to: `https://twin-ai-learn.vercel.app/get-started`
2. Click "Connect Gmail"
3. Same flow should work in production

---

## Additional Notes

### Why This Happens
- Google OAuth requires **exact match** of redirect URIs
- If the redirect URI isn't registered, Google shows an error or opens a new browser window
- Your app uses a unified callback URL: `/oauth/callback`

### OAuth Scopes Currently Requested
Your app requests these Gmail scopes (from `api/routes/connectors.js:24`):
```javascript
scopes: ['https://www.googleapis.com/auth/gmail.readonly']
```

This only requests **read-only** access to Gmail, which is secure and appropriate for your use case.

---

## Troubleshooting

### Issue: "Authorization Error" after clicking "Connect Gmail"
**Solution**: Make sure both redirect URIs are added to Google Console and wait 5-10 minutes

### Issue: Popup opens but shows Google error page
**Solution**: Check that the redirect URI **exactly matches** what's in Google Console (including http vs https)

### Issue: OAuth works locally but not in production
**Solution**: Verify the production redirect URI is added: `https://twin-ai-learn.vercel.app/oauth/callback`

### Issue: OAuth works in production but not locally
**Solution**: Verify the local redirect URI is added: `http://localhost:8086/oauth/callback`

---

## Environment Variables Check

Your `.env` file should have:
```env
# Google OAuth (same credentials for Gmail, YouTube, etc.)
GOOGLE_CLIENT_ID=298873888709-eq7rid9tib30m97r94qaasi3ohpaq52q.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=[Your secret from .env file - do not commit]

# App URLs
VITE_APP_URL=http://localhost:8086
VITE_API_URL=http://localhost:3001/api

# Production (set in Vercel)
APP_URL=https://twin-ai-learn.vercel.app
```

---

## Next Steps After Fix

Once OAuth is working:
1. ✅ Test Gmail connection locally
2. ✅ Test Gmail connection in production
3. ✅ Verify data extraction starts after connection
4. ✅ Check Soul Signature Dashboard shows Gmail data

---

## Quick Reference: Google Console URL

Direct link to your OAuth client (if you have permissions):
https://console.cloud.google.com/apis/credentials/oauthclient/298873888709-eq7rid9tib30m97r94qaasi3ohpaq52q.apps.googleusercontent.com?project=twin-me-soul-signature
