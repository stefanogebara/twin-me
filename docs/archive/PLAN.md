# TWIN ME - EXECUTION PLAN

> Last updated: 2026-02-13
> Status: TIER 1 COMPLETE, TIER 2 COMPLETE, TIER 3 COMPLETE

---

## THE CORE PROBLEM

We have a compelling vision (soul signature from digital life) trapped inside an over-engineered codebase (84 routes, 140 services, 177 dependencies) that has never been tested with real users. The core product loop (onboarding -> soul signature -> twin chat) underperforms at each step.

## THE GOAL

Ship a focused, polished product where:
1. A new user signs up and is SURPRISED by what we already know (< 60 seconds)
2. They receive a soul signature that feels like looking in a mirror
3. They chat with a twin that actually sounds like them

---

## TIER 1: PREREQUISITES (Before Any Real Users)

### 1.1 Investigate & Fix Production Deployment
**Status:** COMPLETE
**Priority:** CRITICAL - nothing else matters if prod is broken
**Effort:** 1 day

**Findings:**
- [x] Backend runs as Vercel serverless function via `api/index.js` → `server.js`
- [x] WebSockets NOT available (serverless). Twin chat uses non-streaming `complete()` - works fine.
- [x] Background jobs run via Vercel Cron (token-refresh/5min, platform-polling/30min, pattern-learning/6h, claude-sync/daily)
- [x] Redis uses in-memory fallback in production (no Redis URL configured)
- [x] Production URL: https://twin-ai-learn.vercel.app - API responds 200, DB connected

**Verified:**
- `GET /api/health` → `{"status":"ok","database":{"connected":true}}`
- Frontend loads at https://twin-ai-learn.vercel.app/
- CORS configured for production domain
- 64 routes mounted in server.js

---

### 1.2 Add Analytics (PostHog)
**Status:** COMPLETE (code deployed, needs PostHog project API key)
**Priority:** CRITICAL - can't improve what you can't measure
**Effort:** 2 days

**Implementation Complete:**
1. [x] Installed `posthog-js` SDK
2. [x] Rewrote `AnalyticsContext.tsx` with PostHog backend (was dead skeleton)
3. [x] Auto page view tracking via React Router (`PostHogPageTracker` in App.tsx)
4. [x] User identification on auth state change (PostHog `identify()` / `reset()`)
5. [x] PostHog autocapture enabled (clicks, inputs, form submits)
6. [x] Demo users excluded from all analytics
7. [x] Custom funnel events instrumented:
   - `auth_initiated` (CustomAuth.tsx - Google sign-in click)
   - `user_signed_up` / `user_signed_in` (OAuthCallback.tsx - auth success)
   - `platform_connect_initiated` (InstantTwinOnboarding.tsx - OAuth redirect)
   - `platform_connected` (OAuthCallback.tsx - connector success, with platform name)
   - `soul_signature_generated` (SoulSignatureDashboard.tsx - generation success)
   - `twin_chat_message_sent` (TalkToTwin.tsx - message sent, with message_number)
8. [x] Env vars added to `.env.example`: `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`

**To Activate:**
1. Create PostHog project at https://us.posthog.com
2. Add `VITE_POSTHOG_KEY=phc_xxxxx` to `.env` and Vercel env vars
3. Deploy - events will start flowing immediately

**Acceptance Criteria:**
- [x] PostHog SDK initialized conditionally (only when key present)
- [ ] PostHog dashboard shows real events (needs API key)
- [ ] Funnel visualization configured in PostHog UI
- [ ] User sessions are trackable

---

### 1.3 Privacy Policy & Data Deletion
**Status:** COMPLETE (core flows implemented, consent management deferred to TIER 3)
**Priority:** CRITICAL - legal requirement for consumer launch
**Effort:** 3 days

**Implementation Complete:**
1. [x] **Privacy Policy Page** - Fully rewritten (`PrivacyPolicy.tsx`):
   - Accurate data collection list per platform (Spotify, Calendar, Whoop, YouTube)
   - Email enrichment disclosure (Gravatar, GitHub)
   - AI processing via OpenRouter (Claude, DeepSeek, Gemini Flash)
   - Third-party services listed: Supabase, OpenRouter, Vercel, PostHog
   - Data retention: immediate deletion on account delete, analytics anonymized
   - User rights: export, delete, disconnect, edit enriched data

2. [x] **Account Deletion Flow** (`api/routes/account.js` + `Settings.tsx`):
   - "Delete My Account" button in Settings with red danger styling
   - Confirmation dialog listing what gets deleted
   - Type "DELETE" confirmation to prevent accidental deletion
   - Backend: `DELETE /api/account` - deletes user row, PostgreSQL CASCADE handles 50+ child tables
   - All user data deleted within seconds (CASCADE constraint)
   - Signs out and redirects to auth page after deletion
   - Disabled in demo mode

3. [x] **Data Export** (`api/routes/account.js` + `Settings.tsx`):
   - "Download My Data" button in Settings with blue styling
   - `GET /api/account/export` - gathers data from 14 tables in parallel
   - Exports: profile, platform connections, platform data, soul signatures, personality scores, twin conversations, twin messages, enriched profiles, onboarding calibration, memories, big five scores, behavioral patterns, reflection history, privacy settings
   - Downloads as `twin-me-export-YYYY-MM-DD.json`
   - Disabled in demo mode

4. **Consent Management:** (deferred to TIER 3)
   - [ ] Clear consent checkboxes during onboarding
   - [ ] Per-platform consent when connecting
   - [ ] Ability to revoke consent per platform

**Acceptance Criteria:**
- [x] Privacy policy page reflects actual practices
- [x] Account deletion removes ALL user data within seconds
- [x] Data export generates downloadable JSON archive
- [ ] Consent is recorded and revocable (TIER 3)

---

### 1.4 Dead Code Audit
**Status:** COMPLETE
**Priority:** HIGH - reduces cognitive load and attack surface
**Effort:** 3-5 days

**Results (Route Files):**
- Routes: 84 → 68 (16 archived to `_archive/dead-routes/` and `_archive/experimental-routes/`)
- 7 dead files archived: auth.js (legacy), memory.js (legacy), activity-scoring.js, platforms.js, 3 backup files
- 9 experimental files archived: 3 unscheduled crons, 2 pipedream variants, music-agent.js, mcp-connectors.js, privacy-settings.js, privacy-controls.js
- 6 CORE routes identified: auth-simple.js, oauth-callback.js, twin-chat.js, soul-signature.js, dashboard.js, onboarding-questions.js

