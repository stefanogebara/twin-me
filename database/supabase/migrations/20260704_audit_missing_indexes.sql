-- Migration: 20260704_audit_missing_indexes
-- DB-layer audit (2026-07-03/04): add the one missing composite index that the
-- static audit could tie DIRECTLY to a hot application query. Same disciplined
-- pattern as PR #147 (read the slow path, match the WHERE/ORDER BY exactly) and
-- 20260325_dashboard_perf_indexes.sql (CONCURRENTLY on a growth table).
--
-- ⚠️ APPLY MANUALLY — NOT via a transaction-wrapping tool.
--    CREATE INDEX CONCURRENTLY cannot run inside a transaction block. Supabase
--    `mcp apply_migration` and the SQL editor's default "run in transaction"
--    mode will error with 25001. Run this statement on its own, e.g. paste the
--    single CREATE INDEX line into the SQL editor with autocommit, or psql
--    without BEGIN/COMMIT. IF NOT EXISTS makes replay a no-op.
--
-- ── Evidence (twin_messages: filter on conversation_id, ORDER BY created_at) ──
-- The hottest read path in the app loads a conversation's messages ordered by
-- time on EVERY chat turn, plus several list/citation paths. All filter on
-- conversation_id and order by created_at — a filter+order-on-different-columns
-- shape that the two existing SINGLE-column indexes
-- (idx_twin_messages_conversation_id, idx_twin_messages_created_at) cannot serve
-- as an index-ordered scan: Postgres filters by conversation_id, then sorts the
-- matched rows. A composite lets it satisfy the equality + ORDER BY ... LIMIT
-- directly. twin_messages is the app's fastest-growing table (2 rows per chat
-- turn), so CONCURRENTLY avoids a write lock as it grows.
--
--   api/services/twinChatPipeline.js:65   .eq('conversation_id', id).order('created_at',{ascending:false}).limit(20)   [every chat turn]
--   api/services/twinChatPipeline.js:104  .eq('conversation_id', id).eq('role','assistant').order('created_at',{ascending:false}).limit(5)
--   api/services/database.js:416          .eq('conversation_id', id).order('created_at',{ascending:true}).limit(n)
--   api/services/citationExtractionService.js:136  .eq('conversation_id', id).eq('role','assistant').order('created_at',{ascending:false}).limit(1)
--   api/routes/conversations.js:94        .eq('conversation_id', id).order('created_at',{ascending:false}).limit(1)   [per-conversation last-message, N+1 over the list]
--   api/routes/twin-conversations.js:63   .eq('conversation_id', id).order('created_at',{ascending:false}).limit(1)
--   api/routes/account.js:170             .in('conversation_id', ids).order('created_at',{ascending:false})   [GDPR export]
--   api/services/twinSelfImprovement.js:584  .in('conversation_id', ids).gte('created_at', ts).order('created_at',{ascending:true})
--
-- Direction note: reads use BOTH ascending:false and ascending:true. A btree on
-- (conversation_id, created_at) serves both — within a conversation the planner
-- scans the created_at ordering forward or backward at equal cost — so a single
-- ASC composite covers every caller above. Not indexing DESC keeps it simplest.
--
-- Not added (already covered — verified against the migration trees, do NOT add):
--   user_memories        → idx_user_memories_user_type + idx_user_memories_user_created (20260325)
--   user_platform_data   → idx_platform_data_user_platform_extracted (#147) + user_platform/user_type
--   user_transactions    → idx_user_transactions_date/category/merchant (all (user_id, …))
--   proactive_insights   → idx_proactive_insights_user_id (user_id, created_at DESC) + undelivered partial
--   reminders            → idx_reminders_due (remind_at) WHERE status='pending'  [delivery-poll cron]
--   memory_links         → idx_memory_links_source + last_reinforced_at partial   [graph + STDP cron]
--   agent_actions        → idx_agent_actions_user (user_id, created_at DESC)
--   twin_calls           → idx_twin_calls_user_created + provider_call_id partial
--   platform_exports     → idx_platform_exports_user + user_platform WHERE status='parsed'

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_twin_messages_conversation_created
  ON twin_messages (conversation_id, created_at);

COMMENT ON INDEX idx_twin_messages_conversation_created IS
  'Serves the hot chat-history read: filter by conversation_id, ORDER BY created_at (both directions), LIMIT N. Replaces reliance on the two single-column indexes which cannot do an index-ordered scan for this pattern.';
