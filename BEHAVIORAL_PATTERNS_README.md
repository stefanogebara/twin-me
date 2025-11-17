# Behavioral Pattern Recognition System

## Overview

A sophisticated cross-platform behavioral intelligence system that detects temporal correlations between calendar events and user activities across multiple platforms (Spotify, YouTube, Discord, GitHub, etc.). The system discovers authentic behavioral rituals and coping mechanisms with ML-based confidence scoring.

**Example Use Case:**
> User has important presentation scheduled in Google Calendar → System detects: 20 minutes before presentation, user always listens to lo-fi hip hop playlist → **Pattern recognized with 94% confidence** → Proactive suggestion: "Queue your focus playlist before upcoming meeting"

---

## Architecture Components

### 1. Database Schema
**File:** `database/supabase/migrations/20250117000000_behavioral_pattern_recognition.sql`

**Core Tables:**

#### `behavioral_patterns`
Stores detected cross-platform patterns with ML-based confidence scoring.

Key fields:
- `pattern_type`: pre_event_ritual, post_event_recovery, stress_response, focus_trigger, etc.
- `trigger_type`: calendar_event, deadline, social_activity, etc.
- `response_platform`: spotify, youtube, discord, github, etc.
- `time_offset_minutes`: Timing relative to trigger (-20 = 20 min before)
- `confidence_score`: 0-100 ML-based confidence
- `occurrence_count`: Number of times observed
- `consistency_rate`: % of similar events where pattern occurred

#### `pattern_observations`
Individual occurrences of detected patterns for validation and tracking.

#### `pattern_insights`
Claude AI-generated natural language insights and actionable suggestions.

Key fields:
- `insight_type`: ritual_discovery, behavior_prediction, pattern_suggestion, etc.
- `title`, `description`: Human-readable insight
- `suggestions`: Actionable recommendations (JSONB array)
- `user_rating`: 1-5 star user feedback

#### `pattern_tracking_sessions`
Real-time pattern detection sessions for monitoring and analytics.

---

### 2. Core Services

#### `behavioralPatternRecognition.js`
**Main pattern detection and correlation engine**

**Key Functions:**
```javascript
// Detect temporal correlations between calendar events and activities
detectTemporalCorrelations(userId, timeWindowHours = 72)

// Build behavioral fingerprint for specific event type
buildBehavioralFingerprint(userId, eventType)

// Calculate ML-based confidence score
scorePatternConfidence(pattern) // Returns 0-100

// Detect and store patterns
detectAndStoreBehavioralPatterns(userId, options)

// Retrieve patterns
getUserPatterns(userId, filters)
getHighConfidencePatterns(userId) // >= 70% confidence
```

**Confidence Scoring Algorithm:**
- **Frequency component (0-40 points)**: More occurrences = higher confidence
- **Consistency component (0-40 points)**: % of similar events where pattern occurred
- **Temporal stability (0-20 points)**: Patterns over longer periods more reliable

**Confidence Levels:**
- **90-100%**: "We're confident you..."
- **70-89%**: "It seems like you..."
- **50-69%**: "You might..."
- **<50%**: Don't surface (insufficient data)

---

#### `patternTracker.js`
**Real-time pattern monitoring and proactive suggestions**

**Key Functions:**
```javascript
// Background job - runs every 15 minutes
startPatternTrackingJob()

// Track individual user
trackUserPatterns(userId)

// Predict next pattern occurrence
predictNextPatternOccurrence(userId, patternId)

// Manual tracking trigger
triggerManualTracking(userId)

// Event-triggered tracking
trackOnCalendarUpdate(userId, newEvent)

// Get tracking status
getPatternTrackingStatus(userId)
```

**Tracking Flow:**
1. Check upcoming calendar events (next 24 hours)
2. Monitor current user activity (last 60 minutes)
3. Match activities to known patterns
4. Generate proactive suggestions when patterns not followed
5. Update pattern confidence scores

---

#### `patternInsightGenerator.js`
**Claude AI-powered natural language insight generation**

**Key Functions:**
```javascript
// Generate insights for high-confidence patterns
generatePatternInsights(userId)

// Retrieve user insights
getUserInsights(userId, filters)

// Dismiss insight
dismissInsight(userId, insightId)

// Rate insight (1-5 stars)
rateInsight(userId, insightId, rating, feedback)

// Cross-pattern correlations
generateCrossPatternInsights(userId)
```

**Claude AI Integration:**
- Model: `claude-3-5-sonnet-20241022`
- Temperature: 0.7
- Generates: Title, description, trigger, behavior, timing, suggestions
- Fallback: Template-based insights if AI unavailable