**Results (Service Files):**
- [x] Archived 17 orphaned services to `_archive/dead-services/`
- [x] Deleted 9 test files from api/services/ (moltbot tests, examples)
- [x] Verified every file via grep before archival
- [x] Server loads correctly after all removals
- Remaining ~137 service files are all actively imported by routes or other services

**Remaining (nice-to-have):**
- [ ] Frontend component audit (150+ components, many likely unused)

---

### 1.5 Dependency Cleanup
**Status:** COMPLETE
**Priority:** HIGH - faster builds, smaller attack surface
**Effort:** 0.5 day

**Removed (9 packages):**
- `@anthropic-ai/sdk` - All LLM calls go through OpenRouter now
- `anthropic` - Duplicate/unused Anthropic package
- `@types/d3`, `@types/three` - Type definitions with 0 imports
- `phosphor-react` - Replaced by lucide-react throughout
- `mammoth` - Word doc parser, never used
- `tesseract.js` - OCR library (~10MB), never used
- `spotify-web-api-node` - Replaced by direct Spotify API calls
- `pdf-parse` - PDF parser, never used

**Result:** 97 → 88 dependencies (9% reduction)
**Verified:** TypeScript clean, production build succeeds

**Still installed but borderline (keep for now):**
- `arctic` - OAuth library, used by 10 connector files
- `bull` + `@bull-board/*` - Queue system, used by connectors + queue dashboard
- `d3` - Used by 7 components (BrainExplorer, etc.)
- `natural` - NLP library, used by 27 files for text processing

---

## TIER 2: FIX THE CORE PRODUCT

### 2.1 Fix Twin Chat Quality
**Status:** COMPLETE
**Priority:** CRITICAL - the core engagement mechanic
**Effort:** 1-2 weeks

**The Problem:**
The twin feels like "ChatGPT with a fact sheet" - generic personality, shallow memory, wrong priorities.

**Completed:**

**A. Upgrade Model for Chat** ✅
- Changed TIER_CHAT in `aiModels.js` to `anthropic/claude-sonnet-4.5`
- Analysis stays on DeepSeek V3.2, Extraction on Mistral Small
- Cost: ~$0.01-0.03 per message (acceptable for freemium)

**B. Rewrite System Prompt** ✅
- Rewrote `TWIN_BASE_INSTRUCTIONS` in twin-chat.js with personality-driven approach:
  - IDENTITY layer: "You are not a chatbot. You are me."
  - VOICE layer: Mirror user's emojis, brevity, style
  - KNOWLEDGE layer: Cross-platform insight generation
  - BEHAVIOR layer: Opinions, not hedging. Friends, not assistants.
- Added "WHAT MAKES YOU DIFFERENT FROM CHATGPT" section
- Reduced platform interpretation from verbose to actionable

**C. Enrich Context Injection** ✅
- Added temporal awareness (day of week, time of day)
- Narrative framing: "I'm listening to X" not "Spotify: Recent: X"
- Calendar events include times, density assessment ("Packed day")
- Whoop recovery translated to natural language ("green - feeling good")
- Cross-platform observations auto-generated (low recovery + busy schedule)
- Big Five translated to personality traits ("highly curious", "introspective")
- Context budgets increased: 8K→12K dynamic, 4K→6K additional
- Writing profile enhanced with explicit voice matching instructions
- Mem0 memories shown as bullet list, not compressed string

**D. Cognitive Architecture Upgrade (Memory System)** ✅
- Unified memory stream (`memoryStreamService.js`) inspired by Generative Agents (Park et al., UIST 2023)
- All observations flow into `user_memories` table with 1536-dim vector embeddings (pgvector, HNSW index)
- Embedding via OpenRouter text-embedding-3-small (`embeddingService.js`)
- Three-factor retrieval scoring: `0.3 * recency_decay + 0.3 * importance/10 + 0.4 * cosine_similarity`
- LLM-rated importance (1-10) for every memory via cheapest model tier
- Reflection engine (`reflectionEngine.js`): generates higher-level insights from raw observations
  - Asks 3 salient questions about recent memories, retrieves evidence via vector search, synthesizes insights
  - Reflections stored back as `memory_type='reflection'` with high importance (7-9)
  - Triggered when accumulated importance > 25, with 1-hour cooldown per user
- Backfill script (`api/scripts/backfillMemoryEmbeddings.js`): 1,692 memories backfilled with embeddings + importance scores
- 3 initial reflections seeded
- Twin chat now retrieves from unified memory stream (replaced flat Mem0 lookup)

**Acceptance Criteria:**
- ✅ Twin uses vocabulary and references consistent with user's data
- ✅ Twin makes unexpected connections between platforms
- ✅ Twin has opinions and personality, not just facts
- Blind test: user can't easily distinguish twin from a knowledgeable friend

---

### 2.2 Build Cofounder.co-Style Onboarding
**Status:** COMPLETE (all 5 vision steps implemented, polish remaining)
**Priority:** CRITICAL - first impression determines everything
**Effort:** 2 weeks

**The Vision:**
```
Step 1: Email Signup (10 seconds)
  -> User enters email
  -> Backend does reverse email lookup
  -> Finds: name, photo, company, title, social profiles, interests

Step 2: The Reveal (30 seconds)
  -> Animated reveal screen: "Here's what we found..."
  -> Show photo, name, company, public interests
  -> "Did we get this right?" with edit controls
  -> WOW MOMENT - how did they know this?

Step 3: Interactive Q&A (2-3 minutes)
  -> AI-driven conversation asking calibration questions
  -> Based on what enrichment found (and what it DIDN'T find)
  -> "We see you work at [company]. What's your role there?"
  -> "Your LinkedIn suggests you're interested in [X]. Tell us more."
  -> Personality-revealing questions woven in naturally

Step 4: Quick Connect (1 minute)
  -> "Connect Spotify to discover your musical soul" (one-click OAuth)
  -> "Connect Calendar to understand your rhythms"
  -> Each connection triggers immediate mini-insight
  -> Can skip - onboarding works without connections

Step 5: First Soul Signature (instant)
  -> Generate initial signature from enrichment + Q&A data
  -> Show it as a beautiful, shareable card
  -> "This is your first draft. Connect more platforms to refine it."
  -> CTA: "Talk to Your Twin" or "Explore Your Dashboard"
```

**Email Enrichment: IMPLEMENTED (Tier 1 - Free APIs)**
Waterfall strategy (Gravatar + GitHub now live, Generect for future):
1. [x] **Gravatar** (FREE) → photo, name, social links - TESTED: finds photo+name
2. [x] **GitHub API** (FREE, 5K/hr) → bio, company, location, repos - IMPLEMENTED
3. [ ] **Generect** ($0.03-0.05) → name, company, title, social - FUTURE
4. Existing: Gemini comprehensive search + Scrapin.io LinkedIn lookup still runs as Phase 2

