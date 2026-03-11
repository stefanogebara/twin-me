-- Onboarding Calibration — stores deep interview results
-- Used by api/routes/onboarding-calibration.js

CREATE TABLE IF NOT EXISTS onboarding_calibration (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  enrichment_context   jsonb DEFAULT '{}'::jsonb,
  conversation_history jsonb DEFAULT '[]'::jsonb,
  insights             text[] DEFAULT '{}',
  archetype_hint       text,
  personality_summary  text,
  domain_progress      jsonb DEFAULT '{}'::jsonb,
  questions_asked      integer DEFAULT 0,
  completed_at         timestamptz,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now(),
  CONSTRAINT onboarding_calibration_user_id_key UNIQUE (user_id)
);

-- Index for fast lookup by user
CREATE INDEX IF NOT EXISTS idx_onboarding_calibration_user_id
  ON onboarding_calibration(user_id);

-- RLS
ALTER TABLE onboarding_calibration ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own calibration"
  ON onboarding_calibration FOR SELECT
  USING (user_id = auth.uid() OR user_id IN (SELECT id FROM public.users WHERE id = user_id));

CREATE POLICY "Users can insert own calibration"
  ON onboarding_calibration FOR INSERT
  WITH CHECK (user_id = auth.uid() OR user_id IN (SELECT id FROM public.users WHERE id = user_id));

CREATE POLICY "Users can update own calibration"
  ON onboarding_calibration FOR UPDATE
  USING (user_id = auth.uid() OR user_id IN (SELECT id FROM public.users WHERE id = user_id));

-- Service role bypass
CREATE POLICY "Service role full access"
  ON onboarding_calibration FOR ALL
  USING (auth.role() = 'service_role');
