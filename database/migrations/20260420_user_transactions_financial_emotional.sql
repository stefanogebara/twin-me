-- Financial-Emotional Twin (Phase 2A) — Bank transactions + emotional context
-- ===========================================================================
-- Pivot 2026-04-20: store user bank transactions imported from CSV/OFX uploads,
-- and a per-transaction emotional-context row linking each purchase to the
-- user's HRV, music valence, calendar load, sleep, and message tone at that
-- moment (+/- 2h window around transaction_date).
-- Idempotent: safe to re-run.
-- Applied to Supabase 2026-04-20 via MCP apply_migration.

CREATE TABLE IF NOT EXISTS user_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  external_id TEXT,                                 -- FITID from OFX or CSV row hash
  amount NUMERIC(14, 2) NOT NULL,                   -- negative = outflow, positive = income
  currency TEXT NOT NULL DEFAULT 'BRL',
  merchant_raw TEXT NOT NULL,                       -- original description from statement
  merchant_normalized TEXT,                         -- cleaned merchant name (lowercase, trimmed)
  category TEXT,                                    -- inferred category (food, transport, shopping, health, ...)
  transaction_date TIMESTAMPTZ NOT NULL,
  source_bank TEXT,                                 -- 'nubank' | 'itau' | 'bradesco' | 'santander' | 'bb' | 'caixa' | 'other'
  source_file_hash TEXT,                            -- sha256 of uploaded file — detects reimports
  account_type TEXT NOT NULL DEFAULT 'checking',    -- 'checking' | 'credit_card' | 'savings'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_user_transactions_date
  ON user_transactions(user_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_user_transactions_category
  ON user_transactions(user_id, category);
CREATE INDEX IF NOT EXISTS idx_user_transactions_merchant
  ON user_transactions(user_id, merchant_normalized);

COMMENT ON TABLE user_transactions IS
  'User bank transactions imported from CSV/OFX uploads. Negative amount = outflow. Deduplicated by (user_id, external_id).';

-- Emotional context at moment of purchase (+/- 2h window signals)
CREATE TABLE IF NOT EXISTS transaction_emotional_context (
  transaction_id UUID PRIMARY KEY REFERENCES user_transactions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- Biology
  hrv_score NUMERIC,                 -- Whoop/Oura/Garmin HRV at nearest signal (ms or normalized)
  recovery_score NUMERIC,            -- Whoop recovery % (0-100) from same morning
  sleep_score NUMERIC,               -- Sleep quality 0-100 from previous night
  strain_score NUMERIC,              -- Whoop strain at time of purchase

  -- Mood
  music_valence NUMERIC,             -- Spotify valence 0-1 nearest to transaction (1 = happy)
  music_energy NUMERIC,              -- Spotify energy 0-1

  -- Load
  calendar_load INTEGER,             -- Count of calendar events within +/- 2h
  message_tone NUMERIC,              -- Sentiment -1 to +1 from recent comms

  -- Composite
  computed_stress_score NUMERIC,     -- 0-1 derived stress at moment of purchase
  is_stress_shop_candidate BOOLEAN,  -- true if computed_stress_score > 0.6 AND purchase is discretionary

  -- Quality
  signals_found INTEGER NOT NULL DEFAULT 0,   -- how many signal categories contributed
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tx_emo_user
  ON transaction_emotional_context(user_id);
CREATE INDEX IF NOT EXISTS idx_tx_emo_stress
  ON transaction_emotional_context(user_id, is_stress_shop_candidate) WHERE is_stress_shop_candidate = true;

COMMENT ON TABLE transaction_emotional_context IS
  'Per-transaction emotional fingerprint: biology (HRV/recovery/sleep) + mood (music) + load (calendar/tone) captured from user_platform_data within +/- 2h of transaction_date.';

-- Enable RLS (service role via API writes; users can read their own rows)
ALTER TABLE user_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_emotional_context ENABLE ROW LEVEL SECURITY;

-- Policies: user can read their own rows
DROP POLICY IF EXISTS user_transactions_select_own ON user_transactions;
CREATE POLICY user_transactions_select_own ON user_transactions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS tx_emo_select_own ON transaction_emotional_context;
CREATE POLICY tx_emo_select_own ON transaction_emotional_context
  FOR SELECT USING (auth.uid() = user_id);

-- Service role has full access (API inserts on behalf of users)
DROP POLICY IF EXISTS user_transactions_service_all ON user_transactions;
CREATE POLICY user_transactions_service_all ON user_transactions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tx_emo_service_all ON transaction_emotional_context;
CREATE POLICY tx_emo_service_all ON transaction_emotional_context
  FOR ALL TO service_role USING (true) WITH CHECK (true);
