# Soul Data Extraction - Integration Example

## Quick Start Integration

### Step 1: Import the New Service

In `api/routes/soul-extraction.js`, add:

```javascript
import {
  extractSpotifyData,
  extractYouTubeData,
  extractGitHubData,
  extractDiscordData,
  extractNetflixData,
  extractPlatformSoulData
} from '../services/soulDataExtraction.js';
```

### Step 2: Update Extraction Route

Replace the old extraction logic with:

```javascript
// POST /api/soul-extraction/extract
router.post('/extract', authenticateUser, async (req, res) => {
  try {
    const { platform } = req.body;
    const userId = req.user.id;

    console.log(`🎯 Starting soul extraction for user ${userId}, platform: ${platform}`);

    // Extract soul data using new service
    const result = await extractPlatformSoulData(platform, userId);

    // Handle null response (extraction failed)
    if (!result) {
      return res.status(500).json({
        success: false,
        error: 'EXTRACTION_FAILED',
        message: `Failed to extract data from ${platform}`
      });
    }

    // Handle rate limiting
    if (result.error === 'RATE_LIMITED') {
      return res.status(429).json({
        success: false,
        error: 'RATE_LIMITED',
        message: `${platform} API rate limit exceeded`,
        retryAfter: result.retryAfter
      });
    }

    // Handle token expiration
    if (result.error === 'TOKEN_EXPIRED') {
      return res.status(401).json({
        success: false,
        error: 'TOKEN_EXPIRED',
        message: `${platform} connection requires re-authorization`,
        requiresReauth: true,
        platform: platform
      });
    }

    // Success response
    res.json({
      success: true,
      platform: result.platform,
      dataType: result.dataType,
      quality: result.quality,
      extractedPatterns: result.extractedPatterns,
      timestamp: result.timestamp
    });

  } catch (error) {
    console.error('Soul extraction error:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});
```

### Step 3: Add Netflix Extension Route

```javascript
// POST /api/soul-extraction/netflix
router.post('/netflix', authenticateUser, async (req, res) => {
  try {
    const { viewingActivity } = req.body;
    const userId = req.user.id;

    if (!viewingActivity || !Array.isArray(viewingActivity)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_DATA',
        message: 'viewingActivity must be an array'
      });
    }

    console.log(`🎬 Processing Netflix data for user ${userId}: ${viewingActivity.length} items`);

    const result = await extractNetflixData({ viewingActivity });

    if (!result) {
      return res.status(500).json({
        success: false,
        error: 'EXTRACTION_FAILED',
        message: 'Failed to process Netflix viewing history'
      });
    }

    // Save to database
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    await supabase.from('soul_data').insert({
      user_id: userId,
      platform: 'netflix',
      data_type: result.dataType,
      raw_data: result.rawData,
      extracted_patterns: result.extractedPatterns,
      extraction_quality: result.quality,
      extracted_at: new Date()
    });

    res.json({
      success: true,
      platform: 'netflix',
      quality: result.quality,
      itemsProcessed: viewingActivity.length,
      extractedPatterns: result.extractedPatterns
    });

  } catch (error) {
    console.error('Netflix extraction error:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});
```

## Frontend Integration

### React Component Example

