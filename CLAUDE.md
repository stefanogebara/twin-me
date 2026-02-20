# TwinMe - Soul Signature Platform

## Vision
TwinMe creates digital twins that capture your true originality - your **Soul Signature**. We go deeper than public information by discovering what makes you authentically YOU through the digital footprints that reveal your genuine curiosities, passions, and patterns.

**One-liner:** A data-driven personality portrait that reveals patterns about yourself you never noticed, powers an AI twin that actually knows you, and lets you share your authentic self.

## Core Product Loop
```
1. ONBOARDING    -> Cofounder.co-style: email lookup -> instant wow -> interactive Q&A
2. SOUL SIGNATURE -> Cross-platform personality portrait from real data
3. TWIN CHAT     -> AI twin that embodies your personality and knows your life
```

## Twin Architecture (Generative Agents-Inspired)

Based on Park et al., UIST 2023 ("Generative Agents: Interactive Simulacra of Human Behavior").

### Memory Stream (`user_memories` table)
Single unified store for ALL memory types:
- **Observations** - Raw platform data (Spotify plays, calendar events, Whoop recovery)
- **Conversations** - Per-utterance chat exchanges with the twin
- **Facts** - Extracted facts about the user
- **Reflections** - Higher-level synthesized insights (stored back as memories)

Each memory has: content, embedding (1536d vector), importance_score (1-10), created_at, last_accessed_at.

### Retrieval (`search_memory_stream` RPC)
Three-factor scoring with context-dependent weights and min-max normalization:
```
score = w_recency * norm(recency) + w_importance * norm(importance) + w_relevance * norm(relevance)
```
- **Recency**: `0.995^hours_since_last_access` (accessing refreshes the timestamp)
- **Importance**: LLM-rated 1-10 at creation time
- **Relevance**: Cosine similarity of embeddings

Weight presets (inspired by Paper 2):
- `default` [1.0, 1.0, 1.0] - General conversation (original Generative Agents)
- `identity` [0.2, 0.8, 1.0] - Twin summary, personality queries (relevance dominant)
- `recent` [1.0, 0.5, 0.7] - Proactive insights, "what's happening" queries
- `reflection` [0.0, 0.5, 1.0] - Expert reflections (Paper 2 style: no recency bias)

### Expert Reflection Engine (`reflectionEngine.js`)
Inspired by Paper 2 (Park et al., 2024 "Generative Agent Simulations of 1,000 People").
Triggered when accumulated importance > 150. Uses 5 domain-specific expert personas:

1. **Personality Psychologist** - Emotional patterns, coping, attachment style, Big Five from behavior
2. **Lifestyle Analyst** - Daily rhythms, energy, health-behavior connections, routine vs spontaneity
3. **Cultural Identity Expert** - Aesthetic preferences, media taste, cultural markers
4. **Social Dynamics Analyst** - Communication style, relationship patterns, social energy
5. **Motivation Analyst** - Work patterns, ambitions, decision-making style

Process: Gather 100 recent memories -> Run all 5 experts in parallel (each retrieves domain-specific evidence via vector search with `reflection` weights) -> Each expert generates 2-3 observations -> Store as `reflection` memories (importance 7-9) with expert metadata -> Recursive up to depth 3

### Background Observation Ingestion
Periodic cron job pulls platform data and stores as observations:
```
Platform APIs -> Natural language observations -> Memory Stream
                                                    |
                                              [Importance accumulates]
                                                    |
                                              Reflection Engine triggers
                                                    |
                                              Proactive Insights generated
```

### Dynamic Twin Summary (`twinSummaryService.js`)
Periodically regenerated summary replacing static soul signature:
- Five parallel retrieval queries aligned to expert domains: personality, lifestyle, cultural identity, social dynamics, motivation
- Uses `identity` retrieval weights (relevance dominant, low recency bias)
- Cached in `twin_summaries` table with 4-hour TTL
- Upserts on `user_id` conflict - one summary per user
- Regenerated after significant memory accumulation

### Proactive Insights (`proactiveInsights.js`)
TwinMe's equivalent of the paper's Planning system - the twin notices things and brings them up:
- Triggered after observation ingestion
- LLM analyzes recent memories + reflections to generate 1-3 insights
- Stored in `proactive_insights` table with urgency (high/medium/low) and category
- Injected into twin chat as "THINGS I NOTICED" context section
- Marked `delivered` after being included in a twin response
- High urgency sorted first for delivery priority

### Twin-Driven Goal Tracking (`goalTrackingService.js`)
The twin observes platform data patterns and SUGGESTS achievable goals. Once accepted, progress is auto-tracked from platform data and the twin weaves accountability into conversations naturally.

**Tables**: `twin_goals`, `goal_progress_log` (migration: `20260220_create_twin_goals.sql`)
**API**: `api/routes/goals.js` (7 endpoints under `/api/goals`)
**Frontend**: `src/pages/GoalsPage.tsx` + components in `src/pages/components/goals/`

Flow: Observation ingestion -> `generateGoalSuggestions()` -> user accepts -> `trackGoalProgress()` auto-tracks -> twin references in chat -> celebration on completion

**Metric extraction**: Primary from structured platform data, fallback to regex on memory stream text (reflections dominate recent memories ~90%, so scan 200+ entries to find platform_data).

