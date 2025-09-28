# Google OAuth Setup Guide for Twin Me

## Quick Setup Steps

### 1. Get Your Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable these APIs:
   - Google+ API
   - Gmail API (for Gmail connector)
   - Google Calendar API (for Calendar connector)
   - Google Drive API (for Drive connector)

4. Configure OAuth consent screen:
   - Choose "External" user type
   - Add app name: "Twin Me"
   - Add your email as support contact
   - Add scopes: email, profile, openid, gmail.readonly, calendar.readonly, drive.readonly

5. Create OAuth 2.0 credentials:
   - Type: Web application
   - Name: Twin Me Web Client
   - Authorized JavaScript origins:
     ```
     http://localhost:8086
     http://localhost:3001
     ```
   - Authorized redirect URIs:
     ```
     http://localhost:8086/oauth/callback
     http://localhost:3001/api/auth/oauth/callback
     ```

6. Copy your credentials:
   - Client ID: (looks like: xxxxx.apps.googleusercontent.com)
   - Client Secret: (looks like: GOCSPX-xxxxx)

### 2. Update Your .env File

Open `.env` file and replace with your actual credentials:

```env
# OAuth Configuration
GOOGLE_CLIENT_ID=your-actual-client-id-here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-actual-client-secret-here
```

### 3. Restart the Backend Server

The server should auto-restart if using nodemon, or manually restart:

```bash
# Stop the server (Ctrl+C) and restart
npm run server:dev
```

### 4. Test Google Sign-In

1. Go to http://localhost:8086
2. Click "Sign in with Google"
3. You should be redirected to Google's OAuth consent page
4. After authorizing, you'll be redirected back to Twin Me

## Troubleshooting

### Error: "Google OAuth not configured"
- Make sure you've added your credentials to the .env file
- Restart the backend server after updating .env

### Error: "redirect_uri_mismatch"
- Make sure the redirect URIs in Google Cloud Console match exactly:
  - `http://localhost:8086/oauth/callback`
  - `http://localhost:3001/api/auth/oauth/callback`

### Error: "invalid_grant"
- The authorization code might have expired (they're only valid for a few minutes)
- Try signing in again

### Error: "This app is blocked"
- Your OAuth consent screen might be in testing mode
- Add your email as a test user in Google Cloud Console
- Or publish your app (requires verification for production)

## Production Setup

For production deployment:

1. Add your production domain to authorized origins and redirect URIs
2. Update .env with production URLs
3. Consider implementing refresh token rotation
4. Add proper error handling and logging
5. Secure your credentials using environment variables or secret management

## Security Notes

- **NEVER** commit your .env file with real credentials to Git
- Keep your Client Secret secure
- Use HTTPS in production
- Implement proper session management
- Consider adding rate limiting for OAuth endpoints

## Additional Scopes

If you need more Google services, add these scopes in Google Cloud Console:

- `https://www.googleapis.com/auth/youtube.readonly` - YouTube data
- `https://www.googleapis.com/auth/fitness.activity.read` - Google Fit
- `https://www.googleapis.com/auth/photoslibrary.readonly` - Google Photos
- `https://www.googleapis.com/auth/contacts.readonly` - Google Contacts

## Support

For issues with Google OAuth:
- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Google Cloud Console Help](https://support.google.com/cloud)
- [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/) - for testing