# TwinMe - Soul Signature Platform

## User Preferences (MUST FOLLOW)

- **NO EMOJIS** — The user dislikes emojis. Never use them in UI text, twin responses, insight text, or any user-facing content. Use plain text only.
- **Design**: Cosmos (since 2026-09-03) — a photographed room at blue hour. Paper #f7f5f3, one still carrying the page with content lifted onto it on rounded panels, frosted glass over the image, Instrument Serif for what is read, Geist for interface, Geist Mono for timestamps and counters only. The bar is cora.computer and createanything.com. Contract: src/styles/presence-cosmos.css (`pc-*`) + /cosmos/system. Nocturne and Claura are previous eras, still loading for unported app surfaces. Full section below.

## Vercel Cost Rules (CRITICAL — $375 bill incident March 2026)

- **Crons**: NEVER more than */15. Removed token-refresh cron (on-demand only). deliver-insights and prospective-check at */15.
- **maxDuration**: 60s (was 120s — halves GB-hour cost)
- **Deploys**: ONE per push (disabled GitHub Action duplicate). Batch commits before pushing.
- **New crons**: Must justify frequency. Default to hourly or daily, not every-N-minutes.
- **LLM in crons**: Always check cooldowns/conditions BEFORE calling LLM. Early return = free.

## Workflow & Task Management

Global workflow rules live in `~/CLAUDE.md` ("Workflow Orchestration" +
"Task Management") and `~/.claude/rules/` — don't duplicate them here; the
last copy of this section drifted for months because it was a verbatim
mirror. Project-specific notes only:

