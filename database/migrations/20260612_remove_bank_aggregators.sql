-- Remove bank aggregators (Pluggy + Plaid + TrueLayer leftovers)
-- Context: replan 2026-06-12 — no budget for prod aggregator fees; sandbox data
-- is fake (Plaid "First Platypus Bank"). The Money feature stays, fed by
-- CSV/OFX upload, WhatsApp capture, and mobile notification-listener purchases.
--
-- ORDERING CONTRACT: this migration MUST be applied to prod before (or with)
-- the deploy that deletes api/services/transactions/sandboxGuard.js. The guard
-- is the only thing hiding these fake rows from the /money page; deleting the
-- guard without this purge resurfaces them as real money (2026-06-10 incident).

-- 1. Purge aggregator-sourced transactions (all sandbox-fake by definition:
--    zero production aggregator connections ever existed).
--    transaction_emotional_context rows cascade (FK ON DELETE CASCADE).
DELETE FROM user_transactions
WHERE source IN (
  'pluggy_webhook', 'pluggy_sync',
  'plaid_webhook', 'plaid_sync', 'plaid_investments_sync'
);

-- 2. Retire all bank connections (Pluggy sandbox + TrueLayer disconnected).
--    Table and provider columns are kept inert for rollback safety; a later
--    cleanup migration may drop them after a soak period.
UPDATE user_bank_connections
SET deleted_at = NOW()
WHERE deleted_at IS NULL;

COMMENT ON TABLE user_bank_connections IS
  'RETIRED 2026-06-12: bank aggregators (Pluggy/Plaid/TrueLayer) removed. Rows soft-deleted, table kept for rollback safety. Do not write.';
