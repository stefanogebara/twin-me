# TwinMe Phase Status

## How to use this skill
When asked "what's next", "phase status", or "what should we work on", read this file and display the current roadmap status clearly.

---

## CURRENT STATUS: All phases complete through Phase 6. Ready to invite beta users.

---

## PHASES COMPLETE (summary)

### Phase 2 — Voice + Speed + Simplicity ✅ DONE (2026-02-26)
1. Twin voice rewrite — friend/curious tone, banned clinical terms
2. Vercel SSE streaming fix — ≤2s first token
3. Reflection dedup — cosine 0.85 threshold
4. Nav — 3 tabs only (Home / Chat / Me)

### Phase 3 — Beta Foundation ✅ DONE (2026-02-26)
1. Android permission onboarding screen
2. Memory archive: `user_memories_archive` + daily 3am cron
3. 18 integration tests (68 assertions, all pass)

### Phase 5 — Cognitive Architecture Upgrade ✅ DONE (2026-02-27)

**Sprint 1 — Memory Quality**
- Ebbinghaus decay: type-differentiated stability (conversation=72h, platform_data=168h, fact=720h, reflection=2160h)
- MMR reranking: over-fetch 3×, λ=0.5, removes redundant hits
- Fact dedup: cosine 0.85 gate before any fact write
- Proposition schema: `confidence` + `reasoning` + `grounding_ids` columns on user_memories

**Sprint 2 — Emotional State**
- `api/services/emotionalStateService.js` — real-time emotional fingerprint from last 4h memories
- Injects `[EMOTIONAL CONTEXT]` block into twin chat before system prompt
- Signal sources: Spotify valence/energy, Whoop HRV/recovery, calendar load

**Sprint 3 — Per-Platform Domain Experts + Expert Routing**
- `api/services/platformExperts.js` — 6 expert personas (Music Psychologist, Health Behaviorist, Productivity Analyst, Media Sociologist, Social Analyst, Digital Behaviorist)
- Experts fire automatically after platform observation ingestion (non-blocking)
- 2-stage query routing: keyword match → Mistral Small LLM fallback
- Expert memories injected into twin chat with domain label

**Sprint 4 — Identity Context Layer**
- `api/services/identityContextService.js` — infers life stage, cultural orientation, career salience, approximate age
- 24h cache (in-memory + DB fact). Feeds `twinVoiceHint` into chat + `identityPreamble` into reflection experts
- No new API calls on cache hit

**Sprint 5 — Memory Health + Forgetting**
- Proposition revision: similarity > 0.90 → UPDATE existing confidence (+0.05) instead of duplicate insert
- Post-reflection source decay: evidence memories decay 40% after reflection (floor=1, protected if importance≥8 or retrieval_count≥3)
- Weekly 3-tier forgetting cron (Sunday 3am): conversation >30d+score≤3 → archive; platform_data >14d+score≤4+never_retrieved → archive; fact >90d+score≤5 → decay 20%
- `retrieval_count` column on user_memories; incremented by touch_memories RPC

---

### Cron Reliability ✅ FIXED (2026-02-27)
- vercel.json: removed invalid `supportsResponseStreaming` (was blocking ALL deployments for 8+ hours)
- server.js: cron routes get 115s Express timeout (was 30s, killing cron mid-run)
- cron-platform-polling.js: skip NANGO_MANAGED platforms (handled by obs-ingestion separately)
- Result: Spotify, Discord, Calendar all polling successfully again

### Phase B — GitHub + WhatsApp + Extension + Audit Closure ✅ DONE (2026-02-28)

#### GitHub PAT Ingestion ✅
- api/services/observationIngestion.js: fetchGitHubObservations (OAuth + PAT dual-path)
- api/routes/github-connect.js: PAT storage in user_github_config table
- Fixed: githubExtraction.js null supabase crash (5 null references → getSupabaseClient())
- Fixed: hardcoded USER placeholder in events URL

#### WhatsApp Export Parser ✅
- api/routes/whatsapp-import.js: full parser (Android + iOS formats), contact/pattern extraction
- Fixed: text/plain content-type middleware, global express.text() body parser
- Fixed: redundant route-level express.text() removed
- Stores: top contacts, message frequency, active hours, message style as platform_data memories

#### Browser Extension Dwell-Time ✅
- browser-extension/background.js: tab visit timing → /api/extension/batch
- api/routes/extension-data.js: dual-write (user_platform_data + ingestWebObservations)
- Fixed: event.data_type field name (was eventType), double-nested raw_data, tab_visit mapping
- Fixed: capture route same field confusion
- Verified: github.com, news.ycombinator.com, search queries → natural-language memories

