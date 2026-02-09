-- ============================================
-- Enhanced Conversation Analysis Schema
-- Adds deep analysis dimensions: engagement, depth, tone, context, arc, sessions
-- ============================================

-- Add enhanced analysis columns to mcp_conversation_logs
ALTER TABLE mcp_conversation_logs
  ADD COLUMN IF NOT EXISTS engagement_level VARCHAR(20),
  ADD COLUMN IF NOT EXISTS conversation_depth VARCHAR(20),
  ADD COLUMN IF NOT EXISTS tone_profile JSONB,
  ADD COLUMN IF NOT EXISTS context_signals JSONB,
  ADD COLUMN IF NOT EXISTS conversation_arc JSONB,
  ADD COLUMN IF NOT EXISTS subject_matter JSONB,
  ADD COLUMN IF NOT EXISTS ai_analysis JSONB,
  ADD COLUMN IF NOT EXISTS turn_number INTEGER;

-- Update session_id to be UUID type if not already (for proper FK relationship)
-- Note: session_id column already exists, we just need to ensure it can link to sessions table

-- ============================================
-- Conversation Sessions Table
-- Groups related messages into sessions with summaries
-- ============================================
CREATE TABLE IF NOT EXISTS conversation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,

  -- Session timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),

  -- Session metrics
  message_count INTEGER DEFAULT 0,
  user_message_count INTEGER DEFAULT 0,
  twin_response_count INTEGER DEFAULT 0,
  total_words INTEGER DEFAULT 0,

  -- AI-analyzed session properties
  primary_topics JSONB,
  overall_engagement VARCHAR(20),
  overall_depth VARCHAR(20),
  session_summary TEXT,
  session_arc JSONB,

  -- Source tracking
  mcp_client TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Enhanced User Writing Patterns
-- Adds engagement and depth preferences
-- ============================================
ALTER TABLE user_writing_patterns
  ADD COLUMN IF NOT EXISTS avg_engagement_level NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS typical_depth VARCHAR(20),
  ADD COLUMN IF NOT EXISTS peak_engagement_hours JSONB,
  ADD COLUMN IF NOT EXISTS topic_depth_preferences JSONB,
  ADD COLUMN IF NOT EXISTS session_duration_avg_minutes NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS messages_per_session_avg NUMERIC(5,2);

-- ============================================
-- AI Analysis Jobs Queue Table
-- Tracks async AI analysis of conversations
-- ============================================
CREATE TABLE IF NOT EXISTS conversation_analysis_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,

  -- Reference to the conversation being analyzed
  conversation_log_id UUID REFERENCES mcp_conversation_logs(id) ON DELETE CASCADE,
  session_id UUID,

  -- Job state
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  priority INTEGER DEFAULT 5,

  -- Timing
  queued_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Results
  analysis_result JSONB,
  error_message TEXT,

  -- Performance
  processing_time_ms INTEGER,
  model_used TEXT,
  tokens_used INTEGER
);

-- ============================================
-- Historical Import Tracking
-- Tracks Claude Desktop LevelDB imports
-- ============================================
CREATE TABLE IF NOT EXISTS claude_desktop_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,

  -- Import state
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),

  -- What was imported
  conversations_found INTEGER DEFAULT 0,
  conversations_imported INTEGER DEFAULT 0,
  conversations_skipped INTEGER DEFAULT 0,
  messages_imported INTEGER DEFAULT 0,

  -- Import metadata
  leveldb_path TEXT,
  last_import_date TIMESTAMPTZ,
  oldest_message_date TIMESTAMPTZ,
  newest_message_date TIMESTAMPTZ,

  -- Error tracking
  error_message TEXT,
  errors JSONB,

  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Indexes
-- ============================================

-- Conversation sessions indexes
CREATE INDEX IF NOT EXISTS idx_conversation_sessions_user ON conversation_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_sessions_started ON conversation_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_sessions_user_recent ON conversation_sessions(user_id, last_message_at DESC);

-- Enhanced mcp_conversation_logs indexes
CREATE INDEX IF NOT EXISTS idx_mcp_logs_session ON mcp_conversation_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_mcp_logs_engagement ON mcp_conversation_logs(engagement_level);
CREATE INDEX IF NOT EXISTS idx_mcp_logs_depth ON mcp_conversation_logs(conversation_depth);
CREATE INDEX IF NOT EXISTS idx_mcp_logs_user_analyzed ON mcp_conversation_logs(user_id)
  WHERE ai_analysis IS NOT NULL;

-- Analysis jobs indexes
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_pending ON conversation_analysis_jobs(status, queued_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_user ON conversation_analysis_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_conversation ON conversation_analysis_jobs(conversation_log_id);

-- Historical import indexes
CREATE INDEX IF NOT EXISTS idx_claude_imports_user ON claude_desktop_imports(user_id);
CREATE INDEX IF NOT EXISTS idx_claude_imports_status ON claude_desktop_imports(status);

-- ============================================
-- Row Level Security
-- ============================================

-- Enable RLS on new tables
ALTER TABLE conversation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_analysis_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE claude_desktop_imports ENABLE ROW LEVEL SECURITY;

-- Policies for conversation_sessions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'conversation_sessions' AND policyname = 'sessions_select_own'
  ) THEN
    CREATE POLICY sessions_select_own ON conversation_sessions
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'conversation_sessions' AND policyname = 'sessions_insert_own'
  ) THEN
    CREATE POLICY sessions_insert_own ON conversation_sessions
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'conversation_sessions' AND policyname = 'sessions_update_own'
  ) THEN
    CREATE POLICY sessions_update_own ON conversation_sessions
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

