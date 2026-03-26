CREATE TABLE IF NOT EXISTS twin_fidelity_scores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  fidelity_score DOUBLE PRECISION NOT NULL,
  probe_count INTEGER NOT NULL,
  confidence DOUBLE PRECISION NOT NULL,
  probe_details JSONB,
  method TEXT NOT NULL DEFAULT 'behavioral_probe',
  measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_fidelity_scores_user ON twin_fidelity_scores(user_id, measured_at DESC);
ALTER TABLE twin_fidelity_scores ENABLE ROW LEVEL SECURITY;
-- RLS: backend uses supabaseAdmin (service role) which bypasses RLS.
-- No user-facing RLS policy needed since all access goes through authenticated API routes.