- Durable plans for this repo: `.claude/plans/<date>-<topic>/README.md`
  (the doc-file hook blocks new .md elsewhere; `tasks/todo.md` is legacy —
  read it if present, don't extend it).
- Lessons for this repo: append to `tasks/lessons.md` after corrections.
- Bug reports here default to failing-test-first (vitest); trivial fixes
  (typo, stale ref, one-line config) can skip the reproduction harness —
  say why.

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
Triggered when accumulated importance reaches IMPORTANCE_THRESHOLD (80 in reflectionEngine.js). Uses 5 domain-specific expert personas:

1. **Personality Psychologist** - Emotional patterns, coping, attachment style, Big Five from behavior
2. **Lifestyle Analyst** - Daily rhythms, energy, health-behavior connections, routine vs spontaneity
3. **Cultural Identity Expert** - Aesthetic preferences, media taste, cultural markers
4. **Social Dynamics Analyst** - Communication style, relationship patterns, social energy
5. **Motivation Analyst** - Work patterns, ambitions, decision-making style

Process: Gather 100 recent memories -> Run all 5 experts in parallel (each retrieves domain-specific evidence via vector search with `reflection` weights) -> Each expert generates 2-3 observations -> Store as `reflection` memories (importance 7-9) with expert metadata. Recursion is gated by MAX_REFLECTION_DEPTH (currently 1: meta-reflections disabled to avoid reflection oversaturation of the memory stream)

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
- Eon Systems whole-brain emulation (Nature, Oct 2024) — Neurotransmitter distribution informing mode-based parameter modulation

### Neurotransmitter Modes (`neurotransmitterService.js`)
Context-dependent dynamic modulation of sampling parameters. Inspired by how neurotransmitters globally shift brain processing. All functions are PURE (no DB, no LLM, microseconds).

**Three modes** (additive deltas on top of OCEAN-derived personality params):
- **Serotonergic** (emotional/supportive): temp +0.05, freq_pen -0.08, pres_pen +0.05 — warmer, allows comforting repetition
- **Dopaminergic** (analytical/goal-focused): temp -0.08, top_p -0.03, freq_pen +0.08, pres_pen -0.05 — precise, varied vocabulary
- **Noradrenergic** (creative/exploratory): temp +0.10, top_p +0.05, freq_pen +0.03, pres_pen +0.03 — widest sampling

**Detection**: Keyword-based classification, requires >= 2 keyword matches to activate. Returns `{ mode, confidence, matchedKeywords }`.
**Feature flag**: `neurotransmitter_modes` (default: enabled)

### Connectome Neuropils (`neuropilRouter.js`)
Domain-specific memory retrieval routing. Maps 5 brain regions to the 5 reflection expert domains with custom retrieval weights and type budgets.

**Five neuropils**:
- `personality`: identity-like weights [0.3, 0.8, 1.0], more reflections+conversations
- `lifestyle`: recent-biased [1.0, 0.5, 0.8], more platform_data (10)
- `cultural`: balanced [0.5, 0.7, 1.0], standard mix
- `social`: balanced-recent [0.7, 0.6, 1.0], more conversations (8)
- `motivation`: recent+importance [0.8, 0.7, 1.0], more facts (8)

**Routing**: `classifyNeuropil(message)` → `{ neuropilId, weights, budgets, confidence }`. Budgets passed to `retrieveDiverseMemories()`.
**Feature flag**: `connectome_neuropils` (default: enabled)

### Embodied Feedback Loop (Nudges)
Closes the sensorimotor loop: twin suggests micro-action → user acts → twin observes result → learns what works.

**Pipeline**: `generateProactiveInsights()` → 'nudge' category with `nudge_action` → delivered in chat → `evaluateNudgeOutcomes()` (12-48h later, keyword overlap with platform_data) → outcome stored → injected as "PAST NUDGES" context in future chats.

**Functions** (in `proactiveInsights.js`):
- `evaluateNudgeOutcomes(userId)` — keyword overlap scan of platform_data vs nudge_action, ≥40% match = followed
- `getNudgeHistory(userId, limit)` — recent evaluated nudges for chat context
- `getNudgeEffectivenessScore(userId)` — followed/total ratio (last 30d)

**Feature flag**: `embodied_feedback_loop` (default: enabled)
**Migration**: `20260309_add_nudge_feedback_columns` — adds nudge_action, nudge_followed, nudge_outcome, nudge_checked_at to proactive_insights

### LLM Wiki (Compiled Knowledge Base)
Inspired by Karpathy's LLM Wiki pattern. Instead of re-deriving knowledge from raw memories on every chat, the system compiles structured, cross-referenced wiki pages that compound over time.

**Three layers** (maps to Karpathy's architecture):
- **Raw sources** = `user_memories` table (observations, facts, platform_data)
- **Wiki** = `user_wiki_pages` table (5 compiled domain pages per user)
- **Schema** = CLAUDE.md + expert personas (conventions for compilation)

**Five domain pages** (one per neuropil/expert):
1. **Personality Profile** (personality_psychologist) -- traits, stress responses, emotional patterns
2. **Lifestyle Patterns** (lifestyle_analyst) -- routines, sleep, exercise, health
3. **Cultural Identity** (cultural_identity) -- music taste, content preferences, aesthetics
4. **Social Dynamics** (social_dynamics) -- communication style, relationships
5. **Motivation & Drive** (motivation_analyst) -- work patterns, goals, productivity

**Compilation trigger**: Chained after `generateReflections()` in `observationIngestion.js` with 60s delay. No dedicated cron. Max 2 domains compiled in parallel. Uses TIER_ANALYSIS (DeepSeek, ~$0.004/cycle).

**Twin chat integration**: Wiki pages fetched in `twinContextBuilder.js` (parallel with other context), injected as `=== MY KNOWLEDGE BASE ===` in system prompt via `twinSystemPromptBuilder.js`. When wiki is present, twinSummary is skipped (wiki subsumes it).

**Cross-references**: Pages use `[[domain:X]]` syntax. Frontend renders these as clickable links that scroll to the target domain card.

**Feature flag**: `llm_wiki` (default: disabled, requires explicit opt-in)
**Tables**: `user_wiki_pages` (UNIQUE on user_id+domain, pgvector embedding), `user_wiki_logs` (change audit)
**RPC**: `match_wiki_pages(user_id, embedding, limit)` -- vector search across wiki pages
**Frontend**: `/wiki` route, `WikiPage.tsx`, `WikiDomainCard.tsx`

### Key Architecture Files
- `api/services/memoryStreamService.js` - Write/read path for memory stream (per-utterance storage)
- `api/services/reflectionEngine.js` - Reflection generation pipeline (recursion gated by MAX_REFLECTION_DEPTH, currently 1)
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
- `api/services/neurotransmitterService.js` - Context-dependent sampling parameter modulation (3 pure functions)
- `api/services/neuropilRouter.js` - Domain-specific memory retrieval routing (5 neuropils)
- `api/services/wikiCompilationService.js` - LLM Wiki: compiles 5 domain knowledge pages from reflections + memories
- `api/routes/wiki.js` - Wiki API endpoints (GET pages, GET page/:domain, GET logs, POST compile)

## Tech Stack
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Framer Motion, shadcn/ui
- **Backend**: Node.js, Express 5, JWT Auth
- **Database**: Supabase (PostgreSQL + pgvector) - ONLY active database
- **AI**: OpenRouter (DeepSeek V3.2 for analysis, Mistral Small for extraction, Claude Sonnet for twin chat)
- **LLM Gateway**: `api/services/llmGateway.js` - ALL LLM calls route through here
- **Cache**: Redis (ioredis) with in-memory fallback
- **Auth**: JWT + OAuth 2.0 for platform connections
- **Analytics**: PostHog

## Active Platform Integrations (9 OAuth-connectable)

Source of truth: `VALID_PROVIDERS` in `api/routes/oauth-callback.js`. Do not add a
platform here without a matching entry there.

1. **Spotify** - Music taste, listening patterns, mood
2. **Google Calendar** (`google_calendar`) - Schedule, events, time patterns
3. **YouTube** - Content preferences, subscriptions
4. **Gmail** (`google_gmail`) - Communication patterns from email metadata
5. **Discord** - Server activity, community interests, communication style
6. **GitHub** - Coding activity and open source contributions
7. **Whoop** - Recovery, strain, sleep, HRV patterns
8. **Instagram** - Visual identity, posting patterns
9. **Outlook** - Communication patterns from email metadata

### Retired (replan-2026-06-10 Track C portfolio cut)
Reddit, Twitch, LinkedIn, Slack, TikTok, Strava, Notion, Pinterest, SoundCloud,
Fitbit, Steam, Apple Music. Their OAuth/live-fetch stacks are gone — existing
`platform_connections` rows keep their data but are no longer connectable or
extractable. LinkedIn and Reddit remain available via the GDPR export upload path
(`api/services/gdpr/parsers/`).

## LLM Model Strategy
All LLM calls route through `llmGateway.js` using the tiers in `api/config/aiModels.js` (single source of truth). Twin chat additionally smart-routes per message via `chatRouter.js`.

| Tier | Use Case | OpenRouter Model ID | Why |
|------|----------|---------------------|-----|
| CHAT | Twin conversation (default) | `deepseek/deepseek-v3.2` | 12x cheaper, ~3x faster TTFT; smart-routes up for hard turns |
| ANALYSIS | Reflections, twin summary, proactive insights | `deepseek/deepseek-v3.2` | Good enough, 95% cheaper |
| EXTRACTION | Importance rating, fact extraction | `deepseek/deepseek-v3.2` | mistral-small-creative was 404'ing on OpenRouter (2026-04-30) |
| VISION | WhatsApp receipt/image extraction | `google/gemini-2.5-flash` | vision-capable, ~$0.001/image |

Smart routing (`chatRouter.js`): Chat Light = `google/gemini-2.5-flash` (greetings/acks), Chat Standard = `deepseek/deepseek-v3.2` (medium), Chat Deep = `deepseek/deepseek-v3.2` (emotional / identity / complex — kept on DeepSeek for cost; `CHAT_TIER_MODELS` in chatRouter.js is the source of truth, drift-guarded by a test).

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
## Design System (Cosmos — active since 2026-09-03)

> Cosmos is the current language, and where a surface disagrees with it, the
> surface is wrong. It replaced Nocturne for everything the user actually meets:
> the landing, auth, onboarding, Presence, and the Portrait. Nocturne
> (`src/styles/nocturne.css`, `/nocturne/*`) and Claura beneath it are the
> previous eras — they still load for unported app surfaces, but nothing new is
> built on them.
> Source of truth: `src/styles/presence-cosmos.css` (the `pc-*` primitives) and
> the rendered spec at `/cosmos/system`.
> The quality bar is two references the user chose: **cora.computer** and
> **createanything.com**. Judge new design against those, not against an
> imagined studio.

### What Cosmos is
Paper `#f7f5f3` and ink `#0d0d0d`, Geist for interface, **Instrument Serif for
what is read**, Geist Mono only for timestamps and counters, so mono still
means a machine wrote it. Warm, soft, centred where it matters. The register is
a photographed room at blue hour, not a gallery wall.

### The laws
1. **One photograph carries the page.** It is the ground, never a banner: it
   runs behind the content, and the content lifts onto it on a rounded panel.
   Never cut the image with a hard horizontal seam.
2. **Panels float inside the photograph**, frosted, so the room reads through
   them — the way both references float their product on their image.
3. **Serif is what is read** (the headline, today's question, the five signature
   lines). Everything you can press is sans. Mono is provenance only.
4. **One italic word per display line**, on the line's most particular word,
   never on its last.
5. **Rounded, not sharp**: 24-28px cards and panels, 16px buttons, 999px pills
   and nav capsules. Hairlines, not shadows.
6. **One conversion per page**, at its end.

### Imagery
The stills in `public/images/twinme/cosmos-*.jpg`: warm tungsten lamp, cobalt
blue-hour window, Portra grain. Crop past the accidents (posters, doorways),
and let a luminous region (the window) be the field that display type sits on.
Do not swap this family for skies or bright fields — it is a chosen register.

### Rules for AI code generation
1. Reuse the `pc-*` primitives; never restyle Presence to make something else fit.
2. NO EMOJIS in user-facing UI (unchanged, permanent).
3. Never bold the serif; never colour body text with the signature hues.
4. `.presence-cosmos p` and `.presence-cosmos a` out-specify a bare class —
   scope new rules as `.presence-cosmos .thing`, or the colour will not apply.
5. `index.css` truncates every `button span` with an ellipsis. Any text inside a
   button needs `white-space: normal; overflow: visible` in the Cosmos scope.

### The five signature hues
ember `#dd8f4c` motivation · iris `#847dff` personality · verdigris `#55a08e`
cultural · orchid `#dd90d8` social · periwinkle `#90b8f0` lifestyle. They name
the five domains in data and in any tile that needs them; the Portrait itself is
monochrome by decision.


## Inteligência de mercado e técnica

Contexto vivo deste projeto — concorrentes, papers e mudanças de plataforma já
triados — vive em `docs/intel/`:

- **`docs/intel/INTEL.md`** — leia no começo de qualquer sessão sobre rumo de
  produto, arquitetura ou posicionamento. A seção "Em aberto" tem decisões
  esperando o Stefano; traga-as à tona quando o assunto encostar nelas.
- **`docs/intel/BACKLOG.md`** — spikes e implementações que saíram da triagem.
  Antes de propor um experimento novo, veja se ele já está aqui.
- **`intel.config.json`** — o que este projeto é, sua stack, suas apostas
  (`bets`), seus buracos (`known_gaps`) e o que já foi decidido (`settled`).
  **Não rediscuta o que está em `settled`** sem que o Stefano reabra.

Para atualizar: `/intel`. A rubrica de triagem está em
`.claude/skills/intel/references/rubric.md` — nada entra nesses arquivos sem
passar por ela.
