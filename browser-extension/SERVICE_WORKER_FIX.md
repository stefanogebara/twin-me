# Service Worker Fix - ES Module Issue Resolved

## Problem

The extension was failing to load with these errors:
```
Service worker registration failed. Status code: 15
Uncaught TypeError: Cannot read properties of undefined (reading 'create')
```

## Root Cause

The service worker (`src/background/service-worker.js`) was using **ES module imports**:

```javascript
import {
  isAuthenticated,
  getAuthToken,
  setupAuthListener,
  refreshTokenIfNeeded
} from '../auth/auth-handler.js';
```

While Manifest V3 supports ES modules in service workers with `"type": "module"`, Chrome has strict requirements and the imports were causing failures with Chrome API calls.

## Solution

**1. Removed ES Module Imports**

Inlined all authentication functions directly into the service worker:

```javascript
// No more imports!
const API_URL = 'http://localhost:3001/api';

// All auth functions now defined inline:
async function getAuthToken() { /* ... */ }
async function isAuthenticated() { /* ... */ }
async function saveAuthData() { /* ... */ }
async function clearAuthData() { /* ... */ }
async function refreshTokenIfNeeded() { /* ... */ }
```

**2. Updated Manifest.json**

Removed the module type declaration:

```json
// BEFORE:
"background": {
  "service_worker": "src/background/service-worker.js",
  "type": "module"
}

// AFTER:
"background": {
  "service_worker": "src/background/service-worker.js"
}
```

**3. Added Missing Message Handlers**

Added handlers for popup interactions:

```javascript
case 'TRIGGER_SYNC':
  // Manual sync from popup button
  syncLocalDataToBackend().then(...)

case 'EXTENSION_AUTH_SUCCESS':
  // Auth token from web app
  saveAuthData(authToken, userId, expiresIn)...

case 'CHECK_AUTH_STATUS':
  // Check if user is authenticated
  isAuthenticated().then(...)
```

**4. Fixed Sync Function**

Updated `syncLocalDataToBackend()` to properly use the batch endpoint:

```javascript
// Collect all events from all platforms
const allEvents = [];
for (const [key, data] of Object.entries(storage)) {
  if (data && Array.isArray(data) && data.length > 0) {
    const platform = key.replace('_history', '');
    allEvents.push(...data.map(event => ({ ...event, platform })));
  }
}

// Send batch to backend
const response = await fetch(`${API_URL}/extension/batch`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({ events: allEvents })
});
```

## Files Modified

1. **`src/background/service-worker.js`** (Complete rewrite)
   - Removed ES module imports
   - Inlined all auth functions
   - Added TRIGGER_SYNC handler
   - Added EXTENSION_AUTH_SUCCESS handler
   - Added CHECK_AUTH_STATUS handler
   - Fixed syncLocalDataToBackend() to use batch endpoint

2. **`manifest.json`** (1 line change)
   - Removed `"type": "module"` from background section

## Testing

After reinstalling the extension with these fixes:

**Expected Results**:
- ✅ No service worker registration errors
- ✅ Service worker console shows: `[Service Worker] Soul Signature Collector initialized`
- ✅ No "Cannot read properties of undefined" errors
- ✅ Popup opens correctly with dark mode design
- ✅ Connect button works
- ✅ Manual sync button works
- ✅ Data capture from Netflix/YouTube/Reddit works

## Why This Happened

The same issue affected both:
1. **Popup** (`popup/popup.js`) - Fixed earlier by inlining auth logic
2. **Service Worker** (`src/background/service-worker.js`) - Fixed now

Chrome extensions have strict requirements for ES modules in:
- Service workers (background scripts)
- Popup scripts
- Content scripts

The safest approach for Manifest V3 is to avoid ES modules entirely and use inline functions instead.

## Related Issues

This is similar to the popup 404 error that was fixed by:
- Removing ES module imports from `popup/popup.js`
- Inlining all auth functions
- Using traditional `<script src="popup.js"></script>` instead of `<script type="module">`

Both issues stem from Chrome's strict handling of ES modules in extension contexts.

## Next Steps

1. **Remove extension** from `chrome://extensions/`
2. **Close Chrome completely**
3. **Reopen Chrome**
4. **Load extension fresh** from `browser-extension` folder
5. **Verify service worker loads** without errors
6. **Test popup** - should show dark mode design
7. **Test connection** - click "Connect to Twin AI Learn"
8. **Test data capture** - visit Netflix/YouTube/Reddit

## Success Criteria

Extension is working when:
- ✅ No errors at `chrome://extensions/`
- ✅ Service worker shows "initialized" message
- ✅ Popup opens with dark mode design
- ✅ Connection flow works (no 404 error)
- ✅ Manual sync button responds
- ✅ Stats display correctly (0s initially)
- ✅ Data captured and synced to database

---

**Status**: Ready for complete reinstall
**Impact**: Critical fix - extension was completely non-functional
**Risk**: None - this is the correct pattern for Manifest V3
