-- ============================================================================
-- 20260523_noise_observation_importance_backfill.sql
-- ============================================================================
-- Backfill paired with the forward-fix shipped 2026-05-16 in
-- api/services/memoryStreamService.js (NOISE_OBSERVATION_PATTERNS at line 502).
--
-- Context: pre-2026-05-16, the LLM importance rater (Mistral Small, 1-10)
-- consistently over-scored periodic GitHub snapshots and branch-creation
-- events at 7-8. These rows then drowned out genuinely meaningful memories
-- in concept-query retrieval because branch names like "twin-voice-fixes"
-- had literal string-match advantage on user queries about "twin-me".
--
-- The forward fix clamps NEW observations on ingest. This migration cleans
-- up the 117 legacy rows still polluting concept retrieval, mirroring the
-- exact patterns + cap values from NOISE_OBSERVATION_PATTERNS.
--
-- Pattern → cap mapping (MUST stay in sync with memoryStreamService.js):
--   ^Created branch ".+" in                                    → 3
--   ^Your GitHub language distribution:                        → 3
--   ^Your GitHub \d{4} activity: \d+ contributions             → 4
--   ^Committed code on \d+ days in the last \d+ days           → 4
--   ^Current GitHub contribution streak: \d+ consecutive days  → 4
--
-- Each UPDATE is guarded by `importance_score > cap`, making this migration
-- idempotent — re-running it is a no-op once applied.
-- ============================================================================

-- branch_creation: 3 legacy rows expected (1@8, 2@6) → 3
UPDATE user_memories
SET importance_score = 3
WHERE memory_type = 'platform_data'
  AND content ~* '^Created branch ".+" in'
  AND importance_score > 3;

-- lang_distribution: 42 legacy rows expected (8@8, 7@7, 27@6) → 3
UPDATE user_memories
SET importance_score = 3
WHERE memory_type = 'platform_data'
  AND content ~* '^Your GitHub language distribution:'
  AND importance_score > 3;

-- annual_summary: 51 legacy rows expected (51@6) → 4
UPDATE user_memories
SET importance_score = 4
WHERE memory_type = 'platform_data'
  AND content ~* '^Your GitHub \d{4} activity: \d+ contributions'
  AND importance_score > 4;

-- commit_days: 14 legacy rows expected (1@8, 13@6) → 4
UPDATE user_memories
SET importance_score = 4
WHERE memory_type = 'platform_data'
  AND content ~* '^Committed code on \d+ days in the last \d+ days'
  AND importance_score > 4;

-- streak: 7 legacy rows expected (7@6) → 4
UPDATE user_memories
SET importance_score = 4
WHERE memory_type = 'platform_data'
  AND content ~* '^Current GitHub contribution streak: \d+ consecutive days'
  AND importance_score > 4;
