# Soul Signature Collector - Chrome Extension Installation Guide

## Quick Installation (5 Minutes)

### Step 1: Load Extension in Chrome

1. Open Chrome browser
2. Navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top-right corner)
4. Click **"Load unpacked"** button
5. Navigate to and select this folder:
   ```
   C:\Users\stefa\twin-ai-learn\browser-extension
   ```
6. Extension will appear with name **"Soul Signature Collector"**

### Step 2: Connect to Twin AI Learn

1. Ensure both servers are running:
   ```bash
   # Frontend: http://localhost:8086
   npm run dev

   # Backend: http://localhost:3001
   npm run server:dev
   ```

2. Click the extension icon in Chrome toolbar
3. You'll see the popup with:
   - Status: "Not connected to Twin AI Learn"
   - Button: "Connect to Twin AI Learn"

4. Click **"Connect to Twin AI Learn"**
   - Opens `http://localhost:8086/extension-auth` in new tab
   - If not logged in, redirects to login page
   - After login, shows "Extension Connected!" success message
   - Window auto-closes after 2 seconds

### Step 3: Test Data Capture

Visit any of these platforms to test data capture:

**Netflix**:
- Go to `https://www.netflix.com`
- Play any video
- Extension captures: title, duration, timestamp, genre

**YouTube**:
- Go to `https://www.youtube.com`
- Play any video
- Extension captures: title, channel, duration, timestamp

**Reddit**:
- Go to `https://www.reddit.com`
- Browse any subreddit
- Extension captures: subreddit, post titles, time spent

### Step 4: Verify Data Captured

**In Extension Popup**:
- Click extension icon
- See capture counts:
  - Netflix: X items
  - YouTube: Y items
  - Reddit: Z items
  - Total: X+Y+Z items

**Manual Sync**:
- Click "Sync Data Now" button
- Data syncs to backend immediately
- Check database for captured data

**In Database**:
```sql
SELECT
  id,
  platform,
  data_type,
  raw_data->>'title' as title,
  raw_data->>'eventType' as event_type,
  created_at
FROM soul_data
WHERE data_type LIKE 'extension_%'
ORDER BY created_at DESC
LIMIT 10;
```

## Backend API Endpoints

All tested and working:

### 1. Single Capture
```bash
POST http://localhost:3001/api/extension/capture/:platform
Headers: Authorization: Bearer <token>
Body: { "title": "...", "eventType": "..." }
```

### 2. Batch Sync
```bash
POST http://localhost:3001/api/extension/batch
Headers: Authorization: Bearer <token>
Body: { "platform": "netflix", "events": [...] }
```

### 3. Get Stats
```bash
GET http://localhost:3001/api/extension/stats
Headers: Authorization: Bearer <token>
Response: { "total": 5, "by_platform": {...}, "recent_activity": [...] }
```

### 4. Clear Platform Data
```bash
DELETE http://localhost:3001/api/extension/clear/:platform
Headers: Authorization: Bearer <token>
```

## Automatic Features

- **Auto-Sync**: Every 30 minutes, locally stored data syncs to backend
- **Token Refresh**: Every 60 minutes, checks if token needs refresh
- **Local Storage**: Keeps last 100 items per platform as backup
- **Offline Mode**: Captures data even without internet, syncs when online

## Troubleshooting

### Extension Not Showing Up
- Check that Developer mode is enabled
- Verify you selected the correct folder: `browser-extension`
- Look for errors in `chrome://extensions/` under the extension

### "Not Connected" Status
- Ensure backend server is running on `http://localhost:3001`
- Click "Connect to Twin AI Learn" and complete auth flow
- Check browser console for errors

### Data Not Capturing
- Open DevTools (F12) on the platform page
- Check Console tab for extension logs
- Look for messages like `[Netflix] Captured data:`
- Verify content script injected (check Sources tab)

### Auth Token Issues
- Click extension icon
- Click "Disconnect" button
- Click "Connect to Twin AI Learn" again
- Complete fresh authentication

## Extension Architecture

```
browser-extension/
├── manifest.json              # Manifest V3 config
├── src/
│   ├── popup/                 # Extension popup UI
│   │   ├── popup.html
│   │   ├── popup.js
│   │   └── popup.css
│   ├── content/               # Platform content scripts
│   │   ├── netflix.js         # Netflix capture
│   │   ├── youtube.js         # YouTube capture
│   │   └── reddit.js          # Reddit capture
│   ├── background/            # Background service worker
│   │   └── service-worker.js  # Message handler & API calls
│   └── auth/                  # Authentication module
│       └── auth-handler.js    # OAuth token management
```

## Privacy & Security

- **Local-First**: All data stored locally first
- **Encrypted Storage**: Chrome storage API with encryption
- **User Control**: Full transparency, can clear data anytime
- **No Third-Party**: Data only sent to Twin AI Learn backend
- **Opt-In**: Only captures when user is authenticated

## Next Steps

After successful installation:

1. ✅ Connect extension to Twin AI Learn
2. ✅ Visit Netflix, YouTube, Reddit to capture data
3. ✅ View stats in extension popup
4. ✅ Verify data in database
5. 🚀 Build more platform connectors
6. 🚀 Add Instagram, TikTok support
7. 🚀 Implement advanced privacy controls

---

**Need Help?** Check console logs in:
- Extension popup DevTools: Right-click popup → Inspect
- Background service worker: `chrome://extensions/` → Soul Signature Collector → "service worker"
- Content scripts: DevTools on platform page (F12)
