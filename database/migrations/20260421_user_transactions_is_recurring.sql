-- Phase 2F: distinguish recurring charges from genuine impulses.
-- Same merchant + similar amount + 3+ occurrences = recurring (Netflix monthly,
-- gym membership, Friday iFood habit). Stress-shop rule now excludes these.
-- Applied to Supabase 2026-04-21 via MCP apply_migration.

ALTER TABLE user_transactions
  ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_user_transactions_recurring
  ON user_transactions(user_id, merchant_normalized, is_recurring);

COMMENT ON COLUMN user_transactions.is_recurring IS
  'True when this charge is part of a recurring pattern (same merchant + amount appearing 3+ times in 120d with <20% stddev). Gates stress-shop candidate logic so subscriptions are not false-flagged as impulses.';
