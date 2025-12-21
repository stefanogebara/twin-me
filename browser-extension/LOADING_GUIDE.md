# Soul Signature Extension - Loading Guide

## Quick Start: Load Extension in Chrome

### 1. Open Chrome Extensions Page

```
chrome://extensions/
```

Or navigate via:
- Chrome menu → More Tools → Extensions

### 2. Enable Developer Mode

- Toggle "Developer mode" switch in **top right** corner
- This allows loading unpacked extensions

### 3. Load the Extension

1. Click **"Load unpacked"** button (top left)
2. Navigate to: `C:\Users\stefa\twin-ai-learn\browser-extension`
3. Click **"Select Folder"**

### 4. Verify Installation

✅ **Extension should appear** in your extensions list:
- Name: **Soul Signature - Digital Twin Collector**
- Version: **1.0.0**
- Status: **Enabled**

✅ **Extension icon** should appear in Chrome toolbar (top right)
- If not visible, click the puzzle piece icon and pin "Soul Signature"

### 5. Open Extension Popup

- Click the Soul Signature icon in toolbar
- Should see "Not Authenticated" status

## Testing JWT Authentication

### Step 1: Login to Web App

1. Open new tab: `http://localhost:8086`
2. Click "Login" or navigate to `/auth`
3. Login with Google OAuth
4. You should be redirected to dashboard

### Step 2: Verify Token Sync

**Open Browser Console (F12):**
```
[Extension Sync] ✅ Token synced to extension successfully
```

**Open Extension Background Console:**
- Go to `chrome://extensions/`
- Find "Soul Signature"
- Click "Service worker" link (will open DevTools)
- Should see:
```
[Soul Signature] ✅ Auth token received from web app, userId: abc123...
```

### Step 3: Check Extension Popup

- Click extension icon
- Status should show: **✓ JWT Authentication (abc123...)**
- Controls section should be visible
- Stats section should be visible

## Testing Data Collection

### Netflix Collection Test

1. Open Netflix: `https://www.netflix.com`
2. Browse content (Continue Watching, My List)
3. **Check extension badge** - should show number of collected items
4. Open extension popup → Click "Sync Now"
5. Badge should clear

**Background Console should show:**
```
[Background] Received Netflix data: {continueWatching: [...]}
[Background] Syncing 5 Netflix items
[Background] Netflix data synced successfully
```

### Soul Observer Mode Test

1. Open extension popup
2. Toggle "Soul Observer Mode" **ON**
3. Read privacy notice
4. Browse various websites
5. **Check extension badge** - should increment with activities

**Background Console should show:**
```
[Background] Recording browsing activity: page_visit
[Background] Recording browsing activity: scroll
[Background] Flushing 15 activities to API
[Background] Activities interpreted: {...}
```

## Troubleshooting

### Extension Not Loading

**Error: "Manifest file is missing or unreadable"**
- Verify you selected the correct folder: `browser-extension`
- Check `manifest.json` exists in that folder
- Ensure no syntax errors in manifest.json

**Fix:**
```bash
cd C:\Users\stefa\twin-ai-learn\browser-extension
cat manifest.json  # Verify file exists and is valid JSON
```

### Token Not Syncing

**Extension shows "Not Authenticated" after login**

**Check Extension ID:**
1. Go to `chrome://extensions/`
2. Find Soul Signature extension
3. Copy the extension ID (e.g., `acnofcjjfjaikcfnalggkkbghjaijepc`)
4. Verify it matches in `src/hooks/useExtensionSync.ts:26`

**Check externally_connectable:**
1. Open `browser-extension/manifest.json`
2. Verify `externally_connectable` includes:
   - `http://localhost:8086/*`
   - `http://localhost:*/*`

**Check Storage:**
```javascript
// In browser console (F12)
chrome.storage.local.get(['authToken', 'userId'], (data) => {
  console.log('Extension storage:', data);
});
```

Should show:
```javascript
{
  authToken: "eyJhbGciOiJIUzI1NiIsInR...",
  userId: "550e8400-e29b-41d4-a716-..."
}
```

### API Calls Failing

**401 Unauthorized errors**

**Check Authorization Header:**
- Open Network tab in extension background console
- Find API request to `/soul-observer/activity` or `/netflix`
- Check Request Headers:
  - Should have: `Authorization: Bearer eyJhbGci...`

