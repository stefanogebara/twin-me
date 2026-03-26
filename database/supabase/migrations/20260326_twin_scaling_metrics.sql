CREATE TABLE IF NOT EXISTS twin_scaling_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  platform_count INTEGER NOT NULL,
  memory_count INTEGER NOT NULL,
  memory_types JSONB NOT NULL DEFAULT '{}',
  connected_platforms TEXT[] NOT NULL DEFAULT '{}',
  twin_quality_score DOUBLE PRECISION,
  retrieval_score DOUBLE PRECISION,
  chat_score DOUBLE PRECISION,
  readiness_score INTEGER,
  fit_a DOUBLE PRECISION,
  fit_b DOUBLE PRECISION,
  fit_r2 DOUBLE PRECISION,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_scaling_metrics_user ON twin_scaling_metrics(user_id, measured_at DESC);
ALTER TABLE twin_scaling_metrics ENABLE ROW LEVEL SECURITY;
-- RLS: backend uses supabaseAdmin (service role) which bypasses RLS.
-- No user-facing RLS policy needed since all access goes through authenticated API routes.
