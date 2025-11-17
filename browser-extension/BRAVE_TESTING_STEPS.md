# Testing Extension in Brave - Step by Step

## The Real Problem

When you visit `http://localhost:8086/extension-auth` in Brave with the extension installed, you should see this in the console:

```
[Extension Auth Listener] ✅ Content script loaded on: http://localhost:8086/extension-auth
[Extension Auth Listener] Chrome runtime available: true
[Extension Auth Listener] Extension ID: <extension-id>
[Extension Auth Listener] 👂 Now listening for auth messages on window.postMessage
```

**If you DON'T see these logs**, the content script is not loading. This means the extension isn't injecting properly.

## Step 1: Load Extension in Brave

1. Open Brave
2. Go to `brave://extensions/`
3. Enable **Developer mode** (top right toggle)
4. Click **"Load unpacked"**
5. Navigate to: `C:\Users\stefa\twin-ai-learn\browser-extension`
6. Click **"Select Folder"**

## Step 2: Enable Localhost Access (CRITICAL!)

**This is the most common issue with Chrome/Brave extensions!**

1. Still on `brave://extensions/`
2. Find "Soul Signature Collector" extension
3. Click **"Details"** button
4. Scroll down to **"Allow access to file URLs"**
5. **ALSO check if there's an option for "Allow on all sites"** - if so, enable it
6. Look for **"Site access"** dropdown - set it to **"On all sites"** or **"On specific sites"**
7. If there's a section about **localhost**, make sure it's allowed

## Step 3: Verify Extension is Active

1. Click the extension icon in Brave toolbar (puzzle piece icon)
2. Pin the "Soul Signature Collector" extension
3. Click the extension icon
4. You should see the popup with "Connect to Twin Me" button

## Step 4: Test the Auth Flow

1. Open a new tab and navigate to: `http://localhost:8086/extension-auth`
2. **IMMEDIATELY open DevTools** (F12 or right-click → Inspect)
3. Go to the **Console** tab
4. **Look for the content script logs** - you should see:
   ```
   [Extension Auth Listener] ✅ Content script loaded on: http://localhost:8086/extension-auth
   ```

### If You SEE the Content Script Load Log:
✅ Great! The extension is working. Continue to Step 5.

### If You DON'T SEE the Content Script Load Log:
❌ **Extension is not injecting**. Common causes:

1. **Extension not enabled** - Check `brave://extensions/` and make sure it's ON
2. **Extension needs reload** - Click the reload icon (circular arrow) on the extension card
3. **Localhost access blocked** - See Step 2 above
4. **Wrong port** - Make sure your dev server is running on port 8086 (`npm run dev`)
5. **Extension error** - Check for error badge on extension icon, or look at the service worker console

### Checking Service Worker Console:
1. Go to `brave://extensions/`
2. Find "Soul Signature Collector"
3. Look for **"service worker"** link (might say "Inspect views: service worker")
4. Click it to open service worker DevTools
5. Check for any errors

## Step 5: Complete Auth Flow

If the content script loaded successfully:

1. On `http://localhost:8086/extension-auth`, you should be redirected to login (if not already logged in)
2. After login, you should see the success screen
3. Console should show the full message flow:
   ```
   [Extension Auth] 📤 Sending auth message to extension
   [Extension Auth Listener] 📨 Received message
   [Extension Auth Listener] 🔑 Auth message detected!
   [Extension Auth Listener] 📤 Forwarding to service worker...
   [Service Worker] 🔑 EXTENSION_AUTH_SUCCESS received!
   [Service Worker] ✅ Authentication successful - data saved to storage
   [Extension Auth Listener] ✅ Service worker response
   [Extension Auth] ✅ Got confirmation from extension!
   ```

4. Extension popup should now show "Connected to Twin Me" ✅

## Troubleshooting

### Problem: "Extension did not respond" timeout error

**Cause**: Content script didn't load OR service worker didn't respond

**Fix**:
1. Check console for `[Extension Auth Listener] ✅ Content script loaded` - if missing, see Step 2
2. Check service worker console for errors
3. Try reloading the extension
4. Try restarting Brave completely

### Problem: Content script loads but no response from service worker

**Cause**: Service worker crashed or has errors

**Fix**:
1. Open service worker console (see "Checking Service Worker Console" above)
2. Look for errors like "chrome.runtime.sendMessage is not a function"
3. Try clicking the extension icon - this often wakes up the service worker
4. Reload the extension

### Problem: "chrome://extensions/ URL doesn't work"

**Note**: Clicking the link in the error message won't work because browsers block `chrome://` URLs from web pages.

**Fix**: Manually type `brave://extensions/` in the address bar

## Common Pitfalls

1. **Forgetting to reload the extension** after making code changes
2. **Not enabling localhost access** (most common issue!)
3. **Service worker goes inactive** - click extension icon to wake it up
4. **Multiple browser profiles** - make sure you're in the right profile
5. **Port mismatch** - extension expects port 8086, make sure `npm run dev` is on that port

## Success Checklist

- [ ] Extension shows in `brave://extensions/` with no errors
- [ ] Extension is **enabled** (toggle is ON)
- [ ] **Developer mode** is enabled
- [ ] Extension has **localhost access enabled**
- [ ] Dev server running on `http://localhost:8086`
- [ ] Console shows `[Extension Auth Listener] ✅ Content script loaded`
- [ ] Extension popup shows "Connected to Twin Me" after auth

If all checkboxes are checked and you still have issues, share:
1. Screenshot of `brave://extensions/` page
2. Screenshot of the extension's service worker console
3. Screenshot of the web page console when visiting `/extension-auth`
