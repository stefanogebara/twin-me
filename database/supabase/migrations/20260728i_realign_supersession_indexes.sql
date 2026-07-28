-- ============================================================================
-- Realign the supersession indexes and comments with what liveness actually is
-- ============================================================================
--
-- 20260728110058 introduced supersession with `superseded_by IS NULL` as the
-- test for "live". 20260728151001 then found that wrong: `superseded_by` is
-- declared ON DELETE SET NULL, so deleting a replacement row silently clears
-- the pointer on every row it retired, and those rows read as live again.
-- Liveness moved to `superseded_at`, and all 12 read paths follow it.
--
-- Two artefacts of the original design were left behind.
--
-- 1. `idx_user_memories_live` is still declared on `superseded_by IS NULL`.
--    Production has since been corrected out-of-band and carries
--    `superseded_at IS NULL`, so this is repo-vs-production drift rather than
--    a live problem — but the migration is what a fresh environment builds
--    from, and `CREATE INDEX IF NOT EXISTS` will not repair an index that
--    already exists with the wrong predicate. Any environment built from the
--    migrations alone gets an index Postgres cannot use for the live filter:
--    a partial index only serves a query whose predicate implies its own.
--
-- 2. The column comment on `superseded_by` still asserts "NULL = live", which
--    is the exact belief 151001 disproved.
--
-- `idx_user_memories_superseded_by` is deliberately NOT touched. Its
-- `superseded_by IS NOT NULL` predicate is correct and load-bearing: the
-- ON DELETE SET NULL constraint makes Postgres search for referencing rows on
-- every delete, which is why that 16 kB index has an order of magnitude more
-- scans than any other index on the table.
-- ============================================================================

-- ── 1. Realign the live index, only where it is actually wrong ──────────────
-- Guarded so this is a no-op on production (already correct) and so it cannot
-- silently do nothing on an environment that has the stale predicate.
DO $$
DECLARE
  v_pred TEXT;
  v_exists BOOLEAN := FALSE;
BEGIN
  SELECT TRUE, pg_get_expr(i.indpred, i.indrelid)
    INTO v_exists, v_pred
  FROM pg_index i
  JOIN pg_class c ON c.oid = i.indexrelid
  WHERE c.relname = 'idx_user_memories_live';

  IF v_exists IS NOT TRUE THEN
    CREATE INDEX idx_user_memories_live
      ON user_memories USING btree (user_id, memory_type, created_at DESC)
      WHERE superseded_at IS NULL;
    RAISE NOTICE 'idx_user_memories_live created on superseded_at';

  ELSIF v_pred IS NULL OR v_pred NOT LIKE '%superseded_at%' THEN
    DROP INDEX idx_user_memories_live;
    CREATE INDEX idx_user_memories_live
      ON user_memories USING btree (user_id, memory_type, created_at DESC)
      WHERE superseded_at IS NULL;
    RAISE NOTICE 'idx_user_memories_live realigned from % to superseded_at', v_pred;

  ELSE
    RAISE NOTICE 'idx_user_memories_live already keyed on superseded_at; left alone';
  END IF;
END $$;

-- ── 2. Serve Tier 2b's scan of retired rows ─────────────────────────────────
-- cron-memory-forgetting Tier 2b selects "retired longer ago than the grace
-- period" every week. Only the live side had an index, so that scan had to
-- read the whole table (566 MB, mostly embeddings) to find ~100 rows. This is
-- the mirror of the live index and stays tiny for the same reason
-- idx_user_memories_superseded_by does.
CREATE INDEX IF NOT EXISTS idx_user_memories_retired
  ON user_memories USING btree (superseded_at)
  WHERE superseded_at IS NOT NULL;

-- ── 3. Stop the schema asserting the disproved rule ─────────────────────────
COMMENT ON COLUMN user_memories.superseded_by IS
  'Id of the memory that replaced this one, for provenance only. NOT a liveness test: the FK is ON DELETE SET NULL, so archiving the replacement clears this while the row stays retired. Liveness is superseded_at IS NULL.';

COMMENT ON COLUMN user_memories.superseded_at IS
  'When this memory was retired, and the authoritative liveness test (NULL = live). Survives deletion of the replacement. Drives the Tier 2b archival grace period.';
