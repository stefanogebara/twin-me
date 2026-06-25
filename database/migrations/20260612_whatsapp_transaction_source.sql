-- WhatsApp transaction capture (Magie-lite) — new source values + dedup index
-- user_transactions.source is plain TEXT (no CHECK constraint); this migration
-- documents the two new values and adds the index the cross-source duplicate
-- heuristic queries on. Idempotent.

COMMENT ON COLUMN user_transactions.source IS
  'Origin: csv_upload | ofx_upload | whatsapp (Kapso webhook capture) | notification (mobile notification-listener) | pluggy_webhook/pluggy_sync/plaid_webhook/plaid_sync (retired 2026-06-12, historical only)';

CREATE INDEX IF NOT EXISTS idx_user_tx_source_date
  ON user_transactions(user_id, source, transaction_date DESC);
