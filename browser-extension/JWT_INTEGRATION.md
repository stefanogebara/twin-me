# JWT Token Integration - Soul Signature Extension

## Overview
The browser extension now uses JWT (JSON Web Token) authentication instead of manual User ID input. This provides seamless, secure authentication synchronized from the web app.

## Architecture

```
┌─────────────────┐           ┌──────────────────┐           ┌─────────────┐
│   Web App       │  Sync     │   Extension      │   API     │   Backend   │
│  (localhost:    │  Token    │   (background.js)│  Calls    │   API       │
│   8086)         │  ──────▶  │                  │  ──────▶  │  (port 3001)│
│                 │           │  ┌─────────────┐ │           │             │
│  useExtension   │           │  │ JWT Decoder │ │           │             │
│  Sync()         │           │  └─────────────┘ │           │             │
│  ↓              │           │  ┌─────────────┐ │           │             │
│  localStorage   │           │  │ chrome.     │ │           │             │
│  .auth_token    │           │  │ storage     │ │           │             │
└─────────────────┘           └──────────────────┘           └─────────────┘
```

## Implementation Details

### 1. Web App Side (`src/hooks/useExtensionSync.ts`)

**What it does:**
- Monitors `localStorage.auth_token` for changes
- Sends token to extension via `chrome.runtime.sendMessage()`
- Handles extension not installed gracefully

**When it syncs:**
- On component mount (immediate sync)
- When localStorage changes (login/logout events)

**Code:**
```typescript
chrome.runtime.sendMessage(
  'acnofcjjfjaikcfnalggkkbghjaijepc', // Extension ID
  { type: 'SET_AUTH_TOKEN', token },
  (response) => {
    console.log('[Extension Sync] ✅ Token synced successfully');
  }
);
```

### 2. Extension Side (`browser-extension/background.js`)

**What was added:**
- `authToken` state variable
- `decodeJWT()` utility function
- `SET_AUTH_TOKEN` message handler
- `onMessageExternal` listener for web app messages
- Authorization headers in all API calls

**JWT Decoding:**
```javascript
function decodeJWT(token) {
  const base64Url = token.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
  }).join(''));
  return JSON.parse(jsonPayload);
}
```

**Token Storage:**
- Stored in `chrome.storage.local` as `authToken`
- Persists across browser sessions
- Automatically reloaded on extension startup

**User ID Extraction:**
```javascript
const decoded = decodeJWT(authToken);
userId = decoded.userId; // Extracted from JWT payload
```

### 3. API Authentication (`fetch` calls)

**Before:**
```javascript
fetch(`${API_BASE_URL}/soul-observer/interpret`, {
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ userId, activities })
})
```

**After:**
```javascript
const headers = {
  'Content-Type': 'application/json',
};

if (authToken) {
  headers['Authorization'] = `Bearer ${authToken}`;
}

fetch(`${API_BASE_URL}/soul-observer/interpret`, {
  headers,
  body: JSON.stringify({ userId, activities })
})
```

### 4. Manifest Changes (`manifest.json`)

Added `externally_connectable` to allow web app to send messages:

```json
{
  "externally_connectable": {
    "matches": [
      "http://localhost:8086/*",
      "http://localhost:*/*",
      "https://*.soul-signature.com/*"
    ]
  }
}
```

## Security Considerations

### ✅ What's Secure:
- JWT tokens are stored in `chrome.storage.local` (isolated per extension)
- Tokens are sent over HTTPS in production
- Token is never exposed in URL parameters
- JWT payload is verified on backend
- Token expiration is enforced by backend

### ⚠️ Important Notes:
- Extension storage is isolated from web page JavaScript
- Only domains in `externally_connectable` can send messages
- JWT tokens have expiration timestamps (check backend implementation)
- If token expires, user must re-login in web app

## Testing the Integration

### 1. Load the Extension

