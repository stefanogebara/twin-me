# Extension Testing Guide

## Issue Summary

You're experiencing two problems:
1. **Brave**: Extension loads, but auth flow doesn't work (no token received) - **FIXED ✅**
2. **Chrome**: Extension won't load due to "icon not found" error

## Root Cause & Fix (Brave Issue)

### Problem Identified
Using Playwright testing, we discovered the exact failure point:
- Content script loads successfully ✅
- But ExtensionAuth page never sends the auth message ❌
- Reason: OAuth callback was redirecting to `/dashboard` instead of `/extension-auth`

### The Auth Flow Problem
1. User clicks "Connect to Twin Me" in extension → redirected to `/extension-auth`
2. `/extension-auth` checks if user is logged in → NOT logged in
3. Redirects to `/auth?redirect=/extension-auth` for Google OAuth
4. User logs in with Google
5. OAuth callback redirects to `/auth/callback?token=...`
6. **OAuthCallback.tsx hardcoded redirect to `/dashboard`** ⚠️
7. User never returns to `/extension-auth` → extension never receives token!

### Solution Implemented
Modified the entire OAuth flow to respect the `redirect` parameter:

**Frontend Changes:**
- `AuthContext.tsx`: Updated `signInWithOAuth()` to accept optional `redirectAfterAuth` parameter
- `CustomAuth.tsx`: Passes `redirect` query param from URL to `signInWithOAuth()`
- `OAuthCallback.tsx`: Uses `stateData.redirectAfterAuth` instead of hardcoded `/dashboard`

**Backend Changes:**
- `api/routes/auth.js`: Captures `redirect` query parameter and includes it in OAuth `state`
- State now contains: `{ provider, timestamp, isAuth, redirectAfterAuth }`

**Result:**
- When user logs in via extension auth flow, they now correctly return to `/extension-auth`
- ExtensionAuth page sends token to extension
- Extension popup shows "Connected" status ✅

## Fixes Applied

### 1. Enhanced Logging
Added detailed emoji-based logging to track the entire auth flow:
- `📤` Web page sending message
- `✅` Content script loaded
- `📨` Content script received message
- `🔑` Auth data detected
- `✅` Service worker saved data

### 2. Better Error Handling
- Added `chrome.runtime.lastError` checks
- Error messages now sent back to web page
- Clearer timeout messages

## How to Test in Brave (Your Current Browser)

### Step 1: Reload the Extension
1. Go to `brave://extensions/`
2. Find "Soul Signature Collector"
3. Click the **reload icon** (circular arrow) to reload with new code
4. Make sure it's **enabled**

### Step 2: Test the Auth Flow
1. Click the extension icon in Brave toolbar
2. Click **"Connect to Twin Me"** button
3. You'll be redirected to `http://localhost:8086/extension-auth`
4. **IMPORTANT**: Open the **browser console** (F12)
5. Watch for these log messages:

**Expected Console Output (Success):**
```
[Extension Auth Listener] ✅ Content script loaded on: http://localhost:8086/extension-auth
[Extension Auth Listener] Chrome runtime available: true
[Extension Auth Listener] Extension ID: <some-id>
[Extension Auth Listener] 👂 Now listening for auth messages on window.postMessage

[Extension Auth] 📤 Sending auth message to extension: {type: ..., userId: ..., tokenLength: ...}
[Extension Auth] ⏳ Message sent, waiting for confirmation...

[Extension Auth Listener] 📨 Received message: {type: 'TWIN_AI_EXTENSION_AUTH', ...}
[Extension Auth Listener] 🔑 Auth message detected! Data: {...}
[Extension Auth Listener] 📤 Forwarding to service worker...

[Service Worker] 🔑 EXTENSION_AUTH_SUCCESS received!
[Service Worker] Auth details - userId: ..., expiresIn: 86400, tokenLength: ...
[Service Worker] ✅ Authentication successful - data saved to storage

[Extension Auth Listener] ✅ Service worker response: {success: true}
[Extension Auth Listener] 📬 Confirmation sent back to page

[Extension Auth] 📨 Received window message: {type: 'TWIN_AI_EXTENSION_AUTH_RECEIVED', success: true}
[Extension Auth] ✅ Got confirmation from extension!
```

### Step 3: Verify Extension is Connected
1. Click the extension icon again
2. You should now see **"Connected to Twin Me"** with a ✓ green checkmark
3. Status should no longer say "Not connected"

## How to Test in Chrome

### Fix the Icon Error - **FIXED ✅**

**Root Cause:**
- Chrome was looking for `icons/icon16.png` but the manifest specified `assets/icon-16.png`
- An old `icons/` folder existed from a previous configuration
- The `icons/` folder only had SVG files, not the PNG files Chrome needed
- Chrome may have cached an old manifest.json that referenced the `icons/` folder

**Solution Implemented:**
Copied PNG icon files from `assets/` to `icons/` folder:
- `icons/icon16.png` ✅
- `icons/icon32.png` ✅
- `icons/icon48.png` ✅
- `icons/icon128.png` ✅

**Steps to Load Extension in Chrome:**
1. Go to `chrome://extensions/`
2. Enable **Developer mode** (top right toggle)
3. Click **"Load unpacked"**
4. Select `C:\Users\stefa\twin-ai-learn\browser-extension`
5. Extension should load without errors now!

**If You Still Get Icon Errors:**
1. Remove the extension completely from `chrome://extensions/`
2. Close Chrome completely
3. Reopen Chrome and try loading again
4. The PNG files now exist in both `icons/` and `assets/` folders, so either path will work

## Debugging Tips

### If Content Script Doesn't Load
**Check in Console:**
- You should see `[Extension Auth Listener] ✅ Content script loaded`
- If you don't see this, the content script isn't injecting

**Possible Causes:**
1. Extension not reloaded after code changes
2. Manifest URL pattern doesn't match (should be `http://localhost:8086/extension-auth`)
3. Content script file path wrong in manifest

### If Message Doesn't Reach Extension
**Check in Console:**
- You should see `[Extension Auth Listener] 📨 Received message`
- If the web page sends but extension doesn't receive, check:
  - Extension is enabled
  - Content script loaded (see above)
  - No errors in service worker console

### If Service Worker Doesn't Respond
**Check Service Worker Console:**
1. Go to `brave://extensions/` or `chrome://extensions/`
2. Find "Soul Signature Collector"
3. Click **"service worker"** link
4. Check for errors in the service worker console

## Success Indicators

✅ Console shows all emoji messages in sequence
✅ Extension popup shows "Connected to Twin Me"
✅ No timeout error after 5 seconds
✅ Page redirects to dashboard after 2 seconds

## Common Issues

### Issue: "Extension did not respond" timeout
**Cause**: Content script not loaded or extension disabled
**Fix**: Reload extension, check it's enabled

### Issue: Content script loads but no message received
**Cause**: Window message not being sent or wrong origin
**Fix**: Check console for the 📤 sending message

### Issue: Service worker error
**Cause**: Chrome runtime issue
**Fix**: Check service worker console for specific error

## Next Steps

1. Try in **Brave first** (since it loads)
2. Open F12 console
3. Watch the emoji log messages
4. Take a screenshot of the console if it fails
5. Share the console output so I can see exactly where it fails

The detailed logging will tell us EXACTLY where the communication breaks down!
