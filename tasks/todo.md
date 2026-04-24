# TwinMe — Active Backlog

## Active Phase: WhatsApp Pre-Purchase Stress-Check Bot (2026-04-24)

First shippable unit of the Financial-Emotional Twin pivot (committed 2026-04-20).
Plan locked 2026-04-24.

### Why this, why now

Renan's frame: find the "credit card" inside the credit card. Bank integration +
transaction tagging + nudges + weekly report is a 4-week MVP. Too big for week 1.

The pre-purchase bot is 1/20th the scope: WhatsApp-only, zero banking, reuses
existing Spotify/Whoop/Calendar integrations. Brazilian-native channel (same
Natura pattern Renan preached). Gets the mood x money reflection loop into a
real user's hands in 7 days.

**One-liner**: Before you tap buy, ask your twin.
**Voice**: "your twin" (named character, not Stefano-the-friend). Creates distance.

### The loop (2 messages)

1. User sends twin: "vou comprar o iFood, R$80" (or "thinking of buying X for $Y")
2. Twin replies:
   > Recovery 42% (estresse alto). Ultimas 2h no Spotify: Billie Eilish, baixa valencia. Calendario: 3 reunioes atras, 2 pela frente.
   >
   > *O que rolou essa manha que voce ta tentando compensar com esse pedido?*

No advice. No judgment. Mirror + one question. PT-BR default, English if detected.

### Day 0 findings (2026-04-24)

Only one user in the entire TwinMe database has Whoop + Spotify + Calendar all
connected: you. Antonio Piza linked WhatsApp on Apr 2 but never reconnected
platforms. Rafael Zema never connected Whoop at all.

| User | Whoop+Spotify+Cal | WA linked | Phone |
|---|---|---|---|
| Stefano (167c27b5) | 3/3 | yes | +5511999002121 |
| Antonio Piza (4ce189bb) | 0/3 disconnected | yes | +5511996112005 |
| Rafael Zema (9147425e) | 0/3, no Whoop ever | no | — |

Even your data is thin: Whoop last obs 2026-04-12 (12d stale), 0 Spotify plays
last 24h, 0 calendar events next 3h. Reconnect/re-sync before Day 1 — Whoop
token may have rotted.

### Revised strategy: dogfood then recruit with proof

#### Days 1-3 — build for Stefano only
- [ ] 1-1: Reconnect Whoop + confirm Spotify sync is live (probe /api/connectors/status)
- [ ] 1-2: `buildPurchaseContext(userId)` — parallel fetch Whoop HRV + Spotify 2h valence + Calendar density. Query DB tables directly, don't re-hit Whoop/Spotify APIs each call.
  - Tables: `user_memories` (whoop platform_data), `spotify_listening_data`, `calendar_events`
- [ ] 1-3: Curl-test the context builder locally, see real numbers
- [ ] 2-1: Add `purchase_check` intent to `classifyIntent()` in `api/routes/whatsapp-twinme-webhook.js:47`. Regex: `/vou compra|pensando em|about to buy|R\$\s*\d+/i`
- [ ] 2-2: `generateReflection(ctx, userMsg)` — DeepSeek call (TIER_ANALYSIS). Prompt: mirror 1 sentence, ask 1 question, PT-BR default. Max 3 sentences total. No advice. No judgment.
- [ ] 2-3: Handler wiring — intent match → buildPurchaseContext → generateReflection → sendWhatsAppMessage
- [ ] 3-1: Text the bot 20 times over the day with real pre-purchase moments
- [ ] 3-2: Binary check — does the reflection feel like a friend, not ChatGPT? Tune prompt until yes.

#### Day 4 — recruit with proof, not promise
- [ ] 4-1: Screenshot a real reflection from Day 3. The one that felt most true.
- [ ] 4-2: Text Antonio + Rafael: "built this, needs Whoop+Spotify+Calendar reconnected (3 min). Here's what it looks like: [screenshot]"
- [ ] 4-3: Do NOT chase if they don't respond within 24h. That's signal.

#### Days 5-7 — widen or kill
- [ ] 5: If they reconnect, help them send their first message. Log it.
- [ ] 6: Public post — IG story / tweet / LinkedIn with a real example. Not a product pitch. Just "this happened."
- [ ] 7: Success check.

### Success metric (binary, no wiggle room)

