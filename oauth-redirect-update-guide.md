# OAuth Redirect URI Update Guide

## ✅ Completed Platforms

### 1. Spotify OAuth
- **Status:** ✅ Complete
- **Redirect URIs:**
  - `http://127.0.0.1:8086/oauth/callback`
  - `https://twin-ai-learn.vercel.app/oauth/callback`
- **Dashboard:** https://developer.spotify.com/dashboard/006475a46fc44212af6ae6b3f4e48c08

### 2. Discord OAuth
- **Status:** ✅ Complete
- **Redirect URIs:**
  - `http://127.0.0.1:8086/oauth/callback`
  - `https://twin-ai-learn.vercel.app/oauth/callback`
- **Dashboard:** https://discord.com/developers/applications/1423392139995513093

---

## 🔄 Platforms Requiring Updates

### 3. GitHub OAuth

**Dashboard:** https://github.com/settings/developers
**Client ID:** `Ov23liY0gOsrEGMfcM9f`

**Steps:**
1. Navigate to https://github.com/settings/developers
2. Click on "OAuth Apps"
3. Find your app or click "New OAuth App" if needed
4. Update "Authorization callback URL":
   ```
   http://127.0.0.1:8086/oauth/callback
   ```
5. **Note:** GitHub supports multiple callback URLs via pattern matching or you may need to create separate apps for dev/prod

**Quick Copy:**
```
http://127.0.0.1:8086/oauth/callback
https://twin-ai-learn.vercel.app/oauth/callback
```

---

### 4. Google OAuth (YouTube, Gmail, Calendar)

**Dashboard:** https://console.cloud.google.com/apis/credentials
**Client ID:** `298873888709-eq7rid9tib30m97r94qaasi3ohpaq52q.apps.googleusercontent.com`

**Steps:**
1. Navigate to https://console.cloud.google.com/apis/credentials
2. Find OAuth 2.0 Client ID: `298873888709...`
3. Click the pencil icon to edit
4. Scroll to "Authorized redirect URIs"
5. Click "ADD URI" for each:
   ```
   http://127.0.0.1:8086/oauth/callback
   ```
   ```
   https://twin-ai-learn.vercel.app/oauth/callback
   ```
6. Click "SAVE"

**Scopes Configured:**
- YouTube: `https://www.googleapis.com/auth/youtube.readonly`
- Gmail: `https://www.googleapis.com/auth/gmail.readonly`
- Calendar: `https://www.googleapis.com/auth/calendar.readonly`

---

### 5. Slack OAuth

**Dashboard:** https://api.slack.com/apps
**Client ID:** `9624299465813.9627850179794`

**Steps:**
1. Navigate to https://api.slack.com/apps
2. Find your app in the list
3. Click on "OAuth & Permissions" in the sidebar
4. Scroll to "Redirect URLs"
5. Click "Add New Redirect URL" for each:
   ```
   http://127.0.0.1:8086/oauth/callback
   ```
   ```
   https://twin-ai-learn.vercel.app/oauth/callback
   ```
6. Click "Save URLs"

---

### 6. LinkedIn OAuth

**Dashboard:** https://www.linkedin.com/developers/apps
**Client ID:** `7724t4uwt8cv4v`

**Steps:**
1. Navigate to https://www.linkedin.com/developers/apps
2. Find your app: "Twin AI Learn" or similar
3. Click on "Auth" tab
4. Under "OAuth 2.0 settings"
5. Find "Authorized redirect URLs for your app"
6. Add both URLs:
   ```
   http://127.0.0.1:8086/oauth/callback
   ```
   ```
   https://twin-ai-learn.vercel.app/oauth/callback
   ```
7. Click "Update"

---

### 7. Reddit OAuth

**Dashboard:** https://www.reddit.com/prefs/apps
**Client ID:** `sPdoyTecXWWSmtR8-6lGNA`

**Steps:**
1. Navigate to https://www.reddit.com/prefs/apps
2. Find your app in the list
3. Click "edit"
4. Update "redirect uri" to:

   **For Development:**
   ```
   http://127.0.0.1:8086/oauth/callback
   ```

   **For Production (switch when deploying):**
   ```
   https://twin-ai-learn.vercel.app/oauth/callback
   ```

⚠️ **IMPORTANT:** Reddit only allows ONE redirect URI per app. You'll need to:
- Use local URI during development
- Update to production URI before deploying
- OR create separate Reddit apps for dev/prod

---

## 🚀 Quick Update Checklist

Copy and paste these exact URLs into each platform:

**Local Development:**
```
http://127.0.0.1:8086/oauth/callback
```

**Production:**
```
https://twin-ai-learn.vercel.app/oauth/callback
```

### Completion Checklist:
- [x] Spotify - Complete ✅
- [x] Discord - Complete ✅
- [ ] GitHub - Pending
- [ ] Google (YouTube/Gmail/Calendar) - Pending
- [ ] Slack - Pending
- [ ] LinkedIn - Pending
- [ ] Reddit - Pending (Single URI limitation)

---

## 🧪 Testing After Updates

### Test Each Platform:

1. **Start servers:**
   ```bash
   npm run dev:full
   ```

2. **Navigate to platform connections:**
   ```
   http://localhost:8086/connect-platforms
   ```

3. **For each platform:**
   - Click "Connect [Platform]"
   - Authorize with your account
   - Verify redirect back to app
   - Check console for successful token exchange
   - Verify connection shows as "Connected"

4. **Check database:**
   ```sql
   SELECT platform, connected_at, last_sync
   FROM platform_connections
   WHERE user_id = 'your-user-id'
   ORDER BY connected_at DESC;
   ```

---

## 📊 Expected Results

After all updates:
- ✅ All 7 platforms functional in local development
- ✅ All platforms (except Reddit) functional in production
- ✅ Reddit requires URI switch for production deployment
- ✅ OAuth flow with PKCE + encrypted state working for all
- ✅ Token storage and refresh working

---

## 🔐 Security Verification

After completing updates, verify:

1. **PKCE Parameters Present:**
   ```bash
   # Check authorization URL includes code_challenge
   curl -X POST http://localhost:3001/api/entertainment/connect/spotify \
     -H "Content-Type: application/json" \
     -d '{"userId": "test"}' | jq '.authUrl' | grep 'code_challenge'
   ```

2. **State Encryption:**
   ```bash
   # Verify state parameter is encrypted (should have 3 parts: iv:authTag:ciphertext)
   curl -X POST http://localhost:3001/api/entertainment/connect/spotify \
     -H "Content-Type: application/json" \
     -d '{"userId": "test"}' | jq '.authUrl' | grep -oP 'state=[^&]+' | cut -d= -f2 | tr ':' '\n' | wc -l
   # Should output: 3
   ```

3. **Rate Limiting Active:**
   ```bash
   # Test rate limiting (should get 429 after 10 requests in 15 minutes)
   for i in {1..12}; do
     curl -s -o /dev/null -w "%{http_code}\n" \
       -X POST http://localhost:3001/api/entertainment/connect/spotify \
       -H "Content-Type: application/json" \
       -d '{"userId": "test"}'
     sleep 1
   done
   ```

---

Generated: 2025-11-13
Platform: Soul Signature (TwinMe)
