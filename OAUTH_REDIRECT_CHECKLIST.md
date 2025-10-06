# OAuth Redirect URI Update Checklist

## 🎯 Quick Action Items

You need to update the redirect URIs in each platform's developer console to use `127.0.0.1` instead of `localhost`.

---

## ✅ Step-by-Step Checklist

### 1. Spotify
- [ ] Go to: https://developer.spotify.com/dashboard
- [ ] Select your app: "Twin AI - Soul Signature Platform"
- [ ] Click "Edit Settings"
- [ ] Under "Redirect URIs", ADD: `http://127.0.0.1:3001/api/oauth/callback/spotify`
- [ ] REMOVE old ngrok URL if present
- [ ] Click "Save"

### 2. GitHub  
- [ ] Go to: https://github.com/settings/developers
- [ ] Click on your OAuth App
- [ ] Update "Authorization callback URL" to: `http://127.0.0.1:3001/api/oauth/callback/github`
- [ ] Click "Update application"

### 3. Discord
- [ ] Go to: https://discord.com/developers/applications
- [ ] Select your application
- [ ] Go to "OAuth2" tab in left sidebar
- [ ] Under "Redirects", click "Add Redirect"
- [ ] Add: `http://127.0.0.1:3001/api/oauth/callback/discord`
- [ ] Click "Save Changes"

### 4. LinkedIn
- [ ] Go to: https://www.linkedin.com/developers/apps
- [ ] Select your app
- [ ] Go to "Auth" tab
- [ ] Under "OAuth 2.0 settings", find "Redirect URLs"
- [ ] ADD: `http://127.0.0.1:3001/api/oauth/callback/linkedin`
- [ ] Click "Update"

### 5. Slack  
- [ ] Go to: https://api.slack.com/apps
- [ ] Select your app
- [ ] Go to "OAuth & Permissions" in left sidebar
- [ ] Under "Redirect URLs", click "Add New Redirect URL"
- [ ] Add: `http://127.0.0.1:3001/api/oauth/callback/slack`
- [ ] Click "Save URLs"

### 6. Google (YouTube, Gmail, Calendar)
- [ ] Go to: https://console.cloud.google.com
- [ ] Select your project
- [ ] Go to "APIs & Services" > "Credentials"
- [ ] Click on your OAuth 2.0 Client ID
- [ ] Under "Authorized redirect URIs", ADD all these:
  ```
  http://127.0.0.1:3001/api/oauth/callback/google
  http://127.0.0.1:3001/api/oauth/callback/youtube
  http://127.0.0.1:3001/api/oauth/callback/gmail
  ```
- [ ] Click "Save"

### 7. Get YouTube API Key (if not done)
- [ ] In same Google Cloud Console, go to "Credentials"
- [ ] Click "Create Credentials" > "API Key"
- [ ] Copy the API key
- [ ] Add to .env as `YOUTUBE_API_KEY=your-api-key-here`
- [ ] (Optional) Click "Restrict Key" and limit to "YouTube Data API v3"

---

## 🧪 Testing After Update

1. **Restart your backend server:**
   ```bash
   npm run server:dev
   ```

2. **Open your app:**
   ```
   http://127.0.0.1:8086/get-started
   ```

3. **Test each platform connection:**
   - Click "Connect" button for each platform
   - You should be redirected to the platform's OAuth page
   - After authorizing, you should be redirected back to your app
   - Connection status should show "Connected" ✅

---

## ❓ Troubleshooting

### "Invalid redirect_uri" error
**Fix**: Make sure the redirect URI in the platform matches exactly (including http://, port, and path)

### "localhost" still showing in error
**Fix**: Clear browser cache and restart both frontend and backend servers

### Token expired immediately  
**Fix**: Check that your system clock is accurate

### Google OAuth showing "unverified app" warning
**Fix**: This is normal for development. Click "Advanced" > "Go to [app name] (unsafe)" to proceed

---

## 📝 Next Steps After All Updated

1. Test each platform connection
2. Verify data extraction works
3. Check that tokens are being saved encrypted in database
4. Test token refresh flow (wait for token to expire ~1 hour)

