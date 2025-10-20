-- Migration: Add status column to platform_connections
-- Date: 2025-01-20
-- Purpose: Add missing status column for OAuth connection state management

-- Step 1: Add status column with CHECK constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'platform_connections'
    AND column_name = 'status'
  ) THEN
    ALTER TABLE public.platform_connections
    ADD COLUMN status TEXT DEFAULT 'connected'
    CHECK (status IN ('connected', 'token_expired', 'needs_reauth', 'disconnected', 'error'));

    COMMENT ON COLUMN public.platform_connections.status IS
      'OAuth connection status: connected, token_expired, needs_reauth, disconnected, error';
  END IF;
END $$;

-- Step 2: Add platform_user_id column for storing the user's ID on the platform
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'platform_connections'
    AND column_name = 'platform_user_id'
  ) THEN
    ALTER TABLE public.platform_connections
    ADD COLUMN platform_user_id TEXT;

    COMMENT ON COLUMN public.platform_connections.platform_user_id IS
      'User ID on the external platform (e.g., Spotify user ID, Discord user ID)';
  END IF;
END $$;

-- Step 3: Add metadata column for storing platform-specific data
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'platform_connections'
    AND column_name = 'metadata'
  ) THEN
    ALTER TABLE public.platform_connections
    ADD COLUMN metadata JSONB DEFAULT '{}';

    COMMENT ON COLUMN public.platform_connections.metadata IS
      'Platform-specific metadata (username, email, profile info, scopes, etc.)';
  END IF;
END $$;

-- Step 4: Create index on status for efficient filtering
CREATE INDEX IF NOT EXISTS idx_platform_connections_status
ON public.platform_connections(status)
WHERE status IN ('connected', 'token_expired');

-- Step 5: Create index on user_id and platform for efficient lookups
CREATE INDEX IF NOT EXISTS idx_platform_connections_user_platform
ON public.platform_connections(user_id, platform);

-- Step 6: Update existing rows to set status to 'connected' if is_active is true
UPDATE public.platform_connections
SET status = CASE
  WHEN is_active = true THEN 'connected'
  WHEN is_active = false THEN 'disconnected'
  ELSE 'connected'
END
WHERE status IS NULL;

-- Verify the migration
SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'platform_connections'
AND column_name IN ('status', 'platform_user_id', 'metadata')
ORDER BY ordinal_position;
