-- DPO Contrastive Training: preference pairs collected from personality reranker
-- Each pair records a chosen (best) and rejected (worst) candidate with similarity scores

CREATE TABLE IF NOT EXISTS preference_pairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  prompt_messages JSONB NOT NULL,
  chosen_response TEXT NOT NULL,
  rejected_response TEXT NOT NULL,
  chosen_similarity REAL NOT NULL,
  rejected_similarity REAL NOT NULL,
  similarity_gap REAL NOT NULL,
  source TEXT NOT NULL DEFAULT 'reranker',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_preference_pairs_user_created
  ON preference_pairs (user_id, created_at DESC);

-- Add training_method column to existing finetuned models table
ALTER TABLE user_finetuned_models
  ADD COLUMN IF NOT EXISTS training_method TEXT DEFAULT 'sft';

-- RLS
ALTER TABLE preference_pairs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on preference_pairs"
  ON preference_pairs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
