-- Migration: Add API Keys table for MCP Server authentication
-- This table stores hashed API keys for secure authentication from external clients

-- Create api_keys table
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(100) DEFAULT 'API Key',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  last_used_at TIMESTAMP WITH TIME ZONE,

  -- Indexes for common queries
  CONSTRAINT api_keys_key_hash_unique UNIQUE (key_hash)
);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);

-- Index for key validation
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash) WHERE is_active = true;

-- Row Level Security
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Users can only see their own API keys
CREATE POLICY "Users can view their own API keys"
  ON api_keys FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own API keys
CREATE POLICY "Users can create their own API keys"
  ON api_keys FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own API keys (deactivate, rename)
CREATE POLICY "Users can update their own API keys"
  ON api_keys FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own API keys
CREATE POLICY "Users can delete their own API keys"
  ON api_keys FOR DELETE
  USING (auth.uid() = user_id);

-- Service role can access all keys (for validation)
CREATE POLICY "Service role can access all API keys"
  ON api_keys FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Comment for documentation
COMMENT ON TABLE api_keys IS 'Stores hashed API keys for MCP server authentication. Keys are never stored in plain text.';
COMMENT ON COLUMN api_keys.key_hash IS 'SHA-256 hash of the API key. Key format: twm_<base64url>';
COMMENT ON COLUMN api_keys.is_active IS 'Whether the key is currently active. Deactivated keys cannot authenticate.';
COMMENT ON COLUMN api_keys.expires_at IS 'Optional expiration date. Null means no expiration.';
COMMENT ON COLUMN api_keys.last_used_at IS 'Timestamp of last successful authentication with this key.';
