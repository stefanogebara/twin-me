# TwinMe Phase Status

## How to use this skill
When asked "what's next", "phase status", or "what should we work on", read this file and display the current roadmap status clearly.

---

## PHASES COMPLETE

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

### Phase B — New Data Sources ✅ DONE (2026-02-27)
GitHub + WhatsApp + Browser Extension were already 95% implemented. The real gap was web dwell-time not being re-processed in the background ingestion loop.
- `fetchRecentWebEvents()` added to `observationIngestion.js` — queries `user_platform_data` for 25h of extension events
- Called in per-user loop after platform sweep (non-fatal try/catch)
- Build: clean ✅

---

## WHAT'S NEXT — Choose one:

### Option A — Beta Readiness (Recommended)
Get 5-10 real users on the product.
- Onboarding funnel polish (reduce friction in platform connect flow)
- Email digest: weekly "what your twin noticed this week"
- Share Soul Signature card (shareable image/link)
- Stripe paywall ($9/mo) + billing portal

### Option C — Twin Quality Validation
Measure how good the twin actually is.
- Manual eval rubric: 10 questions about the user → score twin accuracy 1-5
- A/B: current vs. no-expert-routing vs. no-identity-context
- Memory quality dashboard: distribution by type, avg importance, staleness

### Option D — Mobile Polish
Bring mobile to parity with web.
- Push notifications for proactive insights
- Android home screen widget (today's twin insight)
- Background sync optimization (WorkManager intervals)

---

## Stats (as of 2026-02-27)
- Memories: ~16,000+ rows
- Platform integrations: 5 (Spotify, YouTube, Calendar, Discord, LinkedIn)
- Expert personas: 6 (per-platform domain specialists)
- Cron jobs: 8 (token-refresh, polling, pattern-learning, ingest, claude-sync ×2, memory-archive, memory-forgetting)
- Integration tests: 68 passing
- Target users: 5-10 beta
