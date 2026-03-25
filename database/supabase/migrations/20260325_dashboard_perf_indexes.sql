-- Dashboard performance: composite index for memory type COUNT queries
-- The dashboard/context endpoint runs COUNT(*) on user_memories filtered by
-- (user_id, memory_type) via getTwinReadinessScore. Without a composite index,
-- Postgres must scan the user_id index then filter by memory_type.
-- This covering index makes each COUNT an index-only scan.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_memories_user_type
  ON user_memories (user_id, memory_type);

-- Composite index for "memories this week" COUNT (user_id + created_at range)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_memories_user_created
  ON user_memories (user_id, created_at DESC);
