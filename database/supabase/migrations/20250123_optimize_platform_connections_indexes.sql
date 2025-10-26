-- Migration: Optimize platform_connections table indexes
-- Created: 2025-01-23
-- Purpose: Add composite indexes for faster queries on token expiration and platform lookups

-- Drop existing single-column indexes if they exist (will be replaced by composite indexes)
DROP INDEX IF EXISTS idx_platform_connections_user_platform;
DROP INDEX IF EXISTS idx_platform_connections_token_expiry;

-- Create composite index for user + platform lookups (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_platform_connections_user_platform
  ON platform_connections(user_id, platform);

-- Create composite index for token expiration queries (used by cron job)
-- Includes status filter for better performance
CREATE INDEX IF NOT EXISTS idx_platform_connections_token_expiry
  ON platform_connections(token_expires_at)
  WHERE status IN ('connected', 'token_expired')
    AND refresh_token IS NOT NULL;

-- Create index for platform + status queries
CREATE INDEX IF NOT EXISTS idx_platform_connections_platform_status
  ON platform_connections(platform, status);

-- Create index for last_sync timestamp queries
CREATE INDEX IF NOT EXISTS idx_platform_connections_last_sync
  ON platform_connections(last_sync DESC)
  WHERE status = 'connected';

-- Add comments
COMMENT ON INDEX idx_platform_connections_user_platform IS 'Optimizes queries for user platform connections lookup';
COMMENT ON INDEX idx_platform_connections_token_expiry IS 'Optimizes cron job queries for expiring tokens (partial index for better performance)';
COMMENT ON INDEX idx_platform_connections_platform_status IS 'Optimizes platform-specific status queries';
COMMENT ON INDEX idx_platform_connections_last_sync IS 'Optimizes queries for recently synced connections';
