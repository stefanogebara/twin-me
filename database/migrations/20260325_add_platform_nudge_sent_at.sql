-- Add platform_nudge_sent_at column to users table
-- Tracks when a platform nudge email was sent to prevent duplicate sends.
-- NULL = never nudged, timestamp = when nudge was sent.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS platform_nudge_sent_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN public.users.platform_nudge_sent_at
  IS 'Timestamp when platform connection nudge email was sent. NULL = not yet nudged.';
