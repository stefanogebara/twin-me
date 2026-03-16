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

## Phase 3: Before 100-User Scale — COMPLETE (except 11, 13)
- [ ] 11. Migrate landing page inline styles to Tailwind classes (deferred — needs design stabilization)
- [x] 12. Split PrivacySpectrum into sub-components (3 sections extracted)
- [ ] 13. OG image generation for shared twin links (/p/{userId}) (deferred — needs backend)
- [x] 14. Remove dead routes (/dashboard-old, /soul-onboarding, /discover-legacy, /big-five)
- [x] 15. Split IdentityPage into 7 chapter components + types
- [x] 16. Design token system (src/styles/tokens.ts — OPACITY, TEXT, SURFACE)
- [x] 17. Reusable LoadingSkeleton variants (SectionSkeleton, ChartSkeleton, TableRowSkeleton)
- [x] 18. Context sidebar — hide by default for new users

## UX Tradeoffs (Decisions Needed)
- [ ] Interview gate: allow chat before interview with "basic" twin?
- [ ] Goals tab: add as 4th nav tab or keep discoverable from dashboard?
- [ ] Emerald (#10b77f) overuse: reserve for status only?

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