```typescript
// src/components/SoulDataExtractor.tsx
import { useState } from 'react';
import { api } from '../services/api';

interface ExtractionResult {
  success: boolean;
  platform: string;
  quality: 'high' | 'medium' | 'low';
  extractedPatterns: any;
  error?: string;
  requiresReauth?: boolean;
}

export function SoulDataExtractor({ platform }: { platform: string }) {
  const [extracting, setExtracting] = useState(false);
  const [result, setResult] = useState<ExtractionResult | null>(null);

  const handleExtract = async () => {
    setExtracting(true);
    setResult(null);

    try {
      const response = await api.post('/soul-extraction/extract', { platform });
      setResult(response.data);

      // Show success message with quality indicator
      if (response.data.success) {
        toast.success(`${platform} data extracted! Quality: ${response.data.quality}`);
      }

    } catch (error: any) {
      const errorData = error.response?.data;

      if (errorData?.error === 'TOKEN_EXPIRED') {
        // Trigger re-authorization
        setResult({
          success: false,
          error: 'TOKEN_EXPIRED',
          requiresReauth: true,
          platform: platform
        });
        toast.error(`${platform} connection expired. Please reconnect.`);

      } else if (errorData?.error === 'RATE_LIMITED') {
        // Show rate limit message
        const retryAfter = errorData.retryAfter || 60;
        toast.error(`Rate limited. Try again in ${retryAfter} seconds.`);

      } else {
        toast.error(`Failed to extract ${platform} data`);
      }

    } finally {
      setExtracting(false);
    }
  };

  return (
    <div className="extraction-card">
      <button
        onClick={handleExtract}
        disabled={extracting}
        className="extract-button"
      >
        {extracting ? (
          <>
            <Spinner /> Extracting {platform}...
          </>
        ) : (
          <>
            <IconExtract /> Extract {platform} Data
          </>
        )}
      </button>

      {result?.requiresReauth && (
        <div className="auth-required">
          <p>Authorization expired</p>
          <button onClick={() => window.location.href = `/connect/${platform}`}>
            Reconnect {platform}
          </button>
        </div>
      )}

      {result?.success && (
        <div className="extraction-success">
          <h3>Extraction Complete</h3>
          <div className="quality-badge" data-quality={result.quality}>
            Quality: {result.quality}
          </div>

          {/* Show key insights */}
          {platform === 'spotify' && result.extractedPatterns && (
            <div className="insights">
              <p>Top Genres: {result.extractedPatterns.topGenres?.slice(0, 3).map(g => g.genre).join(', ')}</p>
              <p>Diversity Score: {(result.extractedPatterns.diversityScore * 100).toFixed(0)}%</p>
              <p>Mood: {result.extractedPatterns.emotionalLandscape}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

### Platform Dashboard Example

```typescript
// src/pages/SoulSignatureDashboard.tsx
import { SoulDataExtractor } from '../components/SoulDataExtractor';

const platforms = [
  { id: 'spotify', name: 'Spotify', icon: '🎵', category: 'entertainment' },
  { id: 'youtube', name: 'YouTube', icon: '📺', category: 'entertainment' },
  { id: 'github', name: 'GitHub', icon: '🐙', category: 'productivity' },
  { id: 'discord', name: 'Discord', icon: '💬', category: 'social' },
];

