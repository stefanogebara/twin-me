-- Backend latency audit 2026-07-03: /api/twin/status context fetches
-- (getYouTubeContext / getTwitchContext / getWebBrowsingContext in
-- userContextAggregator.js) all run:
--   SELECT raw_data, data_type, extracted_at FROM user_platform_data
--   WHERE user_id = ? AND platform = ? ORDER BY extracted_at DESC LIMIT n;
-- The existing idx_platform_data_user_platform (user_id, platform) satisfies
-- the filter but not the ordering, so Postgres fetches every matching row and
-- sorts before applying the LIMIT — expensive once extension events pile up
-- (raw_data is large JSONB). This composite serves filter + order + limit in
-- one index walk.
--
-- NOTE: CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
-- Apply via the Supabase SQL editor (or psql with autocommit), same as
-- 20260325_dashboard_perf_indexes.sql.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_platform_data_user_platform_extracted
  ON user_platform_data (user_id, platform, extracted_at DESC);
