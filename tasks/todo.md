# TwinMe — Cold Start + Interview Backlog (2026-03-16)

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
