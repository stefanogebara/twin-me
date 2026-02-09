-- Create table to store Nango connection ID mappings per user
CREATE TABLE IF NOT EXISTS nango_connection_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL,
  nango_connection_id VARCHAR(100) NOT NULL,
  provider_config_key VARCHAR(50) NOT NULL,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'active',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, platform)
);

-- Index for fast lookups
CREATE INDEX idx_connection_mappings_user_platform
ON nango_connection_mappings(user_id, platform);

-- RLS policies
ALTER TABLE nango_connection_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own connections" ON nango_connection_mappings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own connections" ON nango_connection_mappings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own connections" ON nango_connection_mappings
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own connections" ON nango_connection_mappings
  FOR DELETE USING (auth.uid() = user_id);
