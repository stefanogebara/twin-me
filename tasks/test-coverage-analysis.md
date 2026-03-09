# Test Coverage Analysis — TwinMe

**Date:** 2026-03-09
**Branch:** `claude/analyze-test-coverage-jcBQZ`

---

## Current State Summary

| Category | Source Files | Test Files | Coverage |
|----------|-------------|------------|----------|
| **api/services/** | 107 | 1 (`memoryStream.test.js`) | ~1% |
| **api/routes/** | 83 | 0 (only integration tests touch a few) | ~0% |
| **api/middleware/** | 9 | 3 (`auth`, `errors`, `sanitization`) | ~33% |
| **api/config/** | ~5 | 1 (`aiModels.test.js`) | ~20% |
| **Unit tests** | — | 2 (`personality`, `synaptic-maturation`) | — |
| **Integration tests** | — | 2 (`core-flows`, `extended-flows`) | — |
| **E2E (Playwright)** | — | 15 spec files | Good UI coverage |

**Bottom line:** The E2E layer is reasonably built out, but the **unit and integration test layers are critically thin**. Out of 107 service files — the core business logic — only 1 has a dedicated test file.

---

## Priority 1: Critical Services (High Risk, Zero Tests)

These are the backbone of the product. A bug here silently corrupts the twin experience.

### 1. `reflectionEngine.js` — Reflection Generation Pipeline
- **Why critical:** Generates higher-level personality insights from raw memories. Bugs cause cascading bad reflections stored permanently.
- **What to test:** Expert persona routing, importance threshold triggering (>40), recursive depth limiting (max 3), parallel expert execution, reflection memory storage with correct metadata.

### 2. `llmGateway.js` — Unified LLM Gateway
- **Why critical:** EVERY LLM call flows through here. Failure = total product outage.
- **What to test:** Model tier routing (CHAT/ANALYSIS/EXTRACTION), OpenRouter request formatting, cost tracking accumulation, caching behavior, error handling (rate limits, timeouts, invalid responses), retry logic.

### 3. `observationIngestion.js` — Platform Data → Memory Pipeline
- **Why critical:** The entry point for all platform data. If this breaks, the twin stops learning.
- **What to test:** Platform data normalization, natural language observation generation, importance scoring delegation, goal tracking hook invocation, error isolation (one platform failure shouldn't block others).

### 4. `twinSummaryService.js` — Dynamic Twin Summary
- **Why critical:** Generates the core identity summary used in every twin chat response.
- **What to test:** Five parallel domain queries, identity weight preset usage, 4-hour TTL caching, upsert behavior, regeneration triggers.

### 5. `goalTrackingService.js` — Goal CRUD + Auto-Tracking
- **Why critical:** User-facing feature with data persistence. Bugs = lost goals or wrong progress.
- **What to test:** Goal suggestion generation, acceptance flow, metric extraction (structured data + regex fallback), progress tracking calculations, completion detection.

### 6. `personalityProfileService.js` — OCEAN + Stylometrics + Sampling
- **Why critical:** Shapes how the twin speaks and behaves. Wrong values = uncanny twin.
- **What to test:** OCEAN score extraction, stylometric computation (sentence length, TTR, formality), sampling parameter derivation from OCEAN, personality embedding centroid calculation, 12-hour TTL, minimum 20 memories guard.

---

## Priority 2: Security & Data Integrity (High Risk)

### 7. `encryption.js`
- **What to test:** Encrypt/decrypt round-trip, key rotation handling, error on invalid keys, no plaintext leakage in error messages.

### 8. `privacyService.js`
- **What to test:** Privacy level filtering, data redaction, consent enforcement, edge cases (no consent records, expired consent).

### 9. `api/middleware/errorHandler.js`
- **What to test:** Error type mapping to HTTP status codes, sensitive data stripping from error responses, unhandled error catch-all behavior.

### 10. `api/middleware/verifyCronSecret.js`
- **What to test:** Valid/invalid secret rejection, missing header handling, timing-safe comparison.

### 11. `api/middleware/validateOAuthCredentials.js`
- **What to test:** Missing credential rejection, malformed token handling, per-platform validation rules.

---

## Priority 3: Memory Architecture (Core Differentiator)

### 12. `memoryLinksService.js` — Graph Retrieval + Co-Citation
- **What to test:** Auto-linking logic, co-citation strengthening, 1-hop graph traversal, strength-weighted scoring, score capping at 80% of top vector result, feature flag gating.

### 13. `saliencyReplayService.js` — Sleep Consolidation
- **What to test:** Eligibility filtering (importance >= 7, 14+ days stale), `last_accessed_at` refresh, reflection engine trigger, cost controls (3 users/run, 20 memories/user), cooldown respect.

### 14. `proactiveInsights.js` — Insight Generation + Delivery
- **What to test:** LLM analysis of recent memories, insight storage with urgency/category, delivery tracking (mark as delivered), high urgency sorting.

### 15. `embeddingService.js` — Vector Embeddings
- **What to test:** Text-embedding-3-small API call formatting, 1536-dimension output validation, batching behavior, caching, error handling on API failure.

---

## Priority 4: Platform Integrations (User-Facing Fragility)

### 16. `spotifyExtraction.js` / `spotifyEnhancedExtractor.js`
- **What to test:** API response parsing, rate limit handling, token refresh on 401, data normalization, partial failure handling.

### 17. `discordExtraction.js`
- **What to test:** Server activity parsing, message content extraction, rate limiting compliance.

### 18. `tokenRefreshService.js` / `tokenRefresh.js`
- **What to test:** OAuth token refresh flow, expiry detection, concurrent refresh prevention, failure recovery.

### 19. `extractionOrchestrator.js`
- **What to test:** Platform coordination, partial failure isolation, extraction status tracking, retry scheduling.

---

## Priority 5: Route-Level Tests (API Contract Validation)

Currently **zero** route files have dedicated tests. The integration tests cover a handful of endpoints superficially. Priority routes:

### 20. `twin-chat.js` — The core product endpoint
- **What to test:** Full context pipeline assembly, memory retrieval integration, personality prompt injection, streaming response handling, conversation memory storage (per-utterance).

### 21. `goals.js` — 7 endpoints
- **What to test:** CRUD operations, auth enforcement, input validation, error responses for each endpoint.

### 22. `personality-profile.js` — Profile + Drift endpoints
- **What to test:** GET profile (cached vs fresh), POST rebuild trigger, GET drift detection results.

### 23. `auth-simple.js` — Authentication
- **What to test:** Login/signup flows, JWT generation, token format (`id` field), error cases.

### 24. Cron routes (`cron-memory-forgetting.js`, `cron-memory-saliency-replay.js`, etc.)
- **What to test:** Cron secret enforcement, job execution triggering, idempotency, error handling.

---

## Infrastructure Gaps

### No Coverage Thresholds
`vitest.config.ts` tracks coverage but has **no enforced thresholds**. Recommendation:
- Set an initial threshold of 20% (achievable quickly) and ratchet up over time.
- Add per-directory thresholds: `api/services/` should eventually reach 60%+.

### No Tests in CI
`.github/workflows/vercel-deploy.yml` only deploys — **no test job**. Recommendation:
- Add a `test` job that runs `npm run test` before deploy.
- Add `npm run test:coverage` and fail if below threshold.

### Missing Test Utilities
The codebase would benefit from shared test helpers:
- **Mock Supabase client factory** — standardize the chainable query builder mock across all tests.
- **Mock LLM response factory** — create typed mock responses per model tier.
- **Memory fixture factory** — generate realistic memory objects with embeddings.
- **Authenticated request helper** — pre-build Express `req` objects with valid JWT.

---

## Recommended Action Plan

### Phase 1: Foundation (Highest ROI)
1. Add CI test job to GitHub Actions workflow
2. Set initial coverage thresholds (20% global)
3. Create shared test utilities (mock factories)
4. Test `llmGateway.js` — blocks everything else
5. Test `reflectionEngine.js` — core differentiator
6. Test `memoryStreamService.js` — expand existing tests significantly

### Phase 2: Security + Data Integrity
7. Test `encryption.js` — encrypt/decrypt round-trip
8. Test `privacyService.js` — consent and filtering
9. Test remaining middleware (`errorHandler`, `verifyCronSecret`, `validateOAuthCredentials`)
10. Test `auth-simple.js` route

### Phase 3: Memory Architecture
11. Test `memoryLinksService.js` — graph retrieval
12. Test `saliencyReplayService.js` — sleep consolidation
13. Test `proactiveInsights.js` — insight pipeline
14. Test `twinSummaryService.js` — summary generation
15. Test `personalityProfileService.js` — OCEAN extraction

### Phase 4: Platform & Routes
16. Test `twin-chat.js` route — end-to-end context pipeline
17. Test `goals.js` route — CRUD contract
18. Test platform extraction services (Spotify, Discord)
19. Test `tokenRefreshService.js` — OAuth flows
20. Test cron routes — secret enforcement + idempotency

### Target: 60% service coverage, 40% route coverage within 4 phases.