#### Backend Audit Closure ✅ (all 20 findings resolved)
- F8: bulk_decay_memories RPC (single SQL call, no N+1 loop)
- F16: GRACE_DAYS=1 streak resilience (one miss doesn't reset 30-day streak)
- F20: bigram Jaccard check before embedding (avoids ~30% of embedding API calls)

---

### Option A — Beta Readiness ✅ DONE (2026-02-28)
- user_subscriptions table (free/pro/max) + Stripe billing routes
- PaywallModal after first free twin exchange
- /discover pre-signup landing page (quickEnrich)
- Weekly email digest via Resend (twinme.me domain, all DNS records added)
- Chat backend gate (free users: 1 assistant reply, then 403)

### Option B — Onboarding Funnel Polish ✅ DONE (2026-02-28)
- SoulRichnessBar wired into InstantTwinOnboarding step 1 (activeConnections)
- Email hint banner in CustomAuth for /discover → /auth?email= flow
- Web dwell-time already in observationIngestion.js (was already implemented)

### Option C — Twin Quality Validation ✅ DONE (2026-02-28)
- EvalDashboard page already existed with all 4 sections
- Added Eval nav link (FlaskConical) to CollapsibleSidebar More section
- /eval route was already wired in App.tsx

### Option D — Mobile Push Notifications ✅ DONE (2026-02-28)
- registerForPushNotifications wired in mobile/App.tsx on login (token change)
- sendPushToUser for high-urgency insights already in proactiveInsights.js

### Pre-Invite Memory Quality Fixes ✅ DONE (2026-02-28)
- Purged 1,178 exact-duplicate fact memories (2,654 → 1,476)
- Fixed decay_rate per type (conversation=3, platform_data=7, fact=30, reflection=90)
- Twin summary: 15→25 memories per domain, soul_signature_profile fallback, synthesis LLM pass
- Insight dedup: isInsightDuplicate() 7-day 80-char prefix check before insert
- Unique index on (user_id, md5(content)) for fact type — prevents future dupes
- touch_memories RPC fixed to increment retrieval_count

### Phase 4 APK Rebuild ✅ DONE (2026-02-28)
- Fresh APK built (104MB, Feb 28) with Me tab redesign
- WiFi ADB offline during sleep — install when device reconnected

### Phase 6 — Soul Architecture ✅ DONE (2026-02-28)

**6A: Twin Readiness Score (Soul Saturation)**
- getTwinReadinessScore(): 3-factor weighted score in memoryStreamService.js
- TwinReadinessScore.tsx: compact/full modes, animated bar
- Wired into Dashboard (compact) + MemoryHealth page (full)

**6B: A-MEM Zettelkasten Memory Links**
- memory_links table + find_similar_memories_for_linking RPC (cosine 0.75)
- memoryLinksService.js: auto-link on reflection write (fire-and-forget)
- GET /api/memory/:memoryId/links

**6C: Syd-Inspired Daily Check-In + Correlations**
- 50-state mood picker (DailyCheckin.tsx), POST /api/checkin
- daily_checkins table, stored as platform_data memory
- Dashboard shows check-in card if not done today
- Cross-stream correlations: generateCorrelationInsights() runs weekly

**6D: "Who You Are" Identity Explorer**
- GET /api/twin/identity → identity context + soul signature + expert reflections
- IdentityPage.tsx: expert accordion (5 domains), archetype badges, music signature
- /identity route, Fingerprint icon in sidebar More section

**6E: Behavioral Feedback Loop**
- proactive_insights.engaged + engaged_at columns
- POST /api/insights/proactive/:id/engage — fires on "Discuss" tap
- ProactiveInsightsPanel: green dot + "seen" badge on engaged insights

### Phase C — CX Audit + Interview Surface ✅ DONE (2026-03-01)

- Interview flow surfaced: Dashboard CTA card + sidebar "Tell Your Story" link
- Twin chat context renamed to `[YOUR STORY]` block
- Gmail observation generator smoke-tested (google_gmail → user_memories confirmed)
- Interview page UX: fixed double-question bug (initRan ref), dark container contrast, wrong redirects, broken /api/user/profile 404
- **Billing root-cause fix**: `req.userId` was `undefined` in billing.js (should be `req.user?.id`) — subscription check always returned `free`, paywall never triggered correctly. Now fixed.
- YouTube insight text: "50 subscriptions across 0 interest areas" → "50 subscriptions"

---

## WHAT'S NEXT — Phase 7

**Remaining Phase 6 (not done):**
- Play Store alpha release (need to publish signed APK to Google Play)
- iOS app (React Native reuse)

**Phase 7 candidates:**
1. **Invite first beta users** — system is ready, invite 2-5 people
2. **Play Store alpha** — upload APK to Play Store internal testing track
3. **Behavioral finetuning** (Simile Paper 4) — finetune on user patterns
4. **Camera-based stress detection** — Syd-style PPG for users without Whoop
5. **Multi-platform expansion** — Apple Music, Reddit, Oura Ring

---

## Stats (as of 2026-02-28)
- Memories: ~11,000 rows (fact=1,476, reflection=5,034, conversation=2,436, platform_data=2,029)
- Platform integrations: 5 (Spotify, YouTube, Calendar, Discord, LinkedIn)
- Expert personas: 11 (5 generic + 6 per-platform domain)
- Cron jobs: 9 active
- Integration tests: 68 passing
- Subscription tiers: free (1 message) / pro ($19/mo) / max ($50/mo)
- New Phase 6 tables: memory_links, daily_checkins, proactive_insights.engaged
- APK: 104MB fresh build, ready to install
- Target users: 5-10 beta