**Insight Types:**
- **ritual_discovery**: "Your Pre-Presentation Ritual"
- **behavior_prediction**: "You'll likely do X before Y"
- **pattern_suggestion**: "Consider this pattern for upcoming event"
- **anomaly_detection**: "You broke your usual pattern"
- **optimization_tip**: "This pattern seems effective"
- **cross_pattern_correlation**: "These behaviors co-occur"

---

### 3. RESTful API Endpoints

**File:** `api/routes/behavioral-patterns.js`

#### Pattern Detection
```http
POST /api/behavioral-patterns/detect
Authorization: Bearer <token>
Body: {
  "timeWindowDays": 30,     // Optional, default: 30
  "minOccurrences": 3,      // Optional, default: 3
  "minConfidence": 50       // Optional, default: 50
}

Response: {
  "success": true,
  "message": "Detected 5 patterns",
  "data": {
    "patternsDetected": 12,
    "patternsStored": 5,
    "patterns": [...]
  }
}
```

#### Get Patterns
```http
GET /api/behavioral-patterns
Authorization: Bearer <token>
Query params:
  - minConfidence: number
  - patternType: string
  - platform: string
  - highConfidenceOnly: boolean

Response: {
  "success": true,
  "data": {
    "patterns": [...],
    "count": 5
  }
}
```

#### Get Specific Pattern
```http
GET /api/behavioral-patterns/:id
Authorization: Bearer <token>

Response: {
  "success": true,
  "data": {
    "pattern": {
      "id": "uuid",
      "pattern_name": "Spotify lo-fi 20min before presentation",
      "confidence_score": 94.5,
      "occurrence_count": 12,
      "pattern_observations": [...]
    }
  }
}
```

#### Update Pattern
```http
PUT /api/behavioral-patterns/:id
Authorization: Bearer <token>
Body: {
  "pattern_name": "My Focus Ritual",
  "user_confirmed": true,
  "user_notes": "This really helps me focus"
}

Response: {
  "success": true,
  "message": "Pattern updated successfully"
}
```

#### Delete Pattern
```http
DELETE /api/behavioral-patterns/:id
Authorization: Bearer <token>

Response: {
  "success": true,
  "message": "Pattern deleted successfully"
}
```

#### Manual Tracking
```http
POST /api/behavioral-patterns/track
Authorization: Bearer <token>

Response: {
  "success": true,
  "data": {
    "eventsTracked": 3,
    "patternsMatched": 2,
    "suggestions": [...]
  }
}
```

#### Tracking Status
```http
GET /api/behavioral-patterns/tracking/status
Authorization: Bearer <token>

Response: {
  "success": true,
  "data": {
    "isEnabled": true,
    "activePatterns": 8,
    "upcomingEvents": 3,
    "recentSessions": [...],
    "lastTrackedAt": "2025-01-17T10:30:00Z"
  }
}
```

#### Predict Next Occurrence
```http
POST /api/behavioral-patterns/:id/predict
Authorization: Bearer <token>

Response: {
  "success": true,
  "data": {
    "predicted": true,
    "event": {...},
    "executionTime": "2025-01-18T14:40:00Z",
    "pattern": {
      "name": "Pre-presentation music",
      "activity": "Listen to Peaceful Piano"
    }
  }
}
```

#### Get Insights
```http
GET /api/behavioral-patterns/insights
Authorization: Bearer <token>
Query params:
  - minConfidence: number
  - insightType: string
  - generate: boolean (true to generate new insights)

Response: {
  "success": true,
  "data": {
    "insights": [...],
    "count": 3
  }
}
```

#### Generate Insights
```http
POST /api/behavioral-patterns/insights/generate
Authorization: Bearer <token>
Body: {
  "includeCrossPatterns": true  // Optional
}

Response: {
  "success": true,
  "message": "Generated 5 insights",
  "data": {
    "insights": [...],
    "crossPatternInsights": [...],
    "totalGenerated": 5
  }
}
```

#### Dismiss Insight
```http
POST /api/behavioral-patterns/insights/:id/dismiss
Authorization: Bearer <token>

Response: {
  "success": true,
  "message": "Insight dismissed successfully"
}
```

#### Rate Insight
```http
POST /api/behavioral-patterns/insights/:id/rate
Authorization: Bearer <token>
Body: {
  "rating": 5,
  "feedback": "This is exactly right!"
}

Response: {
  "success": true,
  "message": "Insight rated successfully"
}
```

