# Pipedream Gmail Integration Setup Guide

This guide will walk you through setting up Pipedream Connect for Gmail OAuth in the Twin AI Learn project.

## Overview

The Pipedream Gmail integration provides:
- OAuth popup/modal for Gmail permissions (like Cofounder)
- Secure token management via Pipedream Connect
- Email data extraction (last 50-100 emails)
- AI-powered communication style analysis using Claude
- Privacy-first approach (metadata only, no full email content)

## Prerequisites

1. **Pipedream Account**: Sign up at [pipedream.com](https://pipedream.com)
2. **Google Cloud Project**: For Gmail API credentials
3. **Anthropic API Key**: For email style analysis
4. **Node.js & npm**: Already installed in this project

## Step 1: Create Pipedream Connect Project

1. Go to [pipedream.com/connect](https://pipedream.com/connect)
2. Click "Create Project"
3. Project Name: **"Twin AI Learn Gmail"**
4. Copy your:
   - **Project ID** (e.g., `proj_abc123`)
   - **OAuth Secret** (e.g., `pd_oauth_secret_xyz...`)

## Step 2: Configure Gmail App in Pipedream

1. In your Pipedream Connect project, click "Add App"
2. Search for and select **"Gmail"**
3. Configure OAuth Scopes:
   ```
   https://www.googleapis.com/auth/gmail.readonly
   https://www.googleapis.com/auth/gmail.metadata
   https://www.googleapis.com/auth/userinfo.email
   https://www.googleapis.com/auth/userinfo.profile
   ```
4. Set OAuth Redirect URI:
   - **Development**: `http://127.0.0.1:8086/oauth/gmail/callback`
   - **Production**: `https://your-domain.com/oauth/gmail/callback`

## Step 3: Create Google Cloud OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create or select a project
3. Enable **Gmail API**:
   - Go to "APIs & Services" > "Library"
   - Search for "Gmail API"
   - Click "Enable"
4. Create OAuth 2.0 Credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Application type: **Web application**
   - Name: "Twin AI Learn Gmail"
   - Authorized redirect URIs:
     ```
     http://127.0.0.1:8086/oauth/gmail/callback
     http://localhost:8086/oauth/gmail/callback
     ```
5. Copy your:
   - **Client ID** (e.g., `298873888709-...googleusercontent.com`)
   - **Client Secret** (e.g., `GOCSPX-...`)

## Step 4: Configure Pipedream with Google Credentials

1. Back in Pipedream Connect project
2. Go to Gmail app settings
3. Enter your Google OAuth credentials:
   - **Client ID**: (from Google Cloud Console)
   - **Client Secret**: (from Google Cloud Console)
4. Save configuration

## Step 5: Update Environment Variables

Add the following to your `.env` file:

```env
# ========================================
# PIPEDREAM GMAIL INTEGRATION
# ========================================

# Pipedream Connect Credentials
# Get these from: https://pipedream.com/connect
PIPEDREAM_PROJECT_ID=proj_YOUR_PROJECT_ID_HERE
PIPEDREAM_PROJECT_KEY=pd_oauth_secret_YOUR_SECRET_HERE
PIPEDREAM_ENVIRONMENT=development

# Gmail OAuth (Google Cloud Console)
# Already configured in existing .env:
# GOOGLE_CLIENT_ID=298873888709-...
# GOOGLE_CLIENT_SECRET=GOCSPX-...

# Anthropic API (for email analysis)
# Already configured:
# ANTHROPIC_API_KEY=sk-ant-api03-...
```

## Step 6: Register Backend Route

Add the Pipedream Gmail route to `api/server.js`:

```javascript
// Import the route
import pipedreamGmailRoutes from './routes/pipedream-gmail.js';

// Register the route (add with other app.use() statements)
app.use('/api/pipedream-gmail', pipedreamGmailRoutes);
```

## Step 7: Register Frontend Callback Route

Add the Gmail callback route to your React Router configuration:

```tsx
// In src/App.tsx or your routing file
import GmailCallback from './pages/oauth/GmailCallback';

// Add route
<Route path="/oauth/gmail/callback" element={<GmailCallback />} />
```

## Step 8: Update Component Reference

Replace the old Gmail connect component with the new Pipedream version:

```tsx
// In your onboarding router file
import Step4ConnectGmail from './pages/onboarding/Step4ConnectGmailNew';

// Use in route
<Route path="/onboarding/gmail" element={<Step4ConnectGmail />} />
```

## Step 9: Test the Integration

### 1. Start Development Servers

```bash
# Terminal 1: Start backend
npm run server:dev

# Terminal 2: Start frontend
npm run dev
```

### 2. Navigate to Gmail Connect Page

```
http://localhost:8086/onboarding/gmail
```

### 3. Click "Connect Gmail"

You should see:
1. A popup window opens
2. Pipedream OAuth consent screen
3. Google sign-in and permission grant
4. Success message
5. Popup closes automatically
6. Redirected to analysis page

### 4. Check Console Logs

**Frontend Console:**
```
🔵 [Gmail Connect] Initiating Pipedream OAuth...
✅ [Gmail Connect] Opening Pipedream OAuth popup...
✅ [Gmail Connect] OAuth successful!
```

**Backend Console:**
```
🔵 [Pipedream Gmail] Initiating OAuth for user: [userId]
✅ [Pipedream Gmail] Generated OAuth URL
🟢 [Pipedream Gmail] OAuth callback received
✅ [Pipedream Gmail] Connection saved to database
```

### 5. Test Email Extraction

```bash
# Make API request to extract emails
curl -X POST http://localhost:3001/api/pipedream-gmail/extract \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"limit": 50}'
```

Expected response:
```json
{
  "success": true,
  "data": {
    "emailCount": 50,
    "analysis": {
      "communicationStyle": {
        "overallTone": "Professional",
        "formalityLevel": 7,
        "traits": {
          "responsiveness": {
            "score": 85,
            "category": "Highly Responsive"
          }
        }
      }
    }
  }
}
```

## Troubleshooting

### Error: "Pipedream Connect is not configured"

**Solution:** Check that `PIPEDREAM_PROJECT_ID` and `PIPEDREAM_PROJECT_KEY` are set in `.env`

```bash
# Verify environment variables
echo $PIPEDREAM_PROJECT_ID
echo $PIPEDREAM_PROJECT_KEY
```

### Error: "Popup blocked"

**Solution:** Allow popups for localhost:8086 in your browser settings

### Error: "Failed to retrieve access token"

**Solution:** Verify Pipedream project configuration:
1. Gmail app is properly configured in Pipedream
2. Google OAuth credentials are correct
3. Redirect URI matches exactly

### Error: "Gmail API error: 403"

**Solution:** Enable Gmail API in Google Cloud Console

### Error: "Claude API rate limit exceeded"

**Solution:** Wait a few minutes or check your Anthropic API tier limits

## Database Schema

The integration uses these tables:

### `platform_connections`
```sql
CREATE TABLE platform_connections (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  platform TEXT, -- 'gmail'
  account_id TEXT, -- Pipedream account ID
  connected_at TIMESTAMP,
  status TEXT, -- 'connected', 'disconnected'
  metadata JSONB
);
```

### `soul_data`
```sql
CREATE TABLE soul_data (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  platform TEXT, -- 'gmail'
  data_type TEXT, -- 'email_communication'
  raw_data JSONB,
  extracted_patterns JSONB,
  privacy_level INT -- 0-100
);
```

## API Endpoints

### `POST /api/pipedream-gmail/connect`
Initiate Pipedream Gmail OAuth flow

**Request:**
```json
{
  "returnUrl": "/onboarding/analysis"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "oauthUrl": "https://connect.pipedream.com/oauth/connect?...",
    "state": "base64_encoded_state"
  }
}
```

### `POST /api/pipedream-gmail/callback`
Handle OAuth callback from Pipedream

**Request:**
```json
{
  "account_id": "pd_acc_...",
  "state": "base64_encoded_state"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "accountId": "pd_acc_...",
    "platform": "gmail",
    "returnUrl": "/onboarding/analysis"
  }
}
```

### `POST /api/pipedream-gmail/extract`
Extract and analyze email data

**Request:**
```json
{
  "limit": 50
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "emailCount": 50,
    "analysis": {
      "communicationStyle": { ... },
      "patterns": { ... },
      "metadata": { ... }
    }
  }
}
```

### `GET /api/pipedream-gmail/status`
Check Gmail connection status

**Response:**
```json
{
  "success": true,
  "data": {
    "connected": true,
    "platform": "gmail",
    "connectedAt": "2025-01-15T10:30:00Z",
    "accountId": "pd_acc_..."
  }
}
```

### `DELETE /api/pipedream-gmail/disconnect`
Disconnect Gmail account

**Response:**
```json
{
  "success": true,
  "message": "Gmail disconnected successfully"
}
```

## Privacy & Security

### Data Collection
- **Metadata only**: Subject lines, timestamps, sender/recipient domains
- **No full content**: Email body content is NOT stored
- **Anonymized**: Recipient information is anonymized to domain level

### Security Features
- OAuth state validation prevents CSRF attacks
- Secure token storage via Pipedream
- JWT authentication required for all API calls
- HTTPS-only in production
- Token refresh handled automatically

### Privacy Controls
- Users can disconnect at any time
- Data deletion available via API
- Default privacy level: 70/100
- Customizable revelation settings

## Architecture

### Flow Diagram

```
User
  |
  +--> [Click "Connect Gmail"]
  |
Frontend (Step4ConnectGmail.tsx)
  |
  +--> POST /api/pipedream-gmail/connect
  |
Backend (pipedream-gmail.js)
  |
  +--> Generate Pipedream OAuth URL
  |
  +--> Return oauthUrl to Frontend
  |
Frontend
  |
  +--> Open popup with Pipedream OAuth URL
  |
Pipedream Connect
  |
  +--> User grants Gmail permissions
  |
  +--> Redirect to /oauth/gmail/callback?account_id=...
  |
Frontend (GmailCallback.tsx)
  |
  +--> POST /api/pipedream-gmail/callback
  |
Backend
  |
  +--> Save connection to database
  |
  +--> Return success
  |
Frontend
  |
  +--> Close popup
  |
  +--> Navigate to analysis page
  |
  +--> POST /api/pipedream-gmail/extract
  |
Backend (gmail-extractor.js)
  |
  +--> Get access token from Pipedream
  |
  +--> Fetch emails via Gmail API
  |
  +--> Parse email metadata
  |
Backend (email-analyzer.js)
  |
  +--> Analyze patterns
  |
  +--> Send to Claude for style analysis
  |
  +--> Store results in soul_data
  |
Frontend (Step7EmailAnalysis.tsx)
  |
  +--> Display analysis results
```

## Production Deployment

### Environment Variables (Vercel)

Add these to your Vercel project settings:

```env
PIPEDREAM_PROJECT_ID=proj_...
PIPEDREAM_PROJECT_KEY=pd_oauth_secret_...
PIPEDREAM_ENVIRONMENT=production
```

### Update Redirect URIs

1. **Pipedream Connect**: Update redirect URI to your production domain
2. **Google Cloud Console**: Add production redirect URI

### Testing in Production

```bash
# Test OAuth flow
curl https://your-domain.com/api/pipedream-gmail/connect

# Test connection status
curl https://your-domain.com/api/pipedream-gmail/status \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Next Steps

1. **Add More Analysis**: Extend email-analyzer.js with additional insights
2. **Real-time Updates**: Implement webhooks for new emails
3. **UI Enhancements**: Add progress indicators, email samples
4. **Multi-account**: Support multiple Gmail accounts per user
5. **Privacy Dashboard**: Let users control exactly what's analyzed

## Support

- **Pipedream Docs**: [pipedream.com/docs/connect](https://pipedream.com/docs/connect)
- **Gmail API Docs**: [developers.google.com/gmail](https://developers.google.com/gmail/api)
- **Anthropic Docs**: [docs.anthropic.com](https://docs.anthropic.com)

## Files Created

### Backend
- `api/routes/pipedream-gmail.js` - Main API endpoints
- `api/services/gmail-extractor.js` - Gmail data extraction
- `api/services/email-analyzer.js` - Claude-powered analysis

### Frontend
- `src/pages/onboarding/Step4ConnectGmailNew.tsx` - Connect page
- `src/pages/oauth/GmailCallback.tsx` - OAuth callback handler
- `src/pages/onboarding/Step7EmailAnalysis.tsx` - Results page (already exists)

### Documentation
- `PIPEDREAM_GMAIL_SETUP.md` - This file

---

**Ready to launch!** Follow the steps above and you'll have Pipedream Gmail OAuth working just like Cofounder.