**Verify JWT Token:**
1. Copy token from extension storage
2. Go to [jwt.io](https://jwt.io)
3. Paste token
4. Verify payload contains `userId` field

**Check Backend Logs:**
```bash
# Backend terminal
[Soul Observer] Received 25 activities from user: abc123
```

If you see authentication errors:
- Verify JWT_SECRET matches between frontend and backend
- Check token hasn't expired
- Ensure backend middleware extracts `req.user` from JWT

### Background Service Worker Not Running

**"Service worker (Inactive)" in chrome://extensions/**

**Activate it:**
1. Click "Service worker" link
2. Should open DevTools and activate
3. Or reload the extension:
   - Click reload icon on extension card

**Keep it active:**
- Service worker stays active for 30 seconds after last event
- Will auto-activate on alarms or messages
- DevTools must stay open to keep it running during testing

## Development Workflow

### Making Changes

1. **Edit Files:**
   - Modify `background.js`, `popup.js`, `popup.html`, etc.

2. **Reload Extension:**
   - Go to `chrome://extensions/`
   - Click reload icon (circular arrow) on Soul Signature card
   - Or press Ctrl+R while focused on extensions page

3. **Test Changes:**
   - Open extension popup (will use new code)
   - Service worker auto-reloads on next event
   - Content scripts require page reload

### Hot Reload Content Scripts

**To see changes in Netflix collector:**
1. Edit `collectors/netflix.js`
2. Reload extension in `chrome://extensions/`
3. **Refresh Netflix tab** (F5)
4. Content script will reinject with new code

### Debugging

**Extension Popup:**
- Right-click extension icon → "Inspect popup"
- Opens DevTools for popup window

**Background Service Worker:**
- chrome://extensions/ → Click "Service worker"
- Shows console logs, network requests

**Content Scripts:**
- Open webpage (e.g., Netflix)
- Press F12 → Console
- Content script logs appear here

**Console Filtering:**
```
[Soul Signature]  # All extension logs
[Background]      # Background service logs
[Netflix Collector] # Netflix-specific logs
[Soul Observer]   # Observer mode logs
```

## Chrome Web Store Preparation

### Before Publishing:

1. **Update Extension ID:**
   - Get final Chrome Web Store ID
   - Update in `src/hooks/useExtensionSync.ts`

2. **Update Domains:**
   - Add production domain to `externally_connectable`
   - E.g., `https://soul-signature.com/*`

3. **Create Promotional Images:**
   - Icon: 128x128px (already have)
   - Small tile: 440x280px
   - Screenshots: 1280x800px or 640x400px

4. **Privacy Policy:**
   - Required for extensions accessing user data
   - Link to hosted policy page

5. **Test Production Build:**
   - Test with production API URL
   - Verify all OAuth flows work
   - Test on clean Chrome profile

## Extension Permissions Explained

**Requested Permissions:**

- `storage` - Store auth tokens, settings, and collected data locally
- `tabs` - Detect page visits and tab switches for Soul Observer
- `activeTab` - Access current tab for data collection
- `scripting` - Inject content scripts into Netflix, etc.
- `webNavigation` - Track navigation events for browsing patterns
- `alarms` - Schedule periodic data syncs (every 5 minutes)

**Host Permissions:**

- `https://www.netflix.com/*` - Collect Netflix watch history
- `https://www.hulu.com/*` - Collect Hulu data
- `https://www.hbomax.com/*` - Collect HBO Max data
- `https://www.primevideo.com/*` - Collect Prime Video data
- `https://www.disneyplus.com/*` - Collect Disney+ data
- `https://*/*` - Soul Observer Mode (all websites)
- `http://localhost:*/*` - Development/testing

## Security Best Practices

✅ **We Do:**
- Store JWT tokens in isolated `chrome.storage.local`
- Use HTTPS for all API calls (in production)
- Verify sender origin for external messages
- Clear sensitive data on logout
- No passwords stored in extension

❌ **We Don't:**
- Store passwords or credit cards
- Share tokens with third parties
- Track incognito/private browsing
- Inject ads or modify page content
- Send data to any servers except Soul Signature API

---

**Need Help?**
- Check `README.md` for full documentation
- See `JWT_INTEGRATION.md` for authentication details
- Open issue on GitHub

**Status**: ✅ Extension Updated with JWT Auth
**Last Updated**: January 2025