> Did at least **one non-Stefano user send a pre-purchase message unprompted**
> in the 7-day window, and did they report the reflection changed their
> decision even once?

- **Yes** → wedge is real. Commit to bank integration next sprint (Pluggy BR).
- **No** → kill this path. The pain Renan scored 10/10 isn't actually 10/10
  for your network. Rethink the credit card.

### What to explicitly SKIP in V1

- Screenshot OCR (v1.1 if V1 works)
- Proactive push ("stress pattern detected") — needs consent flow, skip
- Bank integration — month 2, only if Day 7 is green
- Savings tracker with R$ math — month 2
- Weekly Financial-Emotional Report — month 2
- Voice note replies (tempting, Brazilian audio culture — v1.1)
- Multi-tenant polish, onboarding — you're the only user in week 1

### Files to touch

| File | Change | Lines |
|---|---|---|
| `api/services/purchaseContextBuilder.js` (new) | Parallel DB fetch of Whoop+Spotify+Calendar state | ~80 |
| `api/services/purchaseReflection.js` (new) | DeepSeek prompt + generator | ~60 |
| `api/routes/whatsapp-twinme-webhook.js` | Add `purchase_check` case in classifyIntent, handler | ~40 |
| `tasks/purchase-reflections-prompt.md` (new) | Living prompt doc, iterated daily | ~30 |

Total: ~210 lines of real code + ~30 lines of prompt.

### Existing infra to reuse (do not rebuild)

- `api/routes/whatsapp-twinme-webhook.js` — inbound webhook with intent classifier
- `api/services/whatsappService.js` — `sendWhatsAppMessage(phone, text)`
- `api/services/observationFetchers/{whoop,spotify,calendar}.js` — fresh API pulls (probably not needed for V1 — DB is fresh enough)
- `api/services/llmGateway.js` — DeepSeek call via TIER_ANALYSIS
- `messaging_channels` table — phone-to-user_id mapping (already has Stefano + Antonio)

### Open questions Day 1 must answer

1. ~~Is Whoop token still valid or did it rot?~~ N/A — biology dropped from V1, Stefano lost his Whoop (2026-04-24).
2. Does the whatsapp-twinme-webhook actually receive inbound messages right now? Send yourself a message and check logs.
3. What's the current WA number the twin replies from? Per memory +1 762-994-3997 but dated 2026-03-29. Verify.

### Data-sync bugs surfaced + fixed during Day 2 (commit 6aad5fb1, 2026-04-24)

1. ~~**Spotify extractor `.insert()` on soul_data**~~ FIXED. Same bug in
   discordExtraction.js + githubExtraction.js — all three now use `.upsert()`
   with onConflict='user_id,platform,data_type' matching the actual unique
   constraint. Every resync was silently no-oping before.
2. ~~**Google Calendar extractor returning 0 items**~~ FIXED. The orchestrator
   case at extractionOrchestrator.js:167 was literally a stub
   `{ success: true, itemsExtracted: 0, message: 'Calendar feature extraction removed' }`.
   Wired to call fetchCalendarObservations + storeObservationsToMemory, and
   extended the fetcher to dual-pull (today for NL observations, 7-day forward
   for raw events persisted to user_platform_data as data_type='events').
   Verified: fresh row with 8 upcoming events landed on first probe.

Impact beyond Stefano: ANY user who connected Spotify/Discord/GitHub once
and then tried to re-extract hit a silent no-op on soul_data writes. ANY
user with google_calendar connected got zero events synced since the stub
was added. This fix unblocks all of them.

### Anti-goals (do not let yourself drift)

- Do NOT build a UI. Zero pages, zero dashboard changes.
- Do NOT rebuild platform integrations. Query existing tables.
- Do NOT add a feature flag. Hardcode your user_id for week 1.
- Do NOT optimize the prompt pre-emptively. Ship bad, iterate with real messages.
- Do NOT recruit users without proof. Day 3 or bust.

### Ship criteria for Day 2 (the "it works" moment)

Text the bot `"vou comprar um iFood de R$60"` from your phone and get back
a reflection that includes at least one real number from your biology/music/
calendar state. Any reflection. Doesn't have to be perfect. Just real data,
real LLM, real WhatsApp round-trip.

---

## Audit (2026-04-24, after 16-commit shipping session)

