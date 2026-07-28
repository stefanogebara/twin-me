-- ============================================================================
-- Memory supersession (Phase 1 — optmem-brain audit, root cause 3)
-- ============================================================================
-- CAPTURED FROM LIVE DDL, not authored here. Migrations 20260728110058 and
-- 20260728130540 were applied directly to the production project and had no
-- corresponding file in this repo, so a fresh environment had no supersession
-- columns at all and any code reading them would break. This file closes that
-- drift.
--
-- Everything below is idempotent (IF NOT EXISTS / CREATE OR REPLACE) so it is
-- a no-op against the live project, and so it stays safe if the original
-- author commits their own copy under a different version.
--
-- Background: nothing in the system could retire a stale snapshot. A new
-- reading ("40,448 unread") was inserted alongside the old one ("40,381")
-- rather than replacing it, and retrieval was age-blind, so the wrong number
-- kept surfacing. superseded_by makes replacement expressible: the newer row
-- wins and the older is retired but preserved (Zep-style invalidation —
-- nothing is deleted, history stays queryable).
-- ============================================================================

ALTER TABLE user_memories
  ADD COLUMN IF NOT EXISTS superseded_by UUID NULL REFERENCES user_memories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN user_memories.superseded_by IS
  'Id of the memory that replaced this one. NULL = live. Set when a newer reading of the same mutable state arrives; retrieval filters these out by default.';
COMMENT ON COLUMN user_memories.superseded_at IS
  'When this memory was retired. Drives the Tier 2b archival grace period.';

-- Hot path: "live rows for this user of this type, newest first".
CREATE INDEX IF NOT EXISTS idx_user_memories_live
  ON user_memories USING btree (user_id, memory_type, created_at DESC)
  WHERE superseded_by IS NULL;

-- Reverse lookup: "what did this row retire?" — small, so partial on NOT NULL.
CREATE INDEX IF NOT EXISTS idx_user_memories_superseded_by
  ON user_memories USING btree (superseded_by)
  WHERE superseded_by IS NOT NULL;
