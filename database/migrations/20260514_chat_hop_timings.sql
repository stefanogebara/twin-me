-- ============================================================================
-- 20260514_chat_hop_timings.sql
-- ============================================================================
-- audit-2026-05-13 trace-id follow-up: persist the per-hop chat timing
-- ladder to Supabase so we can identify the slow-tail bottleneck without
-- needing Vercel log-drain integration. The Vercel MCP runtime-logs tool
-- truncates structured payloads, making chat.hop entries unrecoverable.
--
-- New columns on mcp_conversation_logs (which already records per-turn
-- chat metadata):
--   trace_id    text       — 8-char hex emitted by twin-chat.js. Matches
--                            the X-Twin-Trace-Id response header so a
--                            client crash report can pivot to the full
--                            timing trace.
--   hop_timings jsonb       — array of { hop, elapsedMs, ...extra }
--                            records emitted at each chat-handler stage
--                            (preflight, neuropil, context_fetch_done,
--                            parallel_meta_done, prompt_assembled,
--                            llm_first_call_done, action_chain_done, done).
--
-- The GIN index on hop_timings supports per-hop slice queries like:
--   SELECT trace_id, hop_timings
--   FROM mcp_conversation_logs
--   WHERE hop_timings @> '[{"hop":"done"}]'::jsonb
--   ORDER BY (hop_timings::text)::jsonb->-1->>'elapsedMs' DESC
--   LIMIT 20;
-- ============================================================================

ALTER TABLE mcp_conversation_logs
  ADD COLUMN IF NOT EXISTS trace_id    text,
  ADD COLUMN IF NOT EXISTS hop_timings jsonb;

-- Btree on trace_id so X-Twin-Trace-Id lookups (one row per request) are
-- O(log n) instead of a sequential scan.
CREATE INDEX IF NOT EXISTS idx_mcp_conv_logs_trace_id
  ON mcp_conversation_logs (trace_id)
  WHERE trace_id IS NOT NULL;

-- GIN index for jsonb containment queries on hop_timings (e.g. "find
-- requests where the action_chain_done hop exceeded 20s").
CREATE INDEX IF NOT EXISTS idx_mcp_conv_logs_hop_timings_gin
  ON mcp_conversation_logs USING gin (hop_timings)
  WHERE hop_timings IS NOT NULL;

COMMENT ON COLUMN mcp_conversation_logs.trace_id IS
  'audit-2026-05-13 trace ID — matches the X-Twin-Trace-Id response header on /api/chat/message';
COMMENT ON COLUMN mcp_conversation_logs.hop_timings IS
  'audit-2026-05-13 per-hop timing ladder — array of { hop, elapsedMs, ...extra } records emitted at each chat-handler stage';
