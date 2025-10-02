# OAuth Application Registration Guide

Complete step-by-step instructions for registering OAuth applications with each platform for the TwinMe connector system.

**Time Required:** 10-15 minutes per platform (60-75 minutes total)

---

## Prerequisites

Before you begin, have ready:
- Your application name: **TwinMe** (or your preferred name)
- Your application description: "Digital twin platform that creates authentic personality profiles from your digital footprint"
- Redirect URI: `http://localhost:8086/oauth/callback` (development) or `https://yourdomain.com/oauth/callback` (production)
- Application logo (optional but recommended): 512x512px image

---

## 1. GitHub OAuth Application

**Time:** 10 minutes
**URL:** https://github.com/settings/developers

### Steps:

1. **Navigate to Developer Settings**
   - Go to https://github.com/settings/developers
   - Click "OAuth Apps" in left sidebar
   - Click "New OAuth App" button

2. **Fill Application Details**
   ```
   Application name: TwinMe
   Homepage URL: http://localhost:8086 (or your production URL)
   Application description: Digital twin platform that creates personality profiles
   Authorization callback URL: http://localhost:8086/oauth/callback
   ```

3. **Register Application**
   - Click "Register application"
   - You'll be redirected to your app's settings page

4. **Get Credentials**
   - Copy the **Client ID** (visible immediately)
   - Click "Generate a new client secret"
   - Copy the **Client Secret** (shown only once!)

5. **Update .env File**
   ```env
   GITHUB_CLIENT_ID=your_actual_client_id_here
   GITHUB_CLIENT_SECRET=your_actual_client_secret_here
   ```

### Scopes Explanation:
- `user` - Access user profile, email, and basic info
- `repo` - Read repository data to understand coding patterns
- `read:org` - Read organization memberships

---

## 2. Spotify OAuth Application

**Time:** 10 minutes
**URL:** https://developer.spotify.com/dashboard

### Steps:

1. **Create Spotify Developer Account**
   - Go to https://developer.spotify.com/dashboard
   - Log in with your Spotify account
   - Accept Developer Terms of Service

2. **Create New App**
   - Click "Create app" button
   - Fill in the form:
   ```
   App name: TwinMe
   App description: Digital twin platform analyzing music taste and listening patterns
   Website: http://localhost:8086 (or your production URL)
   Redirect URI: http://localhost:8086/oauth/callback
   ```
   - Check "Web API" under "Which API/SDKs are you planning to use?"
   - Accept Spotify's Developer Terms
   - Click "Save"

3. **Get Credentials**
   - Click on your newly created app
   - Click "Settings" button
   - You'll see:
     - **Client ID** (copy this)
     - **Client Secret** (click "View client secret" to reveal, then copy)

4. **Configure Redirect URIs**
   - In Settings, under "Redirect URIs"
   - Make sure `http://localhost:8086/oauth/callback` is listed
   - For production, add your production callback URL
   - Click "Add" then "Save"

5. **Update .env File**
   ```env
   SPOTIFY_CLIENT_ID=your_actual_client_id_here
   SPOTIFY_CLIENT_SECRET=your_actual_client_secret_here
   SPOTIFY_REDIRECT_URI=http://localhost:8086/oauth/callback
   ```

### Scopes Explanation:
- `user-read-private` - Access subscription type and user profile
- `user-read-email` - Access user's email
- `user-top-read` - Top artists and tracks
- `user-read-recently-played` - Recently played tracks
- `playlist-read-private` - Private playlists
- `user-library-read` - Saved tracks and albums
- `user-follow-read` - Followed artists and users

---

## 3. Discord OAuth Application

**Time:** 10 minutes
**URL:** https://discord.com/developers/applications

### Steps:

1. **Create Discord Developer Account**
   - Go to https://discord.com/developers/applications
   - Log in with your Discord account

2. **Create New Application**
   - Click "New Application" button (top right)
   - Enter name: **TwinMe**
   - Accept Terms of Service
   - Click "Create"

3. **Configure OAuth2**
   - In left sidebar, click "OAuth2"
   - Under "Redirects", click "Add Redirect"
   - Enter: `http://localhost:8086/oauth/callback`
   - Click "Save Changes"

4. **Get Credentials**
   - Still in OAuth2 section
   - Copy the **Client ID**
   - Copy the **Client Secret** (click "Reset Secret" if needed)

5. **Create Bot (Optional, for future features)**
   - In left sidebar, click "Bot"
   - Click "Add Bot"
   - Copy the **Bot Token** (for future Discord bot features)

6. **Update .env File**
   ```env
   DISCORD_CLIENT_ID=your_actual_client_id_here
   DISCORD_CLIENT_SECRET=your_actual_client_secret_here
   DISCORD_BOT_TOKEN=your_bot_token_here
   ```

