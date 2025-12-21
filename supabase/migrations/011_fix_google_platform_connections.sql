-- =========================================================================
-- Fix Google Platform Connection Issue
-- =========================================================================
-- This migration adds 'google' as a valid platform option to support
-- Google OAuth connections that handle multiple Google services
-- (Gmail, Calendar, Drive, etc.) with a single OAuth flow
-- =========================================================================

-- Drop the existing CHECK constraint
ALTER TABLE platform_connections
DROP CONSTRAINT IF EXISTS platform_connections_platform_check;

-- Add new CHECK constraint that includes 'google' (already present in original migration)
ALTER TABLE platform_connections
ADD CONSTRAINT platform_connections_platform_check CHECK (platform IN (
    'spotify', 'discord', 'github', 'youtube', 'netflix', 'reddit',
    'google', 'google_gmail', 'google_calendar', 'linkedin', 'slack', 'twitch',
    'steam', 'goodreads', 'tiktok', 'instagram', 'apple_music',
    'hbo', 'prime_video', 'disney_plus', 'microsoft_teams'
));

-- Update the refresh_token constraint to include 'google'
ALTER TABLE platform_connections
DROP CONSTRAINT IF EXISTS platform_connections_refresh_token_check;

ALTER TABLE platform_connections
ADD CONSTRAINT platform_connections_refresh_token_check CHECK (
    (platform IN ('spotify', 'discord', 'youtube', 'google', 'google_gmail', 'google_calendar') AND refresh_token IS NOT NULL) OR
    (platform NOT IN ('spotify', 'discord', 'youtube', 'google', 'google_gmail', 'google_calendar'))
);

-- =========================================================================
-- Migration Complete
-- =========================================================================

DO $$
BEGIN
  RAISE NOTICE 'Migration 011: Added google to platform_connections CHECK constraint';
  RAISE NOTICE 'Google OAuth connections can now be stored with platform=google';
END $$;