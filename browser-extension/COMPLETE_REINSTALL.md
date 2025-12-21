# Complete Extension Reinstall Guide

## ✅ Critical Fixes Applied

**Service Worker Error Fixed**: Removed ES module imports that were causing the service worker to fail. The extension should now load without errors.

**Files Updated**:
- `src/background/service-worker.js` - Inlined all auth functions (no more ES imports)
- `manifest.json` - Removed `"type": "module"` from background service worker
- `popup/popup.html` - Dark mode design with Anthropic colors
- `popup/popup.js` - Inlined auth logic (no ES imports)

## Why You Need to Reinstall

Chrome caches extension files aggressively. Even after reloading, it may still serve old cached versions. A complete reinstall forces Chrome to load all files fresh.

## Reinstall Steps (2 Minutes)

### Step 1: Remove Existing Extension

1. Open Chrome and navigate to: `chrome://extensions/`
2. Find **"Soul Signature Collector"**
3. Click the **"Remove"** button
4. Confirm removal when prompted

### Step 2: Close and Reopen Chrome

1. Completely **close all Chrome windows**
2. Wait 3 seconds
3. Reopen Chrome

### Step 3: Enable Developer Mode

1. Go to `chrome://extensions/`
2. Toggle **"Developer mode"** ON (top-right switch)

### Step 4: Load Extension Fresh

1. Click **"Load unpacked"** button
2. Navigate to and select:
   ```
   C:\Users\stefa\twin-ai-learn\browser-extension
   ```
3. Click "Select Folder"

### Step 5: Verify Installation

You should now see:
- ✅ Extension card: **"Soul Signature Collector v1.0.0"**
- ✅ Orange "S" icon in Chrome toolbar
- ✅ Status: "No errors"

### Step 6: Test the Popup

1. Click the orange "S" icon in Chrome toolbar
2. **Expected Result**: Dark mode popup should open with:
   - Header with orange "S" logo
   - "Soul Signature Collector" title
   - Connection status showing "Not connected"
   - Stats grid showing 0s
   - Orange "Connect to Twin AI Learn" button
   - Grey "Sync Data Now" button
   - Footer with privacy controls link

### Step 7: Connect Extension

1. Click **"Connect to Twin AI Learn"** in popup
2. New tab opens: `http://localhost:8086/extension-auth`
3. If logged in: Shows "Extension Connected!" with green checkmark
4. Tab auto-closes after 2 seconds
5. Click extension icon again
6. Status should now show: **"✓ Connected to Twin AI Learn"**

## Troubleshooting

### Still Getting 404?

If you still see 404 error after complete reinstall:

1. **Check manifest path**:
   ```bash
   type "C:\Users\stefa\twin-ai-learn\browser-extension\manifest.json" | findstr "default_popup"
   ```
   Should show: `"default_popup": "popup/popup.html"`

2. **Verify files exist**:
   ```bash
   dir "C:\Users\stefa\twin-ai-learn\browser-extension\popup"
   ```
   Should show: `popup.html` and `popup.js`

3. **Check service worker console**:
   - Go to `chrome://extensions/`
   - Find "Soul Signature Collector"
   - Click "service worker" link
   - Look for any error messages

4. **Inspect popup**:
   - Right-click extension icon
   - Select "Inspect popup"
   - Check Console tab for errors

### Popup Opens But Shows Blank/White Screen

This means HTML is loading but JavaScript has errors:

1. Right-click extension icon → "Inspect popup"
2. Check Console tab for JavaScript errors
3. Look for Chrome API errors (expected when testing outside extension context)

### "Cannot read chrome.storage" Error

This is **normal** when testing popup.html directly in browser. It only happens in actual extension context.

## Expected Behavior After Reinstall

### When Clicking Extension Icon:
- ✅ Dark mode popup opens immediately
- ✅ No 404 error
- ✅ No blank screen
- ✅ Stats display (all 0s initially)
- ✅ Buttons are clickable

### When Clicking "Connect":
- ✅ Opens new tab with auth page
- ✅ Shows success message if logged in
- ✅ Tab auto-closes after 2 seconds

### After Connecting:
- ✅ Popup shows "Connected" status in green
- ✅ Button changes to "Disconnect"
- ✅ "Sync Data Now" becomes functional

## Files Verified Before This Reinstall

✅ `popup/popup.html` - Dark mode design with Anthropic colors
✅ `popup/popup.js` - No ES modules, inline auth logic
✅ `manifest.json` - Points to correct path: `popup/popup.html`
✅ `assets/icon-*.svg` - Extension icons exist
✅ Backend API - All 4 endpoints working
✅ Database - Test records verified

## Next Steps After Successful Reinstall

1. **Test Netflix Capture**:
   - Visit https://www.netflix.com
   - Play any video
   - Check extension popup for increased Netflix count

2. **Test YouTube Capture**:
   - Visit https://www.youtube.com
   - Play any video
   - Check extension popup for increased YouTube count

3. **Test Manual Sync**:
   - Click "Sync Data Now" button
   - Should show "Syncing..." → "✓ Synced!"
   - Database should have new records

4. **Verify Database**:
   ```sql
   SELECT
     platform,
     data_type,
     raw_data->>'title' as title,
     created_at
   FROM soul_data
   WHERE data_type LIKE 'extension_%'
   ORDER BY created_at DESC
   LIMIT 10;
   ```

## Success Criteria

Extension is working when:
- ✅ Popup opens with dark mode design (no 404)
- ✅ Connection flow works (auth → success → connected status)
- ✅ Stats display correctly
- ✅ Manual sync button works
- ✅ No console errors in popup or service worker

---

**If you're still experiencing issues after this complete reinstall**, check the service worker console at `chrome://extensions/` for any error messages and share them for further troubleshooting.
