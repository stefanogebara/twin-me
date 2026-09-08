-- Money Twin v2, fourth migration: what the ledger has learned, remembered.
--
-- The system no longer learns about a person by joining money to other connected
-- platforms. Money teaches it everything by itself: which places, which prices, which
-- days, which rhythms, and what is normal for this person. That knowledge has to persist,
-- because a pattern is only worth anything once it has been seen before.
--
-- `money_merchant_profiles` is one row per person per merchant: the median price rather
-- than the mean (one 116 EUR purchase must not move a coffee's typical price), the spread,
-- the usual weekday, the usual gap between visits, and whether the next visit is overdue.
-- It is recomputed from the ledger, so it is derived and disposable — delete it and the
-- next pull rebuilds it.
--
-- `money_predictions` is what the ledger expects next, dated, so that a prediction can be
-- checked against what actually happened rather than quietly forgotten. A forecast nobody
-- scores is a forecast nobody should trust.

CREATE TABLE IF NOT EXISTS public.money_merchant_profiles (
  user_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  merchant_key          TEXT NOT NULL,
  name                  TEXT,
  city                  TEXT,
  category              TEXT,
  channel               TEXT,
  times                 INTEGER NOT NULL DEFAULT 0,
  first_seen            TIMESTAMPTZ,
  last_seen             TIMESTAMPTZ,
  total                 NUMERIC(12,2) NOT NULL DEFAULT 0,
  typical_amount        NUMERIC(12,2),                 -- the median
  amount_low            NUMERIC(12,2),
  amount_high           NUMERIC(12,2),
  amount_is_fixed       BOOLEAN NOT NULL DEFAULT FALSE,-- a subscription-shaped price
  weekday_counts        JSONB,                         -- [sun..sat]
  usual_weekday         SMALLINT,                      -- null unless one day holds the majority
  usual_day_of_month    SMALLINT,
  median_gap_days       NUMERIC(6,2),
  cadence               TEXT,
  days_since_last       INTEGER,
  is_overdue            BOOLEAN NOT NULL DEFAULT FALSE,
  learned_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, merchant_key)
);
CREATE INDEX IF NOT EXISTS idx_money_profiles_total ON public.money_merchant_profiles (user_id, total DESC);

CREATE TABLE IF NOT EXISTS public.money_predictions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  merchant_key          TEXT NOT NULL,
  name                  TEXT,
  expected_on           DATE NOT NULL,
  typical_amount        NUMERIC(12,2),
  confidence            NUMERIC(3,2),
  made_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Scored later against the ledger: did it happen, when, for how much.
  happened              BOOLEAN,
  happened_on           DATE,
  happened_amount       NUMERIC(12,2),
  scored_at             TIMESTAMPTZ,
  UNIQUE (user_id, merchant_key, expected_on)
);
CREATE INDEX IF NOT EXISTS idx_money_predictions_open ON public.money_predictions (user_id, expected_on) WHERE happened IS NULL;

ALTER TABLE public.money_merchant_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.money_predictions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'money_merchant_profiles' AND policyname = 'own merchant profiles') THEN
    CREATE POLICY "own merchant profiles" ON public.money_merchant_profiles FOR ALL USING (auth.uid() IS NOT NULL AND user_id::text = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'money_predictions' AND policyname = 'own predictions') THEN
    CREATE POLICY "own predictions" ON public.money_predictions FOR ALL USING (auth.uid() IS NOT NULL AND user_id::text = auth.uid()::text);
  END IF;
END $$;
