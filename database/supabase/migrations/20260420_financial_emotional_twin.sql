-- =============================================================================
-- Financial-Emotional Twin — Phase 2A schema
-- =============================================================================
-- Backing tables for the Money vertical: bank-statement ingestion + emotional
-- fingerprinting at moment of purchase. Referenced by:
--   - api/routes/transactions.js
--   - api/services/transactions/* (parsers, tagger, financial chat context)
--   - api/services/financialWeeklyReportService.js
--   - api/routes/cron-financial-weekly-report.js
--
-- Tables already exist in production (applied via SQL editor during dev).
-- This migration is idempotent — safe to run on fresh environments and no-op
-- on live. RLS policies intentionally mirror the live schema.
--
-- NOTE on RLS: the SELECT policies target role `public` (= authenticated+anon)
-- to match the live schema. anon cannot actually call PostgREST without a JWT,
-- so effective access is authenticated-only. Hardening to `authenticated` only
-- is a follow-up if needed.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. user_transactions — one row per bank statement transaction
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_transactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  external_id           TEXT,                         -- parser-assigned dedup key
  amount                NUMERIC NOT NULL,             -- negative = outflow
  currency              TEXT NOT NULL DEFAULT 'BRL',
  merchant_raw          TEXT NOT NULL,                -- as appears on statement
  merchant_normalized   TEXT,                         -- canonical brand (via merchantNormalizer)
  category              TEXT,                         -- food_delivery | transport | shopping | ...
  transaction_date      TIMESTAMPTZ NOT NULL,
  source_bank           TEXT,                         -- 'nubank' | 'itau' | ...
  source_file_hash      TEXT,                         -- SHA of uploaded file for audit
  account_type          TEXT NOT NULL DEFAULT 'checking',  -- 'checking' | 'credit'
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dedup: same external id per user is a reimport, not a duplicate transaction.
CREATE UNIQUE INDEX IF NOT EXISTS user_transactions_user_id_external_id_key
  ON public.user_transactions (user_id, external_id);

-- Hot indexes for list + category filters
CREATE INDEX IF NOT EXISTS idx_user_transactions_date
  ON public.user_transactions (user_id, transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_user_transactions_category
  ON public.user_transactions (user_id, category);

CREATE INDEX IF NOT EXISTS idx_user_transactions_merchant
  ON public.user_transactions (user_id, merchant_normalized);

ALTER TABLE public.user_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_transactions_select_own ON public.user_transactions;
CREATE POLICY user_transactions_select_own
  ON public.user_transactions
  FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS user_transactions_service_all ON public.user_transactions;
CREATE POLICY user_transactions_service_all
  ON public.user_transactions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 2. transaction_emotional_context — 1-to-1 emotional fingerprint per tx
-- -----------------------------------------------------------------------------
-- Computed by api/services/transactions/transactionEmotionTagger.js after each
-- upload. Joins HRV (Whoop/Oura/Garmin/Fitbit), music valence (Spotify),
-- calendar load (Google Calendar) at +/- 2h window around transaction_date.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transaction_emotional_context (
  transaction_id            UUID PRIMARY KEY REFERENCES public.user_transactions(id) ON DELETE CASCADE,
  user_id                   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  hrv_score                 NUMERIC,      -- milliseconds (RMSSD)
  recovery_score            NUMERIC,      -- 0-100 (Whoop/Oura)
  sleep_score               NUMERIC,      -- 0-100
  strain_score              NUMERIC,      -- 0-21 (Whoop)
  music_valence             NUMERIC,      -- 0-1 (mood — happy=1)
  music_energy              NUMERIC,      -- 0-1
  calendar_load             INT,          -- count of overlapping events
  message_tone              NUMERIC,      -- Phase 2B: mined from Gmail/WhatsApp (reserved)
  computed_stress_score     NUMERIC,      -- 0-1 composite (weighted biology+calendar+music)
  is_stress_shop_candidate  BOOLEAN,      -- outflow + stress>=0.6 + $20-$2000
  signals_found             INT NOT NULL DEFAULT 0,
  computed_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tx_emo_user
  ON public.transaction_emotional_context (user_id);

-- Partial index for the weekly report stress-shop query
CREATE INDEX IF NOT EXISTS idx_tx_emo_stress
  ON public.transaction_emotional_context (user_id, is_stress_shop_candidate)
  WHERE is_stress_shop_candidate = true;

ALTER TABLE public.transaction_emotional_context ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tx_emo_select_own ON public.transaction_emotional_context;
CREATE POLICY tx_emo_select_own
  ON public.transaction_emotional_context
  FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS tx_emo_service_all ON public.transaction_emotional_context;
CREATE POLICY tx_emo_service_all
  ON public.transaction_emotional_context
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 3. Defense-in-depth: lock down any future direct client access to the
--    underlying columns. Backend uses service_role which bypasses these.
-- -----------------------------------------------------------------------------
-- (No column-level revokes here — the RLS above is sufficient, and column
-- revokes would break the JSON PostgREST select syntax used in routes.)
