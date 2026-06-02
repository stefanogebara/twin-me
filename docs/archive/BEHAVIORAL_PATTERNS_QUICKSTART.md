# Behavioral Pattern Recognition - Quick Start Guide

## 🚀 5-Minute Setup

### Step 1: Run Database Migrations

```bash
# Connect to your Supabase project
cd twin-ai-learn

# Run migrations (via Supabase CLI or dashboard)
# Migration 1: Core tables and schema
database/supabase/migrations/20250117000000_behavioral_pattern_recognition.sql

# Migration 2: Helper functions
database/supabase/migrations/20250117000001_pattern_helper_functions.sql
```

**Via Supabase Dashboard:**
1. Go to https://app.supabase.com
2. Select your project
3. Navigate to SQL Editor
4. Copy/paste migration SQL and run

**Via Supabase CLI:**
```bash
supabase db push
```

### Step 2: Verify Installation

```bash
# Check tables were created
psql -h your-db.supabase.co -U postgres -d postgres -c "\dt behavioral_patterns"
```

You should see:
- `behavioral_patterns`
- `pattern_observations`
- `pattern_insights`
- `pattern_tracking_sessions`

### Step 3: Start Backend Server

The API routes are already registered in `api/server.js`:

```bash
npm run server:dev
```

Server should start on `http://localhost:3001`

### Step 4: Test API Endpoints

```bash
# Get auth token (replace with your actual login)
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'

# Extract token from response
TOKEN="your-jwt-token-here"

# Test pattern detection
curl -X POST http://localhost:3001/api/behavioral-patterns/detect \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "timeWindowDays": 30,
    "minOccurrences": 3,
    "minConfidence": 50
  }'

# Get patterns
curl http://localhost:3001/api/behavioral-patterns \
  -H "Authorization: Bearer $TOKEN"

# Get insights
curl http://localhost:3001/api/behavioral-patterns/insights?generate=true \
  -H "Authorization: Bearer $TOKEN"
```

### Step 5: Enable Pattern Tracking (Optional)

**Start background job in development:**

Edit `api/server.js` (around line 300):

```javascript
import { startPatternTrackingJob } from './services/patternTracker.js';

if (process.env.NODE_ENV !== 'production') {
  console.log('🚀 Starting development server...');

  // Start pattern tracking background job
  startPatternTrackingJob();

  // ... rest of server startup
}
```

Restart server:
```bash
npm run server:dev
```

You should see:
```
✅ Pattern tracking job started
✅ Job scheduled to run every 15 minutes
```

---

## 📊 Quick Test Scenario

### Scenario: Test Pattern Detection with Mock Data

**1. Insert Mock Calendar Event:**

```sql
-- Run in Supabase SQL Editor
INSERT INTO user_platform_data (user_id, platform, data_type, raw_data, extracted_at)
VALUES (
  'your-user-id-here',
  'calendar',
  'event',
  '{
    "id": "test-event-1",
    "summary": "Important Presentation",
    "description": "Q4 Results Presentation",
    "start": {
      "dateTime": "2025-01-20T14:00:00Z"
    },
    "attendees": [
      {"email": "manager@company.com"},
      {"email": "team@company.com"}
    ]
  }'::jsonb,
  NOW()
);
```

**2. Insert Mock Spotify Activity (20 min before event):**

```sql
INSERT INTO user_platform_data (user_id, platform, data_type, raw_data, extracted_at)
VALUES (
  'your-user-id-here',
  'spotify',
  'recently_played',
  '{
    "track": {
      "name": "Peaceful Piano",
      "artists": [{"name": "Relaxing Piano Music"}]
    },
    "context": {
      "uri": "spotify:playlist:37i9dQZF1DX4sWSpwq3LiO"
    }
  }'::jsonb,
  '2025-01-20T13:40:00Z'::timestamp
);
```

**3. Run Pattern Detection:**

```bash
curl -X POST http://localhost:3001/api/behavioral-patterns/detect \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"timeWindowDays": 30}'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Detected 1 patterns",
  "data": {
    "patternsDetected": 1,
    "patternsStored": 1,
    "patterns": [
      {
        "pattern_name": "spotify recently_played 20min before high_stakes",
        "pattern_type": "pre_event_ritual",
        "confidence_score": 75,
        "occurrence_count": 1
      }
    ]
  }
}
```

**4. Generate Insights:**

```bash
curl -X POST http://localhost:3001/api/behavioral-patterns/insights/generate \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Generated 1 insights",
  "data": {
    "insights": [
      {
        "title": "Your Pre-Presentation Ritual",
        "description": "You listen to Peaceful Piano 20 minutes before...",
        "confidence": 75,
        "suggestions": [
          "Queue your focus playlist automatically",
          "Set calendar reminder: 'Time to prepare'",
          "Create variations for different event types"
        ]
      }
    ]
  }
}
```

---

## 🔧 Configuration

### Environment Variables

Add to `.env`:

```env
# Behavioral Pattern Recognition
PATTERN_DETECTION_ENABLED=true
PATTERN_TRACKING_INTERVAL_MINUTES=15
PATTERN_MIN_CONFIDENCE=50
PATTERN_MIN_OCCURRENCES=3

# Claude AI for insights
ANTHROPIC_API_KEY=your-anthropic-key
```

### User Opt-In

**Enable pattern tracking for a user:**

```sql
UPDATE users
SET pattern_tracking_enabled = TRUE
WHERE id = 'your-user-id';
```

**Or via API:**

```javascript
// Frontend
const enablePatternTracking = async () => {
  await fetch('/api/users/settings', {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      pattern_tracking_enabled: true
    })
  });
};
```

