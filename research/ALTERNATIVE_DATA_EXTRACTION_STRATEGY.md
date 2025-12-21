# Alternative Data Extraction Strategy for Twin Me

## Problem
OAuth tokens keep expiring (especially Spotify, YouTube), causing poor user experience and unreliable data extraction.

## Solution: Multi-Method Data Extraction Approach

### 1. Browser Extension (Primary Solution)
**Benefits:**
- Direct access to user's browsing data
- No OAuth required
- Works for ALL platforms (including those without APIs)
- Real-time data capture
- Never expires

**Implementation:**
```javascript
// manifest.json for Chrome Extension
{
  "name": "Twin Me Soul Observer",
  "version": "1.0",
  "manifest_version": 3,
  "permissions": [
    "tabs",
    "storage",
    "webRequest",
    "cookies"
  ],
  "host_permissions": [
    "*://*.spotify.com/*",
    "*://*.youtube.com/*",
    "*://*.netflix.com/*",
    "*://*.discord.com/*",
    "*://*.slack.com/*",
    "*://*.github.com/*"
  ],
  "content_scripts": [
    {
      "matches": ["*://*/*"],
      "js": ["content.js"]
    }
  ]
}
```

### 2. Data Import Feature
**Supported Formats:**
- Spotify: Export playlist via spotify.github.io/web-api-sdk
- YouTube: Google Takeout data
- Netflix: Download viewing history CSV
- Discord: Data package request
- GitHub: API export or git log

**Implementation:**
```typescript
// src/pages/DataImport.tsx
const DataImportPage = () => {
  const handleFileUpload = async (file: File) => {
    const fileType = detectFileType(file);
    const data = await parseFile(file, fileType);
    await processImportedData(data);
  };

  return (
    <div>
      <h2>Import Your Data</h2>
      <div className="grid grid-cols-2 gap-4">
        <ImportCard
          platform="Spotify"
          instructions="1. Go to spotify.com/account
2. Request your data
3. Upload the JSON file"
        />
        <ImportCard
          platform="YouTube"
          instructions="1. Go to takeout.google.com
2. Select YouTube data
3. Upload the archive"
        />
      </div>
    </div>
  );
};
```

### 3. API Key Authentication
For platforms that support it:
```typescript
// api/services/apiKeyAuth.js
const API_KEY_PLATFORMS = {
  github: {
    baseUrl: 'https://api.github.com',
    headers: (key) => ({ 'Authorization': `token ${key}` })
  },
  discord: {
    baseUrl: 'https://discord.com/api/v10',
    headers: (key) => ({ 'Authorization': `Bot ${key}` })
  }
};
```

### 4. Manual Data Entry Forms
Quick personality questionnaires:
```typescript
// src/components/QuickSoulSignature.tsx
const QuickSoulSignature = () => {
  return (
    <form>
      <h3>Quick Soul Discovery (5 minutes)</h3>

      <Question>
        What are your top 5 favorite movies/shows?
        <MultiSelect options={popularShows} />
      </Question>

      <Question>
        What music genres do you prefer?
        <CheckboxGroup options={musicGenres} />
      </Question>

      <Question>
        Describe your ideal weekend:
        <TextArea maxLength={500} />
      </Question>

      <Question>
        What YouTube channels do you subscribe to?
        <TagInput placeholder="Add channels..." />
      </Question>
    </form>
  );
};
```

### 5. Hybrid Scraping Solution
Using Playwright in browser context:
```typescript
// api/services/hybridScraper.js
const extractSpotifyData = async (userCredentials) => {
  const browser = await playwright.chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // Login to Spotify
  await page.goto('https://accounts.spotify.com/login');
  await page.fill('[name="username"]', userCredentials.email);
  await page.fill('[name="password"]', userCredentials.password);
  await page.click('[type="submit"]');

  // Navigate to listening history
  await page.goto('https://www.spotify.com/account/privacy/');

  // Extract data
  const recentlyPlayed = await page.evaluate(() => {
    // Scrape DOM for listening history
    return Array.from(document.querySelectorAll('.track-item')).map(item => ({
      track: item.querySelector('.track-name')?.textContent,
      artist: item.querySelector('.artist-name')?.textContent,
      playedAt: item.querySelector('.played-time')?.textContent
    }));
  });

  await browser.close();
  return recentlyPlayed;
};
```

