-- Phase 3.1: Pluggy real-time bank connections (Open Finance BR).
-- One row per (user, bank item). Item = a connected financial institution in Pluggy parlance.
-- Transactions arrive via webhook → pluggyIngestion.js → user_transactions.
-- Applied to Supabase 2026-04-21 via MCP apply_migration.

CREATE TABLE IF NOT EXISTS user_bank_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'pluggy',
  pluggy_item_id TEXT NOT NULL UNIQUE,
  connector_id INTEGER NOT NULL,
  connector_name TEXT NOT NULL,
  status TEXT NOT NULL,
  status_detail JSONB,
  last_synced_at TIMESTAMPTZ,
  consent_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bank_conn_user ON user_bank_connections(user_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bank_conn_item ON user_bank_connections(pluggy_item_id);

ALTER TABLE user_bank_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_bank_connections_select ON user_bank_connections;
CREATE POLICY user_bank_connections_select ON user_bank_connections
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_bank_connections_service_role ON user_bank_connections;
CREATE POLICY user_bank_connections_service_role ON user_bank_connections
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE user_bank_connections IS
  'Pluggy Open Finance bank connections. One row per connected financial institution ("item"). Status drives reconnect prompts in the UI. consent_expires_at drives the 12-month Open Finance reconsent reminder.';

-- Extend user_transactions so Pluggy-sourced rows are idempotent by provider id,
-- and we can tell CSV vs webhook-sourced rows apart.
ALTER TABLE user_transactions
  ADD COLUMN IF NOT EXISTS pluggy_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS pluggy_account_id TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'csv_upload';

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_tx_pluggy_tx_id
  ON user_transactions(pluggy_transaction_id)
  WHERE pluggy_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_tx_pluggy_account
  ON user_transactions(user_id, pluggy_account_id)
  WHERE pluggy_account_id IS NOT NULL;

COMMENT ON COLUMN user_transactions.source IS
  'Origin of the transaction row: csv_upload | ofx_upload | pluggy_webhook | pluggy_sync';
COMMENT ON COLUMN user_transactions.pluggy_transaction_id IS
  'Pluggy-assigned transaction UUID. Provides native idempotency for webhook-sourced rows (replaces csv external_id).';
