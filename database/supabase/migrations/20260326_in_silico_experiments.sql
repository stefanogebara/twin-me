CREATE TABLE IF NOT EXISTS in_silico_experiments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  stimuli JSONB NOT NULL,
  predicted_rankings JSONB NOT NULL,
  actual_rankings JSONB,
  validation_rho DOUBLE PRECISION,
  validation_p DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  validated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_in_silico_user ON in_silico_experiments(user_id, created_at DESC);
ALTER TABLE in_silico_experiments ENABLE ROW LEVEL SECURITY;
