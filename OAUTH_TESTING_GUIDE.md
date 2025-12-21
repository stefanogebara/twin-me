# OAuth Integration Testing Guide

## Overview

This guide provides step-by-step instructions for testing OAuth integration for each platform in the Twin AI Learn / Soul Signature platform.

## Prerequisites

1. **Server Running**: Both frontend and backend servers must be running
   ```bash
   npm run dev:full
   ```

2. **Environment Variables**: Verify all OAuth credentials are set in `.env`
   ```bash
   node -e "require('./api/middleware/validateOAuthCredentials.js').validateOAuthCredentials()"
   ```

3. **Database Ready**: Ensure Supabase tables exist
   - `users`
   - `platform_connections`
   - `oauth_states`
   - `data_extraction_jobs`

## Testing Workflow

### Step 1: Verify Redirect URIs Match

**Critical**: The redirect URI in your OAuth provider configuration MUST match exactly what the app sends.

Current configuration uses: `http://127.0.0.1:8086/oauth/callback`

**Check each platform's developer console:**

- **Spotify**: https://developer.spotify.com/dashboard → Select app → Edit Settings → Redirect URIs
- **Discord**: https://discord.com/developers/applications → Select app → OAuth2 → Redirects
- **GitHub**: https://github.com/settings/developers → Select app → Authorization callback URL

**Common Issues:**
- Using `localhost` vs `127.0.0.1` (they are NOT the same to OAuth providers)
- Missing `/oauth/callback` path
- HTTP vs HTTPS mismatch
- Trailing slash differences

### Step 2: Test Spotify OAuth Flow

**Manual Testing:**

1. **Initiate Connection**
   ```bash
   curl -X POST http://127.0.0.1:3001/api/entertainment/connect/spotify \
     -H "Content-Type: application/json" \
     -d '{"userId": "your-user-id-here"}'
   ```

   Expected Response:
   ```json
   {
     "success": true,
     "authUrl": "https://accounts.spotify.com/authorize?...",
     "message": "Connect your musical soul - discover your authentic taste"
   }
   ```

2. **Visit Auth URL**: Copy the `authUrl` from response and open in browser

3. **Authorize**: Click "Agree" on Spotify's consent screen

4. **Verify Callback**: You'll be redirected to `http://127.0.0.1:8086/oauth/callback?code=...&state=...`

5. **Check Database**: Verify connection was saved
   ```sql
   SELECT * FROM platform_connections WHERE platform = 'spotify' ORDER BY created_at DESC LIMIT 1;
   ```

6. **Verify Tokens**: Check that tokens are encrypted
   ```sql
   SELECT
     user_id,
     platform,
     status,
     connected_at,
     token_expires_at,
     LENGTH(access_token) as token_length,
     LEFT(access_token, 20) as token_preview
   FROM platform_connections
   WHERE platform = 'spotify';
   ```

**Expected Results:**
- `status` = `'connected'`
- `access_token` starts with encrypted format (hex string with `:` separators)
- `refresh_token` exists and is encrypted
- `token_expires_at` is ~1 hour in the future

**Common Errors:**

**Error: `invalid_client`**
- **Cause**: Wrong Client ID or Client Secret
- **Fix**: Double-check `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` in `.env`

**Error: `invalid_grant`**
- **Cause**: Authorization code expired or already used
- **Fix**: Try the flow again - authorization codes are single-use and expire in 10 minutes

**Error: `redirect_uri_mismatch`**
- **Cause**: Redirect URI doesn't match what's registered in Spotify dashboard
- **Fix**: Add exact URI to Spotify app settings

### Step 3: Test Token Refresh

**Automatic Refresh Testing:**

1. **Wait for Token to Near Expiration**: Tokens refresh automatically when <10 minutes remain

2. **Force Immediate Refresh** (for testing):
   ```sql
   -- Set token to expire in 1 minute
   UPDATE platform_connections
   SET token_expires_at = NOW() + INTERVAL '1 minute'
   WHERE platform = 'spotify' AND user_id = 'your-user-id';
   ```

3. **Trigger Refresh**: The token refresh service runs every 5 minutes automatically, or trigger manually:
   ```javascript
   // In your server code or test file
   import { refreshAccessToken } from './api/services/tokenRefreshService.js';

   await refreshAccessToken('spotify', decryptedRefreshToken, userId);
   ```

4. **Verify New Token**:
   ```sql
   SELECT
     platform,
     status,
     token_expires_at,
     updated_at,
     error_message
   FROM platform_connections
   WHERE platform = 'spotify' AND user_id = 'your-user-id';
   ```

**Expected Results:**
- New `token_expires_at` is ~1 hour in the future
- `updated_at` timestamp is recent
- `status` remains `'connected'`
- `error_message` is NULL

**Common Errors:**