### Scopes Explanation:
- `identify` - Access user's Discord username and avatar
- `email` - Access user's email
- `guilds` - See what Discord servers user is in
- `guilds.members.read` - Read server member details

---

## 4. Slack OAuth Application

**Time:** 15 minutes
**URL:** https://api.slack.com/apps

### Steps:

1. **Create Slack App**
   - Go to https://api.slack.com/apps
   - Click "Create New App"
   - Choose "From scratch"
   - Enter:
   ```
   App Name: TwinMe
   Pick a workspace: [Select your workspace]
   ```
   - Click "Create App"

2. **Configure OAuth & Permissions**
   - In left sidebar, click "OAuth & Permissions"
   - Scroll to "Redirect URLs"
   - Click "Add New Redirect URL"
   - Enter: `http://localhost:8086/oauth/callback`
   - Click "Add"
   - Click "Save URLs"

3. **Add OAuth Scopes**
   - Scroll down to "Scopes" section
   - Under "User Token Scopes", add:
     - `channels:history` - View messages in public channels
     - `channels:read` - View basic channel information
     - `groups:history` - View messages in private channels
     - `groups:read` - View basic private channel information
     - `im:history` - View messages in direct messages
     - `im:read` - View basic direct message information
     - `users:read` - View people in workspace
     - `users.profile:read` - View profile details

4. **Install to Workspace**
   - Scroll to top
   - Click "Install to Workspace"
   - Review permissions
   - Click "Allow"

5. **Get Credentials**
   - After installation, you'll see:
     - **Client ID** (in "Basic Information" or "App Credentials")
     - **Client Secret** (in "Basic Information" or "App Credentials")
     - **Bot User OAuth Token** (starts with `xoxb-`)
     - **User OAuth Token** (starts with `xoxp-`)

6. **Update .env File**
   ```env
   SLACK_CLIENT_ID=your_actual_client_id_here
   SLACK_CLIENT_SECRET=your_actual_client_secret_here
   SLACK_BOT_TOKEN=xoxb-your-bot-token
   SLACK_USER_TOKEN=xoxp-your-user-token
   ```

### Scopes Explanation:
- Channels = Public Slack channels
- Groups = Private Slack channels
- IM = Direct messages
- Users = Workspace member information

---

## 5. LinkedIn OAuth Application

**Time:** 15 minutes
**URL:** https://www.linkedin.com/developers/apps

### Steps:

1. **Create LinkedIn Developer Account**
   - Go to https://www.linkedin.com/developers/apps
   - Log in with your LinkedIn account
   - Complete any required verification

2. **Create New App**
   - Click "Create app" button
   - Fill in details:
   ```
   App name: TwinMe
   LinkedIn Page: [Your LinkedIn company page or create one]
   Privacy policy URL: http://localhost:8086/privacy (or your actual privacy policy)
   App logo: [Upload 512x512px image if you have one]
   Legal agreement: [Check the box]
   ```
   - Click "Create app"

3. **Verify Your App**
   - LinkedIn requires app verification
   - Go to "Settings" tab
   - Complete verification process (may take 1-2 business days)

4. **Configure OAuth 2.0**
   - Go to "Auth" tab
   - Under "OAuth 2.0 settings"
   - Under "Redirect URLs", click "Add redirect URL"
   - Enter: `http://localhost:8086/oauth/callback`
   - Click "Update"

5. **Request API Access**
   - Go to "Products" tab
   - Request access to:
     - "Sign In with LinkedIn" (immediate approval)
     - "Share on LinkedIn" (if needed)

6. **Get Credentials**
   - Go to "Auth" tab
   - Copy the **Client ID**
   - Copy the **Client Secret**

7. **Update .env File**
   ```env
   LINKEDIN_CLIENT_ID=your_actual_client_id_here
   LINKEDIN_CLIENT_SECRET=your_actual_client_secret_here
   ```

### Scopes Explanation:
- `r_liteprofile` - Access user's basic profile (name, photo, etc.)
- `r_emailaddress` - Access user's email address

### Note:
LinkedIn has strict review processes. Basic profile access is immediate, but advanced features may require approval.

---

## Testing Your OAuth Setup

After configuring all credentials, test each connector:

### 1. Restart Your Servers
```bash
# Kill existing servers (Ctrl+C)
# Restart backend
npm run server:dev

# In another terminal, restart frontend
npm run dev
```

### 2. Test Each Connector

1. Navigate to http://localhost:8086/get-started
2. Click "Connect" on each platform
3. You should be redirected to the OAuth provider
4. Authorize the application
5. You should be redirected back to your app
6. Connection status should show as connected

### 3. Verify in Database

