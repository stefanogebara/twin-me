-- User finetuned models tracking table
-- Stores per-user finetuning job status and model IDs

CREATE TABLE IF NOT EXISTS public.user_finetuned_models (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'together',
  base_model TEXT NOT NULL,
  model_id TEXT,            -- Provider's model ID after training completes
  job_id TEXT,              -- Provider's finetuning job ID
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'ready', 'failed', 'cancelled')),
  training_examples INTEGER,
  training_cost_usd NUMERIC(6,4),
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'
);

-- One model per user per provider
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_finetuned_model
  ON public.user_finetuned_models(user_id, provider);

-- Quick lookup for ready models
CREATE INDEX IF NOT EXISTS idx_user_finetuned_ready
  ON public.user_finetuned_models(user_id, status)
  WHERE status = 'ready';
