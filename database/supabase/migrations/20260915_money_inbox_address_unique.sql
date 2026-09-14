-- The receipts address routes a stranger's email to an account: one address, one row.
CREATE UNIQUE INDEX IF NOT EXISTS money_facts_inbox_address_unique ON public.money_facts (value) WHERE kind = 'inbox_address';
