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

## Review
(To be filled after implementation)
