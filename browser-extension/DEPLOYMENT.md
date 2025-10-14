# Soul Signature Extension - Deployment Guide

## Environment Configuration

The extension uses a centralized configuration system in `config.js` that automatically routes to the correct URLs based on the environment.

### Current Environments

**Development** (default):
- Frontend: `http://localhost:8086`
- API: `http://localhost:3001/api`

**Production**:
- Frontend: `https://twin-ai-learn.vercel.app`
- API: `https://twin-ai-learn.vercel.app/api`

---

## Switching to Production

Before publishing the extension to the Chrome Web Store or deploying to production users:

### Step 1: Update Environment Variable

Open `config.js` and change line 7:

```javascript
// FROM:
const ENV = 'development';

// TO:
const ENV = 'production';
```

### Step 2: Verify Changes

Check that all URLs now point to production:

```bash
# In browser extension folder
grep -r "localhost:8086" .
grep -r "localhost:3001" .
```

These commands should return **no results** in code files (only in documentation).

### Step 3: Test Locally

1. Load the extension in Chrome with `ENV = 'production'`
2. Test authentication flow (should redirect to Vercel URL)
3. Test platform connections
4. Verify Soul Observer functionality

### Step 4: Build and Package

```bash
# Create zip for Chrome Web Store
cd browser-extension
zip -r soul-signature-extension.zip . -x "*.git*" "node_modules/*" "*.md"
```

---

## Switching Back to Development

For local development, ensure `config.js` line 7 is set to:

```javascript
const ENV = 'development';
```

Then reload the extension in Chrome.

---

## Updating Production URLs

If your production URLs change, update the `production` section in `config.js`:

```javascript
production: {
  APP_URL: 'https://your-new-domain.com',
  API_URL: 'https://your-new-domain.com/api'
}
```

---

## Files Using Configuration

The following files import and use `EXTENSION_CONFIG`:

- `background.js` - API calls and data syncing
- `popup-new.js` - Authentication and dashboard links
- `popup-new.html` - Loads config.js as module

**Do not hardcode URLs in these files** - always use `EXTENSION_CONFIG.APP_URL` or `EXTENSION_CONFIG.API_URL`.

---

## Troubleshooting

### Extension shows 404 errors
- Check `config.js` ENV setting matches your target environment
- Reload extension after changing config
- Clear browser cache

### API calls failing
- Verify `EXTENSION_CONFIG.API_URL` is correct for your environment
- Check CORS settings on backend allow extension origin
- Inspect background service worker console for errors

### Authentication not working
- Ensure `EXTENSION_CONFIG.APP_URL` points to correct frontend
- Verify OAuth callback URLs are whitelisted
- Check extension ID matches registered ID in backend

---

## Pre-Release Checklist

Before publishing to Chrome Web Store:

- [ ] Set `ENV = 'production'` in config.js
- [ ] Test all authentication flows
- [ ] Test all platform integrations
- [ ] Verify Soul Observer data collection
- [ ] Test on multiple Chrome profiles
- [ ] Check extension icons display correctly
- [ ] Review manifest.json version number
- [ ] Create release notes
- [ ] Package extension as .zip
- [ ] Upload to Chrome Web Store dashboard

---

**Important**: Never commit `config.js` with `ENV = 'production'` to version control if you're actively developing. Keep it on `'development'` for the main branch.
