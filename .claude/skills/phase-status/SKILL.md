# TwinMe Phase Status

## How to use this skill
When asked "what's next", "phase status", or "what should we work on", read this file and display the current roadmap status clearly.

---

## COMPLETED PHASES

### Phase 2 — Voice + Speed + Simplicity ✅ (2026-02-26)
- Twin voice rewrite (friend tone, banned clinical terms, humor section)
- Vercel SSE streaming fix
- Reflection dedup (cosine 0.85)
- Web nav: 3 tabs (Home/Chat/Me)

### Phase 3 — Android + Archive + Tests ✅ (2026-02-26)
- Android permission onboarding
- Memory archive: `user_memories_archive` + daily 3am cron
- 68 integration tests passing

### Phase 4 — Mobile Polish ✅ (2026-02-26)
- Android debug build + JWT 30d fix
- Me tab redesigned

### Phase 5 — Cognitive Architecture ✅ (2026-02-27)
- MMR retrieval + Ebbinghaus decay
- Emotional state → [CURRENT STATE] block in chat
- 5 expert personas in reflectionEngine.js
- Identity context service
- Post-reflection source decay + weekly forgetting cron

### Phase 6 — Soul Dashboard ✅ (2026-02-28)
- Twin Readiness Score
- A-MEM memory_links
- 50-mood daily check-in
- /identity page ("Who You Are")
- Insight engagement tracking

### Phase B — Data Ingestion ✅ (2026-02-28)
- Apple Health + WhatsApp parsers
- GitHub + Reddit observation generators
- Whoop GDPR import wiring

### Phase C — Onboarding Interview + GUM Memory ✅ (2026-03-01)
- New users → /interview on signup
- InterviewPage → /get-started on complete/skip
- TalkToTwin: guard for unfinished interview
- GUM columns: `confidence`, `reasoning`, `grounding_ids` on `user_memories`
- `bulk_decay_memories` RPC

### E2E Audit Fixes ✅ (2026-03-02)
- Jazz contamination cleared
- EXPERT_LABELS completed
- Recharts blank charts fixed
- toSecondPerson verb conjugation fix
- Identity: first accordion auto-opens
- Discoveries cap 4→5
- "1 memories" → "1 memory"
- Whoop + Gmail in Settings
- Today's Insights: retry:0 (no more infinite spinner)

### Soul Signature Voting Layer ✅ (2026-03-08)
- OCEAN Big Five extraction, stylometric fingerprint
- Best-of-N personality reranking (feature-flagged)
- Personality drift detection (7d vs 90d)

### Synaptic Maturation ✅ (2026-03-09)
- STDP exponential decay on memory links
- Graph-based retrieval traversal (1-hop)
- Memory saliency replay (daily 4am cron)

### Dashboard V2 ✅ (2026-03-11)
- Typography-driven design, unified /api/dashboard/context
- 90-day memory heatmap, proactive insights feed

### Phase 7 — Behavioral Finetuning ✅ (2026-03-12)
- Finetuned Llama 3.1 8B LoRA as personality oracle
- 212 clean training examples, oracle latency ~1.8s
- Feature-flagged (personality_oracle, opt-in)

### Smart Model Routing ✅ (2026-03-18)
- LIGHT=Gemini Flash / STANDARD=DeepSeek / DEEP=Sonnet
- 75% cost savings, $0.41/day average

### DPO Training ✅ (2026-03-19)
- 208 preference pairs, personality-aligned responses
- Oracle SFT fallback, per-user scaling

### Beta Invite System ✅ (2026-03-21)
- Invite codes, waitlist, feedback widget, email invites
- BETA_GATE_ENABLED=true, admin role column

### Phase 8 — Agentic Foundation ✅ (2026-03-21)
- Core Memory Blocks (4 pinned identity blocks)
- Session Reflection via Inngest durable workflow
- Context Condensation (12K token threshold)
- Task Intent Routing (reminders, prospective memories)
- 5 seeded skills: morning briefing, evening recap, music mood, pattern alert, social checkin
- Telegram messaging, Smart Email Draft, Evening Recap
- Autonomy Spectrum (5 levels per skill)
- Tool Registry (platform-agnostic)

### 10 Platform Integrations ✅ (2026-03-21)
- Spotify, Calendar, YouTube, Gmail, Discord, GitHub, Reddit, LinkedIn, Whoop, Twitch

### Enrichment Expansion ✅ (2026-03-21)
- 9 providers: Gravatar, GitHub, Reddit, HN, Hunter, Spotify, Twitter/Brave + Brave Search

### Session 2026-03-22 Fixes
- Chrome extension v3.3.0 submitted to CWS (pending review)
- Auth + sidebar monochromatic, orange accent elsewhere
- Night sky background (#13121a) + dynamic sun gradient
- Insight spam killed (3-layer dedup, 400+ duplicates purged)
- Cost dashboard fixed (requireProfessor bug)
- Twin research: 0.810 -> 0.837 (+3.3%)
- 9 plugins + 2 custom skills installed

---

## CURRENT PHASE: Soul Signature Redesign + Beta Launch

1. **Soul Signature page redesign** — archetype system, OCEAN radar, trait badges, expert 1-liners, first-time reveal, weekly drift (IN PROGRESS)
2. **Invite beta users** — system ready, codes created, no blockers
3. **Memory Explorer** — demote to Settings > Advanced
4. **Mobile APK** — push to Play Store internal track
5. **Monitor** — cost dashboard live at /admin/llm-costs

---

## Stats (as of 2026-03-22)
- Memories: ~6,765
- Active platforms: 10 (Spotify, Calendar, YouTube, Gmail, Discord, GitHub, Reddit, LinkedIn, Whoop, Twitch)
- LLM cost: $0.41/day ($12.35/mo projected)
- Beta codes: stefano01, beta0001-0009, schapchap, cmgebara1, tefinho01

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