**Implementation Done:**
1. [x] Backend: `quickEnrich()` method - Gravatar+GitHub in parallel, < 1 second
2. [x] Backend: `POST /api/enrichment/quick` - authenticated endpoint
3. [x] Frontend: `enrichmentService.quickEnrich()` - frontend client
4. [x] Frontend: DiscoveryStep shows instant photo + bio reveal, then deep search
5. [x] Database: `discovered_photo` column added to enriched_profiles
6. [x] Full `enrichFromEmail()` now starts with free lookups before AI searches
7. [x] Backend: `POST /api/onboarding/calibrate` - AI-driven Q&A endpoint (TIER_CHAT)
8. [x] Backend: `GET /api/onboarding/calibration-data/:userId` - retrieve calibration results
9. [x] Database: `onboarding_calibration` table (insights, archetype_hint, personality_summary)
10. [x] Frontend: `CalibrationStep.tsx` - conversational AI Q&A with progress dots
11. [x] Frontend: `PlatformConnectStep.tsx` - Spotify/Calendar/YouTube/Whoop quick-connect cards
12. [x] Onboarding flow restructured: Discovery → Calibration → Platform Connect → Soul Signature → Dashboard
13. [x] Analytics tracking on calibration_completed + platform_connect_initiated + soul_signature_generated
14. [x] Backend: `POST /api/onboarding/instant-signature` - generates archetype from enrichment + calibration
15. [x] Frontend: `SoulSignatureRevealStep.tsx` - animated archetype card with traits + quote
16. [x] Soul signature saved to `soul_signatures` table (archetype_name, defining_traits, narrative)
17. [x] CTA buttons: "Talk to Your Twin" or "Explore Your Dashboard"

**Remaining:**
- [ ] Polish reveal animations (photo card, staggered data reveal)

**Privacy Considerations:**
- Must disclose that we're looking up public information
- "We found some public information about you" (not "we scraped you")
- User can correct or delete any enriched data
- Enrichment data stored with explicit consent flag

---

### 2.3 Simplify Soul Signature Output
**Status:** COMPLETE
**Priority:** HIGH - the identity anchor
**Effort:** 1 week

**Implementation Complete:**
1. [x] Public sharing backend (`api/routes/soul-signature-public.js`):
   - `GET /api/soul-signature/public/:userId` - Public endpoint, no auth, returns signature if `is_public=true`
   - `PATCH /api/soul-signature/visibility` - Authenticated toggle for `is_public`
   - `GET /api/soul-signature/share-status` - Authenticated check of current share status
2. [x] Public Soul Card page (`src/pages/PublicSoulCard.tsx`):
   - Standalone page at `/s/:userId` (no auth, no sidebar)
   - Avatar, archetype name, subtitle quote, traits with evidence, narrative
   - Not-found state with CTA to discover own soul signature
   - Framer Motion staggered animations, dark theme
3. [x] Share controls in SoulSignatureDashboard header:
   - "Share" / "Public" toggle button
   - "Copy Link" button (only visible when public)
   - Fetches share status on mount
4. [x] Route registered in App.tsx at `/s/:userId`
5. [x] TypeScript compiles cleanly

**OG Cards & Social Sharing:** ✅ (implemented in TIER 4.2 sprint)
- `api/routes/og-image.js`: PNG card generation + OG HTML meta tag page
- `api/services/soulCardRenderer.js`: 1200x630 card via satori + @resvg/resvg-js
- `/api/og/soul-card?userId=X` → PNG with archetype, traits, score bars
- `/api/s/:userId` → OG HTML with meta tags + meta-refresh redirect to SPA
- Inter fonts bundled at `api/fonts/`
- Privacy-aware: private signatures return fallback card unless owner requests

**Deferred:**
- "New insight unlocked!" changelog notifications

---

## TIER 3: POLISH FOR LAUNCH

### 3.1 Freemium Gating
**Status:** COMPLETE
**Priority:** HIGH - monetization foundation
**Effort:** 1 day

**Implementation Complete:**
1. [x] Backend: `api/routes/chat-usage.js` - Monthly usage tracking
   - `getMonthlyUsage(userId)` counts user messages in `twin_messages` for current month
   - Joins through `twin_conversations` to scope to user
   - Gracefully handles missing `subscription_tier` column (defaults to 'free')
   - `GET /api/chat/usage` returns `{ used, limit, remaining, tier, reset_date }`
   - `FREE_TIER_LIMIT = 10` messages/month
2. [x] Backend: Quota enforcement in `api/routes/twin-chat.js`
   - Checks quota at start of `POST /message` handler
   - Returns HTTP 429 with `error: 'monthly_limit_reached'` when over limit
   - Wrapped in try/catch so quota check failure doesn't block chat
3. [x] Frontend: Usage counter in `TalkToTwin.tsx`
   - `X/10` badge next to Twin AI indicator
   - Upgrade banner above input when limit reached (gradient purple, "Upgrade to Pro - Coming Soon")
   - Disabled textarea and send button when `limitReached`
   - Handles 429 response: reverts optimistic message, restores input, sets limit state
   - Refreshes usage after each successful message
4. [x] Route registered: `app.use('/api/chat', chatUsageRoutes)` in server.js

**Split:**
- **Free:** Full onboarding + Soul Signature + 10 chat messages/month + Dashboard
- **Pro ($9.99/mo):** Unlimited chat + All insights + Privacy spectrum controls + Data export + Priority AI model

**DB Migration (optional, for future Pro tier):**
- `database/supabase/migrations/20260213_add_subscription_tier.sql` created
- Adds `subscription_tier`, `monthly_chat_count`, `monthly_chat_reset_at` to users table
- Not required for free tier gating (works via message counting)
- Apply via Supabase SQL Editor when ready for Pro tier

---

### 3.2 Trust Signals
**Status:** COMPLETE
**Priority:** HIGH - user trust for consumer launch
**Effort:** 0.5 day

**Implementation Complete:**
1. [x] "How Your Data is Protected" section in Settings.tsx with 4 trust cards:
   - OAuth-only connections (never see or store passwords)
   - Encrypted at rest (Supabase PostgreSQL)
   - No data selling (never sold, shared, or used for ads)
   - Complete deletion (account + ALL data removed instantly)
2. [x] OAuth badge on Connected Platforms header
3. [x] Fixed broken privacy policy link: `/privacy` → `/privacy-policy`
4. [x] Existing: "Delete All My Data" button already prominent in Settings (TIER 1.3)
5. [x] Existing: Data export button in Settings (TIER 1.3)

