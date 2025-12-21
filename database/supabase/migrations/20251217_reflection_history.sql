-- ====================================================================
-- TWIN REFLECTIONS - DATABASE SCHEMA
-- ====================================================================
-- Migration: 20251217_reflection_history
-- Description: Store conversational reflections from the digital twin
-- Author: Claude AI
-- Date: 2025-12-17
--
-- This migration creates the foundation for platform-specific
-- conversational insights from the digital twin. Instead of stats,
-- the twin shares observations about the user's patterns.
-- ====================================================================

-- ====================================================================
-- TABLE: reflection_history
-- Purpose: Store twin reflections for each platform
-- ====================================================================

CREATE TABLE IF NOT EXISTS reflection_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Platform this reflection is about
  platform VARCHAR(50) NOT NULL CHECK (platform IN ('spotify', 'whoop', 'calendar', 'general')),

  -- The conversational reflection text
  reflection_text TEXT NOT NULL,

  -- Themes detected in this reflection (e.g., 'processing', 'evening-listener')
  themes TEXT[],

  -- How confident the twin is about this observation
  confidence VARCHAR(20) CHECK (confidence IN ('high', 'medium', 'low')),

  -- Type of reflection
  reflection_type VARCHAR(30) DEFAULT 'observation' CHECK (reflection_type IN ('observation', 'pattern', 'insight', 'suggestion')),

  -- Snapshot of data that informed this reflection (for context/debugging)
  data_snapshot JSONB,

  -- When this reflection was generated
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- When to auto-refresh (for caching)
  expires_at TIMESTAMP WITH TIME ZONE,

  -- User interaction tracking
  dismissed_at TIMESTAMP WITH TIME ZONE,
  user_rating SMALLINT CHECK (user_rating >= 1 AND user_rating <= 5),

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookup by user and platform (most common query)
CREATE INDEX IF NOT EXISTS idx_reflection_history_user_platform
  ON reflection_history(user_id, platform, generated_at DESC);

-- Index for finding expired reflections that need refresh
CREATE INDEX IF NOT EXISTS idx_reflection_history_expires
  ON reflection_history(expires_at)
  WHERE expires_at IS NOT NULL AND dismissed_at IS NULL;

-- Index for finding active (non-dismissed) reflections
CREATE INDEX IF NOT EXISTS idx_reflection_history_active
  ON reflection_history(user_id, platform)
  WHERE dismissed_at IS NULL;

-- ====================================================================
-- ROW LEVEL SECURITY
-- ====================================================================

ALTER TABLE reflection_history ENABLE ROW LEVEL SECURITY;

-- Users can only see their own reflections
CREATE POLICY "Users can view own reflections"
  ON reflection_history FOR SELECT
  USING (auth.uid()::text = user_id::text);

-- Users can update their own reflections (dismiss, rate)
CREATE POLICY "Users can update own reflections"
  ON reflection_history FOR UPDATE
  USING (auth.uid()::text = user_id::text);

-- Service role can insert reflections
CREATE POLICY "Service can insert reflections"
  ON reflection_history FOR INSERT
  WITH CHECK (true);

-- ====================================================================
-- HELPER FUNCTION: Get latest reflection for platform
-- ====================================================================

CREATE OR REPLACE FUNCTION get_latest_reflection(
  p_user_id UUID,
  p_platform VARCHAR(50)
)
RETURNS TABLE (
  id UUID,
  reflection_text TEXT,
  themes TEXT[],
  confidence VARCHAR(20),
  generated_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    rh.id,
    rh.reflection_text,
    rh.themes,
    rh.confidence,
    rh.generated_at,
    rh.expires_at
  FROM reflection_history rh
  WHERE rh.user_id = p_user_id
    AND rh.platform = p_platform
    AND rh.dismissed_at IS NULL
  ORDER BY rh.generated_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ====================================================================
-- TRIGGER: Update updated_at on changes
-- ====================================================================

CREATE OR REPLACE FUNCTION update_reflection_history_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_reflection_history_updated_at
  BEFORE UPDATE ON reflection_history
  FOR EACH ROW
  EXECUTE FUNCTION update_reflection_history_updated_at();