**Error: `invalid_grant` on refresh**
- **Cause**: Refresh token was revoked by user or expired (Spotify refresh tokens can expire if not used)
- **Fix**: User must reconnect via OAuth flow
- **Status**: System should mark as `'needs_reauth'`

**Error: `invalid_client` on refresh**
- **Cause**: Client credentials changed or are incorrect
- **Fix**: Verify `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` match Spotify dashboard
- **Status**: System should mark as `'error'`

### Step 4: Test Discord OAuth Flow

**Manual Testing:**

1. **Initiate Connection**
   ```bash
   curl -X POST http://127.0.0.1:3001/api/entertainment/connect/discord \
     -H "Content-Type: application/json" \
     -d '{"userId": "your-user-id-here"}'
   ```

2. **Authorize**: Click "Authorize" on Discord's consent screen

3. **Verify Connection**:
   ```sql
   SELECT * FROM platform_connections WHERE platform = 'discord' ORDER BY created_at DESC LIMIT 1;
   ```

**Discord-Specific Notes:**
- Tokens expire after 7 days
- Refresh tokens are provided
- Rate limits: 50 requests per second (global)

### Step 5: Test GitHub OAuth Flow

**Manual Testing:**

1. **Initiate Connection**
   ```bash
   curl -X POST http://127.0.0.1:3001/api/entertainment/connect/github \
     -H "Content-Type: application/json" \
     -d '{"userId": "your-user-id-here"}'
   ```

2. **Authorize**: Click "Authorize" on GitHub's consent screen

3. **Verify Connection**:
   ```sql
   SELECT * FROM platform_connections WHERE platform = 'github' ORDER BY created_at DESC LIMIT 1;
   ```

**GitHub-Specific Notes:**
- Tokens do NOT expire (unless manually revoked)
- No refresh token provided
- Rate limit: 5,000 requests per hour

### Step 6: Test Data Extraction

After successful OAuth connection, test data extraction:

1. **Trigger Extraction** (happens automatically after OAuth, or trigger manually):
   ```bash
   curl -X POST http://127.0.0.1:3001/api/soul-extraction/extract \
     -H "Content-Type: application/json" \
     -d '{"userId": "your-user-id", "platform": "spotify"}'
   ```

2. **Monitor Extraction Job**:
   ```sql
   SELECT
     id,
     platform,
     status,
     total_items,
     processed_items,
     failed_items,
     started_at,
     completed_at,
     error_message
   FROM data_extraction_jobs
   WHERE user_id = 'your-user-id'
   ORDER BY created_at DESC
   LIMIT 5;
   ```

3. **Check Extracted Data**:
   ```sql
   SELECT
     platform,
     data_type,
     jsonb_pretty(extracted_patterns) as patterns,
     created_at
   FROM soul_data
   WHERE user_id = 'your-user-id' AND platform = 'spotify'
   ORDER BY created_at DESC
   LIMIT 1;
   ```

## Testing Checklist

### Pre-Flight Checks
- [ ] Both servers running (frontend on 8086, backend on 3001)
- [ ] `.env` file has all required OAuth credentials
- [ ] Redirect URIs match in each platform's developer console
- [ ] Database tables exist and are accessible
- [ ] Encryption keys are set (`ENCRYPTION_KEY`, `TOKEN_ENCRYPTION_KEY`)

### Spotify OAuth
- [ ] Connection initiation returns valid auth URL
- [ ] Auth URL redirects to Spotify login/consent
- [ ] Callback receives code and state parameters
- [ ] Tokens are saved encrypted in database
- [ ] Token expiration is set correctly (~1 hour)
- [ ] Token refresh works before expiration
- [ ] Invalid refresh token marks connection as `needs_reauth`

### Discord OAuth
- [ ] Connection initiation works
- [ ] Authorization completes successfully
- [ ] Tokens are saved and encrypted
- [ ] Token refresh works (7-day expiration)

### GitHub OAuth
- [ ] Connection initiation works
- [ ] Authorization completes successfully
- [ ] Token is saved (no expiration)
- [ ] No refresh token expected

### Data Extraction
- [ ] Extraction starts automatically after OAuth
- [ ] Extraction job is created in database
- [ ] Platform APIs are called with valid tokens
- [ ] Data is saved to `soul_data` table
- [ ] Extraction handles rate limits gracefully
- [ ] Extraction handles API errors properly

### Error Handling
- [ ] Invalid client credentials show helpful error
- [ ] Expired authorization code shows helpful error
- [ ] Network errors are logged and retried
- [ ] Invalid grant on refresh marks as `needs_reauth`
- [ ] Missing redirect URI shows helpful error

## Debugging Tips

### View Server Logs
```bash
# Terminal running backend server
# Look for:
# ✅ Token refreshed successfully
# ❌ Token refresh failed
# 🔐 Refresh token invalid - user must re-authenticate
```

