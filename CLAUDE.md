# TwinMe - Soul Signature Platform

## Workflow Orchestration

### 1. Plan Node Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One tack per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

---

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
- **Observations** - Raw platform data (Spotify plays, calendar events, YouTube activity)
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
Triggered when accumulated importance > 40 (IMPORTANCE_THRESHOLD in reflectionEngine.js). Uses 5 domain-specific expert personas:

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

### Soul Signature Voting Layer (`personalityProfileService.js`)
Neural-inspired personality shaping for twin responses. Based on CL1_LLM_Encoder's biological neuron blending concept (`blended[tok] = (1-alpha) * model_probs + alpha * neural_probs`), adapted for API-level constraints (Claude via OpenRouter does NOT expose logprobs).

**Three-layer intervention:**
1. **Prompt Injection** (0x cost) - OCEAN Big Five personality traits + stylometric fingerprint translated into behavioral instructions injected into system prompt via `personalityPromptBuilder.js`
2. **Sampling Parameters** (0x cost) - OCEAN dimensions mapped to temperature (0.5-0.9), top_p (0.85-0.95), frequency_penalty (0-0.3), presence_penalty (0-0.3)
3. **Best-of-N Reranking** (3x cost, feature-flagged via `ENABLE_PERSONALITY_RERANKER`) - Generate N candidates with temperature spread, embed all, select by cosine similarity to personality embedding centroid

**Personality Profile** (`user_personality_profiles` table):
- OCEAN Big Five scores (0-1) extracted via LLM analysis (TIER_ANALYSIS) of reflections + conversations + facts
- Stylometric fingerprint: sentence length, vocabulary richness (type-token ratio), formality, emotional expressiveness, humor markers, punctuation distribution — all pure computation, no LLM
- Derived sampling parameters from OCEAN mapping
- Personality embedding centroid: weighted average of memory embeddings with 7-day recency half-life and importance weighting
- Profile TTL: 12 hours, auto-rebuild when stale. Min 20 memories required.

**OCEAN-to-Sampling Mapping:**
- High Openness → higher temperature (more creative), wider top_p
- High Conscientiousness → lower temperature (more precise), narrower top_p
- High Extraversion → higher presence_penalty (explores topics), higher frequency_penalty (varied vocabulary)
- High Agreeableness → lower frequency_penalty (comfortable with repetition for emphasis)
- High Neuroticism → slight temperature increase (more emotional variation)

**Drift Detection** (`personalityDriftService.js`):
- Compares recent (7-day) vs baseline (90-day) personality embedding centroids
- Triggers automatic profile rebuild when cosine similarity < 0.85
- Hooked into observation ingestion pipeline (no extra cron job needed)

**Implementation Plan:** `.claude/plans/2026-03-08-soul-signature-voting-layer.md` (10 tasks, 5 phases)

### Synaptic Maturation (CL1-Inspired Neural Memory)
Completes the biological neuron analogy: memories don't just store — they strengthen, decay, and replay like real synapses.

**Three features:**

1. **STDP Exponential Decay** (`cron-memory-forgetting.js` Tier 4) — "Don't fire, connections expire"
   - Co-citation links decay with `new_strength = old * 0.92^max(0, days - 30)`
   - 30-day grace period (recently reinforced links are safe)
   - Links pruned when strength drops below 0.1
   - Runs weekly in the existing memory-forgetting cron
   - `last_reinforced_at` column tracks when links were last co-cited together

2. **Graph-Based Retrieval Traversal** (`memoryLinksService.js` → `memoryStreamService.js`)
   - 1-hop traversal of `memory_links` augments vector search with associatively connected memories
   - Feature-flagged via `graphRetrieval` in `feature_flags` table (default off)
   - Exactly 2 DB queries: batch fetch links from top-5 seed memories, then batch fetch memory rows
   - Injected after MMR reranking, score capped at 80% of top vector result
   - Strength-weighted: stronger links → higher injection scores

