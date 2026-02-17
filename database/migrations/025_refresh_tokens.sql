-- Add refresh token hash column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS refresh_token_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_users_refresh_token ON users (refresh_token_hash) WHERE refresh_token_hash IS NOT NULL;
