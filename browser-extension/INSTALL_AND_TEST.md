# Soul Signature Collector - Installation & Testing Guide

## ✅ Extension Ready for Installation

All files validated and icons generated. Extension is ready to load in Chrome!

---

## 🚀 Quick Installation (2 Minutes)

### Step 1: Open Chrome Extensions Page
1. Open Google Chrome
2. Navigate to: `chrome://extensions/`
3. Enable **"Developer mode"** (toggle switch in top-right corner)

### Step 2: Load Extension
1. Click **"Load unpacked"** button (top-left)
2. Navigate to and select this folder:
   ```
   C:\Users\stefa\twin-ai-learn\browser-extension
   ```
3. Click "Select Folder"

### Step 3: Verify Installation
You should now see:
- ✅ Extension card: **"Soul Signature Collector v1.0.0"**
- ✅ Orange "S" icon in Chrome toolbar
- ✅ Status: "No errors"

---

## 🔌 Connect Extension to Twin AI Learn

### Prerequisites:
Ensure both servers are running:
```bash
# Terminal 1: Frontend (http://localhost:8086)
npm run dev

# Terminal 2: Backend (http://localhost:3001)
npm run server:dev
```

### Connection Flow:

1. **Click Extension Icon**
   - Look for orange "S" icon in Chrome toolbar
   - Click it to open popup

2. **Connect to Twin AI Learn**
   - Popup shows: "Not connected to Twin AI Learn"
   - Click button: **"Connect to Twin AI Learn"**

3. **Authenticate**
   - New tab opens: `http://localhost:8086/extension-auth`
   - If not logged in: redirects to login page
   - If logged in: shows "Extension Connected!" success message
   - Tab auto-closes after 2 seconds

4. **Verify Connection**
   - Click extension icon again
   - Status should now show: **"✓ Connected to Twin AI Learn"**
   - Button changed to: "Disconnect"

---

## 🎬 Test Data Capture

### Test 1: Netflix Capture

1. **Visit Netflix**
   ```
   https://www.netflix.com
   ```

2. **Play Any Video**
   - Start playing any show or movie
   - Extension automatically captures:
     - Video title
     - Duration
     - Timestamp
     - Event type (video_start, video_pause, video_end)

3. **Check Extension Popup**
   - Click extension icon
   - You should see: **"Netflix: 1 item"** (or more)

4. **Verify in Database**
   ```sql
   SELECT
     platform,
     data_type,
     raw_data->>'title' as title,
     raw_data->>'eventType' as event_type,
     created_at
   FROM soul_data
   WHERE platform = 'netflix'
   AND data_type LIKE 'extension_%'
   ORDER BY created_at DESC
   LIMIT 5;
   ```

### Test 2: YouTube Capture

1. **Visit YouTube**
   ```
   https://www.youtube.com
   ```

2. **Play Any Video**
   - Extension captures:
     - Video title
     - Channel name
     - Duration
     - Timestamp

3. **Check Extension Popup**
   - Should show: **"YouTube: X items"**

4. **Manually Sync**
   - Click **"Sync Data Now"** button in popup
   - Button changes to "Syncing..."
   - Then "✓ Synced!" for 2 seconds
   - Returns to "Sync Data Now"

### Test 3: Reddit Capture

1. **Visit Reddit**
   ```
   https://www.reddit.com
   ```

2. **Browse Subreddits**
   - Extension captures:
     - Subreddit names
     - Post titles
     - Time spent
     - Engagement patterns

3. **Check Total Count**
   - Extension popup shows:
     - Netflix: X items
     - YouTube: Y items
     - Reddit: Z items
     - **Total: X+Y+Z items**

---

## 🔍 Debugging & Troubleshooting

### View Extension Console Logs

**Service Worker (Background Script):**
1. Go to `chrome://extensions/`
2. Find "Soul Signature Collector"
3. Click **"service worker"** link
4. DevTools opens showing service worker console

**Content Scripts:**
1. Open DevTools on Netflix/YouTube/Reddit page (F12)
2. Check Console tab
3. Look for messages like:
   - `[Netflix Collector] Initialized`
   - `[Service Worker] Received message: CAPTURE_NETFLIX_DATA`
   - `[API] Data sent successfully`

**Extension Popup:**
1. Right-click extension icon
2. Select **"Inspect popup"**
3. DevTools opens for popup page

### Common Issues

**Issue: Extension icon not showing**
- Solution: Refresh extensions page (`chrome://extensions/`)
- Verify icons exist: `browser-extension/assets/icon-*.svg`

