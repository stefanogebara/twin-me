# Soul Observer Debugging Guide

## Current Status

✅ **COMPLETED:**
1. Extension authentication working (token synced to chrome.storage.sync)
2. Extension popup shows "Connected to Soul Signature"
3. Soul Observer can be activated from popup
4. Content script loads on pages (confirmed by console log)
5. Background script has handler for SOUL_OBSERVER_EVENT
6. Backend route `/api/soul-observer/activity` exists with authentication middleware
7. Comprehensive logging added to all components

❌ **BLOCKER:**
Events are not being sent from extension to backend. Backend logs show **ZERO POST requests** to `/api/soul-observer/activity`.

## Enhanced Logging Added

### Content Script (content.js)
Added logging to track:
- Initialization and tracking status
- Session ID creation
- Every event captured with buffer size
- When buffer is full and sendBatch() is triggered
- sendBatch() function execution with batch size
- chrome.runtime.sendMessage responses
- Any Chrome runtime errors

### Background Script (background.js)
Added logging to track:
- When SOUL_OBSERVER_EVENT messages are received from content script
- Auth token availability
- Sample events from batches
- API request details (URL, payload, headers)
- HTTP response status codes
- Backend errors
- Success/failure of data transmission

## Manual Testing Steps

### Step 1: Verify Extension is Loaded and Updated
1. Open Chrome and navigate to `chrome://extensions`
2. Find "Soul Signature" extension
3. Verify "ID: acnofcjjfjaikcfnalggkkbghjaijepc"
4. Click **Reload** button to ensure latest code is loaded
5. Verify no errors shown

### Step 2: Open Extension Popup
1. Click the Soul Signature extension icon in toolbar
2. Verify it shows "Connected to Soul Signature" (green dot)
3. If not connected:
   - Navigate to `http://localhost:8086/auth`
   - Complete Google OAuth flow
   - After redirect, the useExtensionSync hook should automatically sync the token

### Step 3: Enable Soul Observer
1. In the extension popup, find "Soul Observer Mode" section
2. Toggle it ON
3. You should see a confirmation dialog
4. Click "Activate"