-- Service role bypass for conversation_sessions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'conversation_sessions' AND policyname = 'sessions_service_all'
  ) THEN
    CREATE POLICY sessions_service_all ON conversation_sessions
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Policies for conversation_analysis_jobs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'conversation_analysis_jobs' AND policyname = 'analysis_jobs_select_own'
  ) THEN
    CREATE POLICY analysis_jobs_select_own ON conversation_analysis_jobs
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'conversation_analysis_jobs' AND policyname = 'analysis_jobs_service_all'
  ) THEN
    CREATE POLICY analysis_jobs_service_all ON conversation_analysis_jobs
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Policies for claude_desktop_imports
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'claude_desktop_imports' AND policyname = 'imports_select_own'
  ) THEN
    CREATE POLICY imports_select_own ON claude_desktop_imports
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'claude_desktop_imports' AND policyname = 'imports_service_all'
  ) THEN
    CREATE POLICY imports_service_all ON claude_desktop_imports
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================
-- Helper Functions
-- ============================================

-- Function to get or create a session for a user
CREATE OR REPLACE FUNCTION get_or_create_conversation_session(
  p_user_id UUID,
  p_mcp_client TEXT DEFAULT 'unknown',
  p_session_gap_minutes INTEGER DEFAULT 30
)
RETURNS UUID AS $$
DECLARE
  v_session_id UUID;
  v_last_message_at TIMESTAMPTZ;
BEGIN
  -- Check for an existing active session (no message in last N minutes = session ended)
  SELECT id, last_message_at INTO v_session_id, v_last_message_at
  FROM conversation_sessions
  WHERE user_id = p_user_id
    AND ended_at IS NULL
    AND last_message_at > NOW() - (p_session_gap_minutes || ' minutes')::INTERVAL
  ORDER BY last_message_at DESC
  LIMIT 1;

  -- If no active session, create a new one
  IF v_session_id IS NULL THEN
    -- First, close any old open sessions for this user
    UPDATE conversation_sessions
    SET ended_at = last_message_at,
        updated_at = NOW()
    WHERE user_id = p_user_id
      AND ended_at IS NULL;

    -- Create new session
    INSERT INTO conversation_sessions (user_id, mcp_client, started_at, last_message_at)
    VALUES (p_user_id, p_mcp_client, NOW(), NOW())
    RETURNING id INTO v_session_id;
  END IF;

  RETURN v_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update session stats when a message is logged
CREATE OR REPLACE FUNCTION update_session_on_message()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.session_id IS NOT NULL THEN
    UPDATE conversation_sessions
    SET message_count = message_count + 1,
        user_message_count = user_message_count + 1,
        total_words = total_words + COALESCE(
          (NEW.writing_analysis->>'wordCount')::INTEGER,
          array_length(regexp_split_to_array(NEW.user_message, '\s+'), 1)
        ),
        last_message_at = NEW.created_at,
        updated_at = NOW()
    WHERE id = NEW.session_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-update session on new message
DROP TRIGGER IF EXISTS trigger_update_session_on_message ON mcp_conversation_logs;
CREATE TRIGGER trigger_update_session_on_message
  AFTER INSERT ON mcp_conversation_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_session_on_message();

-- Function to get the next turn number for a session
CREATE OR REPLACE FUNCTION get_next_turn_number(p_session_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_turn_number INTEGER;
BEGIN
  SELECT COALESCE(MAX(turn_number), 0) + 1 INTO v_turn_number
  FROM mcp_conversation_logs
  WHERE session_id = p_session_id;

  RETURN v_turn_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to close stale sessions
CREATE OR REPLACE FUNCTION close_stale_sessions(p_gap_minutes INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH updated AS (
    UPDATE conversation_sessions
    SET ended_at = last_message_at,
        updated_at = NOW()
    WHERE ended_at IS NULL
      AND last_message_at < NOW() - (p_gap_minutes || ' minutes')::INTERVAL
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM updated;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Comments
-- ============================================

COMMENT ON TABLE conversation_sessions IS 'Groups conversation messages into logical sessions based on time gaps';
COMMENT ON TABLE conversation_analysis_jobs IS 'Tracks async AI analysis jobs for conversations';
COMMENT ON TABLE claude_desktop_imports IS 'Tracks historical imports from Claude Desktop LevelDB';

COMMENT ON COLUMN mcp_conversation_logs.engagement_level IS 'AI-detected engagement: low, medium, high, very_high';
COMMENT ON COLUMN mcp_conversation_logs.conversation_depth IS 'AI-detected depth: surface, moderate, deep, expert';
COMMENT ON COLUMN mcp_conversation_logs.tone_profile IS 'Multi-dimensional tone: {professional, casual, emotional, analytical} 0-100 each';
COMMENT ON COLUMN mcp_conversation_logs.context_signals IS 'Contextual signals: {likelyTrigger, userNeed, emotionalState}';
COMMENT ON COLUMN mcp_conversation_logs.conversation_arc IS 'Conversation stage and progression pattern';
COMMENT ON COLUMN mcp_conversation_logs.subject_matter IS 'AI-classified domains and specific topics';
COMMENT ON COLUMN mcp_conversation_logs.ai_analysis IS 'Full AI analysis result from Claude Sonnet';
COMMENT ON COLUMN mcp_conversation_logs.turn_number IS 'Turn number within the session';