**Issue: "Not connected" status persists**
- Check backend server running on port 3001
- Try disconnect → reconnect flow
- Check browser console for errors

**Issue: No data being captured**
- Open content script console (F12 on platform page)
- Verify content script injected (check Sources tab)
- Look for error messages in console
- Ensure you're on correct URL (https://www.netflix.com, not http)

**Issue: Data not syncing to backend**
- Check service worker console
- Verify auth token in chrome.storage
- Test API endpoint manually with curl
- Check network tab for failed requests

### Manual Token Inspection

Check if auth token is stored:
```javascript
// Run in service worker console
chrome.storage.local.get(['auth_token', 'auth_expiry'], console.log);
```

---

## 📊 Test Coverage Checklist

### Backend API Tests
- ✅ POST /api/extension/capture/:platform (Single capture)
- ✅ POST /api/extension/batch (Batch sync)
- ✅ GET /api/extension/stats (Statistics)
- ✅ DELETE /api/extension/clear/:platform (Clear data)

### Frontend Tests
- ✅ Extension auth page loads correctly
- ✅ Success state displays
- ✅ Auto-close works
- ✅ Design system applied

### Extension Structure
- ✅ Manifest V3 valid
- ✅ Service worker exists
- ✅ All content scripts present
- ✅ Popup UI files exist
- ✅ Icons generated

### Manual Testing Required
- ⏳ Install extension in Chrome
- ⏳ Connect to Twin AI Learn
- ⏳ Test Netflix data capture
- ⏳ Test YouTube data capture
- ⏳ Test Reddit data capture
- ⏳ Verify database storage
- ⏳ Test manual sync
- ⏳ Test periodic sync (wait 30 minutes)

---

## 🎯 Expected Results

After successful installation and testing, you should have:

1. **Extension Installed**
   - Visible in `chrome://extensions/`
   - Orange "S" icon in toolbar
   - No manifest errors

2. **Connected to Backend**
   - Popup shows connected status
   - Auth token stored in chrome.storage
   - Can manually trigger sync

3. **Data Capturing**
   - Content scripts inject on Netflix/YouTube/Reddit
   - Events captured and stored locally
   - Data syncs to backend API
   - Database has extension records

4. **Database Records**
   ```sql
   -- Should return captured events
   SELECT COUNT(*) FROM soul_data WHERE data_type LIKE 'extension_%';
   ```

---

## 📈 Performance Metrics

### Expected Behavior:
- **Content Script Injection**: < 100ms
- **Event Capture**: Immediate (synchronous)
- **Local Storage**: < 10ms
- **Backend Sync**: < 500ms per event
- **Batch Sync**: < 2s for 100 events
- **Token Refresh**: Automatic every 60 minutes

### Resource Usage:
- **Memory**: ~ 15-30 MB (service worker + content scripts)
- **CPU**: Minimal (< 1% during capture)
- **Storage**: Chrome storage (unlimited for extensions)
- **Network**: Only when syncing to backend

---

## 🔐 Security Checklist

- ✅ HTTPS-only host permissions
- ✅ JWT authentication for all API calls
- ✅ Local-first storage (offline resilience)
- ✅ No third-party domains
- ✅ Secure token storage (chrome.storage.local)
- ✅ No eval() or dangerous functions
- ✅ Content Security Policy compliant

---

## 📝 Next Steps After Testing

1. **Verify All Features**
   - All 3 platforms capture data
   - Manual sync works
   - Stats display correctly
   - Database persistence confirmed

2. **Production Checklist**
   - Convert SVG icons to PNG (better compatibility)
   - Add error tracking (Sentry integration)
   - Implement analytics (usage metrics)
   - Add user feedback form
   - Create Chrome Web Store listing

3. **Feature Enhancements**
   - Add more platforms (Instagram, TikTok, Twitch)
   - Implement advanced analytics
   - Add privacy controls per platform
   - Create data export feature
   - Build visualization dashboard

---

## 🎉 Success Criteria

Extension is successfully installed and working when:

- ✅ Extension visible in Chrome toolbar
- ✅ Popup opens without errors
- ✅ Connection to Twin AI Learn successful
- ✅ Netflix data captured and stored in database
- ✅ YouTube data captured and stored in database
- ✅ Reddit data captured and stored in database
- ✅ Manual sync completes successfully
- ✅ Stats display correct counts
- ✅ No console errors in any component

---

**Ready to install?** Follow Step 1-3 above to get started!

For issues or questions, check the service worker console at `chrome://extensions/`.
