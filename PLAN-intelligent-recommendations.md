# Intelligent Cross-Platform Recommendation System

## Overview

Transform the Soul Signature platform from a basic data extraction system into an **intelligent digital twin** that learns from all connected platforms (Whoop, Spotify, Calendar, etc.) and provides contextual, personalized recommendations.

## Current State Analysis

### What Exists

| Component | Location | Current Capability | Gap |
|-----------|----------|-------------------|-----|
| `RecommendationAgent.js` | `api/services/agents/` | Mock Spotify/YouTube results | No real API integration, no Whoop data |
| `whoopExtractor.js` | `api/services/featureExtractors/` | Extracts sleep, recovery, strain features | Only used for personality analysis, not recommendations |
| `presentation-ritual.js` | `api/routes/` | Returns hardcoded mock track suggestions | No intelligent recommendations |
| `spotify-oauth.js` | `api/routes/` | Genre-based playlist filtering | Only user's playlists, no public recommendations |
| `presentationRitualExtractor.js` | `api/services/extractors/` | Detects calendar/music patterns | Doesn't generate recommendations |
| `MasterOrchestrator.js` | `api/services/agents/` | Coordinates multi-agent workflow | Not connected to recommendation flow |

### Key Problems

1. **Hardcoded Mock Data**: `presentation-ritual.js` lines 171-179 return static track suggestions
2. **No Whoop Integration**: Health data not used for contextual recommendations
3. **Limited Spotify**: Only shows user's downloaded playlists, not intelligent recommendations
4. **No Cross-Platform Learning**: Platforms operate in silos
5. **No LLM Inference**: No AI analyzing patterns to make smart decisions

---

## Architecture Design

### New Components

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     INTELLIGENT TWIN ENGINE                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    USER CONTEXT AGGREGATOR                       │   │
│  │  - Collects real-time data from all connected platforms          │   │
│  │  - Whoop: recovery, sleep, strain, HRV                           │   │
│  │  - Spotify: listening history, audio features                    │   │
│  │  - Calendar: upcoming events, event types                        │   │
│  │  - Historical patterns from soul_data                            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    CLAUDE LLM INFERENCE ENGINE                   │   │
│  │  - Analyzes aggregated context                                   │   │
│  │  - Understands user's current state (tired, energized, stressed) │   │
│  │  - Makes intelligent decisions about recommendations             │   │
│  │  - Explains reasoning to user                                    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    RECOMMENDATION GENERATORS                     │   │
│  │  - MusicRecommendationService (Spotify search + recommendations) │   │
│  │  - InsightGenerator (health + activity insights)                 │   │
│  │  - RitualOptimizer (event preparation suggestions)               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: User Context Aggregator Service
**Goal**: Create a unified service that collects real-time data from all platforms

**New File**: `api/services/userContextAggregator.js`

```javascript
// Core methods:
class UserContextAggregator {
  // Collect current state from all platforms
  async aggregateUserContext(userId) {
    return {
      whoop: await this.getWhoopContext(userId),
      spotify: await this.getSpotifyContext(userId),
      calendar: await this.getCalendarContext(userId),
      personality: await this.getPersonalityProfile(userId),
      patterns: await this.getLearnedPatterns(userId)
    };
  }

  // Whoop: current recovery, sleep last night, strain today
  async getWhoopContext(userId) {
    // Real-time Whoop API call for:
    // - Today's recovery score
    // - Last night's sleep performance
    // - Current strain level
    // - HRV trends
  }

  // Calendar: next 3 events, importance, time until
  async getCalendarContext(userId) {
    // Upcoming events with:
    // - Event type classification
    // - Time until event
    // - Attendee count / importance
  }

  // Spotify: recent listening, current mood profile
  async getSpotifyContext(userId) {
    // Recent tracks with audio features
    // Derived mood from recent listening
  }
}
```

**Database Changes**:
- Create `user_context_snapshots` table to cache context for quick retrieval
- Add indexes on `behavioral_features` for faster aggregation

---

### Phase 2: Intelligent Music Recommendation Service
**Goal**: Replace hardcoded tracks with intelligent Spotify recommendations

**New File**: `api/services/intelligentMusicService.js`