### Step 4: Open Browser Console
1. Open a new tab (any website, e.g., https://example.com)
2. Press F12 to open DevTools
3. Go to **Console** tab
4. Clear the console (trash icon)

### Step 5: Monitor Content Script Activity
Look for these console logs:

```
[Soul Observer] Content script loaded
[Soul Observer] Initialized with tracking ENABLED
[Soul Observer] Session ID: <timestamp>_<random>
[Soul Observer] Starting batch sending interval (every 30 seconds)
```

### Step 6: Perform User Interactions
On the test page, perform various interactions:
- Type in any input field
- Move your mouse around
- Click elements
- Scroll up and down
- Switch to another tab and back

You should see console logs like:
```
[Soul Observer] Event captured: typing, buffer size: 1/50
[Soul Observer] Event captured: mouse_move, buffer size: 2/50
[Soul Observer] Event captured: mouse_click, buffer size: 3/50
[Soul Observer] Event captured: scroll, buffer size: 4/50
```

### Step 7: Check if Events are Sent
**Option A: Buffer Full (50 events)**
If you perform 50+ interactions, you should see:
```
[Soul Observer] Buffer full, triggering sendBatch()
[Soul Observer] 📤 Sending batch of 50 events to background script
[Soul Observer] Sample event: { type: 'typing', data: {...}, ... }
[Soul Observer] Background script response: { success: true, result: {...} }
[Soul Observer] ✅ Batch sent successfully
```

**Option B: Wait for Interval (30 seconds)**
After 30 seconds of inactivity, you should see:
```
[Soul Observer] ⏰ Interval tick - buffer has X events
[Soul Observer] Triggering sendBatch() from interval
[Soul Observer] 📤 Sending batch of X events to background script
...
```

### Step 8: Check Background Script Console
1. Go to `chrome://extensions`
2. Find Soul Signature extension
3. Click "service worker" link (this opens background script console)
4. Look for these logs:

```
[Soul Observer] 📥 Received event batch from content script: X events
[Soul Observer] Auth token available: true
[Soul Observer] Sample event from batch: { type: 'typing', ... }
[Soul Observer] sendSoulObserverData called with: X activities
[Soul Observer] 🌐 Sending POST request to: http://localhost:3001/api/soul-observer/activity
[Soul Observer] Request payload: { activitiesCount: X, ... }
[Soul Observer] Response status: 200 OK
[Soul Observer] ✅ Activity data sent to AI for processing successfully
[Soul Observer] Backend result: { success: true, ... }
```

### Step 9: Check Backend Server Logs
In your terminal running the backend server, look for:

```
POST /api/soul-observer/activity
Authentication successful
Received X activities
Stored X events in database
```

### Step 10: Check Database
Query the database to verify events were stored:

```sql
SELECT COUNT(*) FROM soul_observer_events;
SELECT * FROM soul_observer_events ORDER BY timestamp DESC LIMIT 10;
```

## Troubleshooting by Location

### If No Console Logs Appear in Content Script:
**Problem:** Content script not loading
**Solutions:**
- Reload the extension at chrome://extensions
- Make sure you're on a webpage (not chrome:// or extension:// pages)
- Check for JavaScript errors in console
- Verify manifest.json has correct content_scripts configuration

### If "Initialized with tracking DISABLED":
**Problem:** Soul Observer not enabled
**Solutions:**
- Open extension popup
- Toggle Soul Observer Mode ON
- Refresh the page

### If Events Captured But No sendBatch() Call:
**Problem:** sendBatch() not being triggered
**Possible Causes:**
- Buffer not reaching 50 events (perform more interactions)
- 30-second interval not working (wait at least 35 seconds)
- JavaScript error in content.js (check console for errors)

**Check:**
```javascript
// Manually trigger sendBatch() in browser console
chrome.runtime.sendMessage({type: 'SOUL_OBSERVER_EVENT', data: [{test: 'event'}]}, console.log);
```

### If sendBatch() Called But No Response:
**Problem:** Message not reaching background script
**Solutions:**
- Check background script console for errors
- Verify background.js has case 'SOUL_OBSERVER_EVENT' handler
- Check chrome.runtime.lastError in content script console

### If Background Receives But No API Call:
**Problem:** sendSoulObserverData() failing before fetch
**Check:**
- Background script console for "❌ No auth token available!"
- If no auth token, re-authenticate via extension popup

### If API Call Made But Backend Returns Error:
**Problem:** Backend authentication or validation failure
**Check:**
- Backend logs for authentication errors
- Verify JWT token is valid
- Check `/api/soul-observer/activity` route has authenticateUser middleware

### If Backend Receives But Database Shows No Events:
**Problem:** Database insertion failing
**Check:**
- Backend logs for database errors
- Verify Supabase connection
- Check soul_observer_events table exists
- Verify RLS policies allow insert

## Expected Data Flow

```
User Interactions (typing, clicking, scrolling)
    ↓
content.js: captureEvent() → adds to eventBuffer
    ↓
content.js: sendBatch() (when buffer full or interval)
    ↓
chrome.runtime.sendMessage({type: 'SOUL_OBSERVER_EVENT', data: batch})
    ↓
background.js: onMessage listener → case 'SOUL_OBSERVER_EVENT'
    ↓
background.js: sendSoulObserverData({ activities: batch })
    ↓
fetch POST to http://localhost:3001/api/soul-observer/activity
    ↓
Backend: authenticateUser middleware → verify JWT
    ↓
Backend: /api/soul-observer/activity route handler
    ↓
Backend: Insert events into soul_observer_events table
    ↓
Backend: Return { success: true, result: {...} }
    ↓
background.js: sendResponse({ success: true, result })
    ↓
content.js: console.log('✅ Batch sent successfully')
```

## Quick Test Commands

### Test Extension Message Passing:
Open browser console on any page and run:
```javascript
chrome.runtime.sendMessage('acnofcjjfjaikcfnalggkkbghjaijepc',
  { type: 'GET_AUTH_STATUS' },
  (response) => console.log('Auth status:', response)
);
```

### Test Backend API Directly:
```bash
curl -X POST http://localhost:3001/api/soul-observer/activity \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "activities": [{
      "type": "typing",
      "data": {"chars": 5},
      "sessionId": "test_session",
      "url": "https://example.com",
      "pageTitle": "Test",
      "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")'"
    }],
    "insights": [],
    "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")'",
    "source": "soul_observer"
  }'
```

### Query Database Events:
```bash
# Using Supabase CLI
supabase db query "SELECT COUNT(*) FROM soul_observer_events;"
supabase db query "SELECT * FROM soul_observer_events ORDER BY timestamp DESC LIMIT 5;"
```

## Files Modified with Logging

1. **browser-extension/content.js**
   - Lines 22-26: Init logging
   - Lines 129-133: Event capture logging
   - Lines 136-164: sendBatch() comprehensive logging
   - Lines 167-180: Interval logging

2. **browser-extension/background.js**
   - Lines 88-107: SOUL_OBSERVER_EVENT handler logging
   - Lines 172-225: sendSoulObserverData() comprehensive logging

3. **src/hooks/useExtensionSync.ts** (NEW)
   - Automatic token sync from web app to extension

4. **src/App.tsx**
   - Lines 39-45: Integrated useExtensionSync hook

5. **src/pages/OAuthCallback.tsx**
   - Lines 164-181, 227-244: Extension token sync after OAuth

## Next Steps

1. Follow the manual testing steps above
2. Pay special attention to browser console logs
3. Check background script console (service worker)
4. Monitor backend server logs
5. Report back with:
   - Which step you reached before events stopped flowing
   - Any error messages in any of the consoles
   - Screenshot of browser console showing logs

The comprehensive logging should now reveal exactly where the data flow is breaking!