### 6. Email Parsing Integration
Parse forwarded emails:
```typescript
// api/services/emailParser.js
const parseSpotifyEmail = (emailContent) => {
  // Parse "Your Weekly Mixtape" emails
  const tracks = extractTracksFromEmail(emailContent);
  return {
    platform: 'spotify',
    dataType: 'listening_habits',
    data: tracks
  };
};
```

## Implementation Priority

### Phase 1: Quick Wins (Week 1)
1. **Data Import Feature**
   - CSV/JSON upload interface
   - Support for Spotify, YouTube, GitHub exports
   - Parse and store in database

2. **Manual Entry Forms**
   - Quick personality quiz
   - Favorite content forms
   - Interest tagging system

### Phase 2: Browser Extension (Week 2)
1. **Chrome Extension MVP**
   - Basic content tracking
   - Send data to API
   - User privacy controls

2. **Platform Support**
   - Netflix viewing history
   - YouTube watch time
   - Spotify listening patterns

### Phase 3: Advanced Features (Week 3)
1. **Hybrid Scraping**
   - Playwright automation
   - Scheduled data pulls
   - Error recovery

2. **API Key Support**
   - GitHub integration
   - Discord bot data
   - Other platform APIs

## Database Schema Updates

```sql
-- New table for imported data
CREATE TABLE imported_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  platform TEXT NOT NULL,
  import_method TEXT NOT NULL, -- 'oauth', 'import', 'extension', 'manual', 'api_key'
  data_type TEXT NOT NULL,
  raw_data JSONB,
  processed_data JSONB,
  imported_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP -- NULL for permanent data
);

-- Track data source reliability
CREATE TABLE data_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  platform TEXT NOT NULL,
  method TEXT NOT NULL,
  reliability_score FLOAT, -- 0-1 score
  last_successful_sync TIMESTAMP,
  error_count INT DEFAULT 0
);
```

## User Experience Flow

1. **Onboarding Wizard**
```
Welcome → Choose Method → Extract Data → Build Soul Signature

Methods:
┌─────────────────┬──────────────────┬─────────────────┐
│ 🚀 Quick Start  │ 🔧 Power User    │ 🛡️ Privacy First│
│                 │                  │                 │
│ • Import files  │ • Browser ext    │ • Manual entry  │
│ • Quick quiz    │ • API keys       │ • Limited data  │
│ • Basic OAuth   │ • Full OAuth     │ • Local storage │
│                 │                  │                 │
│ 5 min setup     │ 15 min setup     │ 10 min setup    │
└─────────────────┴──────────────────┴─────────────────┘
```

2. **Data Quality Indicators**
```typescript
const DataQualityBadge = ({ method, completeness }) => {
  const quality = {
    oauth: { label: 'Live', color: 'green', score: 100 },
    extension: { label: 'Real-time', color: 'blue', score: 95 },
    import: { label: 'Static', color: 'yellow', score: 70 },
    manual: { label: 'Estimated', color: 'gray', score: 50 }
  };

  return (
    <Badge color={quality[method].color}>
      {quality[method].label} • {completeness}% complete
    </Badge>
  );
};
```

## Success Metrics
- **Data Coverage**: % of platforms with data
- **Data Freshness**: Days since last update
- **Extraction Success Rate**: Successful extractions / attempts
- **User Satisfaction**: Ease of setup rating

## Fallback Chain
1. Try OAuth (if tokens valid)
2. Try API key (if configured)
3. Suggest browser extension
4. Offer data import
5. Fallback to manual entry

This multi-method approach ensures we can always extract user data, regardless of OAuth issues!</content>