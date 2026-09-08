-- Money Twin v2, second migration: what the ledger says, and how often the bank was asked.
--
-- 1. money_feed_accesses — PSD2 allows four unattended reads of a consent per 24 hours.
--    Santander answers 429 [HUB046] past that, and the app had no idea it was spending a
--    budget: three manual pulls on the first day used it up. Every read is recorded here
--    so the store can refuse a read it does not have left, and the page can say how many
--    remain.
--
-- 2. money_readings — a sentence about the person's money with the transactions behind it.
--    Findings are computed deterministically (api/services/money/analyst.js); the row keeps
--    the sentence, the numbers it rests on, the receipt ids, and the person's verdict.
--    `kind` is stable so a finding can be recomputed and compared, never duplicated.

CREATE TABLE IF NOT EXISTS public.money_feed_accesses (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  account_id            UUID REFERENCES public.money_accounts(id) ON DELETE CASCADE,
  at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attended              BOOLEAN NOT NULL DEFAULT FALSE,   -- the person was present (SCA), so it is outside the budget
  rows_seen             INTEGER,
  outcome               TEXT                               -- ok | rate_limited | error
);
CREATE INDEX IF NOT EXISTS idx_money_feed_accesses_window ON public.money_feed_accesses (user_id, at DESC);

CREATE TABLE IF NOT EXISTS public.money_readings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind                  TEXT NOT NULL,                     -- month_pace | subscriptions | small_payments | biggest_line | new_merchant | dormant_charge | weekday_shape
  month                 DATE,                              -- the month it speaks about, when it speaks about one
  sentence              TEXT NOT NULL,                     -- one sentence, in the person's words
  detail                TEXT,                              -- a second sentence, optional
  numbers               JSONB NOT NULL DEFAULT '{}'::jsonb,-- what the sentence rests on
  receipt_ids           UUID[] NOT NULL DEFAULT '{}',      -- money_transactions behind it
  evidence_count        INTEGER NOT NULL DEFAULT 0,
  verdict               TEXT CHECK (verdict IN ('true', 'not_me')),
  verdict_at            TIMESTAMPTZ,
  computed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, kind, month)
);
CREATE INDEX IF NOT EXISTS idx_money_readings_user ON public.money_readings (user_id, computed_at DESC);

ALTER TABLE public.money_feed_accesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.money_readings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'money_feed_accesses' AND policyname = 'own feed accesses') THEN
    CREATE POLICY "own feed accesses" ON public.money_feed_accesses FOR ALL USING (auth.uid() IS NOT NULL AND user_id::text = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'money_readings' AND policyname = 'own readings') THEN
    CREATE POLICY "own readings" ON public.money_readings FOR ALL USING (auth.uid() IS NOT NULL AND user_id::text = auth.uid()::text);
  END IF;
END $$;
