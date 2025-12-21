# Quick Start: Soul Data Extraction Integration

Fast-track guide to get the Soul Data Extraction system running.

---

## Step 1: Register OAuth Apps (Required)

Follow the comprehensive guide for each platform you want to support:

📘 **Complete Guide**: `OAUTH_REGISTRATION_COMPLETE_GUIDE.md`

**Priority Platforms** (Start with these):
1. ✅ **Spotify** - Musical taste analysis (15 min)
2. ✅ **YouTube** - Learning & curiosity profiling (20 min)
3. ✅ **GitHub** - Technical skills & coding patterns (10 min)

**Optional Platforms**:
- Discord - Community involvement
- Reddit - Discussion style
- Twitch - Streaming preferences

---

## Step 2: Configure Environment Variables

Add OAuth credentials to `.env`:

```env
# Spotify
SPOTIFY_CLIENT_ID=your-spotify-client-id
SPOTIFY_CLIENT_SECRET=your-spotify-client-secret

# YouTube (Google OAuth)
YOUTUBE_CLIENT_ID=your-google-client-id
YOUTUBE_CLIENT_SECRET=your-google-client-secret

# GitHub
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
```

---

## Step 3: Register API Routes

Add the new endpoints to your server:

**File**: `api/server.js`

```javascript
// Add this import
import soulDataEndpoints from './routes/soul-data-endpoints.js';

// Register routes (add with other route registrations)
app.use('/api/soul-data', soulDataEndpoints);
```

---

## Step 4: Start Development Servers

```bash
# Terminal 1: Start backend
npm run server:dev

# Terminal 2: Start frontend
npm run dev
```

---

## Step 5: Test Platform Connections

1. **Navigate to Platform Connect Page**:
   ```
   http://localhost:8086/connect-platforms
   ```

2. **Connect Platforms**:
   - Click "Connect Spotify"
   - Authorize with Spotify account
   - Repeat for other platforms

3. **Verify Connections**:
   ```bash
   # Check database
   # platform_connections table should have entries
   ```

---

## Step 6: Test Data Extraction

### Option A: Via Frontend

Navigate to Soul Signature Dashboard and trigger extraction.

### Option B: Via API (Direct Testing)

```bash
# Extract from Spotify
curl -X POST http://localhost:3001/api/soul-data/extract/spotify \
  -H "Content-Type: application/json" \
  -d '{"userId":"YOUR_USER_ID"}'

# Extract from all connected platforms
curl -X POST http://localhost:3001/api/soul-data/extract-all \
  -H "Content-Type: application/json" \
  -d '{"userId":"YOUR_USER_ID"}'

# Check extraction status
curl http://localhost:3001/api/soul-data/status/YOUR_USER_ID
```

---

## Step 7: Run Test Suite

```bash
# Run mock data tests (no backend required)
node test-soul-extraction.js

# Run with backend (integration tests)
TEST_USER_ID=your-user-id node test-soul-extraction.js
```

**Expected Output**:
```
🧪 Starting Mock Data Pattern Tests...

  ✅ Genre diversity calculation valid: 0.87
  ✅ Mood score normalization valid: 0.7
  ✅ Learning ratio valid: 0.5
  ✅ Language diversity calculation valid: 0.85
  ✅ Engagement level classification valid
  ✅ Binge pattern detection valid: heavy-binger
  ✅ SoulDataPoint structure valid

================================================================================
📋 TEST SUITE SUMMARY
================================================================================

✅ Mock Data Tests: Pattern validation and calculation logic
✅ API Integration Tests: Endpoint functionality (requires backend)
✅ Error Handling Tests: Token expiration, rate limits, validation
✅ Data Quality Tests: Quality scoring and threshold validation
```

---

## API Endpoints Reference

### Extract from Single Platform

**Endpoint**: `POST /api/soul-data/extract/:platform`

**Platforms**: `spotify`, `youtube`, `github`, `discord`, `reddit`, `twitch`, `netflix`

**Request**:
```json
{
  "userId": "123e4567-e89b-12d3-a456-426614174000"
}
```

**Success Response** (200):
```json
{
  "success": true,
  "data": {
    "platform": "spotify",
    "extractedPatterns": {
      "topGenres": [...],
      "moodScore": 0.75
    },
    "quality": "high"
  },
  "message": "spotify data extracted successfully"
}
```

