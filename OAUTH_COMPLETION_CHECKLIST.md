# OAuth Platform Update Checklist

**Status:** 2 of 7 platforms complete
**Remaining:** 5 platforms requiring manual authentication

---

## ✅ Completed Platforms

- [x] **Spotify** - Production ready
- [x] **Discord** - Production ready

---

## 📋 Quick Update Checklist

Copy these exact URIs for all remaining platforms:

```
Local Development:
http://127.0.0.1:8086/oauth/callback

Production:
https://twin-ai-learn.vercel.app/oauth/callback
```

---

## 🔧 Platform Updates (Estimated: 15 minutes)

### 1. GitHub OAuth (3 minutes)

**URL:** https://github.com/settings/developers
**Client ID:** `Ov23liY0gOsrEGMfcM9f`

**Steps:**
1. Go to https://github.com/settings/developers
2. Click "OAuth Apps" tab
3. Find your app (Client ID: `Ov23liY0gOsrEGMfcM9f`)
4. Click on the app name
5. Update "Authorization callback URL":
   ```
   http://127.0.0.1:8086/oauth/callback
   ```
6. Click "Update application"

**Note:** GitHub OAuth Apps only support one callback URL. For production, you'll need to either:
- Option A: Change the URL to `https://twin-ai-learn.vercel.app/oauth/callback` before deploying
- Option B: Create a separate OAuth App for production

**Alternative:** Use GitHub Apps instead of OAuth Apps (supports multiple callback URLs)

---

### 2. Google OAuth (5 minutes)

**URL:** https://console.cloud.google.com/apis/credentials
**Client ID:** `298873888709-eq7rid9tib30m97r94qaasi3ohpaq52q.apps.googleusercontent.com`

**Steps:**
1. Go to https://console.cloud.google.com/apis/credentials
2. Find OAuth 2.0 Client ID: `298873888709-eq7rid9tib30m97r94qaasi3ohpaq52q`
3. Click the pencil (edit) icon
4. Scroll to "Authorized redirect URIs"
5. Click "+ ADD URI" and add:
   ```
   http://127.0.0.1:8086/oauth/callback
   ```
6. Click "+ ADD URI" again and add:
   ```
   https://twin-ai-learn.vercel.app/oauth/callback
   ```
7. Click "SAVE" at the bottom

**Covers:** YouTube, Gmail, and Calendar (all use the same OAuth client)

---

### 3. Slack OAuth (3 minutes)

**URL:** https://api.slack.com/apps
**Client ID:** `9624299465813.9627850179794`

**Steps:**
1. Go to https://api.slack.com/apps
2. Click on your app
3. Click "OAuth & Permissions" in the left sidebar
4. Scroll to "Redirect URLs"
5. Click "Add New Redirect URL" and add:
   ```
   http://127.0.0.1:8086/oauth/callback
   ```
6. Click "Add New Redirect URL" again and add:
   ```
   https://twin-ai-learn.vercel.app/oauth/callback
   ```
7. Click "Save URLs"

---

### 4. LinkedIn OAuth (3 minutes)

**URL:** https://www.linkedin.com/developers/apps
**Client ID:** `7724t4uwt8cv4v`

**Steps:**
1. Go to https://www.linkedin.com/developers/apps
2. Find and click on your app
3. Click "Auth" tab
4. Scroll to "OAuth 2.0 settings"
5. Under "Authorized redirect URLs for your app", click the plus icon
6. Add:
   ```
   http://127.0.0.1:8086/oauth/callback
   ```
7. Click the plus icon again and add:
   ```
   https://twin-ai-learn.vercel.app/oauth/callback
   ```
8. Click "Update"

---

### 5. Reddit OAuth (2 minutes)

**URL:** https://www.reddit.com/prefs/apps
**Client ID:** `sPdoyTecXWWSmtR8-6lGNA`

**Steps:**
1. Go to https://www.reddit.com/prefs/apps
2. Find your app in the list
3. Click "edit"
4. Update "redirect uri" to:

   **For Local Development:**
   ```
   http://127.0.0.1:8086/oauth/callback
   ```

5. Click "update app"

**⚠️ IMPORTANT:** Reddit only allows ONE redirect URI per app!

**Production Deployment:**
When deploying to production, you must:
1. Go back to https://www.reddit.com/prefs/apps
2. Click "edit" on your app
3. Change redirect URI to:
   ```
   https://twin-ai-learn.vercel.app/oauth/callback
   ```
4. Click "update app"