---

### 3.3 Frontend Performance
**Status:** COMPLETE
**Priority:** HIGH - initial load speed
**Effort:** 0.5 day

**Implementation Complete:**
1. [x] Route-level code splitting via `React.lazy()` in App.tsx
   - 22 page imports converted from eager to lazy
   - Only 4 eager imports remain: Index, CustomAuth, OAuthCallback, NotFound
   - `Suspense` wrapper with spinner fallback around `<Routes>`
2. [x] Build results:
   - Main chunk: 5,364 KB → 910 KB (**83% reduction**)
   - 22 separate lazy-loaded chunks created
   - Largest chunks: BrainPage (1,414 KB), SoulSignatureDashboard (170 KB)
3. [x] PipedreamContext.tsx rewritten as no-op stub (was breaking builds with missing SDK)

**Remaining (nice-to-have):**
- [ ] Decompose BrainPage (1,414 KB) into sub-components
- [ ] Image optimization (WebP, lazy loading)
- [ ] Vite `manualChunks` to split recharts/shared libraries

---

## TIER 4: GROWTH (Post-Launch)

### 4.1 Platform Expansion
Priority order: Discord -> GitHub -> Reddit -> LinkedIn deep -> Apple Music

### 4.2 Viral Mechanics
- Shareable soul signature cards
- "Compare your soul with a friend" feature
- "Soul Compatibility" score between two users

