-- =============================================================================
-- Money: which bank an account belongs to (2026-09-14)
-- =============================================================================
-- Santander was the only bank, so the rows never said. With Revolut connectable
-- through the same aggregator, each account row keeps the bank's name as the
-- aggregator returns it with the session; rows from before read as Santander.
-- Code: saveBankAccounts in api/services/money/store.js.
-- =============================================================================
ALTER TABLE public.money_accounts ADD COLUMN IF NOT EXISTS bank_name TEXT;
