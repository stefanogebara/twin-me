# Soul Signature Browser Extension

**Capture your authentic viewing patterns to build your soul signature - your true digital identity beyond public information.**

## Overview

The Soul Signature Extension tracks your authentic content consumption across streaming platforms to help build a genuine digital twin that represents who you truly are, not just your public persona.

## Features

### ✅ Currently Implemented (MVP)

**YouTube Tracking:**
- 🎥 Real-time watch event detection
- ⏱️ Watch duration tracking (every 30 seconds)
- 📊 Video metadata capture (title, channel, URL)
- 📜 Historical import (from youtube.com/feed/history)
- 💾 Offline-first with automatic sync

**Privacy Controls:**
- 🔐 All data stays local until synced
- 🎛️ Enable/disable tracking per platform
- 👤 User-controlled data sharing
- 🗑️ Easy disconnect option

### 🚧 Coming Soon

**Netflix Tracking:**
- Shows and movies watched
- Watch duration and completion
- Episode tracking
- Genre preferences

**Additional Platforms:**
- Prime Video
- HBO Max
- Disney+
- Spotify Web Player

## Installation

### For Development

1. Clone the repository
2. Navigate to `browser-extension/` directory
3. Open Chrome and go to `chrome://extensions/`
4. Enable "Developer mode" (top right)
5. Click "Load unpacked"
6. Select the `browser-extension` folder

### For Users (Future)

Will be available on Chrome Web Store once published.

## How It Works

### Architecture

```
User Browses YouTube
         ↓
Content Script Detects Video
         ↓
Sends Event to Background Worker
         ↓
Stores Locally (Offline-First)
         ↓
Syncs to Soul Signature API
         ↓
Builds Authentic Soul Profile
```

### Data Flow

1. **Detection:** Content scripts monitor YouTube pages for video watch events
2. **Capture:** Extract metadata (video ID, title, channel, duration)
3. **Local Storage:** Store events in browser storage as backup
4. **API Sync:** Send to your Soul Signature API endpoint
5. **Processing:** Backend analyzes patterns for soul signature building

## Technical Details

### Manifest V3

Built with Chrome's latest Manifest V3 standard:
- Service Worker for background processing
- Content Scripts for page interaction
- Chrome Storage API for local data
- Alarms API for periodic syncing

### Files Structure

```
browser-extension/
├── manifest.json              # Extension configuration
├── src/
│   ├── background.js          # Service worker (data handling)
│   ├── content-youtube.js     # YouTube tracker
│   └── content-netflix.js     # Netflix tracker (placeholder)
├── popup/
│   ├── popup.html            # Extension UI
│   ├── popup.css             # Anthropic-inspired styling
│   └── popup.js              # Popup logic
├── icons/                    # Extension icons
└── README.md                 # This file
```

### API Integration

The extension sends data to two endpoints:

**Real-time Tracking:**
```
POST /api/soul/extension-tracking
{
  "userId": "user-uuid",
  "platform": "youtube",
  "eventType": "VIDEO_STARTED",
  "data": {
    "videoId": "...",
    "title": "...",
    "channelName": "...",
    ...
  }
}
```

**Historical Import:**
```
POST /api/soul/extension-historical-import
{
  "userId": "user-uuid",
  "platform": "youtube",
  "videos": [{...}, {...}],
  "importedAt": "2025-10-08T..."
}
```

## Privacy & Security

### Privacy-First Design

- ✅ **Local-First:** Data stored in browser until synced
- ✅ **User Control:** Enable/disable per platform
- ✅ **Transparent:** See exactly what's being tracked
- ✅ **Secure:** HTTPS-only communication
- ✅ **Deletable:** Disconnect anytime with data preserved

### What We Track

**YouTube:**
- Video ID, title, channel name
- Watch start time, duration, progress
- NOT tracked: Comments, likes, dislikes

**What We DON'T Track:**
- Passwords or login credentials
- Payment information
- Personal messages
- Search history (unless explicitly enabled)

### Data Retention

- Local browser storage: Until manually cleared
- API server: According to platform privacy policy
- Historical imports: One-time, not repeated

## Development

### Prerequisites

- Chrome/Chromium browser
- Node.js (for API backend)
- Soul Signature account

### Local Development

1. Make changes to extension files
2. Go to `chrome://extensions/`
3. Click reload icon on Soul Signature extension
4. Test on youtube.com

### Debugging

- **Content Script:** Open DevTools on YouTube → Console tab
- **Background Script:** Go to `chrome://extensions/` → Inspect service worker
- **Popup:** Right-click extension icon → Inspect

Look for `[Soul Signature]` logs in console.

### Adding New Platform

1. Create `src/content-{platform}.js`
2. Add to `manifest.json` content_scripts
3. Implement watch detection logic
4. Send events to background script
5. Update popup UI

## Publishing to Chrome Web Store

### Steps (Future)

1. Create developer account ($5 one-time fee)
2. Prepare store listing:
   - Screenshots
   - Description
   - Privacy policy
3. Upload extension package
4. Submit for review
5. Wait for approval (~1-3 days)

### Store Requirements

- ✅ Manifest V3 (check)
- ✅ Privacy policy (needed)
- ✅ Clear permissions explanation (check)
- ✅ Icon assets (need to create)

## Roadmap

### Phase 1: MVP (Current)
- [x] YouTube real-time tracking
- [x] YouTube historical import
- [x] Popup UI
- [x] Local storage & sync
- [x] Privacy controls

### Phase 2: Multi-Platform
- [ ] Netflix tracking
- [ ] Prime Video tracking
- [ ] HBO Max tracking
- [ ] Disney+ tracking

### Phase 3: Advanced Features
- [ ] Watch time analytics in popup
- [ ] Recommendations based on viewing
- [ ] Export viewing data
- [ ] Cross-device sync
- [ ] Browser fingerprint prevention

### Phase 4: Soul Signature Integration
- [ ] Real-time personality updates
- [ ] Viewing pattern insights
- [ ] Content preference visualization
- [ ] Digital twin trait evolution

## Support

**Issues:** https://github.com/stefanogebara/twin-ai-learn/issues

**Email:** support@twinailearn.com (placeholder)

**Documentation:** https://twin-ai-learn.vercel.app/docs

## License

MIT License - see LICENSE file

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create feature branch
3. Make changes
4. Test thoroughly
5. Submit pull request

---

**Built with ❤️ for authentic digital identity**

*"Perhaps we are searching in the branches for what we only find in the roots." - Rami*
