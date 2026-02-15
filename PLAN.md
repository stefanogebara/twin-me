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
