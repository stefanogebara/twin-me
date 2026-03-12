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
