-- replan-2026-06-10 Track D P0: sandbox render guard.
-- The live /money page rendered 644 Plaid SANDBOX transactions (ins_109508
-- "First Platypus Bank") as real money. The purge removes the rows; this flag
-- makes sandbox-era connections permanently identifiable so the read paths
-- (api/routes/transactions.js, plaid.js /holdings, pluggy.js /connections via
-- api/services/transactions/sandboxGuard.js) can refuse to render them when
-- the runtime is production-grade.

ALTER TABLE user_bank_connections
  ADD COLUMN IF NOT EXISTS is_sandbox BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: Plaid's canonical sandbox institutions only ever exist in sandbox.
UPDATE user_bank_connections
SET is_sandbox = TRUE
WHERE provider = 'plaid'
  AND plaid_institution_id IN (
    'ins_109508', 'ins_109509', 'ins_109510', 'ins_109511', 'ins_109512'
  );

COMMENT ON COLUMN user_bank_connections.is_sandbox IS
  'TRUE when the connection was created against a provider sandbox (Plaid PLAID_ENV=sandbox or a known sandbox institution id). Sandbox connections and their transactions are excluded from user-facing responses in production runtimes — see api/services/transactions/sandboxGuard.js.';