### Key Architecture Files
- `api/services/memoryStreamService.js` - Write/read path for memory stream (per-utterance storage)
- `api/services/reflectionEngine.js` - Reflection generation pipeline (recursive, depth 3)
- `api/services/twinSummaryService.js` - Dynamic twin summary generation + caching
- `api/services/proactiveInsights.js` - Proactive insight generation + delivery tracking
- `api/services/observationIngestion.js` - Background platform data -> observation pipeline + goal tracking hooks
- `api/services/goalTrackingService.js` - Goal CRUD, suggestion engine, auto-progress tracking, metric extraction
- `api/services/embeddingService.js` - Vector embeddings (text-embedding-3-small, 1536d)
- `api/services/llmGateway.js` - Unified LLM gateway (OpenRouter + caching + cost tracking)
- `api/routes/twin-chat.js` - Twin chat endpoint with full context pipeline
- `api/routes/goals.js` - Goal tracking API endpoints
- `api/config/aiModels.js` - Model tiers, pricing, OpenRouter config
- `api/services/extractionOrchestrator.js` - Platform data extraction coordinator

## Tech Stack
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Framer Motion, shadcn/ui
- **Backend**: Node.js, Express 5, JWT Auth
- **Database**: Supabase (PostgreSQL + pgvector) - ONLY active database
- **AI**: OpenRouter (DeepSeek V3.2 for analysis, Mistral Small for extraction, Claude Sonnet for twin chat)
- **LLM Gateway**: `api/services/llmGateway.js` - ALL LLM calls route through here
- **Cache**: Redis (ioredis) with in-memory fallback
- **Auth**: JWT + OAuth 2.0 for platform connections
- **Analytics**: PostHog

## Active Platform Integrations (5)
1. **Spotify** - Music taste, listening patterns, mood
2. **Google Calendar** - Schedule, events, time patterns
3. **Whoop** - Recovery, strain, sleep, HRV
4. **YouTube** - Content preferences, subscriptions
5. **Twitch** - Gaming identity, followed channels

## LLM Model Strategy
| Tier | Use Case | OpenRouter Model ID | Why |
|------|----------|---------------------|-----|
| CHAT | Twin conversation | `anthropic/claude-sonnet-4.5` | Quality matters - twin must feel like YOU |
| ANALYSIS | Reflections, twin summary, proactive insights | `deepseek/deepseek-chat-v3-0324` | Good enough, 95% cheaper |
| EXTRACTION | Importance rating, fact extraction | `mistralai/mistral-small-3.1-24b-instruct` | Cheapest, structured output |

## Development
```bash
npm run dev          # Frontend: http://localhost:8086
npm run server:dev   # Backend: http://localhost:3004
npm run dev:full     # Both together
```

## Project Structure
```
twin-ai-learn/
├── src/                    # Frontend (React + TypeScript)
│   ├── pages/              # Route pages
│   ├── components/         # Reusable components
│   ├── contexts/           # React Context providers
│   ├── services/           # API client layer
│   └── hooks/              # Custom hooks
├── api/                    # Backend (Express)
│   ├── routes/             # API endpoints
│   ├── services/           # Business logic + memory architecture
│   ├── middleware/          # Auth, rate limiting, validation
│   └── config/             # AI models, constants
├── database/               # Supabase migrations
├── browser-extension/      # Chrome extension
└── _archive/               # Archived dead code
```

## Environment Variables (Required)
```
NODE_ENV, PORT, VITE_APP_URL, VITE_API_URL
VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
JWT_SECRET, ENCRYPTION_KEY
OPENROUTER_API_KEY
SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET
```

## Philosophy
- **From Resume to Soul**: Moving beyond professional achievements to authentic personality
- **Instant Wow**: Users should be surprised by what we know in the first 60 seconds
- **Privacy as Feature**: The privacy spectrum dashboard IS the trust builder
- **Quality over Quantity**: 5 great integrations > 56 half-built ones
- **The Twin Must Have Soul**: Not ChatGPT with facts - it must EMBODY the user's personality
- **Memory Is Everything**: The twin's quality is directly proportional to how well its memory stream works

## Critical Gotchas

### User IDs: public.users NOT auth.users
The app uses `public.users.id` everywhere (user_memories, twin_goals, etc.), NOT `auth.users.id`. These are DIFFERENT UUIDs. All FK constraints reference `public.users(id)`. The test user is `167c27b5-4a30-49e1-aa79-9973d1e4e06f`.

### JWT Token Format
Auth middleware reads `payload.id || payload.userId`. The verify endpoint uses `decoded.id`. ALWAYS use `id` field when generating test tokens.

### Frontend API Base URL
`VITE_API_URL=http://127.0.0.1:3004/api` already includes `/api`. Frontend API clients use paths like `/goals` not `/api/goals` to avoid double prefix.

### Memory Stream Composition
Recent memories are dominated by reflections (~90 of last 100). Platform data observations are sparse (~4 in 200). When scanning for platform data, fetch 200+ memories and filter by `memory_type === 'platform_data'`.

### Windows Process Management on Git Bash
`taskkill /PID 12345 /F` fails in Git Bash due to path expansion (`/PID` -> `C:/Program Files/Git/PID`). Use `cmd.exe //c "taskkill /PID 12345 /F"` instead.

## NODE PROCESS MANAGEMENT
**NEVER kill ALL node processes (crashes the CLI):**
- `taskkill /F /IM node.exe` - NEVER
- `pkill node` - NEVER

**OK to kill specific processes by PID:**
- `cmd.exe //c "taskkill /PID 12345 /F"` - OK when you know the specific PID

## Custom Slash Commands
- `/verify-app` - TypeScript check + Vite build + server health
- `/test-api <endpoint>` - Test API endpoints with auth
- `/test-twin <message>` - Test twin chat context pipeline
- `/code-review` - Full code review of current branch
- `/design-review` - Design review with browser testing
