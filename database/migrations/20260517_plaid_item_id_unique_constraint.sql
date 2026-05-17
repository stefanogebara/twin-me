-- Phase 4.1 hotfix: replace partial unique index with a proper UNIQUE
-- constraint so PostgREST upserts with onConflict='plaid_item_id' resolve.
--
-- The original 20260517_plaid_columns.sql created
--   CREATE UNIQUE INDEX idx_bank_conn_plaid_item ON user_bank_connections(plaid_item_id) WHERE plaid_item_id IS NOT NULL;
-- which IS a unique index, but PostgREST's `.upsert(..., { onConflict: 'plaid_item_id' })`
-- requires a real UNIQUE/PRIMARY KEY/EXCLUSION constraint as the target. The
-- partial index can't satisfy that even though it would correctly enforce
-- uniqueness at the storage level.
--
-- Postgres UNIQUE constraints allow multiple NULLs by default, so this
-- coexists fine with Pluggy and TrueLayer rows where plaid_item_id IS NULL.
--
-- Applied to prod via Supabase MCP apply_migration on 2026-05-17.

DROP INDEX IF EXISTS idx_bank_conn_plaid_item;

ALTER TABLE user_bank_connections
  ADD CONSTRAINT user_bank_connections_plaid_item_id_key UNIQUE (plaid_item_id);