3 parallel sub-agents (production / code review / test coverage). Bottom line:
**bot does not work in production today** — signature verification consumes
re-serialized body instead of `req.rawBody`, so every signed Meta webhook
returns 403. One-line fix.

### CRITICAL — block ship

- [x] **C1 — Signature verify uses re-serialized body, not `req.rawBody`.** SHIPPED 046a2227 (2026-04-24).
  `whatsapp-twinme-webhook.js:190` reads `JSON.stringify(req.body)` for HMAC
  but raw-body capture in `server.js:329` only fires for `/api/whatsapp/webhook`
  (Kapso path), not `/api/whatsapp-twin/webhook`. Every Meta POST → 403.
  Fix: extend the verify allowlist + use `req.rawBody`. (~5min)
- [x] **C2 — Prompt injection via raw `userMessage`.** SHIPPED 046a2227.
  `purchaseReflection.js:136` interpolates user text without escape. Attacker
  sends `"R$100" Ignore previous instructions...`. Wrap in XML tags or
  sanitize. (~15min)
- [x] **C3 — PostgREST filter injection via `msg.from`.** SHIPPED 046a2227.
  `whatsapp-twinme-webhook.js:215-219` interpolates phone into `.or(...)`.
  A crafted value alters the OR clause. Use parameterized syntax. (~10min)
- [ ] **C4 — No webhook dedup on `wamid`.** Meta retries → 2 reflections, 2 LLM
  calls, 2 memory rows. Add Redis `SETNX EX 300` on `msg.id`. (~30min)
- [x] **C5 — No per-user rate limit.** SHIPPED 046a2227 — `acquirePurchaseRateSlot` with Redis INCR + in-memory fallback. Cap via `PURCHASE_RATE_LIMIT_PER_HOUR` env (default 10). Existing `apiLimiter` is per-IP (Meta
  IP pool defeats it). Cap at 10 purchase intents/hour/user via Redis
  counter. (~30min)
- [x] **C6 — No feature flag / kill switch.** SHIPPED 046a2227. `PURCHASE_BOT_ENABLED=true` env required to fire reflections; defaults OFF. Add
  `if (process.env.PURCHASE_BOT_ENABLED !== 'true') return;` at intent
  branch entry. (~5min)
- [ ] **C7 — No user opt-out.** Add `purchase_bot_enabled boolean` to
  `messaging_channels` (default true) + check before classify. (~45min)
- [ ] **C8 — WhatsApp number unverified.** Memory `+1 762-994-3997` is 26 days
  stale. Manual test before shipping to non-Stefano users. (~5min)

**Critical total: ~2.5 hours of focused work.**

### HIGH — this week

- [ ] **H1 — `sensitiveContent: true` silently downgrades to Mistral Small.**
  `llmGateway.js:407` swaps tier without telling caller. Either pass
  `TIER_EXTRACTION` directly or remove the flag. Note: "privacy routing to
  a different model" is not actually privacy-preserving — data still leaves
  via OpenRouter.
- [ ] **H2 — No cross-user leak regression test.** The `skipCache: true` fix
  has no test. A future "let's cut costs" PR removes it and the bug returns.
- [ ] **H3 — `getValidAccessToken` called 3x sequentially in calendar fetcher.**
  Triples cold-start latency. Hoist to top + pass down.
  (`observationFetchers/calendar.js:20,258,370`)
- [ ] **H4 — Zero PostHog telemetry on purchase reflections.** Can't answer
  Day-7 success metric. Add `posthog.capture('purchase_reflection_generated')`
  with `{userId, lang, hasMusic, hasCalendar, elapsed_ms, cost}`. No user text.
- [ ] **H5 — `addConversationMemory` swallows errors silently** —
  `.catch(() => {})` loses entire conversation turn. Log to warn at minimum.
  (`whatsapp-twinme-webhook.js:259`)
- [ ] **H6 — Calendar `source_url: calendar:events:${today}` overwrites
  intraday changes.** Cancellations vanish. Document or include hour in key.
  (`observationFetchers/calendar.js:108-121`)
- [x] **H7 — No `userMessage` length cap.** SHIPPED 046a2227 — drops messages >2000 chars at the webhook + `purchaseReflection` clamps to 1000.
- [ ] **H8 — Zero unit tests for 4 modified extractors.** spotifyExtraction,
  discordExtraction, githubExtraction, observationFetchers/calendar — all
  touched in 6aad5fb1 with no tests. Silent regression risk.
