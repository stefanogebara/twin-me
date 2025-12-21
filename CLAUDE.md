# Twin AI Learn - MVP Development Guide

## Project Vision

Twin AI Learn creates an **Intelligent Digital Twin** that learns from your real data to provide personalized recommendations and insights. The agent learns from:
- **Your calendar events** (Google Calendar)
- **Your music** (Spotify listening patterns)
- **Your health data** (Whoop recovery, strain, sleep)

By combining these data sources, the twin understands your life patterns and can make intelligent recommendations - like suggesting the perfect music for your upcoming meeting based on your recovery score and event type.

## MVP Core Focus

### Primary Data Sources (Phase 1)
1. **Google Calendar** - Events, meetings, schedule patterns
2. **Spotify** - Music preferences, listening history, mood patterns
3. **Whoop** - Recovery, strain, sleep quality, HRV

### Core Features
1. **Ritual Music** - AI recommends music based on:
   - Upcoming calendar events (meeting, workout, focus time)
   - Whoop recovery/strain data
   - Time of day and energy needs
   - Explains WHY each song is recommended

2. **Soul Signature** - Personality profile learned from:
   - Music preferences (16personalities-style inference)
   - Calendar patterns (work style, social habits)
   - Health rhythms (energy patterns)

3. **Daily Insights** - The twin tells you:
   - "Based on your low recovery, consider lighter music today"
   - "You have a big presentation - here's focus music"
   - "Your evening is free - discovery playlist time"

### Learning Mechanism
- **Behavioral Learning**: Extract patterns from real platform data
- **Explicit Questions**: 16personalities-style questions to calibrate
- **Feedback Loop**: User confirms/rejects recommendations to improve

## Current State (What's Real vs Demo)

### Real Integrations Working
- [ ] Spotify OAuth - Needs real credentials
- [ ] Google Calendar OAuth - Needs real credentials
- [ ] Whoop OAuth - Needs real credentials
- [ ] Claude AI personality analysis

### Demo Mode (Hardcoded Data)
- [x] Demo user "Alex Rivera"
- [x] Fake platform connections (6 platforms - WRONG for MVP)
- [x] Sample personality scores
- [x] Sample behavioral features

### Issues to Fix
- Demo shows Netflix, YouTube, Discord, GitHub, Reddit - NOT MVP platforms
- Platform count mismatch (5 vs 6 displayed)
- Soul Signature uses demo data only
- Ritual Music has placeholder recommendations

## Technology Stack

### Frontend
- React 18 + TypeScript
- Vite for build
- Tailwind CSS
- shadcn/ui components
- React Query for state

### Backend
- Node.js + Express
- Supabase (PostgreSQL)

### AI
- Anthropic Claude API for personality analysis
- OpenAI for additional processing

## Development

```bash
# Start development
npm run dev          # Frontend: http://localhost:8086
npm run server:dev   # Backend: http://localhost:3001
```

## Key Files

### MVP Platform Integration
- `api/routes/intelligent-twin.js` - Context & music recommendation API
- `api/routes/entertainment-connectors.js` - OAuth flows
- `src/services/demoDataService.ts` - Demo data (NEEDS FIXING)
- `src/pages/RitualStart.tsx` - Ritual music UI

### Soul Signature
- `src/pages/SoulSignatureDashboard.tsx` - Main dashboard
- `api/services/stylometricAnalyzer.js` - Claude personality analysis

### Data Flow
1. User connects platforms (OAuth)
2. Backend extracts data (calendar events, tracks, health metrics)
3. Claude analyzes patterns for personality
4. Frontend displays insights and recommendations

## MVP Routes

- `/` - Landing page
- `/dashboard` - Main dashboard
- `/soul-signature` - Soul Signature view
- `/ritual/start` - Ritual music selection
- `/get-started` - Platform connections

## Next Steps (Priority Order)

1. **Fix Demo Data** - Update to only show MVP platforms (Spotify, Calendar, Whoop)
2. **Real OAuth Setup** - Get actual API credentials working
3. **Question Flow** - Add 16personalities-style questions
4. **Data Extraction** - Extract real data from connected platforms
5. **Recommendation Engine** - Real music recommendations based on context

## NOT in MVP (Future)

- Privacy Spectrum Dashboard
- Browser extension
- Soul matching
- Netflix/YouTube/Discord integrations
- 30+ platform support

## Philosophy

The twin should feel like it **knows you** because it learns from:
- What you listen to (not just genres, but when and why)
- How you schedule your life (busy days, recovery time)
- Your body's signals (when you're depleted vs energized)

The goal is recommendations that feel magical - "How did it know I needed exactly this song right now?"
