# OAuth Setup Guide

This guide walks you through setting up OAuth credentials for the MVP platforms: Spotify, Google (Calendar), and Whoop.

## Prerequisites

1. Copy `.env.example` to `.env` in the project root
2. Generate an encryption key for token storage:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
3. Add the generated key to your `.env` file as `ENCRYPTION_KEY`

---

## 1. Spotify Setup

Spotify provides music listening data for personality inference and recommendations.

### Create Developer App

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Log in with your Spotify account
3. Click **Create App**
4. Fill in the details:
   - **App name**: Twin AI Learn
   - **App description**: Digital twin that learns from your music
   - **Website**: `http://localhost:8086` (or your production URL)
   - **Redirect URI**: `http://localhost:3001/api/entertainment/oauth/callback`
5. Check the Web API checkbox
6. Accept the terms and click **Save**

### Get Credentials

1. On your app's page, click **Settings**
2. Copy the **Client ID**
3. Click **View client secret** and copy the **Client Secret**

### Configure Environment

Add to your `.env` file:
```env
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
```

### Required Scopes

The app requests these scopes:
- `user-read-recently-played` - Recent listening history
- `user-top-read` - Top artists and tracks
- `user-read-playback-state` - Current playback info
- `user-read-private` - Account details
- `user-library-read` - Saved tracks/albums

### Testing

1. Start the backend: `npm run server:dev`
2. Navigate to `/get-started` or Connect Data page
3. Click "Connect Spotify"
4. Authorize the app
5. You should be redirected back with a success message

---

## 2. Google Setup (Calendar)

Google Calendar provides schedule data for context-aware recommendations.

### Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select an existing one
3. In the navigation menu, go to **APIs & Services** > **Enabled APIs & services**
4. Click **+ ENABLE APIS AND SERVICES**
5. Search for and enable:
   - **Google Calendar API**
   - **YouTube Data API v3** (optional, for future features)

### Configure OAuth Consent Screen

1. Go to **APIs & Services** > **OAuth consent screen**
2. Select **External** user type (unless you have a Google Workspace organization)
3. Fill in the required fields:
   - **App name**: Twin AI Learn
   - **User support email**: Your email
   - **Developer contact email**: Your email
4. Click **Save and Continue**
5. On the **Scopes** page, click **Add or Remove Scopes**
6. Add these scopes:
   - `https://www.googleapis.com/auth/calendar.readonly`
   - `https://www.googleapis.com/auth/calendar.events.readonly`
7. Click **Save and Continue**
8. Add test users (your email) while in testing mode
9. Click **Save and Continue**

### Create OAuth Credentials

1. Go to **APIs & Services** > **Credentials**
2. Click **+ CREATE CREDENTIALS** > **OAuth client ID**
3. Select **Web application**
4. Name it: `Twin AI Learn Web Client`
5. Add Authorized redirect URIs:
   - `http://localhost:3001/api/entertainment/oauth/callback`
   - `http://localhost:3001/api/auth/google/callback` (for login)
6. Click **Create**
7. Copy the **Client ID** and **Client Secret**

### Configure Environment

Add to your `.env` file:
```env
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
```

### Required Scopes

The app requests these scopes:
- `calendar.readonly` - Read calendar events
- `calendar.events.readonly` - Read event details

### Testing

1. Start the backend: `npm run server:dev`
2. Navigate to Connect Data page
3. Click "Connect Google Calendar"
4. Select your Google account and authorize
5. You should see upcoming events extracted

---

## 3. Whoop Setup

Whoop provides biometric data (recovery, strain, sleep) for health-aware recommendations.

### Create Developer Account

1. Go to [Whoop Developer Portal](https://developer.whoop.com)
2. Sign up for a developer account
3. Verify your email

### Create Application

1. In the developer portal, go to **My Apps**
2. Click **Create App**
3. Fill in the details:
   - **App Name**: Twin AI Learn
   - **Description**: Digital twin for health-aware insights
   - **Redirect URI**: `http://localhost:3001/api/entertainment/oauth/callback`
4. Click **Create**

### Get Credentials

1. On your app's page, find the **Client ID**
2. Generate or view the **Client Secret**

### Configure Environment

Add to your `.env` file:
```env
WHOOP_CLIENT_ID=your_client_id_here
WHOOP_CLIENT_SECRET=your_client_secret_here
```

### Required Scopes

The app requests these scopes:
- `read:cycles` - Daily cycle data
- `read:recovery` - Recovery scores
- `read:sleep` - Sleep analysis
- `read:workout` - Workout details
- `read:profile` - User profile

### Testing

1. Start the backend: `npm run server:dev`
2. Navigate to Connect Data page
3. Click "Connect Whoop"
4. Log in to your Whoop account and authorize
5. You should see recovery data extracted

---

## Troubleshooting

### Common Issues

#### "Invalid redirect URI"
- Ensure the redirect URI in your OAuth app exactly matches: `http://localhost:3001/api/entertainment/oauth/callback`
- Include the trailing path, no trailing slash
- For production, update to your production URL

#### "Access denied" or "App not verified"
- For Google: Add your email as a test user in OAuth consent screen
- For Spotify: Your app may be in development mode (limited to 25 users)
- For Whoop: Ensure your developer account is approved

#### "Token refresh failed"
- Tokens may have been revoked - disconnect and reconnect the platform
- Check if your credentials are still valid
- Verify ENCRYPTION_KEY hasn't changed

#### "Missing environment variable"
- Ensure all required variables are in `.env`
- Restart the server after changing `.env`
- Check for typos in variable names

### Debug Endpoint

Check OAuth configuration status:
```bash
curl http://localhost:3001/api/entertainment/oauth/debug
```

Response shows which platforms are configured:
```json
{
  "spotify": { "configured": true },
  "google": { "configured": true },
  "whoop": { "configured": false }
}
```

### Logs

Check server logs for detailed error messages:
```bash
npm run server:dev
```

OAuth-related logs are prefixed with `[OAuth]` or `[Entertainment]`.

---

## Production Deployment

### Update Redirect URIs

For each platform, add your production redirect URI:
```
https://your-domain.com/api/entertainment/oauth/callback
```

### Environment Variables

Ensure production environment has:
- All OAuth credentials
- Unique ENCRYPTION_KEY (different from development)
- JWT_SECRET for authentication

### Security Checklist

- [ ] Never commit `.env` file to version control
- [ ] Use different credentials for dev/staging/production
- [ ] Rotate secrets if compromised
- [ ] Use HTTPS in production
- [ ] Review OAuth scopes - request minimum necessary

---

## Quick Reference

| Platform | Developer Portal | Callback URL |
|----------|-----------------|--------------|
| Spotify | [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) | `/api/entertainment/oauth/callback` |
| Google | [console.cloud.google.com](https://console.cloud.google.com) | `/api/entertainment/oauth/callback` |
| Whoop | [developer.whoop.com](https://developer.whoop.com) | `/api/entertainment/oauth/callback` |

### Environment Variables Summary

```env
# Spotify
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=

# Google
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Whoop
WHOOP_CLIENT_ID=
WHOOP_CLIENT_SECRET=

# Token Encryption
ENCRYPTION_KEY=
```
