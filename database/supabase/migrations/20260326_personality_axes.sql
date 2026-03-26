CREATE TABLE IF NOT EXISTS personality_axes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  axis_index INTEGER NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  top_memory_ids UUID[] NOT NULL DEFAULT '{}',
  top_memory_contents TEXT[] NOT NULL DEFAULT '{}',
  mixing_vector DOUBLE PRECISION[] NOT NULL,
  variance_explained DOUBLE PRECISION,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, axis_index, generated_at)
);

CREATE INDEX IF NOT EXISTS idx_personality_axes_user ON personality_axes(user_id, generated_at DESC);
ALTER TABLE personality_axes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS personality_axes_cache (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  n_components INTEGER NOT NULL DEFAULT 20,
  n_memories_used INTEGER NOT NULL,
  total_variance_explained DOUBLE PRECISION,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE personality_axes_cache ENABLE ROW LEVEL SECURITY;
