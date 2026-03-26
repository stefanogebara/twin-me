CREATE TABLE IF NOT EXISTS multimodal_profiles (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  spotify_features DOUBLE PRECISION[] NOT NULL DEFAULT '{}',
  whoop_features DOUBLE PRECISION[] NOT NULL DEFAULT '{}',
  calendar_features DOUBLE PRECISION[] NOT NULL DEFAULT '{}',
  youtube_features DOUBLE PRECISION[] NOT NULL DEFAULT '{}',
  fused_vector DOUBLE PRECISION[] NOT NULL DEFAULT '{}',
  modality_count INTEGER NOT NULL DEFAULT 0,
  modalities_present TEXT[] NOT NULL DEFAULT '{}',
  feature_names JSONB NOT NULL DEFAULT '{}',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE multimodal_profiles ENABLE ROW LEVEL SECURITY;