### Check Environment Variables
```javascript
// In Node.js console or test file
console.log('Spotify ID:', process.env.SPOTIFY_CLIENT_ID?.substring(0, 8) + '...');
console.log('Has Secret:', !!process.env.SPOTIFY_CLIENT_SECRET);
```

### Decrypt Token for Debugging
```javascript
import { decryptToken } from './api/services/encryption.js';

// Get encrypted token from database
const encryptedToken = 'iv:authtag:ciphertext...';

try {
  const decrypted = decryptToken(encryptedToken);
  console.log('Token length:', decrypted.length);
  console.log('Token preview:', decrypted.substring(0, 20) + '...');
} catch (error) {
  console.error('Decryption failed:', error.message);
}
```

### Test OAuth State Validation
```sql
-- Check OAuth states (should be cleaned up after use)
SELECT * FROM oauth_states ORDER BY created_at DESC LIMIT 10;

-- Old states should be deleted
DELETE FROM oauth_states WHERE expires_at < NOW();
```

### Monitor Rate Limits

**Spotify:**
- 180 requests per minute
- Check response header: `X-RateLimit-Remaining`

**Discord:**
- 50 requests per second (global)
- Check response header: `X-RateLimit-Remaining`

**GitHub:**
- 5000 requests per hour
- Check response header: `X-RateLimit-Remaining`

## Common Issues and Solutions

### Issue: "Invalid Grant" on Token Refresh

**Symptoms:**
- Token refresh fails with `invalid_grant` error
- Connection status becomes `needs_reauth`

**Causes:**
1. Refresh token was revoked by user
2. User changed their password
3. User revoked app permissions
4. Refresh token expired (rare, but possible)

**Solution:**
- User must reconnect via OAuth flow
- System correctly marks as `needs_reauth` - show reconnect button in UI

### Issue: "Invalid Client" Error

**Symptoms:**
- OAuth initiation or token refresh fails with `invalid_client`

**Causes:**
1. Wrong Client ID in `.env`
2. Wrong Client Secret in `.env`
3. Client secret was regenerated in developer console

**Solution:**
- Verify credentials in platform's developer console
- Copy exact values to `.env`
- Restart server after updating `.env`

### Issue: Redirect URI Mismatch

**Symptoms:**
- Error after clicking "Authorize" on OAuth screen
- `redirect_uri_mismatch` error

**Causes:**
1. URI in developer console doesn't match what app sends
2. Using `localhost` vs `127.0.0.1` inconsistently
3. Missing or extra trailing slash

**Solution:**
- Add exact URI to platform's developer console
- Use `127.0.0.1:8086` consistently (as configured in `.env`)
- Ensure `/oauth/callback` path is included

### Issue: Tokens Not Being Saved

**Symptoms:**
- OAuth flow completes but no tokens in database
- Connection status is NULL or missing

**Causes:**
1. Database connection issue
2. Supabase RLS policies blocking insert
3. Missing `user_id` in request

**Solution:**
- Check Supabase connection in server logs
- Verify RLS policies allow insert for service role
- Ensure `userId` is passed in OAuth initiation request

## Production Deployment Considerations

When deploying to production (e.g., Vercel):

1. **Update Redirect URIs** in ALL platform developer consoles:
   - Change from: `http://127.0.0.1:8086/oauth/callback`
   - Change to: `https://your-production-domain.com/oauth/callback`

2. **Update Environment Variables**:
   ```env
   VITE_APP_URL=https://your-production-domain.com
   APP_URL=https://your-production-domain.com
   VITE_API_URL=https://your-production-domain.com/api
   ```

3. **Test OAuth Flow** on production:
   - All platforms must be reconfigured
   - Authorization codes and tokens are different per environment

4. **Enable HTTPS Only**:
   - OAuth providers require HTTPS in production
   - Use secure cookies for sessions

## Next Steps

After successful OAuth testing:

1. **Implement UI Components**:
   - Platform connection buttons
   - Connection status indicators
   - Reconnect prompts for `needs_reauth` status

2. **Add Webhook Support** (if available):
   - Spotify: No webhooks
   - Discord: Webhooks available
   - GitHub: Webhooks available

3. **Implement Incremental Sync**:
   - Full sync on first connection
   - Incremental updates for subsequent syncs
   - Delta APIs where available

4. **Add Analytics**:
   - Track connection success rate
   - Monitor token refresh failures
   - Alert on credential issues

## Support

For issues with this OAuth implementation:

1. Check server logs for detailed error messages
2. Verify credentials with validation middleware
3. Test with curl commands before UI testing
4. Review platform-specific API documentation

**Platform Documentation:**
- Spotify: https://developer.spotify.com/documentation/web-api/tutorials/code-flow
- Discord: https://discord.com/developers/docs/topics/oauth2
- GitHub: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
