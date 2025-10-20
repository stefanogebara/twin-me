-- Create platform_webhooks table to store webhook registration info
-- This table tracks webhook subscriptions for platforms that support real-time push notifications

CREATE TABLE IF NOT EXISTS platform_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  webhook_id TEXT, -- Platform-specific webhook ID (e.g., GitHub hook ID)
  webhook_url TEXT NOT NULL, -- Our endpoint URL that receives webhooks
  events TEXT[], -- Array of event types subscribed to
  metadata JSONB DEFAULT '{}', -- Platform-specific metadata (repo name, expiration, etc.)
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Ensure one webhook per platform per user
  UNIQUE(user_id, platform)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_platform_webhooks_user_platform
  ON platform_webhooks(user_id, platform);

-- Enable Row Level Security
ALTER TABLE platform_webhooks ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own webhooks
CREATE POLICY "Users can view own webhooks"
  ON platform_webhooks
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: Users can insert their own webhooks
CREATE POLICY "Users can insert own webhooks"
  ON platform_webhooks
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can update their own webhooks
CREATE POLICY "Users can update own webhooks"
  ON platform_webhooks
  FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policy: Users can delete their own webhooks
CREATE POLICY "Users can delete own webhooks"
  ON platform_webhooks
  FOR DELETE
  USING (auth.uid() = user_id);

-- Add comment for documentation
COMMENT ON TABLE platform_webhooks IS 'Stores webhook subscription information for platforms that support real-time push notifications (GitHub, Gmail Pub/Sub, Slack, etc.)';

-- Migration applied: 2025-01-20
-- Purpose: Enable webhook-based real-time monitoring for supported platforms
