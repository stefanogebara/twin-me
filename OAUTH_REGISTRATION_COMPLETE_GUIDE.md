# OAuth Registration Complete Guide

Complete step-by-step guide for registering OAuth applications with all supported platforms for the Soul Signature Platform. Follow these instructions to obtain Client IDs and Client Secrets for each platform.

---

## Table of Contents

1. [Spotify](#1-spotify)
2. [YouTube (Google OAuth)](#2-youtube-google-oauth)
3. [GitHub](#3-github)
4. [Discord](#4-discord)
5. [Reddit](#5-reddit)
6. [Twitch](#6-twitch)
7. [LinkedIn](#7-linkedin)
8. [Gmail (Google OAuth)](#8-gmail-google-oauth)
9. [Google Calendar](#9-google-calendar)
10. [Environment Configuration](#10-environment-configuration)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Spotify

### Overview
Spotify provides access to user's musical taste, listening history, playlists, and top artists/tracks through the Spotify Web API.

### Required Scopes
- `user-read-recently-played` - Recent listening history
- `user-top-read` - Top artists and tracks
- `user-read-email` - User email address
- `playlist-read-private` - Access to private playlists
- `user-library-read` - Access to saved tracks

### Registration Steps

1. **Go to Spotify Developer Dashboard**
   - Navigate to: https://developer.spotify.com/dashboard
   - Click **"Log In"** with your Spotify account

2. **Create New App**
   - Click **"Create App"** button (top right)
   - Fill in the form:
     - **App Name**: `Soul Signature Platform` (or your app name)
     - **App Description**: `Discover your authentic soul signature through your musical taste and listening patterns`
     - **Website**: `http://localhost:8086` (development) or `https://your-domain.com` (production)
     - **Redirect URIs**: Add both development and production URLs:
       - `http://localhost:3001/api/entertainment/callback/spotify` (development)
       - `https://your-production-domain.com/api/entertainment/callback/spotify` (production)

3. **Accept Terms**
   - Check **"I understand and agree with Spotify's Developer Terms of Service and Design Guidelines"**
   - Click **"Save"**

4. **Get Credentials**
   - After creation, click on your app name
   - Click **"Settings"** button (top right)
   - You'll see:
     - **Client ID**: Copy this value
     - **Client Secret**: Click **"View client secret"** and copy it
   - ⚠️ **IMPORTANT**: Keep the Client Secret secure and never commit it to version control

5. **Add to Environment Variables**
   ```env
   SPOTIFY_CLIENT_ID=your-client-id-here
   SPOTIFY_CLIENT_SECRET=your-client-secret-here
   ```

### Testing
Test your Spotify integration:
```bash
# Start backend
npm run server:dev

# Navigate to platform connect page
http://localhost:8086/connect-platforms

# Click "Connect Spotify" and authorize
```

---

## 2. YouTube (Google OAuth)

### Overview
YouTube Data API v3 provides access to user's subscriptions, liked videos, watch history, and viewing preferences.

### Required Scopes
- `https://www.googleapis.com/auth/youtube.readonly` - Read user's YouTube data

### Registration Steps

1. **Go to Google Cloud Console**
   - Navigate to: https://console.cloud.google.com
   - Sign in with your Google account

2. **Create New Project (if needed)**
   - Click project dropdown (top left)
   - Click **"New Project"**
   - **Project Name**: `Soul Signature Platform`
   - Click **"Create"**

3. **Enable YouTube Data API v3**
   - In the search bar, type **"YouTube Data API v3"**
   - Click on **"YouTube Data API v3"**
   - Click **"Enable"** button

4. **Create OAuth 2.0 Credentials**
   - Go to **"APIs & Services"** > **"Credentials"**
   - Click **"Create Credentials"** > **"OAuth client ID"**
   - If prompted, configure OAuth consent screen first (see below)
   - **Application type**: Web application
   - **Name**: `Soul Signature YouTube`
   - **Authorized JavaScript origins**:
     - `http://localhost:8086` (development)
     - `https://your-domain.com` (production)
   - **Authorized redirect URIs**:
     - `http://localhost:3001/api/entertainment/callback/youtube` (development)
     - `https://your-domain.com/api/entertainment/callback/youtube` (production)
   - Click **"Create"**

5. **Configure OAuth Consent Screen** (if required)
   - Select **"External"** for user type
   - Fill in required fields:
     - **App name**: `Soul Signature Platform`
     - **User support email**: your-email@example.com
     - **Developer contact**: your-email@example.com
   - **Scopes**: Add `youtube.readonly`
   - **Test users**: Add your Google account email for testing

6. **Get Credentials**
   - After creation, you'll see:
     - **Client ID**: Copy this value
     - **Client Secret**: Copy this value

7. **Add to Environment Variables**
   ```env
   YOUTUBE_CLIENT_ID=your-google-client-id
   YOUTUBE_CLIENT_SECRET=your-google-client-secret
   ```

### Testing
```bash
# Navigate to
http://localhost:8086/connect-platforms

# Click "Connect YouTube" and authorize with Google
```

---

## 3. GitHub

### Overview
GitHub API provides access to user's repositories, programming languages, contribution patterns, and project interests.

### Required Scopes
- `read:user` - Read user profile data
- `repo` - Access to public and private repositories

### Registration Steps

1. **Go to GitHub Developer Settings**
   - Navigate to: https://github.com/settings/developers
   - Or: GitHub Settings > Developer settings > OAuth Apps
   - Click **"New OAuth App"**

2. **Fill in Application Details**
   - **Application name**: `Soul Signature Platform`
   - **Homepage URL**:
     - Development: `http://localhost:8086`
     - Production: `https://your-domain.com`
   - **Application description**: `Discover your coding personality and technical soul signature`
   - **Authorization callback URL**:
     - Development: `http://localhost:3001/api/entertainment/callback/github`
     - Production: `https://your-domain.com/api/entertainment/callback/github`
   - ⚠️ **Note**: GitHub only allows ONE callback URL per app. For development and production, you'll need separate apps.

3. **Register Application**
   - Click **"Register application"**

4. **Generate Client Secret**
   - After registration, click **"Generate a new client secret"**
   - **Important**: Copy the secret immediately - you won't be able to see it again
   - Store it securely

5. **Get Credentials**
   - **Client ID**: Displayed on the page
   - **Client Secret**: The one you just generated

6. **Add to Environment Variables**
   ```env
   GITHUB_CLIENT_ID=your-github-client-id
   GITHUB_CLIENT_SECRET=your-github-client-secret
   ```

### Testing
```bash
# Start dev server and navigate to:
http://localhost:8086/connect-platforms

# Click "Connect GitHub" and authorize
```

---

## 4. Discord

### Overview
Discord API provides access to user's server memberships, community involvement, and social circles.

### Required Scopes
- `identify` - Read user profile
- `guilds` - Access to user's Discord servers

### Registration Steps

1. **Go to Discord Developer Portal**
   - Navigate to: https://discord.com/developers/applications
   - Sign in with your Discord account
   - Click **"New Application"** (top right)

2. **Create Application**
   - **Name**: `Soul Signature Platform`
   - Check the Developer Terms of Service
   - Click **"Create"**

3. **Configure OAuth2**
   - In the left sidebar, click **"OAuth2"** > **"General"**
   - **Client ID**: Automatically generated (copy this)
   - **Client Secret**: Click **"Reset Secret"** to generate new one (copy it)

4. **Add Redirect URIs**
   - Scroll to **"Redirects"** section
   - Click **"Add Redirect"**
   - Add:
     - `http://localhost:3001/api/entertainment/callback/discord` (development)
     - `https://your-domain.com/api/entertainment/callback/discord` (production)
   - Click **"Save Changes"**

5. **Configure Bot (Optional)**
   - If you need bot features, go to **"Bot"** tab
   - Click **"Add Bot"**
   - Configure bot permissions as needed

6. **Add to Environment Variables**
   ```env
   DISCORD_CLIENT_ID=your-discord-client-id
   DISCORD_CLIENT_SECRET=your-discord-client-secret
   ```

### Testing
```bash
http://localhost:8086/connect-platforms
# Click "Connect Discord" and authorize
```

---

## 5. Reddit

### Overview
Reddit API provides access to user's subreddit subscriptions, post history, and discussion patterns.

### Required Scopes
- `identity` - Read user profile
- `mysubreddits` - Access subscribed subreddits
- `history` - Read post/comment history

### Registration Steps

1. **Go to Reddit App Preferences**
   - Navigate to: https://www.reddit.com/prefs/apps
   - Scroll to **"Developed Applications"**
   - Click **"Create App"** or **"Create Another App"**

2. **Fill in Application Details**
   - **Name**: `Soul Signature Platform`
   - **App type**: Select **"web app"**
   - **Description**: `Discover your discussion style and community interests`
   - **About URL**: `http://localhost:8086` (or your domain)
   - **Redirect URI**:
     - `http://localhost:3001/api/entertainment/callback/reddit` (development)
     - **Note**: Reddit allows multiple redirect URIs - add both dev and production

3. **Create App**
   - Click **"Create app"**

4. **Get Credentials**
   - After creation, you'll see:
     - **Client ID**: String below the app name (looks like `abc123xyz`)
     - **Client Secret**: Labeled "secret"

5. **Add to Environment Variables**
   ```env
   REDDIT_CLIENT_ID=your-reddit-client-id
   REDDIT_CLIENT_SECRET=your-reddit-client-secret
   ```

### Testing
```bash
http://localhost:8086/connect-platforms
# Click "Connect Reddit" and authorize
```

---

## 6. Twitch

### Overview
Twitch API provides access to user's followed channels, viewing habits, and streaming preferences.

### Required Scopes
- `user:read:follows` - Read followed channels
- `user:read:email` - Read email address

### Registration Steps

1. **Go to Twitch Developer Console**
   - Navigate to: https://dev.twitch.tv/console
   - Sign in with your Twitch account
   - Click **"Register Your Application"**

2. **Fill in Application Details**
   - **Name**: `Soul Signature Platform`
   - **OAuth Redirect URLs**: Add both:
     - `http://localhost:3001/api/entertainment/callback/twitch`
     - `https://your-domain.com/api/entertainment/callback/twitch`
   - **Category**: Choose **"Website Integration"**
   - Complete CAPTCHA
   - Click **"Create"**

3. **Get Credentials**
   - Click on your app name to view details
   - **Client ID**: Displayed on the page
   - Click **"New Secret"** to generate Client Secret
   - **Important**: Copy the secret immediately

4. **Add to Environment Variables**
   ```env
   TWITCH_CLIENT_ID=your-twitch-client-id
   TWITCH_CLIENT_SECRET=your-twitch-client-secret
   ```

### Testing
```bash
http://localhost:8086/connect-platforms
# Click "Connect Twitch" and authorize
```

---

## 7. LinkedIn

### Overview
LinkedIn API provides access to user's professional profile, connections, and career trajectory.

### Required Scopes
- `r_liteprofile` - Read basic profile information
- `r_emailaddress` - Read email address

### Registration Steps

1. **Go to LinkedIn Developers**
   - Navigate to: https://www.linkedin.com/developers/apps
   - Sign in with your LinkedIn account
   - Click **"Create app"**

2. **Fill in App Information**
   - **App name**: `Soul Signature Platform`
   - **LinkedIn Page**: Select your LinkedIn company page (or create one)
   - **App logo**: Upload a logo (256x256 px PNG)
   - **Legal agreement**: Accept terms
   - Click **"Create app"**

3. **Verify Your App**
   - Go to **"Settings"** tab
   - Under **"App settings"**, verify URL
   - LinkedIn will send verification link to company page admin

4. **Configure OAuth 2.0**
   - Go to **"Auth"** tab
   - **Authorized redirect URLs for your app**:
     - Add: `http://localhost:3001/api/entertainment/callback/linkedin`
     - Add: `https://your-domain.com/api/entertainment/callback/linkedin`
   - Click **"Update"**

5. **Get Credentials**
   - Still in **"Auth"** tab:
     - **Client ID**: Copy this value
     - **Client Secret**: Copy this value

6. **Request API Access**
   - LinkedIn requires approval for certain API products
   - Go to **"Products"** tab
   - Request access to **"Sign In with LinkedIn"**

7. **Add to Environment Variables**
   ```env
   LINKEDIN_CLIENT_ID=your-linkedin-client-id
   LINKEDIN_CLIENT_SECRET=your-linkedin-client-secret
   ```

### Testing
```bash
http://localhost:8086/connect-platforms
# Click "Connect LinkedIn" and authorize
```

---

## 8. Gmail (Google OAuth)

### Overview
Gmail API provides access to communication style, email patterns, and professional relationships.

### Required Scopes
- `https://www.googleapis.com/auth/gmail.readonly` - Read Gmail messages

### Registration Steps

**Note**: If you already created a Google Cloud project for YouTube, you can use the same project.

1. **Go to Google Cloud Console**
   - Navigate to: https://console.cloud.google.com
   - Select your existing project or create a new one

2. **Enable Gmail API**
   - Search for **"Gmail API"**
   - Click **"Enable"**

3. **Use Existing OAuth 2.0 Credentials or Create New**
   - Go to **"Credentials"**
   - Either use existing YouTube credentials OR create new OAuth client ID
   - Add redirect URI: `http://localhost:3001/api/entertainment/callback/google_gmail`

4. **Update Consent Screen**
   - Add Gmail scope: `gmail.readonly`

5. **Add to Environment Variables**
   ```env
   GOOGLE_GMAIL_CLIENT_ID=your-google-client-id
   GOOGLE_GMAIL_CLIENT_SECRET=your-google-client-secret
   ```

   **Or if using same credentials as YouTube:**
   ```env
   GOOGLE_CLIENT_ID=your-google-client-id
   GOOGLE_CLIENT_SECRET=your-google-client-secret
   ```

---

## 9. Google Calendar

### Overview
Google Calendar API provides access to time management patterns, meeting schedules, and work-life balance insights.

### Required Scopes
- `https://www.googleapis.com/auth/calendar.readonly` - Read calendar events

### Registration Steps

**Note**: Same as Gmail - use the same Google Cloud project.

1. **Enable Calendar API**
   - In Google Cloud Console, search for **"Google Calendar API"**
   - Click **"Enable"**

2. **Use Existing OAuth Credentials**
   - Add redirect URI: `http://localhost:3001/api/entertainment/callback/google_calendar`

3. **Update Consent Screen**
   - Add Calendar scope: `calendar.readonly`

4. **Environment Variables**
   ```env
   GOOGLE_CALENDAR_CLIENT_ID=your-google-client-id
   GOOGLE_CALENDAR_CLIENT_SECRET=your-google-client-secret
   ```

---

## 10. Environment Configuration

### Complete .env File Example

Create a `.env` file in your project root with all credentials:

```env
# ============================================================================
# SPOTIFY
# ============================================================================
SPOTIFY_CLIENT_ID=abc123xyz456
SPOTIFY_CLIENT_SECRET=def789ghi012

# ============================================================================
# GOOGLE (YouTube, Gmail, Calendar)
# ============================================================================
GOOGLE_CLIENT_ID=123456789-abcdefg.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abc123xyz456
# Or separate credentials:
YOUTUBE_CLIENT_ID=your-youtube-client-id
YOUTUBE_CLIENT_SECRET=your-youtube-client-secret
GOOGLE_GMAIL_CLIENT_ID=your-gmail-client-id
GOOGLE_GMAIL_CLIENT_SECRET=your-gmail-client-secret
GOOGLE_CALENDAR_CLIENT_ID=your-calendar-client-id
GOOGLE_CALENDAR_CLIENT_SECRET=your-calendar-client-secret

# ============================================================================
# GITHUB
# ============================================================================
GITHUB_CLIENT_ID=Iv1.abc123xyz456
GITHUB_CLIENT_SECRET=abc123xyz456def789ghi012jkl345mno678

# ============================================================================
# DISCORD
# ============================================================================
DISCORD_CLIENT_ID=123456789012345678
DISCORD_CLIENT_SECRET=abc123xyz456def789ghi012jkl345mno678

# ============================================================================
# REDDIT
# ============================================================================
REDDIT_CLIENT_ID=abc123xyz456
REDDIT_CLIENT_SECRET=def789ghi012jkl345mno678pqr901stu234

# ============================================================================
# TWITCH
# ============================================================================
TWITCH_CLIENT_ID=abc123xyz456def789ghi012
TWITCH_CLIENT_SECRET=abc123xyz456def789ghi012jkl345mno678

# ============================================================================
# LINKEDIN
# ============================================================================
LINKEDIN_CLIENT_ID=abc123xyz456
LINKEDIN_CLIENT_SECRET=def789ghi012

# ============================================================================
# SERVER CONFIGURATION
# ============================================================================
NODE_ENV=development
PORT=3001
CLIENT_URL=http://localhost:8086
API_URL=http://localhost:3001/api

# ============================================================================
# DATABASE
# ============================================================================
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# ============================================================================
# JWT & SECURITY
# ============================================================================
JWT_SECRET=your-jwt-secret-key-here-use-strong-random-string
ENCRYPTION_KEY=your-encryption-key-32-chars-long
```

### Security Best Practices

1. **Never Commit .env to Git**
   ```gitignore
   # Add to .gitignore
   .env
   .env.local
   .env.*.local
   ```

2. **Use Strong Secrets**
   ```bash
   # Generate JWT secret
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```

3. **Separate Dev and Production**
   - Create separate OAuth apps for development and production
   - Use different credentials for each environment

4. **Rotate Secrets Regularly**
   - Change Client Secrets periodically
   - Update .env and redeploy

---

## 11. Troubleshooting

### Common Issues

#### "Invalid redirect_uri" Error

**Problem**: OAuth provider rejects the callback URL.

**Solution**:
1. Double-check the redirect URI in your OAuth app settings
2. Ensure it EXACTLY matches the one in your code:
   ```javascript
   // api/services/platformAPIMappings.js
   redirect_uri: `${process.env.API_URL}/entertainment/callback/${platform}`
   ```
3. Include protocol (`http://` or `https://`)
4. No trailing slashes
5. Match port numbers exactly

#### "Invalid client credentials" Error

**Problem**: Client ID or Secret is incorrect.

**Solution**:
1. Verify credentials in .env file
2. Check for extra spaces or line breaks
3. Regenerate Client Secret if unsure
4. Restart backend server after changing .env

#### "Insufficient scopes" Error

**Problem**: OAuth app doesn't have required permissions.

**Solution**:
1. Check platform's OAuth app settings
2. Ensure all required scopes are enabled
3. For Google: Update OAuth consent screen scopes
4. May need to reauthorize connection

#### "Token expired" Error

**Problem**: Access token has expired.

**Solution**:
- Platform should auto-refresh using refresh token
- If not working, reconnect platform manually
- Check `tokenRefresh.js` implementation

#### OAuth Consent Screen Not Approved (Google)

**Problem**: Google shows "This app isn't verified" warning.

**Solution**:
1. For testing: Add test users in OAuth consent screen
2. For production: Submit app for Google verification
3. Users can bypass warning by clicking "Advanced" > "Go to [App Name]"

### Testing Checklist

Before deploying to production:

- [ ] All OAuth apps created for each platform
- [ ] Client IDs and Secrets added to `.env`
- [ ] Redirect URIs configured correctly (dev + production)
- [ ] Required scopes enabled for each platform
- [ ] Test OAuth flow for each platform
- [ ] Verify token refresh works
- [ ] Test data extraction from each platform
- [ ] Ensure error handling works (expired tokens, rate limits)

### Platform-Specific Notes

**Spotify**:
- Free tier has rate limits (180 requests per minute)
- Consider caching API responses

**YouTube/Google**:
- Requires OAuth consent screen configuration
- May need Google verification for production use
- Daily API quota limits apply

**GitHub**:
- Only ONE callback URL per app
- Create separate apps for dev and production

**Discord**:
- Bot token separate from OAuth token
- Guild permissions affect data access

**Reddit**:
- Very strict rate limiting (60 requests per minute)
- Requires unique User-Agent header

**LinkedIn**:
- Requires company page for app creation
- Limited API access without partnership program

---

## Next Steps

After completing OAuth setup:

1. **Test Platform Connections**
   ```bash
   npm run server:dev
   # Navigate to http://localhost:8086/connect-platforms
   # Test each platform connection
   ```

2. **Run Test Suite**
   ```bash
   node test-soul-extraction.js
   ```

3. **Monitor Extraction**
   - Check backend logs for successful extractions
   - Verify data is being saved to `soul_data` table
   - Test soul signature building

4. **Deploy to Production**
   - Update environment variables in production
   - Configure production OAuth redirect URIs
   - Test OAuth flow on production domain

---

## Support

If you encounter issues:

1. Check platform-specific documentation:
   - [Spotify Web API Docs](https://developer.spotify.com/documentation/web-api)
   - [YouTube Data API Docs](https://developers.google.com/youtube/v3)
   - [GitHub API Docs](https://docs.github.com/en/rest)
   - [Discord API Docs](https://discord.com/developers/docs)
   - [Reddit API Docs](https://www.reddit.com/dev/api)

2. Review server logs for specific error messages

3. Test with curl or Postman to isolate issues

4. Verify environment variables are loaded correctly:
   ```javascript
   console.log('Spotify Client ID:', process.env.SPOTIFY_CLIENT_ID ? 'SET' : 'NOT SET');
   ```

---

**Last Updated**: January 2025
**Version**: 1.0.0