### 4.3 Advanced Features
- Soul matching (find similar people)
- Browser extension data integration
- Temporal evolution (see how you've changed over months)
- Privacy spectrum as a feature (different personas for different contexts)

---

## DECISION LOG

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-12 | Core loop = Onboarding + Soul Signature + Twin Chat | Everything else is secondary |
| 2026-02-12 | Target = General consumers, freemium | Not enterprise, not developers |
| 2026-02-12 | Cut Moltbot, Neo4j, Qdrant | Experimental, not active, not needed for launch |
| 2026-02-12 | Upgrade twin chat to Claude Sonnet | Quality is the #1 problem, cost is acceptable |
| 2026-02-12 | Cofounder.co-style onboarding | Email enrichment -> wow moment is the key differentiator |
| 2026-02-13 | Prod deployment verified working | API + DB + frontend all responding at twin-ai-learn.vercel.app |
| 2026-02-13 | Archived 16 dead/experimental routes | Routes 84 -> 68. Legacy + backup + unscheduled files to _archive/ |
| 2026-02-13 | Twin chat: Sonnet + new prompt + rich context | 3 of 4 quality workstreams complete. Memory upgrade remaining. |
| 2026-02-13 | Enrichment: Gravatar->GitHub->Generect waterfall | 85-95% coverage at ~$0.02/lookup, GDPR-compliant |
| 2026-02-13 | PostHog analytics fully instrumented | 7 funnel events + auto pageviews + user identification. Needs API key to activate |
| 2026-02-13 | Instant enrichment: Gravatar+GitHub | Free APIs return photo+name in <1s. Existing Gemini/Scrapin enrichment runs as Phase 2 |
| 2026-02-13 | AI calibration Q&A via TIER_CHAT | 5 personalized questions from Claude Sonnet. References enrichment data, fills personality gaps |
| 2026-02-13 | Replaced Resume+LinkedIn steps with Calibration+PlatformConnect | Onboarding flow now: Discovery → Calibration → Platform Connect → Dashboard |
| 2026-02-13 | Privacy policy rewritten + account deletion + data export | Legal requirements for launch. All user tables use ON DELETE CASCADE. Consent management deferred to TIER 3 |
| 2026-02-13 | Freemium: count messages from twin_messages, not new columns | Works without DB migration. subscription_tier column checked gracefully with fallback |
| 2026-02-13 | Free tier: 10 msgs/month, Pro: unlimited (coming soon) | 429 response with upgrade CTA. Quota check failure doesn't block chat |
| 2026-02-13 | React.lazy() for 22 pages, 83% bundle reduction | Main chunk 5,364 KB → 910 KB. Only landing/auth/404 loaded eagerly |
| 2026-02-13 | Trust signals integrated into Settings (not separate page) | 4 trust cards + OAuth badge. Leverages existing delete/export buttons |
| 2026-02-13 | PipedreamContext stubbed out | SDK import was breaking builds, usePipedream never called anywhere |
| 2026-02-13 | Public soul card at /s/:userId | Share toggle + copy link in dashboard header. No auth required to view |
| 2026-02-13 | Service audit: 17 orphaned + 9 test files removed | Verified every file via grep before archival. Server loads correctly. |
| 2026-02-13 | Dependency cleanup: 97 → 88 packages | Removed tesseract.js (10MB), phosphor-react, anthropic SDKs, unused parsers |
| 2026-02-13 | Full UI testing: 10 pages, 0 errors | Dashboard, Soul Signature, Twin Chat, Brain, Journal, Personality, Connect, Settings, LLM Costs all clean. Fixed CORS (PATCH), chat-usage 500, node-fetch, pdf-parse |
| 2026-02-13 | Cognitive architecture upgrade (TIER 2.1D) | Unified memory stream with pgvector HNSW, three-factor retrieval, reflection engine. 1,692 memories backfilled, 3 reflections seeded. Twin chat now retrieves from vector-indexed memory stream |
| 2026-02-13 | OG card system verified | satori+resvg-js rendering, /api/og/soul-card PNG, /api/s/:userId OG HTML with meta-refresh. Inter fonts bundled. No new code needed |

---

## METRICS TO TRACK (Post-Analytics Setup)

| Metric | Target | Why |
|--------|--------|-----|
| Signup -> First Platform Connected | > 60% | Measures onboarding quality |
| Signup -> Soul Signature Generated | > 80% | Measures core loop completion |
| First Chat -> Second Chat | > 50% | Measures twin quality/stickiness |
| DAU/MAU | > 30% | Measures overall engagement |
| Free -> Paid conversion | > 5% | Measures monetization viability |
| Time to wow moment | < 60 seconds | Measures onboarding speed |

---

## TIER 5: AUDIT BACKLOG (2026-02-22)

Compiled from comprehensive codebase audit. All items confirmed with user via alignment session.

### Security (P0)

| # | Task | Status | Notes |
|---|------|--------|-------|
| S1 | Fix cron-claude-sync.js weak CRON_SECRET check | ✅ DONE | Main POST / and /process-analysis routes allowed through when CRON_SECRET not set. Fixed to match robust pattern used by other 4 cron files. |
| S2 | Verify CRON_SECRET is set in Vercel env vars | ✅ DONE | Confirmed present in Development, Preview, Production (set 123d ago). All 5 cron routes protected. |

### Performance (P1)

| # | Task | Status | Notes |
|---|------|--------|-------|
| P1 | Fix prompt caching bug in twin-chat.js | ✅ DONE | `buildTwinSystemPrompt()` returns array with `cache_control` blocks, but at lines 1120-1122 it got `.map(b => b.text).join('\n')` before being passed to `complete()`. Stripped caching metadata — Anthropic prompt caching never activated. Fix: removed stringification, pass array directly. `formatMessages()` in llmGateway already handles arrays correctly (`{ role: 'system', content: arrayOrString }`). OpenRouter forwards array format to Anthropic with cache_control intact. |
| P2 | Remove getMoltbotContext() from twin-chat.js | ✅ DONE | Removed function + getClusterPersonalityBuilder import + getRecentMemories import. Personality → already from personalityScores. Memories → already from twinContext.memories. Recovery → already from platformData.whoop. Simplified parallel fetch to single fetchTwinContext call. |

### User Experience (P1)

| # | Task | Status | Notes |
|---|------|--------|-------|
| U1 | Raise free tier from 10 → 100 messages/month | ✅ DONE | `FREE_TIER_LIMIT` in `api/routes/chat-usage.js`. Was 10 (far too low). Now 100. |
| U2 | Add chat streaming | ✅ DONE | SSE via `?stream=1`. Backend: streamLLM() with onChunk callback, SSE headers. Frontend: ReadableStream reader + TextDecoder, first-chunk spinner pattern. Commit a5cc527. |

### Memory Quality (P2)

| # | Task | Status | Notes |
|---|------|--------|-------|
| M1 | Fix memory diversity problem | ✅ DONE | Added `retrieveDiverseMemories()` in memoryStreamService.js: reflections (15) via semantic search + identity weights, facts (8) by importance DESC, platform_data (7) by recency DESC. twinContextBuilder.js updated. Commit 9354cff. |

### Code Health (P3)

| # | Task | Status | Notes |
|---|------|--------|-------|
| C1 | Aggressive route cleanup | ✅ DONE | All 80 routes confirmed mounted (og-image.js via dynamic import). Fixed 2 open endpoints in test-pattern-learning.js (/trigger-all, /status had no auth). Fixed training.js legacy import (api/config/supabase.js → api/services/database.js). Commit 4a5f94b. |

### Completed This Session

| Date | Item | Notes |
|------|------|-------|
| 2026-02-22 | Fix Whoop-anchor bias | Changed "Recovery score is everything" in TWIN_BASE_INSTRUCTIONS to "Recovery gives physical context... Don't anchor every response". Added PLATFORM DIVERSITY and HEALTH DATA IS CONTEXT response rules. Commit 2c1c34f. |
| 2026-02-22 | Fix cron-claude-sync.js security (S1) | Hardened two endpoint auth checks to fail-closed when CRON_SECRET not configured. |
| 2026-02-22 | Fix prompt caching bug (P1) | Removed stringification at twin-chat.js:1120. System prompt array now passed directly to complete(), enabling Anthropic prompt caching for TWIN_BASE_INSTRUCTIONS (~1024 tokens). |
| 2026-02-23 | AUDIT-PLAN.md all 28 issues resolved | 26 were already fixed. Fixed M8 footer (3-column nav) and L4 YouTube extension CTA (now "coming soon"). Commit c034433. |

---

## TIER 6: GROWTH ROADMAP (2026-02-23)

Priority order confirmed by user: Discord connector → BrainPage content → Temporal evolution.

---

### Phase 1: Discord Connector

**Status:** ✅ COMPLETE (2026-02-24)

**What already exists (don't rebuild):**
- `POST /api/entertainment-connectors/connect/discord` — OAuth initiation
- Token exchange in `api/routes/entertainment-connectors.js` (~line 465)
- `fetchDiscordObservations()` in `api/services/observationIngestion.js` (~line 432) — pulls guild list + category detection
- `src/pages/insights/DiscordInsightsPage.tsx` (377 lines) — full UI exists
- Connector card in `src/pages/onboarding/components/connectorConfig.tsx` (category: 'social')
- Route `/insights/discord` wired in `App.tsx`
- `DISCORD_CLIENT_ID` + `DISCORD_CLIENT_SECRET` + `DISCORD_REDIRECT_URI` in Vercel (set 140d ago)
- `VITE_APP_URL=https://twin-ai-learn.vercel.app` used as redirect URI base — correct

**Critical pre-check (do first):**
- Go to https://discord.com/developers/applications → app ID 1423392139995513093
- OAuth2 → Redirects: `https://twin-ai-learn.vercel.app/oauth/callback` must be listed
- If missing → add it. Without this, prod OAuth fails with "redirect_uri mismatch"
- Scopes needed: `identify`, `guilds`

**Steps:**
1. [x] Verify Discord dev portal has prod redirect URI whitelisted
2. [x] Test full OAuth flow locally
3. [x] Verify token stored in `platform_connections` — confirmed via /connectors/status
4. [x] Trigger observation ingestion — 15 servers in user_memories
5. [x] Audit `/api/twin/insights` — discordServers + discordCategoryBreakdown returned ✓
6. [x] Not needed (already returned)
7. [x] detectDiscordCategories() already has 10 categories (gaming, tech/dev, creative, learning, community, music, finance, health, sports, education)
8. [x] DiscordInsightsPage shows real data (rich reflection, servers, category bars)
9. [x] platformStatus?.discord?.connected resolves in TalkToTwin.tsx ✓

---

### Phase 2: BrainPage Content

**Status:** ✅ COMPLETE (2026-02-24)

**Bundle size already solved** — BrainPage chunk is 16 KB (was 1,414 KB before code-splitting). Nothing to do on performance. Focus is on making the page show real content.

**Steps:**
1. [x] Audit what `/api/twin/insights` returns today — returns Today's Intelligence (non-array), not suitable for Discoveries
2. [x] Add "X memories recorded" count per platform — new `GET /api/twin/memory-stats` endpoint + shown in "Your Data" sidebar
3. [x] Show top 3 insight nodes derived from reflections (expert domain + one-line summary) — Discoveries section now uses top reflection per expert, color-coded
4. [x] Color per expert (psychology=purple, lifestyle=green, cultural=amber, social=blue, motivation=orange) — EXPERT_META map in BrainPage
5. [x] Verify "Your Data" platform list shows correct connection status + last sync times — already working
6. [x] Add "X total memories" stat to the overview panel — shown in header ("13,354 memories")

---

### Phase 3: Temporal Evolution

**Status:** ✅ COMPLETE (2026-02-24)

**Data that already exists:**
- `soul_signatures` table: `created_at`, `archetype_name`, `defining_traits` — new rows on each generation → natural history exists
- `user_memories` table: every memory has `created_at` — full timeline
- `personality_scores` table: single row per user, OVERWRITTEN — no history

**Steps:**
1. [x] DB migration: create `personality_score_snapshots` table (used NUMERIC(5,2) not 4,3 — actual scores 0-100, seeded 3 users)
2. [x] Hook: after each reflection engine run → insert snapshot row into `personality_score_snapshots` (in reflectionEngine.js, depth=0, fire-and-forget)
3. [x] API: `GET /api/twin/evolution` — returns personality snapshots + soul_signature history + weekly memory growth + daysKnown
4. [x] Frontend: `EvolutionSection` component in `SoulSignatureDashboard.tsx`
   - Big Five radar chart (BigFiveRadarChart preset from PersonalityRadarChart.tsx)
   - Soul archetype timeline with arrows ("The X → The Y")
   - Memory growth bar chart (recharts BarChart, weeklyGrowth data)
5. [x] "Twin has known you for X days" badge in EvolutionSection header

---

## Phase 4: Android App — Architecture Decision Record

**Status:** 📋 DECISION PENDING (user must choose framework)

**Date:** 2026-02-24

### Problem Statement

TwinMe's competitive advantage is deep, passive data collection from the actual device the user uses. A web app can only see what users manually connect. An Android app can:
- Capture **foreground app usage** via `UsageStatsManager` (no special Play Store permissions)
- Capture **notification patterns** via `NotificationListenerService`
- Run **background sync** to continuously enrich the memory stream
- Provide **push notifications** for proactive twin insights

### Decision: React Native vs Flutter

| Criterion | React Native | Flutter |
|-----------|-------------|---------|
| **Code reuse** | ~60-70% shared with existing TypeScript/React codebase | 0% — Dart is a new language |
| **Native API access** | Good via NativeModules / community libs | Excellent — direct platform channel to Java/Kotlin |
| **`UsageStatsManager`** | Available via `react-native-usage-stats` or custom NativeModule | Direct via MethodChannel to Kotlin |
| **`NotificationListenerService`** | Available via `react-native-notification-listener` | Direct via Kotlin plugin |
| **Play Store risk** | Low — standard permissions, no Accessibility Service | Low — same |
| **Performance** | JSI bridge adds overhead for high-frequency data | Native rendering, no bridge |
| **Developer experience** | TypeScript — same toolchain as existing code | Dart — new lang to learn |
| **Hot reload** | Yes (Metro bundler) | Yes (Flutter engine) |
| **UI consistency** | Uses native components → matches OS look | Custom renderer → consistent cross-platform |
| **Community** | Large, mature, Meta-backed | Large, growing, Google-backed |
| **Bundle size** | ~7 MB base | ~5 MB base |
| **Timeline to first build** | 2-3 days (reuse React skills) | 1 week (Dart ramp-up) |

### Data Collection Strategy (Both Frameworks)

**Do NOT use Accessibility Service** — this triggers enhanced Play Store review and requires policy justification. Use:

1. **`UsageStatsManager`** (`PACKAGE_USAGE_STATS` permission)
   - User grants in Android Settings → Digital Wellbeing → App usage
   - Returns foreground app time by hour/day
   - Highly reliable, no Play Store concerns
   - Data: `{ appPackage, totalTimeInForeground, lastTimeUsed }`

2. **`NotificationListenerService`** (user-enabled service)
   - Captures: which apps send notifications + frequency
   - Does NOT read notification content (privacy-safe)
   - Data: `{ packageName, notificationCount, hourOfDay }`

3. **Background sync** every 4-6 hours
   - `WorkManager` (Android) — battery-efficient background jobs
   - POST to `/api/imports` with `platform: 'android_usage'`
   - Same deduplication pipeline as GDPR imports

### Recommended Data Observations Generated

From `UsageStatsManager`:
```
"Used Instagram for 2h 15min on average daily (last 30 days)"
"Peak phone usage: 9-10pm (32% of daily screen time)"
"Top apps: Instagram (23%), YouTube (18%), WhatsApp (15%)"
"Reduced TikTok usage by 40% week-over-week"
```

From `NotificationListenerService`:
```
"High notification frequency from Slack (48/day avg) — work/communication dominant"
"Mostly quiet from 11pm-7am — healthy digital sleep hygiene"
"Discord notifications peak on weekends — community-oriented social pattern"
```

### Backend Integration

Reuse existing GDPR import pipeline:
- `POST /api/imports/gdpr` with `platform: 'android_usage'`
- Add parser in `gdprImportService.js`:
  ```javascript
  case 'android_usage': observations = parseAndroidUsage(fileBuffer); break;
  ```
- No new DB migration needed — `user_data_imports` table already exists

### Recommendation

**React Native** for Phase 4 because:
1. Immediate TypeScript/React code reuse → faster delivery
2. Existing team skill (no Dart learning curve)
3. `UsageStatsManager` and `NotificationListenerService` both have solid React Native libraries
4. Same API client code can be shared with web app
5. Hot reload development experience matches existing workflow

**Flutter** is the better long-term choice if:
- You plan to ship iOS simultaneously (Flutter's iOS support is excellent)
- You need very high performance UI rendering
- You're willing to invest 1-2 weeks in Dart onboarding

### Phase 4 Milestones (React Native path)

1. [ ] Init project: `npx react-native init TwinMeAndroid --template react-native-template-typescript`
2. [ ] Add auth: reuse JWT logic, store token in `react-native-keychain`
3. [ ] Implement `UsageStatsManager` bridge (NativeModule in Kotlin)
4. [ ] Implement `NotificationListenerService` (Background service in Kotlin)
5. [ ] `WorkManager` background job → POST to `/api/imports/gdpr`
6. [ ] Add `android_usage` parser to `gdprImportService.js`
7. [ ] Push notifications via FCM → deliver proactive twin insights
8. [ ] Play Store alpha release

### **Decision Required**

Before starting Phase 4 code:
- [ ] Choose framework: **React Native** or **Flutter**?
- [ ] Confirm data collection scope: UsageStats only, or also Notifications?
- [ ] iOS priority: Android-first or simultaneous?

---

## PHASE 5: COGNITIVE ARCHITECTURE UPGRADE (2026-02-26)

> Research basis: Generative Agents (Park et al. UIST 2023), Generative Agent Simulations of 1,000 People (Park et al. 2024, Simile Paper 2), Creating General User Models from Computer Use (Shaikh et al. UIST 2025, Simile Paper 3), Finetuning LLMs for Human Behavior Prediction (Kolluri et al. EMNLP 2025, Simile Paper 4), Ebbinghaus Forgetting Curve + MemoryBank (Zhong et al. AAAI 2024), A-MEM (Xu et al. 2025)

**Goal:** Move from "data collector + RAG" to a genuine cognitive architecture that models how human memory actually works — differentiated decay by memory type, emotional state awareness, per-platform domain experts, MMR retrieval diversity, proposition confidence, and identity-conditioned reflection framing.

**User decisions (2026-02-26):**
- Schema: Incremental — add confidence, decay_rate, reasoning, grounding_ids to user_memories
- Expert model: Hybrid — per-platform experts for INGESTION, 5 generic experts for SYNTHESIS
- Identity: Infer from existing data (music era, locale, calendar, LinkedIn)

---

### Sprint 1 — Retrieval Quality + Schema Foundation

**Status:** ✅ COMPLETE (2026-02-26)

**Goal:** Make retrieval smarter — MMR diversity, type-differentiated decay, proposition columns.

**Tasks:**
- [x] S1.1 DB migration: add `confidence FLOAT DEFAULT 0.7`, `decay_rate FLOAT DEFAULT 0.5`, `reasoning TEXT`, `grounding_ids UUID[]` to `user_memories` — migration `20260226_phase5_sprint1_memory_schema` applied
- [x] S1.2 Update `search_memory_stream` RPC: replaced flat `0.995^hours` recency with type-aware Ebbinghaus decay: `exp(-0.1053 * hours / stability_hours)` where stability = {conversation:72h, platform_data:168h, fact:720h, reflection:2160h}. Also added `embedding` to RETURNS for MMR.
- [x] S1.3 Add MMR reranking to `retrieveMemories()`: over-fetch 3× candidates, apply `mmrRerank(candidates, limit, λ=0.5)` — directly fixes jazz/reflection over-indexing at query time
- [x] S1.4 Whoop already in memory stream (205 observations). No change needed.
- [x] S1.5 Reflection threshold confirmed at 40 in code. CLAUDE.md corrected (was wrong at 150). Threshold at 40 is intentional for TwinMe's volume.
- [x] BONUS: Fixed `extractConversationFacts` — added semantic dedup (cosine threshold 0.92) + exact-match dedup + JSON object parsing. DB cleanup: 7,093 duplicate facts deleted (8,374→1,281).

**Files:**
- `database/supabase/migrations/20260226_phase5_memory_columns.sql`
- `database/supabase/migrations/20260226_phase5_mmr_retrieval.sql` (or update existing search RPC)
- `api/services/observationIngestion.js` (Whoop ingestion)
- `api/services/reflectionEngine.js` (threshold fix)

**Acceptance criteria:**
- Retrieval returns diverse results (no single topic >40% of returned memories)
- Whoop recovery/sleep appears in memory stream after ingestion
- `confidence`, `decay_rate`, `reasoning`, `grounding_ids` columns exist on user_memories
- Test: run `/api/twin/reflections?diverse=true` — should not be >2 same-expert reflections in top 5

---

### Sprint 2 — Emotional State Awareness

**Status:** ✅ COMPLETE (2026-02-26)

**Goal:** Twin knows how you're feeling RIGHT NOW from behavioral signals, not just history.

**Key insight (cognitive science):** Historical memory without current state produces a twin that knows who you WERE but not who you ARE. The emotional state vector is the highest-ROI unimplemented feature.

**Tasks:**
- [x] S2.1 Build `api/services/emotionalStateService.js`:
  - Inputs: last 24h Spotify (valence, tempo, energy from audio features), Whoop recovery score, calendar density today, message tone from recent conversation memories
  - Outputs: `{ valence: 0-1, arousal: 0-1, cognitiveLoad: 'low'|'normal'|'high', timestamp }`
  - Formula: `valence = 0.3*spotify_valence + 0.4*conversation_sentiment + 0.2*whoop_normalized + 0.1*calendar_positivity`
  - Formula: `arousal = 0.3*(tempo/200) + 0.3*(meetings/10) + 0.4*(1-whoop_recovery)`
  - `cognitiveLoad = 'high'` if meetings > 6 OR whoop_recovery < 50
- [x] S2.2 Inject `[CURRENT STATE]` block into twin chat system prompt — behavioral guidance injected at start of additionalContext
- [x] S2.3 Timestamp-aware context tagging in `addConversationMemory`: late_night (22:00-04:00) + early_morning (04:00-08:00) added to metadata.context
- [x] S2.4 Store emotional state snapshot as 'observation' memory (importance=6, non-blocking) via `buildEmotionalStateMemory()`

**Files:**
- `api/services/emotionalStateService.js` (new, ~150 lines)
- `api/routes/twin-chat.js` (inject [CURRENT STATE] block)
- `api/services/memoryStreamService.js` (timestamp-aware tagging)

**Acceptance criteria:**
- Twin responds differently to "I feel anxious" at 2pm vs 11pm
- Twin acknowledges heavy workload when calendar shows 6+ meetings without user saying anything
- Whoop "recovery 52%" generates twin response that accounts for low energy

---

### Sprint 3 — Per-Platform Domain Experts + Expert Routing

**Status:** ✅ COMPLETE (2026-02-26)

**Goal:** Each platform has a specialist that deeply understands its signal. Chat queries route to the right expert.

**Architecture (Hybrid):**
- **Ingestion layer**: per-platform experts generate 10-20 deep propositions when new platform data arrives
- **Synthesis layer**: existing 5 generic experts run periodically to generate cross-platform insights
- **Chat layer**: expert routing classifies incoming query → pulls that expert's memories preferentially

**Per-Platform Experts (new):**
| Platform | Expert Persona | Example Reflection |
|----------|----------------|-------------------|
| Spotify | Music Psychologist | "Transitions to low-BPM minor-key music late at night signal emotional processing windows" |
| Whoop | Health Behaviorist | "HRV dips correlate with heavy workdays — recovery is reactive to schedule, not just sleep" |
| Calendar | Productivity Analyst | "Consistent 90-min morning focus blocks before 10am — this is the deep work signature" |
| YouTube | Media Sociologist | "Channel subscriptions skew heavily toward autodidactic learning — values knowledge acquisition over entertainment" |
| Discord | Social Analyst | "Active in 3 tech/dev servers but minimal engagement in gaming despite membership — professional identity dominates social online presence" |
| Android UsageStats | Digital Behaviorist | "Peak phone usage 9-10pm, 32% of daily screen time — evening is the primary digital consumption window" |

**Tasks:**
- [x] S3.1 Create `api/services/platformExperts.js` with 6 expert personas + their reflection prompts
- [x] S3.2 Hook platform experts into `observationIngestion.js`: after storing platform observations, run platform-specific expert reflection (capped at 5 reflections per ingestion run)
- [x] S3.3 Store platform expert reflections with `metadata.expertType = 'platform'` and `metadata.platform = 'spotify'` etc.
- [x] S3.4 Add expert routing to `api/routes/twin-chat.js`:
  - Classify incoming query: is it about health/energy, music/mood, schedule/work, content/interests, social, digital habits?
  - Pull that platform expert's recent memories as priority context (before generic retrieval)
  - Routing prompt: "Which domain does this question primarily concern: health, music_mood, schedule, content, social, digital_habits, or general?"
- [x] S3.5 Store `reasoning` + `grounding_ids` on all new reflections (use Sprint 1 columns)

**Files:**
- `api/services/platformExperts.js` (new, ~300 lines)
- `api/services/observationIngestion.js` (hook platform experts post-ingestion)
- `api/routes/twin-chat.js` (expert routing logic)
- `api/services/reflectionEngine.js` (store reasoning + grounding_ids)

**Acceptance criteria:**
- After Spotify sync, Music Psychologist generates ≥2 new reflections with reasoning stored
- Ask twin "how's my energy looking?" → response draws primarily from Whoop/Health Behaviorist memories
- Ask twin "what have I been listening to?" → response draws from Music Psychologist memories
- Generic experts still run cross-platform synthesis (existing 5 experts unchanged)

---

### Sprint 4 — Identity Context Layer

**Status:** ✅ COMPLETE (2026-02-26)

**Goal:** Reflection framing adapts to who the user actually is (life stage, culture, career salience).

**Inference approach (no user friction):**
| Signal | What to Infer |
|--------|--------------|
| Music era preferences (Spotify) | Approximate age ±5 years |
| LinkedIn locale / calendar timezone | Country / culture |
| Calendar meeting density, LinkedIn headline | Career salience score |
| Spotify language distribution | Primary language / cultural orientation |
| Content categories (YouTube, Discord) | Interests → life stage proxy |

**Tasks:**
- [x] S4.1 Build `api/services/identityContextService.js`:
  - `inferIdentityContext(userId)` → `{ lifeStage, culturalOrientation, careerSalience, approximateAge }`
  - Cached 24h (changes slowly)
- [x] S4.2 Inject identity context into expert reflection prompts:
  - "This person appears to be in early adulthood (mid-20s), career-building phase, individualist cultural orientation. Frame insights accordingly."
- [x] S4.3 Condition twin voice on identity: career-focused users → reference work/growth more; exploratory-stage users → more curiosity framing
- [x] S4.4 Store identity context as `fact` memory (importance=8): "Inferred identity context: early adult, high career salience, individualist orientation, ~25 years old."

**Files:**
- `api/services/identityContextService.js` (new, ~200 lines)
- `api/services/reflectionEngine.js` (inject identity context into expert prompts)
- `api/routes/twin-chat.js` (inject identity context into twin voice section)

---

### Sprint 5 — Memory Health + Forgetting

**Status:** ✅ COMPLETE (2026-02-26)

**Goal:** Memory quality improves over time rather than degrading from noise accumulation.

**Tasks:**
- [x] S5.1 Proposition revision: at write time, check cosine similarity of new memory against recent same-type memories. If >0.90 similar → update existing memory's confidence + reasoning instead of creating duplicate.
- [x] S5.2 Post-reflection source decay: after reflection engine runs, decay importance of contributing source memories by 40% (they've been abstracted upward). Prevents source observations from competing with their own reflection.
- [x] S5.3 Multi-tier forgetting cron (weekly, Sunday 3am):
  - Tier 1 (aggressive): conversation memories >30 days + importance ≤3 → archive
  - Tier 2 (moderate): platform_data memories >14 days + importance ≤4 + retrieval_count=0 → archive
  - Tier 3 (gentle): fact memories >90 days + importance ≤5 → decay importance by 20%
  - Never touch: importance ≥8, retrieval_count ≥3, reflections
- [x] S5.4 Add `retrieval_count INTEGER DEFAULT 0` to user_memories. Increment on access via `touch_memories` RPC.

**Files:**
- `api/services/memoryStreamService.js` (proposition revision, post-reflection decay, retrieval_count increment)
- `api/routes/cron-memory-archive.js` (multi-tier forgetting pass)
- `database/supabase/migrations/20260226_phase5_retrieval_count.sql`
- `vercel.json` (weekly forgetting cron)

---

### Research References

| Paper | Key Contribution | Applied In |
|-------|-----------------|-----------|
| Generative Agents (Park 2023) | Memory stream + 3-factor retrieval + reflection tree | Foundation (already implemented) |
| 1,000 People (Park 2024) | Per-platform domain experts + expert routing + 4-step CoT | Sprint 3 |
| GUM / Computer Use (Shaikh 2025) | Proposition confidence+decay+reasoning + MMR retrieval + revision | Sprint 1, 5 |
| MemoryBank (Zhong 2024) | SM-2 stability-based decay formula | Sprint 1 |
| Behavioral Finetuning (Kolluri 2025) | 10% saturation point → twin readiness score | Future (Phase 6) |
| A-MEM (Xu 2025) | Zettelkasten memory links | Future (Phase 6) |
| Ebbinghaus / SM-2 | R = exp(-k*t/S), type-differentiated stability | Sprint 1 |
| Cognitive Science (emotional memory) | Amygdala salience, emotional encoding boost | Sprint 2 |

---

### Key Formulas

```javascript
// Type-differentiated decay (Sprint 1)
const STABILITY_DAYS = { conversation:3, platform_data:7, fact:30, reflection:90 };
retention(m, t_days) = exp(-0.1053 * t_days / STABILITY_DAYS[m.memory_type])

// MMR retrieval (Sprint 1)
mmr_score(d, S) = 0.5 * relevance(d) - 0.5 * max_{j in S} cosine(d, j)

// Emotional state (Sprint 2)
valence = 0.3*spotify_valence + 0.4*conversation_sentiment + 0.2*whoop_normalized + 0.1*calendar_positivity
arousal = 0.3*(tempo/200) + 0.3*(meetings/10) + 0.4*(1 - whoop_recovery)

// Post-reflection source decay (Sprint 5)
new_importance = max(1, round(original_importance * 0.6))
```
