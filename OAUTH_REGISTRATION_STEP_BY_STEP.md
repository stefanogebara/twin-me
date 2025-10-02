# OAuth Registration - Complete Step-by-Step Guide

**Estimated Total Time:** 60 minutes (12 minutes per platform)
**Callback URL (Same for All):** `http://localhost:8086/oauth/callback`

---

## 🎵 1. Spotify OAuth Registration (10 minutes)

### Step 1: Go to Spotify Developer Dashboard
📍 **URL:** https://developer.spotify.com/dashboard

### Step 2: Log in or Create Account
- Use your Spotify account (personal or create new one)
- Accept terms if prompted

### Step 3: Create a New App
1. Click **"Create app"** button
2. Fill in the form:
   - **App name:** `TwinMe Soul Signature` (or your preference)
   - **App description:** `Soul signature extraction from Spotify listening history`
   - **Redirect URIs:**
     ```
     http://localhost:8086/oauth/callback
     ```
   - **Website:** `http://localhost:8086` (optional)
   - Check ✅ **Web API**
   - Accept Spotify Developer Terms

3. Click **"Save"**

### Step 4: Get Credentials
1. You'll be taken to your app dashboard
2. Click **"Settings"** in the top right
3. You'll see:
   - **Client ID** (copy this)
   - **Client secret** (click "View client secret" and copy)

### Step 5: Configure Scopes (Already done in backend)
Our backend requests these scopes:
```
user-read-recently-played
user-top-read
user-read-playback-state
playlist-read-private
playlist-read-collaborative
user-library-read
```

### Credentials to Provide:
```
SPOTIFY_CLIENT_ID=<paste your client ID here>
SPOTIFY_CLIENT_SECRET=<paste your client secret here>
```

---

## 🐙 2. GitHub OAuth Registration (10 minutes)

### Step 1: Go to GitHub Developer Settings
📍 **URL:** https://github.com/settings/developers

### Step 2: Create OAuth App
1. Click **"OAuth Apps"** in the left sidebar
2. Click **"New OAuth App"** button
3. Fill in the form:
   - **Application name:** `TwinMe Soul Signature`
   - **Homepage URL:** `http://localhost:8086`
   - **Application description:** `Soul signature extraction from GitHub activity`
   - **Authorization callback URL:**
     ```
     http://localhost:8086/oauth/callback
     ```
4. Click **"Register application"**

### Step 3: Get Credentials
1. You'll see your new app's page
2. **Client ID** is displayed at the top (copy this)
3. Click **"Generate a new client secret"**
4. **Client secret** will be shown once (copy immediately!)
   - ⚠️ You won't be able to see it again

### Step 4: Enable User-to-Server Token Expiration (Optional)
1. Scroll down to **"Optional Features"**
2. Find **"User-to-server token expiration"**
3. Click **"Opt-in"** if you want 8-hour token expiry + refresh tokens
   - Our token refresh supports this!
   - If you skip this, tokens never expire (also fine)

### Credentials to Provide:
```
GITHUB_CLIENT_ID=<paste your client ID here>
GITHUB_CLIENT_SECRET=<paste your client secret here>
```

---

## 💬 3. Discord OAuth Registration (15 minutes)

### Step 1: Go to Discord Developer Portal
📍 **URL:** https://discord.com/developers/applications

### Step 2: Create New Application
1. Click **"New Application"** button (top right)
2. **Name:** `TwinMe Soul Signature`
3. Accept Developer Terms
4. Click **"Create"**

### Step 3: Configure OAuth2
1. In the left sidebar, click **"OAuth2"**
2. Under **"Redirects"**, click **"Add Redirect"**
3. Enter:
   ```
   http://localhost:8086/oauth/callback
   ```
4. Click **"Save Changes"**

### Step 4: Get Credentials
1. Still on the OAuth2 page, you'll see:
   - **CLIENT ID** (copy this)
   - **CLIENT SECRET** (click "Reset Secret" if needed, then copy)
   - ⚠️ Copy the secret immediately - you won't see it again!

### Step 5: Configure Bot (Optional)
If you want server/guild info:
1. Click **"Bot"** in left sidebar
2. Click **"Add Bot"** and confirm
3. This is optional for basic OAuth

### Step 6: Select Scopes (Already done in backend)
Our backend requests these scopes:
```
identify
email
guilds
```

### Credentials to Provide:
```
DISCORD_CLIENT_ID=<paste your client ID here>
DISCORD_CLIENT_SECRET=<paste your client secret here>
```

### 🔍 Verification:
Discord Client ID should be a long number (snowflake format), like:
```
1234567890123456789
```

---

## 🔔 4. Slack OAuth Registration (15 minutes)

### Step 1: Go to Slack API Portal
📍 **URL:** https://api.slack.com/apps

### Step 2: Create New App
1. Click **"Create New App"** button
2. Choose **"From scratch"**
3. Fill in:
   - **App Name:** `TwinMe Soul Signature`
   - **Pick a workspace:** Select your development workspace
4. Click **"Create App"**

### Step 3: Configure OAuth & Permissions
1. In left sidebar, click **"OAuth & Permissions"**
2. Scroll down to **"Redirect URLs"**
3. Click **"Add New Redirect URL"**
4. Enter:
   ```
   http://localhost:8086/oauth/callback
   ```
5. Click **"Add"**
6. Click **"Save URLs"**

### Step 4: Add Bot Token Scopes
Scroll down to **"Scopes"** section and add:

**Bot Token Scopes:**
```
channels:history
channels:read
groups:history
groups:read
im:history
im:read
mpim:history
mpim:read
users:read
users:read.email
```

**User Token Scopes:**
```
channels:history
channels:read
groups:history
groups:read
im:history
im:read
mpim:history
mpim:read
users:read
```

### Step 5: Get Credentials
1. In left sidebar, click **"Basic Information"**
2. Scroll to **"App Credentials"**
3. You'll see:
   - **Client ID** (copy this)
   - **Client Secret** (click "Show" and copy)
   - **Signing Secret** (we don't need this for OAuth)

### Credentials to Provide:
```
SLACK_CLIENT_ID=<paste your client ID here>
SLACK_CLIENT_SECRET=<paste your client secret here>
```

---

## 💼 5. LinkedIn OAuth Registration (15 minutes)

### Step 1: Go to LinkedIn Developers
📍 **URL:** https://www.linkedin.com/developers/apps

### Step 2: Create New App
1. Click **"Create app"** button
2. Fill in the form:
   - **App name:** `TwinMe Soul Signature`
   - **LinkedIn Page:** Select your company page or create one
     - If you don't have a company page, you'll need to create one first
     - Go to: https://www.linkedin.com/company/setup/new/
     - Company name: Your name or "TwinMe Dev"
   - **Privacy policy URL:** `http://localhost:8086/privacy` (or any URL)
   - **App logo:** Upload any logo (256x256px minimum)
3. Check the Legal Agreement
4. Click **"Create app"**

### Step 3: Verify Your App
1. LinkedIn will show a banner: **"Verify this app"**
2. Click on it and follow the verification steps
3. This usually requires:
   - Adding a verification URL to your website, OR
   - Uploading an HTML file
4. For localhost, you can skip verification for testing
   - You'll see limited functionality but OAuth will work

### Step 4: Configure OAuth 2.0
1. Click on the **"Auth"** tab
2. Under **"OAuth 2.0 settings"**, find **"Redirect URLs"**
3. Click **"Add redirect URL"**
4. Enter:
   ```
   http://localhost:8086/oauth/callback
   ```
5. Click **"Update"**

### Step 5: Request Products/Scopes
1. Click on the **"Products"** tab
2. Request access to:
   - **Sign In with LinkedIn using OpenID Connect** (for basic profile)
   - Click **"Request access"**
   - This is usually auto-approved

### Step 6: Get Credentials
1. Click back to the **"Auth"** tab
2. Under **"Application credentials"**, you'll see:
   - **Client ID** (copy this)
   - **Client Secret** (copy this)

### Step 7: Verify Scopes (Already done in backend)
Our backend requests these scopes:
```
openid
profile
email
```

### Credentials to Provide:
```
LINKEDIN_CLIENT_ID=<paste your client ID here>
LINKEDIN_CLIENT_SECRET=<paste your client secret here>
```

### 🔍 LinkedIn Notes:
- LinkedIn has stricter requirements than other platforms
- For production, you need a verified app and approved products
- For localhost testing, basic OAuth should work with Sign In with LinkedIn

---

## 📝 Summary Checklist

Copy these credentials once you have them:

```bash
# Spotify
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=

# GitHub
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# Discord
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=

# Slack
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=

# LinkedIn
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
```

---

## 🚀 After You Have Credentials

**Option 1: Send me the credentials**
Provide the credentials in your next message, and I'll:
1. Update the `.env` file
2. Restart the backend server
3. Test each platform with Playwright
4. Verify token refresh works for each

**Option 2: Update .env yourself**
If you prefer to update the file directly:
1. Open `.env` file in the project root
2. Replace the placeholder values
3. Restart the backend: `npm run server:dev`
4. Let me know when ready, and I'll run tests

---

## ⚠️ Important Notes

**Redirect URL Must Match Exactly:**
```
http://localhost:8086/oauth/callback
```
- No trailing slash
- No https (we're using http for localhost)
- Port 8086 (matches our Vite dev server)

**Client Secrets:**
- Copy immediately when shown
- Most platforms show them only once
- If you lose it, you can regenerate (but old one becomes invalid)

**Rate Limits:**
- Each platform has API rate limits
- We're only doing OAuth, so shouldn't hit limits during testing
- Token refresh uses minimal API calls

**Production Deployment:**
When deploying to production:
1. Create new OAuth apps for production
2. Use your production domain in redirect URLs
3. Use environment variables (never commit credentials to git)

---

## 🧪 Testing After Registration

Once you provide credentials, I will:

1. ✅ Update `.env` file
2. ✅ Restart backend server
3. ✅ Test each platform connection with Playwright
4. ✅ Verify OAuth flow completes
5. ✅ Check tokens are stored in database
6. ✅ Test token refresh for each platform
7. ✅ Verify data extraction works

**Estimated Testing Time:** 30 minutes for all 5 platforms

---

## 💡 Quick Start (Fastest Platform)

**Start with GitHub** - it's the fastest and easiest:
1. Go to https://github.com/settings/developers
2. New OAuth App
3. Fill in form (2 minutes)
4. Copy credentials
5. Done! ✅

**Then do Spotify** - second easiest:
1. https://developer.spotify.com/dashboard
2. Create app
3. Copy credentials
4. Done! ✅

The others take a bit more time due to workspace/verification requirements.

---

**Ready to start?** Pick a platform and let me know when you have the credentials! 🚀
