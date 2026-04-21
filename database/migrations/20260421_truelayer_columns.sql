-- Phase 4: TrueLayer EU/UK Open Banking aggregator.
-- Extends user_bank_connections + user_transactions to accept TrueLayer-sourced
-- items alongside Pluggy. Same abstraction, new provider.
-- Applied to Supabase 2026-04-21 via MCP apply_migration.

ALTER TABLE user_bank_connections
  ADD COLUMN IF NOT EXISTS truelayer_credentials_id TEXT,
  ADD COLUMN IF NOT EXISTS refresh_token_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS access_token_expires_at TIMESTAMPTZ;

ALTER TABLE user_bank_connections
  DROP CONSTRAINT IF EXISTS user_bank_connections_provider_check;
ALTER TABLE user_bank_connections
  ADD CONSTRAINT user_bank_connections_provider_check
  CHECK (provider IN ('pluggy', 'truelayer'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_conn_tl_creds
  ON user_bank_connections(truelayer_credentials_id)
  WHERE truelayer_credentials_id IS NOT NULL;

COMMENT ON COLUMN user_bank_connections.truelayer_credentials_id IS
  'TrueLayer Credentials ID — identifier for the user-bank pairing, used to fetch accounts/transactions. One per connected bank.';
COMMENT ON COLUMN user_bank_connections.refresh_token_encrypted IS
  'AES-GCM encrypted TrueLayer refresh token. access_token is short-lived (1h); we refresh server-side using this.';

ALTER TABLE user_transactions
  ADD COLUMN IF NOT EXISTS truelayer_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS truelayer_account_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_tx_tl_id
  ON user_transactions(truelayer_transaction_id)
  WHERE truelayer_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_tx_tl_account
  ON user_transactions(user_id, truelayer_account_id)
  WHERE truelayer_account_id IS NOT NULL;

COMMENT ON COLUMN user_transactions.source IS
  'Origin of the transaction row: csv_upload | ofx_upload | pluggy_webhook | pluggy_sync | truelayer_sync | truelayer_webhook';
