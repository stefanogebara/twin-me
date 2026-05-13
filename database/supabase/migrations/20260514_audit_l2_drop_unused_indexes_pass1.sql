-- Migration: 20260514_audit_l2_drop_unused_indexes_pass1
-- audit-2026-05-12 L2: drop 13 unused indexes (~31 MB combined).
--
-- Applied to prod 2026-05-13 via mcp__claude_ai_Supabase__apply_migration.
-- Mirrored here so the migration is tracked in the repo.
--
-- Rationale: pg_stat_user_indexes.idx_scan = 0 across all of these on
-- tables that DO have other index activity, so the 0-count is meaningful
-- (not a post-restart artifact). Each drop documented with size + table
-- state at the time of removal.
--
-- Skipped this pass (more risk):
--   * idx_user_transactions_*  — table in active development, low row count
--     today but high churn (9023 inserts on 7 live rows)
--   * idx_user_wiki_pages_embedding — vector index, expensive to rebuild
--     if we discover a use case
--   * idx_memory_links_updated_at  — recent STDP feature, might warm up
--   * idx_mcp_logs_*  — H10 telemetry just shipped, might be queried soon
--
-- Rollback for any of these is a simple CREATE INDEX (~1-5s rebuild on
-- current row counts). All wrapped in IF EXISTS for idempotent replay.
--
-- Post-apply metric: unused-index count 312 → 177, footprint 35 MB → 3.8 MB.

-- Tier A: indexes on empty tables (0 live rows). Pure overhead today.
DROP INDEX IF EXISTS public.idx_realtime_events_user_time;
DROP INDEX IF EXISTS public.idx_realtime_events_platform;
DROP INDEX IF EXISTS public.idx_pl_raw_events_user_time;
DROP INDEX IF EXISTS public.idx_pl_raw_events_platform;
DROP INDEX IF EXISTS public.idx_pl_raw_events_type;

-- Tier B: llm_usage_log — 5088 rows, table has light index usage (1891
-- table_idx_scan total) but these two specific indexes have never been
-- hit. Combined 24 MB.
DROP INDEX IF EXISTS public.idx_llm_usage_service;
DROP INDEX IF EXISTS public.idx_llm_usage_tier;

-- Tier C: brain_activity_log — 98 rows, table never indexed-scanned.
DROP INDEX IF EXISTS public.idx_brain_activity_date;
DROP INDEX IF EXISTS public.idx_brain_activity_user;

-- Tier D: user_memories_archive — 1425 rows, 0 table_idx_scan (the table
-- itself is never queried, only inserted into by the forgetting cron).
-- The PK we just added in 20260514_audit_l1_l3 handles row identity.
DROP INDEX IF EXISTS public.idx_archive_user_created;
DROP INDEX IF EXISTS public.idx_memories_archive_reason;

-- Tier E: user_memories full-text-search indexes — TwinMe uses pgvector
-- for memory retrieval (search_memory_stream RPC), not Postgres FTS.
-- idx_user_memories_fts (3.9 MB) + idx_user_memories_confidence (2 MB)
-- have never been scanned across 22k rows. The fts index alone is the
-- single largest unused index on user_memories.
DROP INDEX IF EXISTS public.idx_user_memories_fts;
DROP INDEX IF EXISTS public.idx_user_memories_confidence;