export function SoulSignatureDashboard() {
  return (
    <div className="soul-dashboard">
      <h1>Soul Signature Extraction</h1>

      <div className="platform-grid">
        {platforms.map(platform => (
          <div key={platform.id} className="platform-card">
            <div className="platform-header">
              <span className="platform-icon">{platform.icon}</span>
              <h3>{platform.name}</h3>
              <span className="category-badge">{platform.category}</span>
            </div>

            <SoulDataExtractor platform={platform.id} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Browser Extension Integration (Netflix)

### Chrome Extension Content Script

```javascript
// browser-extension/content-scripts/netflix.js

// Detect Netflix viewing activity page
if (window.location.hostname === 'www.netflix.com' &&
    window.location.pathname.includes('/viewingactivity')) {

  // Wait for page to load
  setTimeout(() => {
    // Extract viewing history from DOM
    const viewingActivity = [];
    const items = document.querySelectorAll('.retableRow');

    items.forEach(item => {
      const title = item.querySelector('.title')?.textContent?.trim();
      const date = item.querySelector('.date')?.textContent?.trim();

      if (title && date) {
        viewingActivity.push({ title, date });
      }
    });

    console.log(`📊 Extracted ${viewingActivity.length} Netflix items`);

    // Send to Twin AI Learn backend
    chrome.runtime.sendMessage({
      action: 'uploadNetflixData',
      data: { viewingActivity }
    });

  }, 2000); // Wait for Netflix to render
}
```

### Background Script

```javascript
// browser-extension/background.js

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'uploadNetflixData') {
    // Get JWT token from storage
    chrome.storage.local.get(['twinai_jwt'], async (result) => {
      const jwt = result.twinai_jwt;

      if (!jwt) {
        console.error('Not logged in to Twin AI Learn');
        return;
      }

      // Upload to backend
      const response = await fetch('http://localhost:3001/api/soul-extraction/netflix', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${jwt}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(message.data)
      });

      const result = await response.json();

      if (result.success) {
        // Show notification
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon.png',
          title: 'Netflix Data Uploaded',
          message: `Extracted ${message.data.viewingActivity.length} items. Quality: ${result.quality}`
        });
      }
    });
  }
});
```

## Testing Examples

### Test Spotify Extraction

```bash
# Using curl
curl -X POST http://localhost:3001/api/soul-extraction/extract \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"platform": "spotify"}'

# Expected success response
{
  "success": true,
  "platform": "spotify",
  "dataType": "musical_taste",
  "quality": "high",
  "extractedPatterns": {
    "topGenres": [
      { "genre": "indie rock", "count": 45 },
      { "genre": "electronic", "count": 32 }
    ],
    "moodScore": 0.67,
    "diversityScore": 0.85,
    "emotionalLandscape": "energetic-positive",
    "temporalPattern": "night_owl"
  },
  "timestamp": 1234567890
}
```

### Test Token Expiration

```bash
# Simulate expired token
curl -X POST http://localhost:3001/api/soul-extraction/extract \
  -H "Authorization: Bearer EXPIRED_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"platform": "spotify"}'

# Expected error response
{
  "success": false,
  "error": "TOKEN_EXPIRED",
  "message": "spotify connection requires re-authorization",
  "requiresReauth": true,
  "platform": "spotify"
}
```

### Test Rate Limiting

```bash
# Make multiple rapid requests
for i in {1..10}; do
  curl -X POST http://localhost:3001/api/soul-extraction/extract \
    -H "Authorization: Bearer YOUR_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"platform": "spotify"}' &
done

# Expected rate limit response
{
  "success": false,
  "error": "RATE_LIMITED",
  "message": "spotify API rate limit exceeded",
  "retryAfter": 60
}
```

### Test Netflix Upload

```bash
curl -X POST http://localhost:3001/api/soul-extraction/netflix \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "viewingActivity": [
      {"title": "Breaking Bad: Season 1: Pilot", "date": "2024-01-15"},
      {"title": "Breaking Bad: Season 1: Episode 2", "date": "2024-01-15"},
      {"title": "Stranger Things: Season 1", "date": "2024-01-16"}
    ]
  }'

# Expected response
{
  "success": true,
  "platform": "netflix",
  "quality": "low",
  "itemsProcessed": 3,
  "extractedPatterns": {
    "topShows": [
      { "title": "Breaking Bad", "episodes": 2, "status": "in-progress" }
    ],
    "bingeStyle": "moderate-binger",
    "topGenre": "drama"
  }
}
```

## Monitoring & Debugging

### Check Extraction Logs

```javascript
// Console output during extraction
🎯 Starting soul extraction for platform: spotify
🎵 Starting Spotify extraction...
📦 Using cached data for spotify-top-artists
✅ Spotify extraction complete: 50 tracks, 50 artists
✅ Soul data saved to database for spotify
```

### Query Extracted Data

```sql
-- Check latest extractions
SELECT
  platform,
  data_type,
  extraction_quality,
  extracted_at,
  jsonb_array_length((extracted_patterns->'topGenres')::jsonb) as pattern_count
FROM soul_data
WHERE user_id = 'USER_ID'
ORDER BY extracted_at DESC
LIMIT 10;

-- Check extraction quality distribution
SELECT
  platform,
  extraction_quality,
  COUNT(*) as count
FROM soul_data
WHERE user_id = 'USER_ID'
GROUP BY platform, extraction_quality;
```

### Clear Cache (for testing)

```javascript
// In soulDataExtraction.js, add:
export function clearCache() {
  apiCache.clear();
  console.log('🗑️ API cache cleared');
}

// In route:
router.post('/clear-cache', authenticateUser, (req, res) => {
  clearCache();
  res.json({ success: true, message: 'Cache cleared' });
});
```

## Environment Variables Required

Make sure these are set in `.env`:

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Encryption (if using token encryption)
ENCRYPTION_KEY=your-32-byte-hex-key
```

## Next Steps

1. ✅ **Integration**: Add import to `soul-extraction.js`
2. ✅ **Route Update**: Replace extraction logic with new service
3. ✅ **Frontend**: Update SoulDataExtractor component
4. ✅ **Testing**: Test each platform with real OAuth tokens
5. ⏭️ **Browser Extension**: Build Netflix extraction extension
6. ⏭️ **Monitoring**: Add extraction analytics dashboard

## Support

For issues or questions:
- Check console logs for detailed error messages
- Verify OAuth tokens are valid and not expired
- Ensure platform_connections table has correct access_token
- Test API endpoints directly with curl/Postman first