Check Supabase database:
```sql
SELECT provider, user_id, is_active, connected_at
FROM data_connectors
WHERE user_id = 'your_user_id';
```

You should see entries for each connected platform.

---

## Common Issues & Solutions

### Issue: "Redirect URI mismatch"
**Solution:**
- Ensure the redirect URI in your OAuth app settings exactly matches
- Check for http vs https
- Check for trailing slashes
- Common correct format: `http://localhost:8086/oauth/callback`

### Issue: "Invalid client_id"
**Solution:**
- Double-check you copied the correct Client ID
- Ensure no extra spaces in .env file
- Restart your backend server after updating .env

### Issue: "Access denied" or "Unauthorized"
**Solution:**
- Check that all required scopes are configured in the OAuth app
- Verify the app is approved/verified (especially LinkedIn)
- Make sure you're logged in to the correct account

### Issue: Discord "Bot token is invalid"
**Solution:**
- Reset the bot token in Discord Developer Portal
- Copy the new token immediately (it's only shown once)
- Update .env and restart server

### Issue: Slack "missing_scope" error
**Solution:**
- Go back to Slack app settings
- Add all required User Token Scopes (not Bot Token Scopes)
- Reinstall the app to your workspace

---

## Production Deployment Checklist

When moving to production, update:

1. **Redirect URIs** in each OAuth app
   - Change from `http://localhost:8086/oauth/callback`
   - To `https://yourdomain.com/oauth/callback`

2. **Environment Variables**
   ```env
   VITE_APP_URL=https://yourdomain.com
   NODE_ENV=production
   ```

3. **App Verification**
   - Submit apps for verification where required
   - Google: Submit for OAuth verification
   - LinkedIn: Complete business verification
   - Others: Follow platform-specific review processes

4. **Privacy Policy & Terms**
   - Create actual privacy policy page
   - Create terms of service page
   - Update OAuth app settings with actual URLs

5. **Rate Limits**
   - Monitor API usage
   - Implement rate limiting
   - Consider caching strategies

---

## Platform-Specific Notes

### GitHub
- Free for public and private repositories
- Rate limit: 5,000 requests/hour (authenticated)
- No app review required for basic scopes

### Spotify
- Free for most read operations
- Rate limit: Varies by endpoint (typically generous)
- No app review for read-only scopes

### Discord
- Free for OAuth and basic bot features
- Rate limit: Varies by endpoint
- No review required for basic scopes

### Slack
- Free tier available
- Different rate limits per method
- User tokens expire, implement refresh logic

### LinkedIn
- Requires company page for app creation
- May require verification for production use
- Rate limits can be restrictive on free tier

---

## Security Best Practices

1. **Never Commit Credentials**
   - Keep .env file in .gitignore
   - Use environment variables in production
   - Rotate secrets periodically

2. **Token Storage**
   - Always encrypt tokens at rest (already implemented)
   - Use secure encryption keys
   - Implement token refresh before expiration

3. **OAuth State Parameter**
   - Always validate state parameter (already implemented)
   - Include CSRF token
   - Check timestamp to prevent replay attacks

4. **HTTPS in Production**
   - Always use HTTPS for OAuth callbacks
   - Use secure cookies
   - Implement proper CORS policies

---

## Support & Resources

### Documentation Links

- **GitHub:** https://docs.github.com/en/developers/apps
- **Spotify:** https://developer.spotify.com/documentation/web-api
- **Discord:** https://discord.com/developers/docs
- **Slack:** https://api.slack.com/docs
- **LinkedIn:** https://learn.microsoft.com/en-us/linkedin/

### Community Support

- **GitHub Discussions:** For GitHub API issues
- **Spotify Community:** https://community.spotify.com/t5/Spotify-for-Developers/bd-p/Spotify_Developer
- **Discord Developers:** https://discord.gg/discord-developers
- **Slack Community:** https://slackcommunity.com

---

## Completion Checklist

After completing all registrations, verify:

- [ ] GitHub OAuth app created and credentials in .env
- [ ] Spotify OAuth app created and credentials in .env
- [ ] Discord OAuth app created and credentials in .env
- [ ] Slack OAuth app created and credentials in .env
- [ ] LinkedIn OAuth app created and credentials in .env
- [ ] All redirect URIs configured correctly
- [ ] Backend server restarted with new credentials
- [ ] Frontend tested - can initiate OAuth flows
- [ ] OAuth callbacks working - tokens stored in database
- [ ] Connection status showing correctly in UI
- [ ] Data extraction tested and working

---

**Congratulations!** 🎉

Once you've completed all registrations and verified the connections work, your TwinMe platform is ready for:
- User onboarding
- Real data extraction
- Soul signature generation
- Full platform testing

See `CONNECTOR_TEST_RESULTS.md` for testing results and next steps.