**Alternative Solution:**
Create two separate Reddit apps:
- One for development with local URI
- One for production with production URI

---

## ✅ Verification Steps

After updating each platform, verify the configuration:

### Quick Test (Per Platform)

1. **Start servers:**
   ```bash
   npm run dev:full
   ```

2. **Navigate to:**
   ```
   http://localhost:8086/connect-platforms
   ```

3. **Test OAuth flow:**
   - Click "Connect [Platform]"
   - Authorize with your account
   - Verify redirect back to app
   - Check that connection shows as "Connected"

### Database Verification

```sql
-- Check all platform connections
SELECT
  platform,
  connected_at,
  last_sync,
  CASE
    WHEN access_token IS NOT NULL THEN 'Token stored'
    ELSE 'No token'
  END as token_status
FROM platform_connections
ORDER BY connected_at DESC;
```

---

## 🔐 Security Verification

After completing all updates, run these checks:

### 1. Verify PKCE Implementation

```bash
# Should show code_challenge in the URL
curl -X POST http://localhost:3001/api/entertainment/connect/github \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-user"}' | jq '.authUrl'
```

Look for: `code_challenge=...` and `code_challenge_method=S256`

### 2. Verify State Encryption

```bash
# State should have 3 parts (iv:authTag:ciphertext)
curl -X POST http://localhost:3001/api/entertainment/connect/github \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-user"}' | jq -r '.authUrl' | grep -oP 'state=[^&]+' | cut -d= -f2 | awk -F: '{print NF}'
```

Should output: `3`

### 3. Test Rate Limiting

```bash
# Should get 429 (Too Many Requests) after 10 attempts
for i in {1..12}; do
  echo "Request $i:"
  curl -s -o /dev/null -w "  Status: %{http_code}\n" \
    -X POST http://localhost:3001/api/entertainment/connect/github \
    -H "Content-Type: application/json" \
    -d '{"userId": "test-user"}'
  sleep 1
done
```

Expected: First 10 requests return `200`, requests 11-12 return `429`

---

## 📊 Completion Status Tracker

Update this as you complete each platform:

```
✅ Spotify   - COMPLETE (2025-11-13)
✅ Discord   - COMPLETE (2025-11-13)
⬜ GitHub    - Pending
⬜ Google    - Pending (covers YouTube, Gmail, Calendar)
⬜ Slack     - Pending
⬜ LinkedIn  - Pending
⬜ Reddit    - Pending (single URI limitation)
```

---

## 🚨 Common Issues & Solutions

### Issue: "Redirect URI mismatch" error during OAuth

**Solution:**
- Ensure URIs match EXACTLY (including trailing slashes)
- Check for `http` vs `https`
- Verify `127.0.0.1` vs `localhost` (we use `127.0.0.1`)

### Issue: GitHub only allows one callback URL

**Solutions:**
1. **Option A - Switch manually:** Change between local/prod as needed
2. **Option B - Separate apps:** Create dev and prod OAuth apps
3. **Option C - Use GitHub Apps:** Supports multiple callback URLs (requires different integration)

### Issue: Reddit only allows one URI

**Solutions:**
1. **Development:** Use local URI, test OAuth flows
2. **Pre-production:** Switch to production URI, deploy
3. **Alternative:** Create two Reddit apps (one for dev, one for prod)

### Issue: "Invalid client" error

**Possible causes:**
- Wrong Client ID or Client Secret in `.env`
- OAuth app deleted or suspended
- Incorrect platform configuration

**Solution:** Verify credentials in `.env` match the OAuth app settings

---

## 🎯 Next Steps After Completion

Once all platforms are configured:

1. **Test each OAuth flow** end-to-end
2. **Verify token storage** in database
3. **Test token refresh** (wait 30+ minutes, verify tokens refresh automatically)
4. **Test data extraction** for each platform
5. **Update documentation** with any platform-specific gotchas discovered
6. **Deploy to production** with production URIs

---

## 📚 Reference Documents

- **Setup Guide:** `OAUTH_SETUP_COMPLETE.md`
- **Detailed Instructions:** `oauth-redirect-update-guide.md`
- **Session Summary:** `SESSION_SUMMARY.md`
- **Implementation Details:** `OAUTH_IMPLEMENTATION_COMPLETE.md`

---

**Estimated Total Time:** 15-20 minutes
**Complexity:** Low (mostly copy-paste)
**Authentication Required:** Yes (for each platform's developer portal)

Generated: 2025-11-13
Last Updated: 2025-11-13
