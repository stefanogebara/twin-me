# Google OAuth Configuration - Redirect URI Setup

## Error: redirect_uri_mismatch

You're getting this error because the redirect URI used by your application is not registered in Google Cloud Console.

## Redirect URI to Add

Your application is using this redirect URI:

```
http://localhost:3001/api/auth/oauth/callback
```

## Steps to Fix

### 1. Go to Google Cloud Console
Visit: https://console.cloud.google.com/apis/credentials

### 2. Select Your OAuth 2.0 Client
- Find your client ID: `298873888709-eq7rid9tib30m97r94qaasi3ohpaq52q.apps.googleusercontent.com`
- Click on it to edit

### 3. Add Authorized Redirect URI
In the "Authorized redirect URIs" section, add:
```
http://localhost:3001/api/auth/oauth/callback
```

### 4. Also Add (for Future/Production Use)
```
https://twin-ai-learn.vercel.app/api/auth/oauth/callback
```

### 5. Save Changes
- Click "Save" at the bottom
- Wait 5-10 seconds for changes to propagate

### 6. Test Again
- Go back to http://localhost:8086
- Click "Sign In with Google"
- Should now work!

---

## Your Current OAuth Configuration

**Google Client ID:** 298873888709-eq7rid9tib30m97r94qaasi3ohpaq52q.apps.googleusercontent.com

**Redirect URIs in use:**
- Development: http://localhost:3001/api/auth/oauth/callback
- Production: https://twin-ai-learn.vercel.app/api/auth/oauth/callback

---

## Quick Link
https://console.cloud.google.com/apis/credentials

Created: January 13, 2025