```bash
# Navigate to chrome://extensions/
# Enable "Developer mode"
# Click "Load unpacked"
# Select: C:\Users\stefa\twin-ai-learn\browser-extension
```

### 2. Open Web App

```bash
# Web app should be running on http://localhost:8086
npm run dev
```

### 3. Login to Web App
- Login with Google OAuth
- JWT token is stored in localStorage

### 4. Verify Token Sync

**Check browser console:**
```
[Extension Sync] ✅ Token synced to extension successfully
```

**Check extension background console:**
```
[Soul Signature] ✅ Auth token received from web app, userId: abc123
```

### 5. Test Data Collection

**Navigate to Netflix:**
```
# Go to https://www.netflix.com
# Browse content
# Extension collects watch history
```

**Check extension badge:**
- Should show number of unsynced items
- Orange badge background

**Manual sync:**
- Click extension icon
- Click "Sync Now"
- Badge should clear

### 6. Verify API Calls

**Backend logs should show:**
```
[Soul Observer] Received 25 activities from user: abc123
[Soul Observer] Activities stored successfully
```

## Troubleshooting

### Token not syncing:
1. Check extension is loaded: `chrome://extensions/`
2. Check extension ID matches in `useExtensionSync.ts`
3. Verify web app domain in `externally_connectable`
4. Check browser console for errors

### API calls failing:
1. Verify `Authorization` header is present
2. Check JWT token is valid (not expired)
3. Verify backend accepts Bearer token format
4. Check backend middleware extracts `req.user` from JWT

### User ID not extracted:
1. Verify JWT payload contains `userId` field
2. Check JWT structure matches decoding logic
3. Ensure backend signs JWT with `userId` in payload

## Migration Path

### Old System (Manual User ID):
- User copies User ID from dashboard
- Pastes into extension popup
- Extension sends `userId` in request body

### New System (JWT Auth):
- User logs in to web app
- JWT automatically synced to extension
- Extension sends JWT in Authorization header
- Backend extracts `userId` from JWT

### Backward Compatibility:
- Extension still supports manual User ID input (fallback)
- If JWT is available, it takes precedence
- Manual input can be removed in future version

## Future Enhancements

### Token Refresh:
```javascript
// Detect token expiration
if (isTokenExpired(authToken)) {
  // Request new token from web app
  chrome.runtime.sendMessage({
    type: 'REQUEST_TOKEN_REFRESH'
  });
}
```

### Multi-Account Support:
```javascript
// Store multiple accounts
chrome.storage.local.set({
  accounts: [
    { userId: 'abc', token: 'jwt1' },
    { userId: 'xyz', token: 'jwt2' }
  ],
  activeAccountId: 'abc'
});
```

### Token Revocation:
```javascript
// Clear token on logout
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'LOGOUT') {
    authToken = null;
    userId = null;
    chrome.storage.local.remove(['authToken', 'userId']);
  }
});
```

## API Contract

### Expected JWT Payload:
```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "iat": 1699564800,
  "exp": 1699651200
}
```

### Backend Middleware:
```javascript
// api/middleware/auth.js
const jwt = require('jsonwebtoken');

function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
```

## Deployment Checklist

- [ ] Update extension ID in `useExtensionSync.ts`
- [ ] Add production domain to `externally_connectable`
- [ ] Verify JWT_SECRET is set in backend .env
- [ ] Test token expiration handling
- [ ] Implement token refresh flow
- [ ] Add error handling for network failures
- [ ] Update extension popup UI to show auth status
- [ ] Remove manual User ID input from popup
- [ ] Create user documentation
- [ ] Submit extension to Chrome Web Store

## Support

For issues with JWT integration:
1. Check browser and extension console logs
2. Verify token structure with jwt.io
3. Test API endpoints with Postman using Bearer token
4. Review backend authentication middleware

---

**Status**: ✅ JWT Integration Complete
**Last Updated**: January 2025
**Version**: 1.0.0
