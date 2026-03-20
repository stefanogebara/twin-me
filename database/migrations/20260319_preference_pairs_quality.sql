-- Extend preference_pairs and user_finetuned_models for DPO Phase 1
-- Adds quality scoring, user validation, and training usage tracking

ALTER TABLE preference_pairs ADD COLUMN IF NOT EXISTS source_detail TEXT;
ALTER TABLE preference_pairs ADD COLUMN IF NOT EXISTS quality_score FLOAT DEFAULT 0.5;
ALTER TABLE preference_pairs ADD COLUMN IF NOT EXISTS user_validated BOOLEAN DEFAULT false;
ALTER TABLE preference_pairs ADD COLUMN IF NOT EXISTS used_in_training BOOLEAN DEFAULT false;

ALTER TABLE user_finetuned_models ADD COLUMN IF NOT EXISTS sft_model_id TEXT;
