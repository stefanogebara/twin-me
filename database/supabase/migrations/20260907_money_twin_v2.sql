-- =============================================================================
-- Money Twin v2 — from zero (2026-09-07)
-- =============================================================================
-- Five nouns: sightings (what a channel saw, verbatim), the ledger (one row per
-- real transaction, reconciled from sightings), frames (one row per hour of the
-- person's life, derived buckets only), episodes (purchases that belong
-- together) and forecasts (this month, with a band). Readings live in
-- user_memories with domain 'money'. Nothing here references the April 2026
-- tables (user_transactions, transaction_emotional_context).
--
-- Spec: .claude/plans/2026-09-07-money-twin/README.md
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.money_accounts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider              TEXT NOT NULL,                 -- enablebanking | statement | phone
  provider_account_id   TEXT,                          -- aggregator's account uid
  name                  TEXT,                          -- "Santander Cuenta Online"
  iban_mask             TEXT,                          -- "ES** **** 1234"
  currency              TEXT NOT NULL DEFAULT 'EUR',
  consent_expires_at    TIMESTAMPTZ,                   -- PSD2: SCA again every 180 days
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, provider, provider_account_id)
);

CREATE TABLE IF NOT EXISTS public.money_transactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  account_id            UUID REFERENCES public.money_accounts(id) ON DELETE SET NULL,
  occurred_at           TIMESTAMPTZ NOT NULL,          -- the swipe, best known
  posted_at             TIMESTAMPTZ,                   -- the bank's booking date
  amount                NUMERIC(12,2) NOT NULL,        -- negative = out
  currency              TEXT NOT NULL DEFAULT 'EUR',
  merchant_raw          TEXT,
  merchant_key          TEXT NOT NULL,                 -- normalised, see ledger.js
  merchant_name         TEXT,
  category              TEXT,
  channel               TEXT,                          -- card | bizum | transfer | cash | direct_debit
  card_last4            TEXT,
  is_recurring          BOOLEAN NOT NULL DEFAULT FALSE,
  recurring_id          UUID,
  episode_id            UUID,
  verdict               TEXT CHECK (verdict IN ('worth_it', 'not_me')),
  verdict_at            TIMESTAMPTZ,
  primary_sighting_id   UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_money_tx_user_time ON public.money_transactions (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_money_tx_user_merchant ON public.money_transactions (user_id, merchant_key);

CREATE TABLE IF NOT EXISTS public.money_sightings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  account_id            UUID REFERENCES public.money_accounts(id) ON DELETE SET NULL,
  source                TEXT NOT NULL,                 -- phone | bizum | bankfeed | gmail | statement
  source_ref            TEXT,                          -- provider transaction id, message id, file hash + line
  seen_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_text              TEXT,                          -- the notification, verbatim
  raw_json              JSONB,                         -- the feed row, verbatim
  amount                NUMERIC(12,2),
  currency              TEXT,
  direction             TEXT CHECK (direction IN ('out', 'in')),
  merchant_raw          TEXT,
  merchant_key          TEXT,
  occurred_at           TIMESTAMPTZ,
  card_last4            TEXT,
  parse_confidence      NUMERIC(3,2),                  -- 1.00 bankfeed, 0.85 phone, 0.60 gmail
  transaction_id        UUID REFERENCES public.money_transactions(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS money_sightings_source_ref_key ON public.money_sightings (user_id, source, source_ref) WHERE source_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_money_sightings_user_time ON public.money_sightings (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_money_sightings_unlinked ON public.money_sightings (user_id) WHERE transaction_id IS NULL;

CREATE TABLE IF NOT EXISTS public.money_merchants (
  merchant_key          TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  category              TEXT,
  platform              TEXT,                          -- spotify | youtube | github | whoop | apple ... for subscriptions-against-use
  source                TEXT NOT NULL DEFAULT 'rule',  -- rule | llm | user
  hits                  INTEGER NOT NULL DEFAULT 0,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.money_recurring (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  merchant_key          TEXT NOT NULL,
  cadence               TEXT NOT NULL,                 -- weekly | monthly | quarterly | yearly
  typical_amount        NUMERIC(12,2) NOT NULL,
  occurrences           INTEGER NOT NULL,
  first_seen            TIMESTAMPTZ NOT NULL,
  last_seen             TIMESTAMPTZ NOT NULL,
  next_expected         DATE,
  is_subscription       BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, merchant_key)
);

CREATE TABLE IF NOT EXISTS public.money_frames (
  user_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  frame_start           TIMESTAMPTZ NOT NULL,
  frame_hours           SMALLINT NOT NULL DEFAULT 1,
  recovery_bucket       TEXT CHECK (recovery_bucket IN ('low', 'mid', 'high')),
  sleep_bucket          TEXT CHECK (sleep_bucket IN ('short', 'usual', 'long')),
  strain_bucket         TEXT CHECK (strain_bucket IN ('low', 'mid', 'high')),
  calendar_load         SMALLINT,
  work_intensity        SMALLINT,
  music_valence         NUMERIC(3,2),
  place_class           TEXT,                          -- home | work | travel | out | transit
  payday_distance       SMALLINT,
  weekday               SMALLINT NOT NULL,
  hour                  SMALLINT NOT NULL,
  PRIMARY KEY (user_id, frame_start)
);

CREATE TABLE IF NOT EXISTS public.money_episodes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  started_at            TIMESTAMPTZ NOT NULL,
  ended_at              TIMESTAMPTZ NOT NULL,
  total                 NUMERIC(12,2) NOT NULL,
  transaction_count     INTEGER NOT NULL,
  place_class           TEXT,
  frame_start           TIMESTAMPTZ,
  verdict               TEXT CHECK (verdict IN ('worth_it', 'not_me')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.money_forecasts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  as_of                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  month                 DATE NOT NULL,                 -- first day of the month
  spent                 NUMERIC(12,2) NOT NULL,
  committed             NUMERIC(12,2) NOT NULL,
  projected_p10         NUMERIC(12,2) NOT NULL,
  projected_p50         NUMERIC(12,2) NOT NULL,
  projected_p90         NUMERIC(12,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_money_forecasts_user ON public.money_forecasts (user_id, as_of DESC);

-- RLS: owners read their own rows; the service role does the writing.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['money_accounts','money_transactions','money_sightings','money_recurring','money_frames','money_episodes','money_forecasts'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select_own ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_select_own ON public.%I FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_service_all ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_service_all ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;
ALTER TABLE public.money_merchants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS money_merchants_read ON public.money_merchants;
CREATE POLICY money_merchants_read ON public.money_merchants FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS money_merchants_service_all ON public.money_merchants;
CREATE POLICY money_merchants_service_all ON public.money_merchants FOR ALL TO service_role USING (true) WITH CHECK (true);