- [x] **H9 — Silent failure escalates to Claude Sonnet (~50x cost).** SHIPPED 046a2227 — fallback is now a fixed string, not a Sonnet escalation.
- [ ] **H10 — No `purchase_reflections` audit table.** Can't see lang
  breakdown, false-positive rate, delivery success.

### MEDIUM — next sprint

- [ ] **M1 — `PURCHASE_INTENT_PATTERNS[4]` (`/\bR\$\s*\d/`) too broad.**
  False positives: "meu aluguel é R$ 2000", "comprei R$50 ontem", "salário
  R$5000". Add LLM gate or require present/future verb.
- [ ] **M2 — Real PII committed in test file.** `STEFANO_USER_ID` +
  `STEFANO_PHONE` should come from env. (`tests/purchase-bot-e2e.spec.ts:33-35`)
- [ ] **M3 — `insertError` named for upsert calls** (Discord:97, GitHub:125).
- [ ] **M4 — `local_iso` always UTC despite the name.** (`purchaseContextBuilder.js:56`)
- [ ] **M5 — Dead `biology_fresh` log field** post-pivot. (`purchaseReflection.js:160`)
- [ ] **M6 — `case 'calendar':` dead alias** — codebase uses `'google_calendar'`.
  (`extractionOrchestrator.js:167`)
- [ ] **M7 — Default timezone hardcoded `'America/Sao_Paulo'`.** Silently wrong
  for non-BR users. Log warning on fallback. (`purchaseContextBuilder.js:217`)
- [ ] **M8 — `markMessageAsRead` ignores Kapso entirely.** (`whatsappService.js:151-165`)

### LOW

- [ ] **L1 — 4 `console.log` calls in committed test file.**
- [ ] **L2 — `githubExtraction.js` API calls have no timeout** — slow GitHub
  hangs entire extraction. (`githubExtraction.js:56-68`)

### Test coverage gaps (P0/P1)

- [ ] **T1 (P0)** — Cross-user reflection leak test (User A vs User B)
- [ ] **T2 (P0)** — Webhook idempotency on duplicate `wamid`
- [ ] **T3 (P0)** — Prompt injection neutralization
- [ ] **T4 (P0)** — `purchaseContextBuilder` graceful degrade (no Spotify/Calendar)
- [ ] **T5 (P0)** — Rapid-fire 5 messages in 60s (rate-limit verification)
- [ ] **T6 (P1)** — LLM timeout returns graceful fallback (mocked)
- [ ] **T7 (P1)** — Extractor regression suite (Spotify/Discord/GitHub/Calendar fixtures)
- [ ] **T8 (P1)** — Non-linked phone rejected cleanly
- [ ] **T9 (P2)** — Timezone DST + midnight boundary on `computeMoment()`
- [ ] **T10 (P2)** — Edge inputs (empty, emoji, 4KB, ES/JP languages)

### Ship-blocker short list (~70 minutes to "minimally safe")

1. C1 signature fix — 5min
2. C8 verify WA number works — 5min
3. C2 sanitize userMessage interpolation — 15min
4. C3 parameterize phone filter — 10min
5. C5 add per-user rate limit — 30min
6. C6 add kill-switch env var — 5min

---

## Previous Phase: Cold Start + Interview Backlog (2026-03-16)

Archived — all items complete.

## Cold Start Instant Wow — COMPLETE
- [x] 1. Add `discoveryScan()` to enrichmentService.ts (public, unauthenticated)
- [x] 2. Rewrite DiscoverLanding.tsx hero (email input → SoulOrb reveal → CTA)
- [x] 3. Update Index.tsx hero CTA → navigate('/discover')
- [x] 4. Cache discovery data in sessionStorage for post-auth pickup
- [x] 5. Verified: incognito → email → SoulOrb animates → data reveals → CTA works

## P0 — Before Beta
- [x] Demo mode: explicit "Try Demo" button on /discover and / pages (enterDemoMode → /dashboard)
- [x] Stack trace leak: already handled — `errors.js` strips stack in prod (`isDev && { stack }`)
- [x] Google OAuth callback: verified — all prod redirect URIs already configured in Google Cloud Console (google, youtube, gmail, auth/oauth, oauth/callback)
- [x] A11y: toggles have role="switch" + aria-checked + aria-label; send button has aria-label