---

## 📱 Frontend Integration

### React Component Example

```tsx
// src/components/BehavioralPatterns.tsx
import { useState, useEffect } from 'react';

export function BehavioralPatterns() {
  const [patterns, setPatterns] = useState([]);
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPatterns();
  }, []);

  const loadPatterns = async () => {
    const token = localStorage.getItem('token');

    // Get high-confidence patterns
    const patternsRes = await fetch(
      '/api/behavioral-patterns?highConfidenceOnly=true',
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    const patternsData = await patternsRes.json();
    setPatterns(patternsData.data.patterns);

    // Get insights
    const insightsRes = await fetch(
      '/api/behavioral-patterns/insights',
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    const insightsData = await insightsRes.json();
    setInsights(insightsData.data.insights);

    setLoading(false);
  };

  const detectPatterns = async () => {
    const token = localStorage.getItem('token');
    setLoading(true);

    await fetch('/api/behavioral-patterns/detect', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    await loadPatterns();
  };

  if (loading) return <div>Loading patterns...</div>;

  return (
    <div className="behavioral-patterns">
      <h2>Your Behavioral Patterns</h2>

      <button onClick={detectPatterns}>
        Detect New Patterns
      </button>

      <div className="insights">
        <h3>Insights</h3>
        {insights.map(insight => (
          <div key={insight.id} className="insight-card">
            <h4>{insight.title}</h4>
            <p>{insight.description}</p>
            <div className="confidence">
              Confidence: {insight.confidence}%
            </div>
            <ul className="suggestions">
              {insight.suggestions?.map((suggestion, i) => (
                <li key={i}>{suggestion}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="patterns">
        <h3>Detected Patterns</h3>
        {patterns.map(pattern => (
          <div key={pattern.id} className="pattern-card">
            <h4>{pattern.pattern_name}</h4>
            <div className="pattern-details">
              <span>Type: {pattern.pattern_type}</span>
              <span>Confidence: {pattern.confidence_score}%</span>
              <span>Occurrences: {pattern.occurrence_count}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## 🐛 Troubleshooting

### Issue: No patterns detected

**Check:**
1. User has `pattern_tracking_enabled = true`
2. Sufficient data exists:
   - At least 5 calendar events
   - At least 20 platform activities (Spotify, YouTube, etc.)
3. Time window is appropriate (try 30-60 days)

**Debug:**
```sql
-- Check calendar events
SELECT COUNT(*) FROM user_platform_data
WHERE user_id = 'your-id' AND platform = 'calendar';

-- Check platform activities
SELECT platform, COUNT(*) FROM user_platform_data
WHERE user_id = 'your-id'
GROUP BY platform;
```

### Issue: Low confidence scores

**Cause:** Patterns need more observations

**Solution:**
- Wait for more data to accumulate
- Sync more historical data from platforms
- Lower `minConfidence` threshold temporarily

### Issue: Background job not running

**Check:**
```bash
# Verify job started
# Should see in logs:
✅ Pattern tracking job started
```

**Debug:**
```javascript
// Add to patternTracker.js
console.log('🔍 [Pattern Tracker] Running tracking cycle');
```

### Issue: Insights not generating

**Check:**
1. `ANTHROPIC_API_KEY` is set
2. Patterns have confidence >= 70%
3. No existing insights for same pattern

**Test Claude API:**
```bash
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-3-5-sonnet-20241022","max_tokens":100,"messages":[{"role":"user","content":"Test"}]}'
```

---

## 📈 Monitoring

### Check System Health

```bash
# Get pattern stats
curl http://localhost:3001/api/behavioral-patterns/stats \
  -H "Authorization: Bearer $TOKEN"

# Get tracking status
curl http://localhost:3001/api/behavioral-patterns/tracking/status \
  -H "Authorization: Bearer $TOKEN"
```

### Database Queries

```sql
-- Pattern summary
SELECT * FROM get_user_pattern_summary('user-id');

-- Recent insights
SELECT * FROM recent_pattern_insights WHERE user_id = 'user-id';

-- High confidence patterns
SELECT * FROM high_confidence_patterns WHERE user_id = 'user-id';

-- Recent tracking sessions
SELECT * FROM pattern_tracking_sessions
WHERE user_id = 'user-id'
ORDER BY created_at DESC
LIMIT 5;
```

---

## 🎯 Next Steps

After basic setup:

1. **Integrate with Soul Dashboard:**
   - Add pattern cards to `SoulSignatureDashboard.tsx`
   - Display insights prominently

2. **Enable Privacy Controls:**
   - Add pattern visibility sliders
   - Connect to existing privacy spectrum UI

3. **Set up Notifications:**
   - Alert users when patterns detected
   - Suggest rituals before calendar events

4. **Production Deployment:**
   - Set up Vercel Cron for `/api/cron/pattern-tracking`
   - Configure rate limiting
   - Enable monitoring/logging

---

## 📚 Documentation

- **Full Documentation:** `BEHAVIORAL_PATTERNS_README.md`
- **Database Schema:** `database/supabase/migrations/20250117000000_behavioral_pattern_recognition.sql`
- **API Reference:** `api/routes/behavioral-patterns.js`
- **Services:** `api/services/behavioral*.js`

---

## 🆘 Support

**Common Commands:**

```bash
# Restart server
npm run server:dev

# Check logs
tail -f api/logs/server.log

# Test API
npm run test:api

# Database reset (CAUTION)
supabase db reset
```

**Need Help?**
- Review inline code comments
- Check `BEHAVIORAL_PATTERNS_README.md`
- Verify environment variables
- Check Supabase logs in dashboard
