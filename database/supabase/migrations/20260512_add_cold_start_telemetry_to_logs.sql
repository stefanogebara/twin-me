-- Add cold_start_ms and memory_count telemetry columns to mcp_conversation_logs
-- Wired into persistChatTurn -> logConversationToDatabase so chat turn quality
-- can be analyzed against context-build latency and memory recall depth.
-- Addresses audit bug H10: cold_start_ms and memory_count always NULL.

ALTER TABLE mcp_conversation_logs
ADD COLUMN IF NOT EXISTS cold_start_ms INTEGER,
ADD COLUMN IF NOT EXISTS memory_count INTEGER;

COMMENT ON COLUMN mcp_conversation_logs.cold_start_ms IS 'Wall-clock ms spent building the twin context (fetchChatPreFlight) for this turn. Tracks cold-start latency after per-leg timeout + HyDE skip work.';
COMMENT ON COLUMN mcp_conversation_logs.memory_count IS 'Number of memories included in the final context for this turn (after MMR rerank, after per-leg timeout drops).';
