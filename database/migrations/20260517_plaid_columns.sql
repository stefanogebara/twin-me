-- Phase 4.1: Plaid US Open Banking aggregator.
-- Extends user_bank_connections + user_transactions to accept Plaid-sourced
-- items alongside Pluggy (BR) and TrueLayer (UK/EU). Closes the US gap that
-- OpenAI shipped on top of on 2026-05-15.
--
-- Schema changes:
--   1. Drop NOT NULL on pluggy_item_id — Plaid + TrueLayer rows don't have one.
--   2. Add plaid_item_id + plaid_access_token_encrypted columns.
--   3. Extend the provider CHECK to include 'plaid'.
--   4. Add plaid_transaction_id + plaid_account_id to user_transactions
--      with the same unique-index-where-not-null pattern Pluggy and TrueLayer
--      already use.

ALTER TABLE user_bank_connections
  ALTER COLUMN pluggy_item_id DROP NOT NULL;

ALTER TABLE user_bank_connections
  ADD COLUMN IF NOT EXISTS plaid_item_id TEXT,
  ADD COLUMN IF NOT EXISTS plaid_access_token_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS plaid_institution_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_conn_plaid_item
  ON user_bank_connections(plaid_item_id)
  WHERE plaid_item_id IS NOT NULL;

ALTER TABLE user_bank_connections
  DROP CONSTRAINT IF EXISTS user_bank_connections_provider_check;
ALTER TABLE user_bank_connections
  ADD CONSTRAINT user_bank_connections_provider_check
  CHECK (provider IN ('pluggy', 'truelayer', 'plaid'));

COMMENT ON COLUMN user_bank_connections.plaid_item_id IS
  'Plaid-issued Item ID — identifier for the user-institution pairing, returned by /item/public_token/exchange. Used to fetch accounts/transactions and as the dedup key for webhooks.';
COMMENT ON COLUMN user_bank_connections.plaid_access_token_encrypted IS
  'AES-GCM encrypted Plaid access_token. Plaid access tokens are permanent (no refresh dance), but we keep them encrypted at rest because they grant full read access to bank data.';
COMMENT ON COLUMN user_bank_connections.plaid_institution_id IS
  'Plaid institution_id (e.g. ins_109508 for First Platypus sandbox, ins_56 for Chase). Lets us render bank logos and pre-flight institution health.';

ALTER TABLE user_transactions
  ADD COLUMN IF NOT EXISTS plaid_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS plaid_account_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_tx_plaid_id
  ON user_transactions(plaid_transaction_id)
  WHERE plaid_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_tx_plaid_account
  ON user_transactions(user_id, plaid_account_id)
  WHERE plaid_account_id IS NOT NULL;

COMMENT ON COLUMN user_transactions.plaid_transaction_id IS
  'Plaid-assigned transaction_id. Stable across /transactions/sync responses (Plaid normalizes pending → posted via the same id). Native idempotency for webhook-sourced rows.';

-- Source enum gets two new values; the column itself is a free-text TEXT
-- so no enum migration needed. The comment below tracks valid values.
COMMENT ON COLUMN user_transactions.source IS
  'Origin of the transaction row: csv_upload | ofx_upload | pluggy_webhook | pluggy_sync | truelayer_sync | truelayer_webhook | plaid_webhook | plaid_sync';

-- Stash the per-item sync cursor so /transactions/sync can resume
-- incrementally. Lives on user_bank_connections (one cursor per item).
ALTER TABLE user_bank_connections
  ADD COLUMN IF NOT EXISTS plaid_sync_cursor TEXT;

COMMENT ON COLUMN user_bank_connections.plaid_sync_cursor IS
  'Opaque cursor returned by Plaid /transactions/sync. Pass it on the next call to fetch only what changed since. NULL means "start from the beginning (everything Plaid has ever seen for this item)".';