3. **Memory Saliency Replay** (`saliencyReplayService.js`) — Neural sleep consolidation
   - Daily cron at 4am UTC replays stale-but-important memories (importance >= 7, not accessed in 14+ days)
   - Refreshes `last_accessed_at = NOW()` to restore recency scores in retrieval
   - Triggers reflection engine for fresh cross-temporal insights connecting old + new memories
   - Cost controls: max 3 users/run, 20 memories/user, respects reflection cooldown
   - Eligible types: `fact`, `platform_data`, `observation` (not reflections — they're already high-level)

**STDP + Graph Retrieval feedback loop:**
```
Memory co-cited in reflection → strengthenCoCitedLinks() → strength ↑ + last_reinforced_at = NOW
                                                              ↓
                                          Graph retrieval picks up strong links
                                                              ↓
                                          Connected memories surface in twin chat
                                                              ↓
                                          More co-citations → strength ↑↑ (Hebbian learning)

No co-citations for 30+ days → STDP decay kicks in → strength ↓↓ → pruned at 0.1
```

**References:**
- Park et al., "Generative Agents" (UIST 2023) — Memory stream architecture
- CL1_LLM_Encoder (Cortical Labs) — Biological neuron blending formula, synaptic plasticity
- arXiv:2412.00804 — Personality drift detection in LLM agents
- STDP (Spike-Timing Dependent Plasticity) — Biological synaptic strengthening/weakening model

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
- `api/services/personalityProfileService.js` - OCEAN extraction, stylometrics, sampling derivation, personality embedding centroid
- `api/services/personalityPromptBuilder.js` - OCEAN-to-prompt-instruction translator for system prompt injection
- `api/services/personalityReranker.js` - Best-of-N reranking with personality embedding cosine similarity
- `api/services/personalityDriftService.js` - Drift detection (7-day vs 90-day) and automatic profile rebuild
- `api/routes/personality-profile.js` - API endpoints (GET profile, POST rebuild, GET drift)
- `api/services/memoryLinksService.js` - Memory graph: auto-linking, co-citation strengthening, graph traversal for retrieval
- `api/services/saliencyReplayService.js` - CL1-inspired sleep consolidation: replay stale important memories
- `api/routes/cron-memory-saliency-replay.js` - Daily 4am cron for saliency replay
- `api/routes/cron-memory-forgetting.js` - Weekly memory quality: soft-delete, STDP decay, link pruning

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
3. **YouTube** - Content preferences, subscriptions
4. **Discord** - Server activity, community interests, communication style
5. **LinkedIn** - Career trajectory, professional skills, network

## LLM Model Strategy
| Tier | Use Case | OpenRouter Model ID | Why |
|------|----------|---------------------|-----|
| CHAT | Twin conversation | `anthropic/claude-sonnet-4.5` | Quality matters - twin must feel like YOU |
| ANALYSIS | Reflections, twin summary, proactive insights | `deepseek/deepseek-v3.2` | Good enough, 95% cheaper |
| EXTRACTION | Importance rating, fact extraction | `mistralai/mistral-small-creative` | Cheapest, structured output |

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
└── browser-extension/      # Chrome extension
```

## Environment Variables (Required)
```
NODE_ENV, PORT, VITE_APP_URL, VITE_API_URL
VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
JWT_SECRET, ENCRYPTION_KEY
OPENROUTER_API_KEY
SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
YOUTUBE_API_KEY
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
The app uses `public.users.id` everywhere (user_memories, twin_goals, etc.), NOT `auth.users.id`. These are DIFFERENT UUIDs. All FK constraints reference `public.users(id)`. The test user is `167c27b5-a40b-49fb-8d00-deb1b1c57f4d` (stefanogebara@gmail.com).

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

---

## Design System (Figma → Code)
> Deep extraction from Figma Sundust UI Kit (fileKey: sm0EoOjSqFSL85choKFBwF) — 2026-03-09
> Frames extracted: LandingPage (47:736), LogIn (9910:5553), SignUp (9926:23644), Settings (100:3743), GradientBackground (47:3228), Home (95:1125)

### Color Tokens

**Light mode** (`:root` — Figma confirmed values):
- `--background: #fdfcfb` — warm off-white
- `--foreground: #1b1818` — warm near-black (text, labels)
- `--glass-surface-bg: rgba(244,241,236,0.7)` — warm beige glass (`card/background`)
- `--glass-surface-bg-subtle: rgba(218,217,215,0.2)` — input/subtle fill (`card/background-subtle`)
- `--glass-surface-border: #d9d1cb` — warm stone border (`card/border`)
- `--card-separator: rgba(50,47,47,0.05)` — row dividers in settings
- `--text-secondary: #4a4242` — body secondary (`text/secondary`)
- `--text-muted: #86807b` — placeholders, inactive (`text/placeholder`)
- `--button-bg-dark: #252222` — dark buttons (NOT `#1b1818`)
- `--avatar-bg: rgba(255,115,0,0.6)` — user avatar circle

**Dark mode** (`.dark` class):
- `--background: #110f0f` — very dark warm black
- `--foreground: #fdfcfb` — warm white
- `--glass-surface-bg: rgba(72,65,65,0.6)`
- `--glass-surface-border: rgba(94,86,86,0.6)`
- `--text-secondary: #d9d1cb`
- `--text-muted: #86807b`
- `--button-bg-dark: #252222`

**Accent** (both modes):
- `--accent-vibrant: #ff8400` — orange CTA highlight
- `--accent-vibrant-glow: rgba(255,132,0,0.12)` — active nav pill fill
- `--accent-amber: #c17e2c` — warm copper (gradient core)
- `--accent-purple: #5d5cae` — cool purple (gradient corner only)

**Ghost button hover:**
- `rgba(17,15,15,0.05)` — `button/ghost/hover:background`

### Background Gradient System (Figma Exact — 3 Layered SVG Radials)

The page bg uses THREE overlapping radial gradients stacked at the bottom of the page:

**Layer 1 — Amber center burst (vertical):**
```
rgba(195,45,112,0) 0% → rgba(194,85,78,0.5) 9.4% → rgba(193,126,44,1) 18.75%
→ rgba(224,129,22,0.8) 32.5% → rgba(255,132,0,0.6) 46.2% → rgba(218,128,26,0.525) 53.2%
→ rgba(181,124,52,0.45) 60.3% → rgba(108,117,103,0.3) 74.5% → rgba(108,117,103,0) 96.6%
```

**Layer 2 — Orange diagonal (tilted left):**
```
rgba(195,45,112,0) 0% → rgba(225,88,56,0.3) 10.6% → rgba(240,110,28,0.45) 15.9%
→ rgba(255,132,0,0.6) 21.2% → rgba(224,129,22,0.8) 29.1% → rgba(193,126,44,1) 37%
→ rgba(185,101,74,0.65) 55.8% → rgba(177,76,105,0.3) 74.5% → rgba(73,56,57,0) 96.6%
```

**Layer 3 — Purple bottom-left corner:**
```
rgba(195,45,112,0) 0% → rgba(146,34,67,0.3) 10.6% → rgba(97,22,22,0.6) 21.2%
→ rgba(157,49,11,0.55) 29.1% → rgba(217,76,0,0.5) 37% → rgba(202,78,22,0.475) 41.7%
→ rgba(186,80,44,0.45) 46.4% → rgba(155,84,87,0.4) 55.8% → rgba(93,92,174,0.3) 74.5%
→ rgba(73,56,57,0) 96.6%
```

Simplified CSS approximation (use full SVG radials for production):
```css
body {
  background-color: var(--background);
  background-image:
    radial-gradient(ellipse 80% 50% at 51% 100%, rgba(193,126,44,0.5) 0%, rgba(255,132,0,0.35) 30%, transparent 65%),
    radial-gradient(ellipse 70% 50% at 30% 100%, rgba(193,126,44,0.45) 0%, rgba(185,101,74,0.3) 40%, transparent 70%),
    radial-gradient(ellipse 60% 45% at 15% 100%, rgba(217,76,0,0.3) 0%, rgba(93,92,174,0.2) 60%, transparent 97%);
}
```

**Auth page right panel gradient (exact):**
```css
background: linear-gradient(90deg, rgba(236,13,13,0.2) 0%, rgba(236,13,13,0.2) 100%),
            linear-gradient(180deg, rgb(51,52,160) 0%, rgb(131,156,174) 30.3%, rgb(114,149,179) 38.9%,
              rgb(90,90,107) 65.4%, rgb(97,74,74) 86.5%, rgb(95,76,139) 100%);
border-radius: 16px;
```

### Glass Surface (REQUIRED for all cards/panels)
```css
background: var(--glass-surface-bg);           /* rgba(244,241,236,0.7) light */
backdrop-filter: blur(42px);
-webkit-backdrop-filter: blur(42px);
border: 1px solid var(--glass-surface-border); /* #d9d1cb */
border-radius: 20px;
box-shadow: 0 4px 4px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.06);
```

### Blur + Radius Reference (Figma exact)
| Element                 | backdrop-filter  | border-radius  | padding              |
|-------------------------|------------------|----------------|----------------------|
| Floating navbar         | blur(19.65px)    | 32px           | pl-5 pr-3 py-2.5     |
| Cards / Chatbox         | blur(42px)       | 20px           | px-5 py-4            |
| Suggestion pills        | blur(42px)       | 46px           | px-3 py-2.5          |
| Auth modal card         | blur(51px)       | 24px           | px-6 py-4            |
| Settings sidebar        | blur(42px)       | 8px            | pt-3 px-5            |
| Top navbar (app)        | blur(16px)       | 0 (full-width) | p-3                  |
| Share button (ghost)    | blur(16px)       | 6px            | px-2 py-0.5          |

### Typography (Figma confirmed)
- **`Instrument Serif`** — hero headings, auth titles, brand name. Weight 400, tracking -0.02em
  - Auth title: `text-[36px] tracking-[-0.72px]` / Hero: `text-[48px] tracking-[-0.96px]` / Large: `text-[56px] tracking-[-1.12px]`
- **`Inter`** — ALL UI text: labels, body, inputs, buttons, nav items, descriptions
  - Regular (400): body, descriptions, placeholder, nav items
  - Medium (500): labels, button text, active states
  - Semi Bold (600): breadcrumb username
- **`Geist`** — some pill/badge text (used interchangeably with Inter Medium)
- **`Poppins`** — section headings within content (18-20px), nav link items (14px)
- Scale: `text-xs 12px` / `text-sm 14px` / `text-base 16px` / `text-lg 18px` / `text-xl 20px` / `text-4xl 36px` / `text-5xl 48px`

### Component Specs (Figma Exact)

**Floating Navbar** (`backdrop-blur(19.65px)` pill):
- `bg-[rgba(244,241,236,0.7)] border border-[#d9d1cb] rounded-[32px]`
- `pl-[20px] pr-[12px] py-[10px]` / logo+nav gap: `36px`
- Logo: Instrument Serif ~25px, flower icon `32px` circle
- Nav links: Poppins Regular 14px, `gap-[56px]`
- Divider line between nav and buttons

**AI Chatbox** (`backdrop-blur(42px)` card):
- `bg-[rgba(244,241,236,0.7)] border border-[#d9d1cb] rounded-[20px] px-[20px] py-[16px]`
- Placeholder: Inter Regular 14px `#86807b`
- Height: `87px` content area

**Send Button** (dark pill):
- `bg-[#252222] rounded-[100px] p-[4px]` — total `28×28px` with `20×20` arrow icon
- `opacity-50` when disabled

**Attach Button** (ghost):
- No background, `rounded-[200px] px-[8px] py-[2px]`
- Paperclip icon 16px + "Attach" text, Inter Medium 12px

**Online/AI Badge** (ghost with bg):
- `bg-[rgba(17,15,15,0.05)] rounded-[6px] px-[8px] py-[2px]`
- Globe icon 16px + label, Inter Medium 12px

**Suggestion Pills** (glass chips):
- `backdrop-blur(42px) bg-[rgba(244,241,236,0.7)] border border-[#d9d1cb]`
- `rounded-[46px] px-[12px] py-[10px] gap-[4px]`
- Icon 16px + Geist/Inter Medium 12px

**Primary CTA Button** (filled pill):
- `bg-[#1b1818] text-[#fdfcfb] rounded-[100px] px-[12px] py-[8px] min-w-[80px]`
- Geist/Inter Medium 14px

**Dark Action Button** (filled rounded):
- `bg-[#252222] text-[#fdfcfb] rounded-[6px] px-[12px] py-[6px] h-[36px] min-w-[80px]`
- Inter Medium 14px (used in auth forms, sidebar "New chat" button)

**Secondary/Ghost Button** (transparent):
- No background, `rounded-[6px] px-[8px] py-[2px]`
- Inter Medium 12px, `text-[#1b1818]`

**Input Field**:
- `bg-[rgba(218,217,215,0.2)] border border-[#d9d1cb] rounded-[6px]`
- `pl-[12px] pr-[12px] py-[10px]`
- Label above: Inter Medium 14px `#1b1818` / Placeholder: Inter Regular 14px `#86807b`
- Disabled: `opacity-50`

**Settings Tab (active)**:
- `border-b-2 border-[#1b1818] h-[34px] px-[10px] py-[8px]`
- Inter Regular 14px `#1b1818`

**Settings Tab (inactive)**:
- No border, Inter Regular 14px `#4a4242`

**Settings Row**:
- `border-b border-t border-[rgba(50,47,47,0.05)] py-[20px]`
- Left col: label Inter Medium 14px + description Inter Regular 12px `#4a4242`
- Right col: input field

**Settings Sidebar** (left panel):
- `backdrop-blur(42px) rounded-[8px] w-[296px]`
- Menu items: `h-[38px] rounded-[8px]`
- Active item: `bg-[rgba(244,241,236,0.7)]`
- Item inner: `rounded-[12px] px-[12px] py-[10px]` + icon 16px + Inter Regular 14px
- Section header: Inter Medium 12px `#4a4242`

**Sidebar Nav (app sidebar)**:
- Floating pill `rounded-[32px]` (NOT full-width bar)
- Active item: `bg-[var(--accent-vibrant-glow)] rounded-full px-[16px] py-[10px]`
- Icon: `color: var(--accent-vibrant)` when active
- Inactive: transparent + hover `bg-sidebar-accent`
- Font: Inter Medium 14px

**Checkbox**:
- Selected: `bg-[#1b1818] border-[#1b1818] rounded-[4px] 16×16px` with white checkmark
- Unselected: `border border-[#1b1818] rounded-[4px] 16×16px`

**Shadow tokens**:
- `translucent`: `blur(84px)` + `drop-shadow(0 4px 4px rgba(0,0,0,0.12))`
- `shadow-lg`: `drop-shadow(0 4px 6px rgba(0,0,0,0.1)) drop-shadow(0 10px 15px rgba(0,0,0,0.1))`

### 12 Rules for AI Code Generation

1. Every card/panel → glass surface (`backdrop-blur(42px)`, `glass-surface-bg`, `glass-surface-border`)
2. Never flat white/black on app surfaces — always glass
3. Page wrapper → `--background` + 3-layer ambient gradient at bottom (see above)
4. Primary CTA → `rounded-[100px]` pill. Dark action buttons (forms) → `rounded-[6px]` h-[36px]
5. Suggestion chips → `rounded-[46px]`, NOT `rounded-full`
6. Floating navbar → `rounded-[32px]` pill with `blur(19.65px)`, NOT full-width bar
7. Font → Inter for ALL UI; Instrument Serif for hero/display/auth titles only
8. Headings → always negative letter-spacing (`tracking-tight` or explicit negative value)
9. Active sidebar nav → full pill fill (`accent-vibrant-glow`), icon in `accent-vibrant`, NEVER underline or left border
10. Gradients → amber-copper center, orange diagonal secondary, purple bottom-corner — never neon
11. Input fields → `rgba(218,217,215,0.2)` bg (NOT glass-surface-bg) — subtler fill
12. Dark button bg = `#252222`, NOT `#000` or `#1b1818` (foreground)
