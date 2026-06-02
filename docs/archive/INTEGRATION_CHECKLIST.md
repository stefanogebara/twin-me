# Pipedream Gmail Integration - Quick Integration Checklist

Follow these steps to integrate the Pipedream Gmail OAuth code into your Twin AI Learn project.

## 1. Environment Variables

Add to `.env`:
```env
# Pipedream Gmail Integration
PIPEDREAM_PROJECT_ID=your-pipedream-project-id-here
PIPEDREAM_PROJECT_KEY=your-pipedream-oauth-secret-here
PIPEDREAM_ENVIRONMENT=development
```

## 2. Backend Integration

### A. Add Route to Server

**File:** `api/server.js`

Add import (around line 196):
```javascript
import pipedreamGmailRoutes from './routes/pipedream-gmail.js';
```

Add route registration (around line 232):
```javascript
app.use('/api/pipedream-gmail', pipedreamGmailRoutes);
```

### B. Update Database Service

**Option 1:** Merge into existing `api/services/database.js`

Copy the functions from `api/services/database-gmail-helpers.js` into your existing `database.js` file.

**Option 2:** Import as separate module

```javascript
import { serverDb as gmailDb } from './services/database-gmail-helpers.js';
```

Then in `pipedream-gmail.js`, change:
```javascript
import { serverDb } from '../services/database.js';
```
to:
```javascript
import { serverDb } from '../services/database-gmail-helpers.js';
```

## 3. Frontend Integration

### A. Add OAuth Callback Route

**File:** `src/App.tsx` (or your main routing file)

Add import:
```tsx
import GmailCallback from './pages/oauth/GmailCallback';
```

Add route:
```tsx
<Route path="/oauth/gmail/callback" element={<GmailCallback />} />
```

### B. Update Gmail Connect Component

**File:** Your onboarding router

Replace:
```tsx
import Step4ConnectGmail from './pages/onboarding/Step4ConnectGmail';
```

With:
```tsx
import Step4ConnectGmail from './pages/onboarding/Step4ConnectGmailNew';
```

Or manually copy the contents of `Step4ConnectGmailNew.tsx` over the existing `Step4ConnectGmail.tsx`

## 4. Database Tables

Ensure these tables exist in Supabase:

### `platform_connections` table:
```sql
CREATE TABLE IF NOT EXISTS platform_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  account_id TEXT,
  connected_at TIMESTAMP,
  last_sync TIMESTAMP,
  status TEXT DEFAULT 'connected',
  metadata JSONB DEFAULT '{}',
  UNIQUE(user_id, platform)
);

CREATE INDEX idx_platform_connections_user ON platform_connections(user_id);
CREATE INDEX idx_platform_connections_platform ON platform_connections(platform);
```

### `soul_data` table:
```sql
CREATE TABLE IF NOT EXISTS soul_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  data_type TEXT NOT NULL,
  raw_data JSONB DEFAULT '{}',
  extracted_patterns JSONB DEFAULT '{}',
  privacy_level INT DEFAULT 50,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_soul_data_user ON soul_data(user_id);
CREATE INDEX idx_soul_data_platform ON soul_data(platform);
CREATE INDEX idx_soul_data_type ON soul_data(data_type);
```

## 5. Pipedream Setup

1. **Create Project**: [pipedream.com/connect](https://pipedream.com/connect)
2. **Add Gmail App**: Configure OAuth scopes
3. **Get Credentials**: Copy Project ID and OAuth Secret to `.env`
4. **Set Redirect URI**: `http://127.0.0.1:8086/oauth/gmail/callback`

## 6. Google Cloud Setup

1. **Enable Gmail API**: [console.cloud.google.com](https://console.cloud.google.com)
2. **Create OAuth Client**: Web application type
3. **Add Redirect URI**: `http://127.0.0.1:8086/oauth/gmail/callback`
4. **Update Pipedream**: Add Google credentials to Pipedream Gmail app config

## 7. Test

```bash
# Start servers
npm run dev:full

# Navigate to
http://localhost:8086/onboarding/gmail

# Click "Connect Gmail"
# Should open popup with Pipedream OAuth flow
```

## Files Reference

### Created Files:
- `api/routes/pipedream-gmail.js` - Main API endpoints
- `api/services/gmail-extractor.js` - Gmail data extraction
- `api/services/email-analyzer.js` - Claude analysis
- `api/services/database-gmail-helpers.js` - Database helpers
- `src/pages/onboarding/Step4ConnectGmailNew.tsx` - Updated connect page
- `src/pages/oauth/GmailCallback.tsx` - OAuth callback handler
- `PIPEDREAM_GMAIL_SETUP.md` - Full documentation

### Modified Files Needed:
- `api/server.js` - Add route registration
- `src/App.tsx` - Add OAuth callback route
- `.env` - Add Pipedream credentials

## Troubleshooting

### "PIPEDREAM_PROJECT_ID not configured"
- Check `.env` file has correct values
- Restart backend server after adding env vars

### Popup blocked
- Allow popups for localhost:8086

### "Failed to retrieve access token"
- Verify Pipedream Gmail app is properly configured
- Check Google OAuth credentials in Pipedream

### Database errors
- Run SQL migrations to create tables
- Check Supabase connection in `.env`

---

**Time to Complete:** ~30 minutes

**Questions?** See `PIPEDREAM_GMAIL_SETUP.md` for full documentation
