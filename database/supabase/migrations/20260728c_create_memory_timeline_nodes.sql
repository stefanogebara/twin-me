-- ============================================================================
-- Temporal spine node cache
-- Date: 2026-07-28
--
-- Each row is one block of the telescoping timeline: a summary of everything
-- that happened in an aligned power-of-2 range of days. Leaves (block_size = 1)
-- digest a single day; larger nodes merge their two halves, as OptMem's binary
-- merge tree does (github.com/VictorTaelin/OptMem).
--
-- WHY DAY RANGES AND NOT LOG POSITIONS
-- OptMem addresses blocks by position (#0-1, #2-3, ...), which is sound only
-- because its log is strictly append-only. Ours is not: the forgetting cron
-- archives rows, supersession retires them, and the Phase 0 backfill deleted
-- 4,626 in one pass. Any of those renumbers every position-addressed block and
-- invalidates the entire tree. Addressing by absolute day index instead means a
-- node's identity is permanent — block (size=8, start=2467816) denotes the same
-- eight calendar days forever — so only the affected node ever needs rebuilding.
--
-- WHY IT EXISTS AT ALL
-- Phase 2 measured that retrieval selects candidates by vector distance alone,
-- so recent-but-not-semantically-near memories are unreachable: asked "what has
-- this person been doing this week?", it returned 30 conversations, none younger
-- than 49 days, while 889 platform rows from the last 7 days sat unretrieved.
-- Re-weighting recency moved the freshness score by exactly zero. The spine is
-- selected by TIME, so it reaches what similarity cannot.
--
-- This table is a CACHE. user_memories remains the source of truth, so any node
-- can be dropped and rebuilt — the property that makes OptMem's `forget` safe.
-- ============================================================================

CREATE TABLE IF NOT EXISTS memory_timeline_nodes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  block_size    INTEGER NOT NULL CHECK (block_size >= 1),
  block_start   INTEGER NOT NULL,
  summary       TEXT NOT NULL,
  memory_count  INTEGER NOT NULL DEFAULT 0,
  -- Fingerprint of the inputs this summary was built from. When it stops
  -- matching, the node is stale and gets rebuilt rather than silently serving a
  -- summary of memories that have since changed.
  source_digest TEXT,
  built_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, block_size, block_start)
);

COMMENT ON TABLE memory_timeline_nodes IS
  'Cached summaries for the temporal spine. One row per aligned power-of-2 day block. Rebuildable from user_memories at any time.';
COMMENT ON COLUMN memory_timeline_nodes.block_start IS
  'Absolute day index (days since Unix epoch), always a multiple of block_size.';

-- Spine assembly reads all of a user's nodes for the current cover.
CREATE INDEX IF NOT EXISTS idx_timeline_nodes_user_block
  ON memory_timeline_nodes (user_id, block_size, block_start);

ALTER TABLE memory_timeline_nodes ENABLE ROW LEVEL SECURITY;

-- Service role does all writes; users may read their own spine.
DROP POLICY IF EXISTS timeline_nodes_own_read ON memory_timeline_nodes;
CREATE POLICY timeline_nodes_own_read ON memory_timeline_nodes
  FOR SELECT USING (auth.uid() = user_id);