**Error Responses**:
- `404` - Platform not connected
- `401` - Token expired
- `429` - Rate limited

---

### Extract from All Platforms

**Endpoint**: `POST /api/soul-data/extract-all`

**Request**:
```json
{
  "userId": "123e4567-e89b-12d3-a456-426614174000"
}
```

**Response**:
```json
{
  "success": true,
  "summary": [
    { "platform": "spotify", "status": "fulfilled", "data": {...} },
    { "platform": "github", "status": "rejected", "error": "TOKEN_EXPIRED" }
  ],
  "successCount": 1,
  "failureCount": 1,
  "totalPlatforms": 2
}
```

---

### Get Extraction Status

**Endpoint**: `GET /api/soul-data/status/:userId`

**Response**:
```json
{
  "success": true,
  "platforms": [
    {
      "platform": "spotify",
      "connected": true,
      "tokenExpired": false,
      "lastExtraction": "2025-01-13T12:00:00Z",
      "dataQuality": "high"
    }
  ],
  "totalConnected": 3
}
```

---

## Frontend Integration Example

```typescript
// src/services/soulDataService.ts

export async function extractPlatformData(platform: string, userId: string) {
  const response = await fetch(
    `${import.meta.env.VITE_API_URL}/soul-data/extract/${platform}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    }
  );

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Extraction failed');
  }

  return data.data;
}

export async function extractAllPlatforms(userId: string) {
  const response = await fetch(
    `${import.meta.env.VITE_API_URL}/soul-data/extract-all`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    }
  );

  return response.json();
}

export async function getExtractionStatus(userId: string) {
  const response = await fetch(
    `${import.meta.env.VITE_API_URL}/soul-data/status/${userId}`
  );

  return response.json();
}
```

---

## Troubleshooting

### Issue: "Platform not connected"

**Solution**:
1. Navigate to `/connect-platforms`
2. Click "Connect [Platform]"
3. Authorize with platform account
4. Verify connection in database

### Issue: "TOKEN_EXPIRED"

**Solution**:
1. Reconnect platform via frontend
2. Platform should auto-refresh token
3. If persists, check `tokenRefresh.js`

### Issue: API endpoint returns 404

**Solution**:
1. Verify routes are registered in `api/server.js`
2. Check backend is running on port 3001
3. Verify endpoint path is correct

### Issue: Tests fail with "backend not running"

**Solution**:
```bash
# Start backend first
npm run server:dev

# Then run tests
node test-soul-extraction.js
```

---

## File Locations

```
twin-ai-learn/
├── api/
│   ├── routes/
│   │   └── soul-data-endpoints.js          ← API endpoints
│   └── services/
│       └── soulDataExtraction.js           ← Extraction service
│
├── test-soul-extraction.js                 ← Test suite
├── OAUTH_REGISTRATION_COMPLETE_GUIDE.md    ← OAuth setup guide
├── SOUL_DATA_EXTRACTION_INTEGRATION_COMPLETE.md  ← Full documentation
└── QUICK_START_SOUL_EXTRACTION.md          ← This file
```

---

## Next Steps

1. **Register OAuth Apps** (Priority)
   - [ ] Spotify (15 min)
   - [ ] YouTube (20 min)
   - [ ] GitHub (10 min)

2. **Configure Environment**
   - [ ] Add credentials to `.env`
   - [ ] Restart backend server

3. **Test Integration**
   - [ ] Connect platforms via frontend
   - [ ] Trigger extraction
   - [ ] Verify data in database

4. **Production Deployment**
   - [ ] Register production OAuth apps
   - [ ] Update production redirect URIs
   - [ ] Deploy to Vercel/production

---

## Time Estimate

- **OAuth Registration**: 45-60 minutes (for 3 platforms)
- **Environment Setup**: 5 minutes
- **Testing**: 15 minutes
- **Total**: ~1-1.5 hours

---

## Support

**Documentation**:
- Full details: `SOUL_DATA_EXTRACTION_INTEGRATION_COMPLETE.md`
- OAuth guide: `OAUTH_REGISTRATION_COMPLETE_GUIDE.md`

**Common Issues**: See Troubleshooting section in main documentation

---

**Quick Start Complete!** 🚀

You now have a fully integrated soul data extraction system with:
✅ 3 production-ready API endpoints
✅ Comprehensive test suite
✅ Complete OAuth registration guide