```javascript
class IntelligentMusicService {
  // Get smart recommendations based on context
  async getRecommendations(userId, context, purpose) {
    // 1. Analyze user context (Whoop recovery, upcoming event, time of day)
    // 2. Determine optimal audio features (energy, valence, tempo)
    // 3. Use Spotify's search API to find matching tracks
    // 4. Include public playlists, not just user's library
    // 5. Return with explanations
  }

  // Search public Spotify for tracks/playlists matching criteria
  async searchPublicMusic(criteria) {
    // Uses Spotify search API:
    // - Search by genre + audio features
    // - Search curated playlists (Focus, Workout, Relax)
    // - Search by mood keywords
  }

  // Map Whoop recovery to optimal audio features
  mapRecoveryToAudioFeatures(recoveryScore, purpose) {
    if (recoveryScore < 33) {
      // Low recovery = calm, restorative music
      return { energy: 0.2-0.4, valence: 0.4-0.6, tempo: 60-90 };
    } else if (recoveryScore < 66) {
      // Medium recovery = balanced energy
      return { energy: 0.4-0.6, valence: 0.5-0.7, tempo: 90-120 };
    } else {
      // High recovery = can handle higher energy
      return { energy: 0.6-0.9, valence: 0.6-0.9, tempo: 100-140 };
    }
  }
}
```

**Key Features**:
1. **Public Playlist Discovery**: Search Spotify for public playlists matching mood
2. **Track Recommendations**: Use Spotify search with audio feature filters
3. **Whoop Integration**: Recovery score affects recommended energy level
4. **Explanations**: "Based on your 45% recovery, I'm suggesting calming music"

---

### Phase 3: Claude LLM Inference Engine
**Goal**: Use Claude to intelligently analyze context and make recommendations

**New File**: `api/services/intelligentTwinEngine.js`

```javascript
class IntelligentTwinEngine {
  constructor() {
    this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.MODEL = 'claude-sonnet-4-5-20250929';
  }

  // Generate contextual recommendations with Claude
  async generateInsightsAndRecommendations(userId) {
    const context = await userContextAggregator.aggregateUserContext(userId);

    const prompt = `You are an AI digital twin assistant analyzing a user's current state across multiple platforms.

USER CONTEXT:
- Whoop Recovery: ${context.whoop.recovery}% (${context.whoop.recoveryLabel})
- Sleep Last Night: ${context.whoop.sleepPerformance}% (${context.whoop.sleepHours} hours)
- Current Strain: ${context.whoop.strain}/21
- HRV: ${context.whoop.hrv}ms (${context.whoop.hrvTrend})

UPCOMING EVENTS:
${context.calendar.events.map(e => `- ${e.title} in ${e.minutesUntil} minutes (${e.importance})`).join('\n')}

PERSONALITY PROFILE:
${JSON.stringify(context.personality, null, 2)}

LEARNED PATTERNS:
${context.patterns.map(p => `- ${p.description} (${p.confidence}% confidence)`).join('\n')}

Based on this comprehensive context, provide:
1. CURRENT STATE ASSESSMENT: How is the user likely feeling right now?
2. MUSIC RECOMMENDATION: What type of music would help them right now?
   - Energy level (0-100)
   - Mood (calm/focused/energizing/power)
   - Genre suggestions
   - Reasoning
3. PREPARATION ADVICE: If there's an upcoming event, how should they prepare?
4. HEALTH INSIGHTS: Any observations about their health patterns?
5. PERSONALIZED TIP: One actionable suggestion based on everything

Respond in JSON format.`;

    const response = await this.anthropic.messages.create({
      model: this.MODEL,
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }]
    });

    return this.parseAndEnhanceResponse(response, context);
  }
}
```

---

### Phase 4: Enhanced Start Ritual API
**Goal**: Replace hardcoded ritual suggestions with intelligent recommendations

**Modify**: `api/routes/presentation-ritual.js`

```javascript
// BEFORE (hardcoded):
ritualSuggestion: {
  suggestedTracks: [
    { name: 'Midnight City', artist: 'M83', duration: 244, energy: 0.8 },
    // ... hardcoded tracks
  ]
}

// AFTER (intelligent):
router.get('/next', authenticateUser, async (req, res) => {
  const context = await userContextAggregator.aggregateUserContext(userId);
  const insights = await intelligentTwinEngine.generateInsightsAndRecommendations(userId);
  const music = await intelligentMusicService.getRecommendations(userId, context, 'pre-event');

  return res.json({
    success: true,
    nextEvent: nextImportantEvent,
    ritualSuggestion: {
      startTime: calculateOptimalStartTime(context, nextEvent),
      suggestedTracks: music.tracks,
      suggestedPlaylists: music.publicPlaylists,
      reasoning: insights.musicRecommendation.reasoning,
      basedOn: {
        recovery: context.whoop?.recovery,
        eventType: nextEvent?.type,
        learnedPatterns: insights.appliedPatterns
      }
    },
    insights: insights.healthInsights,
    personalizedTip: insights.personalizedTip
  });
});
```

---

### Phase 5: Whoop Integration for Recommendations

**Modify**: `api/routes/health-connectors.js`

Add new endpoint for real-time Whoop context:

```javascript
// GET /api/health/whoop/current-state
// Returns real-time health context for recommendations
router.get('/whoop/current-state', authenticateUser, async (req, res) => {
  const whoopData = await whoopService.getCurrentState(userId);

  return res.json({
    recovery: {
      score: whoopData.recovery.score,
      label: getRecoveryLabel(whoopData.recovery.score),
      components: {
        hrv: whoopData.recovery.hrv,
        rhr: whoopData.recovery.rhr,
        sleepQuality: whoopData.recovery.sleepPerformance
      }
    },
    sleep: {
      hours: whoopData.sleep.totalSleep / 3600,
      efficiency: whoopData.sleep.efficiency,
      stages: whoopData.sleep.stages
    },
    strain: {
      current: whoopData.strain.score,
      max: 21,
      label: getStrainLabel(whoopData.strain.score)
    },
    recommendations: {
      activityCapacity: calculateActivityCapacity(whoopData),
      optimalBedtime: calculateOptimalBedtime(whoopData),
      recoveryNeeded: whoopData.strain.score > 15
    }
  });
});
```

---

### Phase 6: Cross-Platform Learning System

**New Table**: `cross_platform_insights`

```sql
CREATE TABLE cross_platform_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  insight_type TEXT NOT NULL,
  -- e.g., 'music_recovery_correlation', 'pre_event_pattern', 'sleep_productivity'
  source_platforms TEXT[] NOT NULL,
  -- e.g., ['whoop', 'spotify', 'calendar']
  insight_data JSONB NOT NULL,
  confidence_score NUMERIC,
  first_detected_at TIMESTAMP DEFAULT NOW(),
  last_confirmed_at TIMESTAMP,
  occurrence_count INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true
);
```

**Learning Examples**:
1. "When recovery < 50%, user listens to calmer music before meetings"
2. "User's productivity peaks when they slept > 7 hours AND had HRV > 60"
3. "Before investor meetings, user prefers instrumental music starting 25 min before"

---

## API Changes Summary

### New Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/twin/context` | GET | Get aggregated user context from all platforms |
| `/api/twin/recommendations` | GET | Get intelligent recommendations based on context |
| `/api/twin/insights` | GET | Get cross-platform insights and patterns |
| `/api/health/whoop/current-state` | GET | Get real-time Whoop health context |
| `/api/spotify/public-playlists` | GET | Search public Spotify playlists by mood/purpose |
| `/api/spotify/recommendations` | GET | Get track recommendations (not just user's library) |

### Modified Endpoints

| Endpoint | Changes |
|----------|---------|
| `/api/presentation-ritual/next` | Replace hardcoded tracks with intelligent recommendations |
| `/api/presentation-ritual/analyze` | Add Whoop context to pattern analysis |
| `/api/spotify/playlists/filtered` | Add public playlist recommendations |

---

## File Changes Summary

### New Files

1. `api/services/userContextAggregator.js` - Cross-platform data aggregation
2. `api/services/intelligentMusicService.js` - Smart music recommendations
3. `api/services/intelligentTwinEngine.js` - Claude-powered inference
4. `api/routes/intelligent-twin.js` - New API routes

### Modified Files

1. `api/routes/presentation-ritual.js` - Replace hardcoded suggestions
2. `api/routes/health-connectors.js` - Add real-time health context endpoint
3. `api/routes/spotify-oauth.js` - Add public playlist search
4. `api/services/agents/RecommendationAgent.js` - Connect to real services

### Database Migrations

1. Create `user_context_snapshots` table
2. Create `cross_platform_insights` table
3. Add indexes for performance

---

## Implementation Order

1. **Phase 1**: UserContextAggregator - Foundation for all recommendations
2. **Phase 2**: IntelligentMusicService - Replace hardcoded Spotify
3. **Phase 3**: IntelligentTwinEngine - Add Claude reasoning
4. **Phase 4**: Update presentation-ritual.js - Integrate new services
5. **Phase 5**: Whoop real-time endpoint - Health-aware recommendations
6. **Phase 6**: Cross-platform learning - Long-term pattern detection

---

## Success Metrics

1. **No more hardcoded data** - All recommendations are dynamic
2. **Whoop integration** - Recovery score affects music energy
3. **Public playlists** - User sees Spotify recommendations, not just their library
4. **Explanations** - User understands WHY recommendations are made
5. **Cross-platform intelligence** - Patterns detected across multiple platforms

---

## Questions for User

Before implementation, clarify:

1. **Spotify API scope**: Do we have `user-top-read` scope for recommendations?
2. **Whoop API rate limits**: How often can we fetch real-time data?
3. **Claude usage**: Acceptable to make Claude API calls for each recommendation request?
4. **MVP priorities**: Start with music recommendations or full cross-platform insights?