#### Get Statistics
```http
GET /api/behavioral-patterns/stats
Authorization: Bearer <token>

Response: {
  "success": true,
  "data": {
    "totalPatterns": 8,
    "patternsByType": {
      "pre_event_ritual": 3,
      "stress_response": 2,
      "focus_trigger": 3
    },
    "confidenceDistribution": {
      "very_high": 2,
      "high": 4,
      "medium": 2,
      "low": 0
    },
    "averageConfidence": 78.5,
    "recentObservations": 15
  }
}
```

---

## Integration with Soul Extraction Pipeline

### Step 1: Add to Soul Data Extraction Flow

Update `api/routes/soul-extraction.js` to trigger pattern detection after platform data extraction:

```javascript
// After extracting calendar and platform data
if (extractedData.calendar && extractedData.spotify) {
  // Trigger pattern detection
  const patternResult = await detectAndStoreBehavioralPatterns(userId, {
    timeWindowDays: 30,
    minOccurrences: 3,
    minConfidence: 50
  });

  console.log(`Detected ${patternResult.patternsStored} behavioral patterns`);
}
```

### Step 2: Include Patterns in Soul Signature

Update soul signature data structure to include behavioral patterns:

```javascript
const soulSignature = {
  // ... existing soul data
  behavioralPatterns: {
    highConfidencePatterns: await getHighConfidencePatterns(userId),
    patternInsights: await getUserInsights(userId, { minConfidence: 70 }),
    stats: {
      totalPatterns: patterns.length,
      averageConfidence: calculateAvgConfidence(patterns)
    }
  }
};
```

---

## Privacy Controls & Opt-In

### User Privacy Settings

Add to `users` table:
```sql
ALTER TABLE users ADD COLUMN pattern_tracking_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN pattern_sharing_level INT DEFAULT 50; -- 0-100
```

### Privacy Controls in `pattern_insights` table:
- `privacy_level`: 0-100 (controls revelation intensity)
- `shared_with_twin`: Boolean (share with digital twin)
- User can view, edit, delete any pattern
- All confidence scores visible (no black box)

### Opt-In Flow:

**Frontend:**
```typescript
// SoulSignatureDashboard.tsx
const [patternTrackingEnabled, setPatternTrackingEnabled] = useState(false);

const enablePatternTracking = async () => {
  await fetch('/api/users/settings', {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ pattern_tracking_enabled: true })
  });

  // Start initial detection
  await fetch('/api/behavioral-patterns/detect', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });

  setPatternTrackingEnabled(true);
};
```

**Backend:**
```javascript
// Only track users who opted in
const { data: users } = await supabase
  .from('users')
  .select('id')
  .eq('pattern_tracking_enabled', true);
```

---

## Background Job Setup

### Development (Node.js server)

Add to `api/server.js` startup:

```javascript
import { startPatternTrackingJob } from './services/patternTracker.js';

if (process.env.NODE_ENV !== 'production') {
  // Start pattern tracking background job
  startPatternTrackingJob();
  console.log('✅ Pattern tracking job started');
}
```

### Production (Vercel Cron)

Add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/pattern-tracking",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

Create `api/routes/cron-pattern-tracking.js`:

```javascript
import express from 'express';
import { trackAllUsers } from '../services/patternTracker.js';

const router = express.Router();

router.post('/', async (req, res) => {
  // Verify Vercel Cron secret
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  await trackAllUsers();

  res.json({ success: true, message: 'Pattern tracking complete' });
});

export default router;
```

---

## Example Pattern Insights

### Insight 1: Pre-Presentation Ritual
```json
{
  "type": "ritual_discovery",
  "title": "Your Pre-Presentation Ritual",
  "description": "You consistently listen to lo-fi hip hop 20 minutes before important presentations. This seems to help you focus and calm nerves.",
  "confidence": 94,
  "pattern_data": {
    "trigger": "High-stakes presentations",
    "behavior": "Lo-fi hip hop playlist",
    "timing": "20 minutes before",
    "frequency": "12 out of 13 presentations"
  },
  "suggestions": [
    "Queue your focus playlist automatically before upcoming meetings",
    "Set calendar reminder: 'Time to prepare mentally'",
    "Create new playlists for different event types"
  ]
}
```

### Insight 2: Post-Meeting Recovery
```json
{
  "type": "post_event_recovery",
  "title": "Your Wind-Down Pattern",
  "description": "After stressful meetings with 5+ attendees, you often play strategy games on Steam for about 30 minutes. This appears to be an effective stress-relief mechanism.",
  "confidence": 82,
  "pattern_data": {
    "trigger": "Large team meetings",
    "behavior": "Strategy games on Steam",
    "timing": "15-45 minutes after",
    "frequency": "9 out of 11 meetings"
  },
  "suggestions": [
    "Block 30 minutes after big meetings for decompression",
    "Track whether this improves afternoon productivity",
    "Consider other recovery activities for variety"
  ]
}
```

