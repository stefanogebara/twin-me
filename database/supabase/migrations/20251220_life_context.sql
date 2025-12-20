-- Life Context Table for Twin Memory
-- Stores inferred life events (vacation, conferences, etc.) that inform all reflections

-- Create life_context table
CREATE TABLE IF NOT EXISTS life_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,

  -- Context identification
  context_type TEXT NOT NULL CHECK (context_type IN (
    'vacation', 'conference', 'training', 'holiday',
    'work_project', 'health_event', 'travel', 'sabbatical'
  )),

  -- Context details
  title TEXT NOT NULL,
  description TEXT,

  -- Temporal data
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,

  -- Source tracking
  source TEXT NOT NULL CHECK (source IN ('calendar_inference', 'user_input', 'pattern_detection')),
  source_event_id TEXT, -- Reference to original calendar event
  source_platform TEXT, -- Which platform triggered the inference

  -- Confidence and metadata
  confidence DECIMAL(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  metadata JSONB DEFAULT '{}',

  -- Language detection for multilingual support
  detected_language TEXT,
  original_title TEXT, -- Original event title before translation

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_dismissed BOOLEAN DEFAULT false, -- User can dismiss inferred events

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicates
  CONSTRAINT unique_user_context_period UNIQUE(user_id, context_type, start_date, source_event_id)
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_life_context_user_active
  ON life_context(user_id, is_active)
  WHERE is_active = true AND is_dismissed = false;

CREATE INDEX IF NOT EXISTS idx_life_context_user_dates
  ON life_context(user_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_life_context_type
  ON life_context(user_id, context_type);

-- Function to check if user is currently in a life context
CREATE OR REPLACE FUNCTION get_active_life_context(p_user_id UUID)
RETURNS TABLE (
  context_type TEXT,
  title TEXT,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  days_remaining INTEGER,
  confidence DECIMAL(3,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    lc.context_type,
    lc.title,
    lc.start_date,
    lc.end_date,
    CASE
      WHEN lc.end_date IS NOT NULL
      THEN EXTRACT(DAY FROM (lc.end_date - NOW()))::INTEGER
      ELSE NULL
    END as days_remaining,
    lc.confidence
  FROM life_context lc
  WHERE lc.user_id = p_user_id
    AND lc.is_active = true
    AND lc.is_dismissed = false
    AND lc.start_date <= NOW()
    AND (lc.end_date IS NULL OR lc.end_date >= NOW())
  ORDER BY lc.start_date DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get upcoming life contexts
CREATE OR REPLACE FUNCTION get_upcoming_life_context(p_user_id UUID, p_days_ahead INTEGER DEFAULT 14)
RETURNS TABLE (
  context_type TEXT,
  title TEXT,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  days_until INTEGER,
  confidence DECIMAL(3,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    lc.context_type,
    lc.title,
    lc.start_date,
    lc.end_date,
    EXTRACT(DAY FROM (lc.start_date - NOW()))::INTEGER as days_until,
    lc.confidence
  FROM life_context lc
  WHERE lc.user_id = p_user_id
    AND lc.is_active = true
    AND lc.is_dismissed = false
    AND lc.start_date > NOW()
    AND lc.start_date <= NOW() + (p_days_ahead || ' days')::INTERVAL
  ORDER BY lc.start_date ASC;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_life_context_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER life_context_updated_at
  BEFORE UPDATE ON life_context
  FOR EACH ROW
  EXECUTE FUNCTION update_life_context_timestamp();

-- Row Level Security
ALTER TABLE life_context ENABLE ROW LEVEL SECURITY;

-- Users can only see their own life context
CREATE POLICY "Users can view own life context"
  ON life_context FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own life context"
  ON life_context FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own life context"
  ON life_context FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own life context"
  ON life_context FOR DELETE
  USING (auth.uid() = user_id);

-- Service role can manage all life context (for background jobs)
CREATE POLICY "Service role full access"
  ON life_context FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

COMMENT ON TABLE life_context IS 'Stores inferred life events (vacation, conferences, etc.) that inform twin reflections across all platforms';
COMMENT ON COLUMN life_context.context_type IS 'Type of life event: vacation, conference, training, holiday, etc.';
COMMENT ON COLUMN life_context.source IS 'How this context was detected: calendar_inference, user_input, or pattern_detection';
COMMENT ON COLUMN life_context.confidence IS 'Confidence score 0.00-1.00 for inferred contexts';
