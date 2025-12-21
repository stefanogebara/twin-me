-- =========================================================================
-- OAuth States Table for CSRF Protection and PKCE
-- =========================================================================
-- This table stores OAuth state parameters for CSRF protection and PKCE
-- (Proof Key for Code Exchange) code verifiers. States are single-use and
-- expire after 10 minutes per OAuth 2.0 specification.
--
-- Security:
-- - State parameters prevent CSRF attacks
-- - PKCE code verifiers prevent authorization code interception
-- - Automatic expiration prevents replay attacks
-- - Used flag prevents authorization code reuse
-- =========================================================================

-- Drop existing table if it exists
DROP TABLE IF EXISTS oauth_states CASCADE;

-- Create oauth_states table
CREATE TABLE oauth_states (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- State parameter (unique, cryptographically random)
  state TEXT UNIQUE NOT NULL CHECK (length(state) >= 32),

  -- PKCE code verifier (encrypted, 43-128 characters base64url)
  code_verifier TEXT CHECK (code_verifier IS NULL OR length(code_verifier) >= 32),

  -- Additional data (userId, platform, timestamp, etc.)
  data JSONB DEFAULT '{}',

  -- Expiration and usage tracking
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  used BOOLEAN DEFAULT FALSE,
  used_at TIMESTAMP WITH TIME ZONE,

  -- Ensure states expire within 10 minutes (per OAuth 2.0 spec)
  CONSTRAINT oauth_states_expiry_check CHECK (expires_at <= created_at + INTERVAL '10 minutes'),

  -- Ensure used_at is only set when used is true
  CONSTRAINT oauth_states_used_at_check CHECK ((used = TRUE AND used_at IS NOT NULL) OR (used = FALSE AND used_at IS NULL))
);

-- Indexes for performance
CREATE INDEX idx_oauth_states_state ON oauth_states(state);
CREATE INDEX idx_oauth_states_expires_at ON oauth_states(expires_at);
CREATE INDEX idx_oauth_states_used ON oauth_states(used);
CREATE INDEX idx_oauth_states_created_at ON oauth_states(created_at);

-- =========================================================================
-- Automatic Cleanup Function
-- =========================================================================
-- This function removes expired OAuth states to prevent table bloat.
-- Should be called periodically (recommended: every 15 minutes).
-- =========================================================================

CREATE OR REPLACE FUNCTION cleanup_expired_oauth_states()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM oauth_states
  WHERE expires_at < NOW()
  RETURNING * INTO deleted_count;

  RETURN COALESCE(deleted_count, 0);
END;
$$ LANGUAGE plpgsql;

-- Comment for documentation
COMMENT ON FUNCTION cleanup_expired_oauth_states() IS
  'Removes expired OAuth states. Run periodically (every 15 minutes) via cron job or background worker.';

-- =========================================================================
-- Row Level Security (RLS) Policies
-- =========================================================================
-- OAuth states are backend-only and should NOT be accessible from frontend.
-- All RLS policies deny access to prevent unauthorized state manipulation.
-- =========================================================================

ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;

-- Deny all frontend access (oauth_states are server-side only)
CREATE POLICY "oauth_states_deny_all" ON oauth_states
  FOR ALL USING (FALSE);

-- Comment for security documentation
COMMENT ON TABLE oauth_states IS
  'OAuth state parameters for CSRF protection and PKCE. Server-side only - no frontend access allowed via RLS.';

-- =========================================================================
-- Helper Function: Mark State as Used
-- =========================================================================
-- Atomically marks an OAuth state as used and returns the state data.
-- Returns NULL if state doesn't exist, is already used, or is expired.
-- =========================================================================

CREATE OR REPLACE FUNCTION mark_oauth_state_as_used(state_param TEXT)
RETURNS JSONB AS $$
DECLARE
  state_record oauth_states%ROWTYPE;
BEGIN
  -- Atomically update and retrieve state (prevents race conditions)
  UPDATE oauth_states
  SET
    used = TRUE,
    used_at = NOW()
  WHERE
    state = state_param
    AND used = FALSE  -- Only update if not already used
    AND expires_at > NOW()  -- Only update if not expired
  RETURNING * INTO state_record;

  -- Return NULL if state not found, already used, or expired
  IF state_record.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Return state data including code_verifier
  RETURN jsonb_build_object(
    'id', state_record.id,
    'state', state_record.state,
    'code_verifier', state_record.code_verifier,
    'data', state_record.data,
    'created_at', state_record.created_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comment for documentation
COMMENT ON FUNCTION mark_oauth_state_as_used(TEXT) IS
  'Atomically marks OAuth state as used. Returns state data on success, NULL if already used/expired. Prevents authorization code reuse attacks.';

-- =========================================================================
-- Migration Complete
-- =========================================================================

-- Log successful migration
DO $$
BEGIN
  RAISE NOTICE 'Migration 009: oauth_states table created successfully';
  RAISE NOTICE 'IMPORTANT: Set up cron job to call cleanup_expired_oauth_states() every 15 minutes';
  RAISE NOTICE 'Example: SELECT cron.schedule(''cleanup-oauth-states'', ''*/15 * * * *'', ''SELECT cleanup_expired_oauth_states()'')';
END $$;
