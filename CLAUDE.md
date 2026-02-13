# Twin Me - Soul Signature Platform

## Vision
Twin Me creates digital twins that capture your true originality - your **Soul Signature**. While public information is easily cloned and commoditized, it lacks soul. We go deeper by discovering what makes you authentically YOU through the digital footprints that reveal your genuine curiosities, passions, and patterns.

**One-liner:** A data-driven personality portrait that reveals patterns about yourself you never noticed, powers an AI twin that actually knows you, and lets you share your authentic self.

## Core Product Loop (Launch)
```
1. ONBOARDING    -> Cofounder.co-style: email lookup -> instant wow -> interactive Q&A
2. SOUL SIGNATURE -> Cross-platform personality portrait from real data
3. TWIN CHAT     -> AI twin that embodies your personality and knows your life
```

Everything else is secondary to this loop working flawlessly.

## Target User
General consumers who are curious about self-discovery and already use platforms like Spotify, Whoop, Google Calendar. Freemium SaaS model.

## Tech Stack
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Framer Motion, shadcn/ui
- **Backend**: Node.js, Express 5, JWT Auth
- **Database**: Supabase (PostgreSQL) - ONLY active database
- **AI**: OpenRouter (DeepSeek V3.2 for analysis, Mistral Small for extraction, Claude Sonnet for twin chat)
- **LLM Gateway**: `api/services/llmGateway.js` - ALL LLM calls route through here
- **Cache**: Redis (ioredis) with in-memory fallback
- **Auth**: JWT + OAuth 2.0 for platform connections

## Active Platform Integrations (5)
1. **Spotify** - Music taste, listening patterns, mood
2. **Google Calendar** - Schedule, events, time patterns
3. **Whoop** - Recovery, strain, sleep, HRV
4. **YouTube** - Content preferences, subscriptions
5. **Twitch** - Gaming identity, followed channels

## Development
```bash
npm run dev          # Frontend: http://localhost:8086
npm run server:dev   # Backend: http://localhost:3001
npm run dev:full     # Both together
```

## Project Structure
```
twin-ai-learn/
├── src/                    # Frontend (React + TypeScript)
│   ├── pages/              # Route pages (17 files)
│   ├── components/         # Reusable components (150+)
│   ├── contexts/           # React Context providers (9)
│   ├── services/           # API client layer (16 files)
│   └── hooks/              # Custom hooks (20 files)
├── api/                    # Backend (Express)
│   ├── routes/             # API endpoints (84 files) [NEEDS AUDIT - many unused]
│   ├── services/           # Business logic (140 files) [NEEDS AUDIT - many unused]
│   ├── middleware/          # Auth, rate limiting, validation
│   └── config/             # AI models, constants
├── database/               # Supabase migrations (20 files)
├── browser-extension/      # Chrome extension (under Google review)
└── PLAN.md                 # Detailed execution roadmap
```

## Key Architecture Files
- `api/services/llmGateway.js` - Unified LLM gateway (OpenRouter + caching + cost tracking)
- `api/config/aiModels.js` - Model tiers, pricing, OpenRouter config
- `api/middleware/auth.js` - JWT authentication middleware
- `api/services/database.js` - Supabase client and queries
- `api/services/redisClient.js` - Redis with graceful fallback
- `src/services/apiService.ts` - Frontend API client (35KB)
- `src/contexts/AuthContext.tsx` - Auth state management

## Current Status & Execution Plan

### TIER 1: Prerequisites (Before Real Users)
- [ ] Investigate and fix production deployment (Vercel)
- [ ] Add analytics (PostHog)
- [ ] Privacy policy + data deletion flows
- [ ] Dead code audit (target: reduce 140 services to ~60)
- [ ] Dependency cleanup (remove unused SDKs)

### TIER 2: Fix Core Product
- [ ] Fix twin chat quality (upgrade model, rewrite prompts, richer context)
- [ ] Build cofounder.co-style onboarding (email enrichment + interactive Q&A)
- [ ] Simplify soul signature to one clear, shareable output

### TIER 3: Polish for Launch
- [ ] Freemium gating (free: onboarding + signature + 10 chats/mo)
- [ ] Trust signals (security page, data transparency, delete button)
- [ ] Frontend performance (code splitting, component decomposition)

### TIER 4: Growth (Post-Launch)
- [ ] More platform integrations (Discord, GitHub, Reddit)
- [ ] Shareable soul signature cards (social virality)
- [ ] Soul matching (find similar people)
- [ ] Browser extension data integration

## What to CUT
- Moltbot system (experimental, archive it)
- Neo4j/Qdrant drivers (not active, remove)
- 51 unused platform connector definitions (archive)
- LangChain, Ollama, Groq SDKs (not used via gateway)
- Multiple integration frameworks (pick one, remove others)
- Professional Universe features (Gmail, Teams - save for v2)
- Multiple overlapping onboarding flows (replace with single cofounder.co-style)

## LLM Model Strategy
| Tier | Use Case | Model | Why |
|------|----------|-------|-----|
| CHAT | Twin conversation | Claude Sonnet (via OpenRouter) | Quality matters - twin must feel like YOU |
| ANALYSIS | Background analysis | DeepSeek V3.2 (via OpenRouter) | Good enough, 95% cheaper |
| EXTRACTION | Fact extraction | Mistral Small (via OpenRouter) | Cheapest, structured output |

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

## NODE PROCESS MANAGEMENT
**NEVER kill ALL node processes (crashes the CLI):**
- `taskkill /F /IM node.exe` - NEVER
- `pkill node` - NEVER

**OK to kill specific processes by PID:**
- `taskkill /PID 12345 /F` - OK when you know the specific PID
