-- DPO preference pairs for contrastive training
-- Stores chosen/rejected response pairs from personality reranker
CREATE TABLE IF NOT EXISTS preference_pairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  prompt_messages JSONB NOT NULL,
  chosen_response TEXT NOT NULL,
  rejected_response TEXT NOT NULL,
  chosen_similarity FLOAT,
  rejected_similarity FLOAT,
  similarity_gap FLOAT,
  source TEXT NOT NULL DEFAULT 'reranker',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_preference_pairs_user_id ON preference_pairs(user_id);
CREATE INDEX IF NOT EXISTS idx_preference_pairs_created_at ON preference_pairs(created_at DESC);

-- Add training_method to user_finetuned_models
ALTER TABLE user_finetuned_models ADD COLUMN IF NOT EXISTS training_method TEXT DEFAULT 'sft';