## P1 — Beta Quality
- [x] All 10 integrations to prod quality — 7 OCEAN feature extractors built + wired into extractionOrchestrator.js (GitHub, Whoop, Discord, Reddit, LinkedIn, Gmail, Twitch). All 10 now have: OAuth + observations + feature extraction pipeline
- [x] Cost dashboard: full page at /admin/llm-costs (summary, daily, per-user, realtime). RPC migration applied via Supabase SQL Editor (3 functions: aggregate_llm_costs_summary, aggregate_llm_costs_daily, aggregate_llm_costs_by_user)
- [x] Privacy spectrum: promoted to Settings — prominent card with Shield icon at top of Data & Privacy section
- [x] Greeting name spacing (#21): verified — `Good ${timeLabel}, ${firstName}` has correct comma+space

## P2 — Post-Beta
- [x] Littlebird pricing: Free(50msg/2plat) / Plus $20(500msg/5plat/90d) / Pro $100(unlimited). Updated: subscriptionService, billing, chat-usage, twin-chat, PaywallModal, Settings plan section, LimitReachedBanner, ChatInputArea. Stripe products created (Seatable account): Plus prod_UA4MQg5yxKRuPH/price_1TBkDPKf4yCMjmH56nMAiI0i, Pro prod_UA4OcjaGZ1mPpr/price_1TBkG5Kf4yCMjmH5r5umQraS. Vercel env vars updated: STRIPE_PRICE_PRO → Plus $20, STRIPE_PRICE_MAX → Pro $100
- [x] Credential rotation: BFG scrub (git-filter-repo removed 14 .env files from 1020 commits) + force push + rotate all secrets. Rotated: JWT_SECRET, ENCRYPTION_KEY, TOKEN_ENCRYPTION_KEY, GOOGLE_CLIENT_SECRET, GITHUB_CLIENT_SECRET, SPOTIFY_CLIENT_SECRET, DISCORD_CLIENT_SECRET, LINKEDIN_CLIENT_SECRET, SLACK_CLIENT_SECRET (old expires 2026-03-18), ANTHROPIC_API_KEY, ELEVENLABS_API_KEY. All updated on Vercel. REDDIT_CLIENT_SECRET confirmed safe (no rotation available). SUPABASE_SERVICE_ROLE_KEY cannot rotate without project recreation. Note: TOKEN_ENCRYPTION_KEY rotation invalidates all stored encrypted OAuth tokens — users must reconnect platforms after deploy
- [x] OG image generation for /p/:userId — already complete: satori+resvg in soulCardRenderer.js, per-user OG tags via /api/s/:userId, Redis cached

---

# TwinMe UI/UX Audit — Task Tracker (2026-03-15)

## Phase 1: Before Next User Test (NOW) — COMPLETE
- [x] 1. Auth page visual upgrade — add Figma gradient right panel (CustomAuth.tsx)
- [x] 2. Chat empty state heading opacity fix 0.6 → 0.85 (ChatEmptyState.tsx)
- [x] 3. Chat limit — glass surface banner + disabled input (TalkToTwin.tsx + ChatInputArea.tsx)
- [x] 4. Remove vaporware platforms from landing strip (Index.tsx — removed Browser Extension, WhatsApp)

## Phase 2: Before 10-User Beta — COMPLETE
- [x] 5. Identity page loading skeletons for each chapter
- [x] 6. Standardize border radius (pills=46px, CTAs=100px, cards=20px)
- [x] 7. Split TalkToTwin.tsx into sub-components (<400 lines each)
- [x] 8. Accessibility: aria-labels on Settings toggles, Privacy sliders
- [x] 9. Chat message timestamp — add timezone indicator
- [x] 10. Error messages — increase visual weight (icon + color)

## Phase 3: Before 100-User Scale — COMPLETE
- [x] 11. Migrate landing page inline styles to Tailwind classes — Index.tsx 788→553 lines, 43→1 inline style, pseudo-elements in src/styles/landing.css
- [x] 12. Split PrivacySpectrum into sub-components (3 sections extracted)
- [x] 13. OG image generation for shared twin links (/p/{userId}) — complete: soulCardRenderer.js + og-image.js routes
- [x] 14. Remove dead routes (/dashboard-old, /soul-onboarding, /discover-legacy, /big-five)
- [x] 15. Split IdentityPage into 7 chapter components + types
- [x] 16. Design token system (src/styles/tokens.ts — OPACITY, TEXT, SURFACE)
- [x] 17. Reusable LoadingSkeleton variants (SectionSkeleton, ChartSkeleton, TableRowSkeleton)
- [x] 18. Context sidebar — hide by default for new users

## UX Tradeoffs — DECIDED (2026-03-17)
- [x] Interview gate: YES, allow chat before interview. Twin works with whatever data exists (platforms, discovery scan). Interview is a CTA on dashboard + identity page, not a gate. Current code already does this — no blocking logic in TalkToTwin.tsx.
- [x] Goals tab: Keep discoverable from dashboard, NOT a 4th nav tab. Nav stays Home / Twin / You / Settings. Goals accessible via dashboard card + /goals route. Avoids tab clutter.
- [x] Emerald (#10b77f) overuse: Reserve for success/status indicators only. Use `var(--accent-vibrant)` (#ff8400 orange) for CTAs and interactive elements per design system. Caret color in chat input is the only remaining emerald accent (cosmetic, low priority).

---

# TwinMe — Phase 7: Behavioral Finetuning

**Plan:** `.claude/plans/2026-03-11-behavioral-finetuning.md`
**Started:** 2026-03-11

## Phase 1: Training Data Export
- [x] 1A. `api/services/finetuning/trainingDataExporter.js` — enhanced with `buildPersonalitySystemPrompt()` + per-user JSONL export

## Phase 2: Finetuning Service
- [x] 2A. `api/services/finetuning/finetuneManager.js` — together.ai API (upload + create job + status polling)
- [x] 2B. DB migration: `user_finetuned_models` table — applied to Supabase

## Phase 3: Personality Oracle
- [x] 3A. `api/services/finetuning/personalityOracle.js` — 800ms budget, Redis cache, graceful fallback
- [x] 3B. Inject oracle into `twin-chat.js` — parallel fetch + `[PERSONALITY ORACLE]` block in system prompt

## Phase 4: API Endpoints
- [x] 4A. `POST /api/finetuning/train` — trigger finetuning (min 50 examples, conflict check)
- [x] 4B. `GET /api/finetuning/status` — check status + poll together.ai
- [x] 4C. Route registered in `server.js`

## Phase 5: Auto-Retrain
- [x] 5A. `api/services/finetuning/autoRetrain.js` — 200 memories trigger, 7-day cooldown, hooked into observation ingestion cron

## Phase 6: Evaluation
- [x] 6A. Feature-flagged oracle (`personality_oracle`, opt-in) + conditional Promise.all in twin-chat.js
- [x] 6B. `src/pages/components/settings/PersonalityOracleSettings.tsx` — train button, status display, toggle switch

---

## Review — COMPLETE (2026-03-12)

**Status**: All 6 phases shipped to production. Oracle live for test user.

### Architecture
- Finetuned Llama 3.1 8B (together.ai serverless LoRA) as personality oracle
- Oracle generates 100-token second-person behavioral compass ("you'd say...", "you tend to...")
- Injected into Claude Sonnet's system prompt as directional guidance
- Claude generates final twin response in first person, guided by oracle's tone/angle

### Key Numbers
- 212 clean training examples (filtered from 2,736 — 92% were contaminated with `[Imported from Claude Desktop]`)
- Oracle latency: ~1.8s (runs in parallel with fetchTwinContext, no user-facing delay)
- Base model: `meta-llama/Meta-Llama-3.1-8B-Instruct-Reference` (supports serverless LoRA)
- 3 training runs total: Qwen (no serverless), Llama v1 (contaminated), Llama v2 (clean, live)

### Lessons Learned
1. together.ai REST file upload is broken — must use Python SDK (`check=False`)
2. Qwen models don't support serverless LoRA — use Llama 3.1 8B Reference
3. Training data quality > quantity — 212 clean > 2,736 contaminated
4. Oracle timeout needs 8s budget (DB ~400ms + together.ai cold start ~3s)
5. Feature flag must be `=== true` (opt-in) since oracle requires trained model

---

# Full Platform Audit — 2026-04-11

## CRITICAL

- [x] **C1. Twin chat 504 / rate limiter** — Fixed: `api/server.js` now scopes aiLimiter to POST /chat/message + GET /chat/intro only (not all /api/chat/*). 25s timeout pending profiling.
- [x] **C2. Memory routing 500** — FALSE POSITIVE: `/api/memories` and `/api/memory-health` work; audit tested wrong paths.
- [x] **C3. cron maxDuration missing** — FALSE POSITIVE: Express app uses `vercel.json` global `maxDuration: 60`, not per-route exports.

## HIGH

- [x] **H1. Identity page shows "stefanogebara" not "Stefano"** — Fixed: `user?.firstName` fallback added in `IdentityPage.tsx`.
- [x] **H2. Auth refresh rate limit too low** — Fixed: `initAuth()` now skips refresh when `auth_token` exists in localStorage. `/auth/refresh` gets its own `refreshLimiter` (100/15min) instead of sharing the brute-force `authLimiter` (15/15min).
- [x] **H3. Admin LLM costs has no auth guard** — FALSE POSITIVE: `admin-llm-costs.js` already has `router.use(authenticateUser, requireProfessor)`.
- [x] **H4. Accent color tokens wrong** — Fixed: `--accent-vibrant: #ff8400`, `--accent-vibrant-glow: rgba(255,132,0,0.12)`, `--accent-amber: #c17e2c` in `src/index.css`.
- [x] **H5. Sidebar active state colors wrong** — Fixed: active bg → `var(--accent-vibrant-glow)`, icon → `var(--accent-vibrant)` in `CollapsibleSidebar.tsx`.
- [x] **H6. Soul signature stale** — Fixed: `POST /api/soul-signature/generate` had dead code checking `signatureResult.success` (which doesn't exist — service returns `{layers, generatedAt, cached}`). Removed dead check + `soul_signatures` table guard. Now correctly regenerates and returns `{success: true, layers, generatedAt, cached}`.
- [x] **H7. Daily crons lack early-exit LLM guards** — FALSE POSITIVE: All 7 crons already have `wasRecentlyRun()` / per-user cooldown checks. Inngest workflows have additional `hard-cooldown-check` steps before any LLM call.

## MEDIUM

- [x] **M1. Dashboard checklist shows "0 connected" despite 9 platforms connected** — Fixed: API returns `data` as platform-keyed object, not array. `BetaOnboardingChecklist.tsx` now converts via `Object.values()` and checks `c.connected === true`.
- [x] **M2. /connect redirects to /get-started** — Fixed: `/connect` now renders `InstantTwinOnboarding` directly (no redirect). Nav item updated to `path: '/connect'`.
- [x] **M3. Privacy spectrum sliders non-interactive** — FALSE POSITIVE: Radix UI `SliderPrimitive` renders `role="slider"` divs (not `<input type="range">`). Sliders are fully interactive.
- [x] **M4. Sidebar nav buttons use type="submit"** — Fixed: Added `type="button"` to all 6 buttons in `CollapsibleSidebar.tsx`.
- [x] **M5. Returning users locked out without invite code** — Fixed: Hint text "Enter invite code to unlock sign-in" now only shows when no `auth_user` cached (new users only).
- [x] **M6. Proactive insights endpoint missing** — FALSE POSITIVE: `/api/insights/proactive` already works. Frontend hook uses correct path.
- [x] **M7. card.tsx glass surface too subtle** — Fixed: `rgba(0.06)` bg, `backdrop-blur-[42px]`, `glass-surface-border`, `box-shadow` added to `card.tsx`.

## LOW

- [x] **L1. Wiki section headings repeat without domain prefix** — Fixed: `WikiDomainCard.tsx` now prefixes h3 `id` attrs with domain label (e.g. `personality-communication-style`) for accessibility uniqueness.
- [x] **L2. Identity page twin text not using Instrument Serif** — Fixed: taste statement paragraph in `IdentityPage.tsx` now uses `className="narrative-voice"`.
- [x] **L3. observationIngestion.js is 5,578 lines** — Split into modules: `observationUtils.js` (utilities) + `observationFetchers/{spotify,calendar,youtube,discord,gmail,github,whoop}.js`. Main file reduced 5,578 → 3,063 lines. `ingestWebObservations` re-implemented as export.
- [x] **L4. auth/refresh called on every page load** — Fixed as part of H2: `initAuth()` now skips refresh when `auth_token` is in localStorage.