---

## Testing Strategy

### Unit Tests

**Pattern Confidence Scoring:**
```javascript
describe('scorePatternConfidence', () => {
  it('should return 100 for perfect pattern', () => {
    const pattern = {
      occurrence_count: 15,
      consistency_rate: 100,
      first_observed_at: '2024-12-01',
      last_observed_at: '2025-01-15'
    };
    expect(scorePatternConfidence(pattern)).toBe(100);
  });

  it('should return low score for infrequent pattern', () => {
    const pattern = {
      occurrence_count: 2,
      consistency_rate: 40,
      first_observed_at: '2025-01-10',
      last_observed_at: '2025-01-15'
    };
    expect(scorePatternConfidence(pattern)).toBeLessThan(50);
  });
});
```

### Integration Tests

**Temporal Correlation Detection:**
```javascript
describe('detectTemporalCorrelations', () => {
  it('should find Spotify activity before calendar events', async () => {
    // Mock calendar event at 2:00 PM
    // Mock Spotify activity at 1:40 PM (20 min before)

    const correlations = await detectTemporalCorrelations(userId, 24);

    expect(correlations.length).toBeGreaterThan(0);
    expect(correlations[0].activities[0].timeOffsetMinutes).toBe(-20);
  });
});
```

### End-to-End Tests

**Full Pattern Detection Flow:**
```javascript
describe('Pattern Detection E2E', () => {
  it('should detect, store, and generate insights', async () => {
    // 1. Detect patterns
    const detectionResult = await fetch('/api/behavioral-patterns/detect', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    // 2. Retrieve patterns
    const patterns = await fetch('/api/behavioral-patterns?highConfidenceOnly=true', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    // 3. Generate insights
    const insights = await fetch('/api/behavioral-patterns/insights/generate', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    expect(patterns.data.count).toBeGreaterThan(0);
    expect(insights.data.totalGenerated).toBeGreaterThan(0);
  });
});
```

---

## Performance Considerations

### Database Indexes
All critical queries have optimized indexes:
- `idx_behavioral_patterns_confidence` - High-confidence pattern queries
- `idx_pattern_observations_trigger_time` - Temporal queries
- `idx_pattern_insights_user` - Insight retrieval

### Query Optimization
- Use JSONB for flexible data storage
- Partial indexes for active patterns
- Efficient RLS policies

### Rate Limiting
Pattern detection can be CPU-intensive:
- Limit detection to once per hour per user
- Background job runs every 15 minutes (batch processing)
- API endpoint has rate limit: 10 requests/hour

---

## Security Checklist

- ✅ Row Level Security (RLS) enabled on all tables
- ✅ Users can only access their own patterns
- ✅ Input validation on all API endpoints
- ✅ JWT authentication required
- ✅ No pattern data in error messages
- ✅ Confidence scores always visible
- ✅ User can delete any pattern anytime
- ✅ Privacy level controls per pattern/insight
- ✅ Opt-in required for pattern tracking
- ✅ Audit trail via tracking sessions

---

## Next Steps

### Immediate Implementation:
1. ✅ Run database migration
2. ✅ Deploy new API endpoints
3. ✅ Start background tracking job
4. ✅ Add opt-in UI to Soul Dashboard

### Future Enhancements:
- **Pattern Automation**: Auto-queue Spotify playlist before detected events
- **Mobile Notifications**: "Time for your pre-meeting ritual"
- **Pattern Evolution Tracking**: How patterns change over time
- **Social Pattern Sharing**: "People with similar roles do X before Y"
- **Pattern Recommendations**: "Users like you benefit from this pattern"
- **Advanced ML**: More sophisticated clustering and prediction models
- **Real-time Sync**: WebSocket integration for instant pattern updates

---

## Support & Documentation

**Files to Review:**
- Database Schema: `database/supabase/migrations/20250117000000_behavioral_pattern_recognition.sql`
- Core Service: `api/services/behavioralPatternRecognition.js`
- Real-time Tracker: `api/services/patternTracker.js`
- AI Insights: `api/services/patternInsightGenerator.js`
- API Routes: `api/routes/behavioral-patterns.js`

**Key Concepts:**
- Temporal correlation: Time-based relationships between events
- Confidence scoring: ML-based pattern reliability assessment
- Behavioral fingerprinting: Event-specific behavior profiles
- Cross-platform integration: Unified view across all platforms

**Contact:**
For questions or issues with the behavioral pattern recognition system, refer to this documentation or review the inline code comments in the service files.
