-- Soul Signature Layers: 5-layer personality portrait cache
-- Stores the generated Values, Rhythms, Taste, Connections, Growth Edges
-- layers as JSONB with a 12-hour TTL managed by the application layer.

CREATE TABLE IF NOT EXISTS soul_signature_layers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  layers JSONB NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Index for fast lookup by user
CREATE INDEX IF NOT EXISTS idx_soul_signature_layers_user_id
  ON soul_signature_layers(user_id);

-- Enable RLS (bypassed by service role key)
ALTER TABLE soul_signature_layers ENABLE ROW LEVEL SECURITY;

-- Policy: users can read their own signature layers
CREATE POLICY "Users can read own soul signature layers"
  ON soul_signature_layers FOR SELECT
  USING (auth.uid() = user_id);
