-- ============================================================================
-- SOUL OBSERVER MODE - COMPREHENSIVE BEHAVIORAL TRACKING ARCHITECTURE
-- Migration: 007_soul_observer_mode_architecture
-- Purpose: Complete browser activity tracking and AI-powered behavioral analysis
-- Research-backed: Keystroke dynamics (72% F1), Mouse patterns (Big Five correlation)
-- ============================================================================

-- ============================================================================
-- CORE SOUL OBSERVER TABLES
-- ============================================================================

-- 1. SOUL OBSERVER EVENTS (Time-series raw activity data)
-- Stores every browser interaction for pattern detection
CREATE TABLE IF NOT EXISTS soul_observer_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL, -- Groups events into browsing sessions

  -- Event Details
  event_type TEXT NOT NULL CHECK (event_type IN (
    'typing', 'mouse_move', 'mouse_click', 'scroll', 'focus', 'blur',
    'navigation', 'form_submit', 'form_abandon', 'media_play', 'media_pause',
    'tab_switch', 'window_focus', 'window_blur'
  )),
  event_data JSONB NOT NULL, -- Complete event payload

  -- Context
  url TEXT NOT NULL, -- Page where event occurred
  domain TEXT NOT NULL, -- Extracted domain for grouping
  page_title TEXT,

  -- Timing (critical for pattern detection)
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  duration_ms INTEGER, -- How long the event lasted (for focus, typing sessions)

  -- Metadata
  user_agent TEXT,
  viewport_size JSONB, -- {width, height}

  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Indexes optimized for time-series queries
CREATE INDEX idx_soul_observer_events_user_id ON soul_observer_events(user_id);
CREATE INDEX idx_soul_observer_events_session_id ON soul_observer_events(session_id);
CREATE INDEX idx_soul_observer_events_timestamp ON soul_observer_events(timestamp DESC);
CREATE INDEX idx_soul_observer_events_type ON soul_observer_events(event_type);
CREATE INDEX idx_soul_observer_events_domain ON soul_observer_events(domain);
CREATE INDEX idx_soul_observer_events_user_time ON soul_observer_events(user_id, timestamp DESC);

-- Partition by month for performance (time-series optimization)
-- Future: ALTER TABLE soul_observer_events PARTITION BY RANGE (timestamp);

-- 2. SOUL OBSERVER SESSIONS
-- Aggregated session summaries with AI-generated insights
CREATE TABLE IF NOT EXISTS soul_observer_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL UNIQUE,

  -- Session Timing
  started_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ended_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,

  -- Activity Summary
  total_events INTEGER DEFAULT 0,
  event_counts JSONB, -- {typing: 150, clicks: 45, scrolls: 230}
  domains_visited TEXT[], -- List of domains
  pages_visited INTEGER,

  -- Behavioral Patterns Detected
  typing_speed_wpm FLOAT, -- Words per minute
  typing_correction_rate FLOAT, -- Backspace/delete frequency
  mouse_movement_pattern TEXT, -- smooth, erratic, exploratory, purposeful
  mouse_avg_speed FLOAT, -- Pixels per second
  scroll_pattern TEXT, -- reading, skimming, hunting
  scroll_avg_speed FLOAT, -- Pixels per second
  focus_avg_duration FLOAT, -- Average seconds on each element
  multitasking_score FLOAT, -- Tab switching frequency (0-1)

  -- AI-Generated Insights
  ai_insights JSONB, -- Array of insight objects from ActivityAIProcessor
  personality_indicators JSONB, -- Big Five traits indicators
  work_style_analysis TEXT, -- focused, multitasker, distracted, etc.
  decision_making_style TEXT, -- deliberate, impulsive, analytical, etc.

  -- Session Context
  peak_productivity_time TIME, -- Time of day when most focused
  primary_activity TEXT, -- browsing, working, shopping, reading, etc.

  -- Processing Status
  processed BOOLEAN DEFAULT FALSE,
  ai_analyzed BOOLEAN DEFAULT FALSE,
  embeddings_generated BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_soul_observer_sessions_user_id ON soul_observer_sessions(user_id);
CREATE INDEX idx_soul_observer_sessions_started_at ON soul_observer_sessions(started_at DESC);
CREATE INDEX idx_soul_observer_sessions_processed ON soul_observer_sessions(processed);
CREATE INDEX idx_soul_observer_sessions_ai_analyzed ON soul_observer_sessions(ai_analyzed);

-- 3. BEHAVIORAL PATTERNS
-- Aggregated behavioral patterns with confidence scores
CREATE TABLE IF NOT EXISTS behavioral_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Pattern Classification
  pattern_type TEXT NOT NULL CHECK (pattern_type IN (
    'writing_style', 'decision_making', 'information_processing',
    'work_style', 'attention_pattern', 'reading_style',
    'shopping_behavior', 'media_consumption', 'search_behavior',
    'productivity_rhythm', 'stress_indicators', 'cognitive_load'
  )),
  pattern_name TEXT NOT NULL, -- "Confident Writer", "Deliberate Decision Maker", etc.

  -- Pattern Data
  pattern_description TEXT NOT NULL, -- Human-readable description
  pattern_metrics JSONB NOT NULL, -- Quantitative metrics
  confidence_score FLOAT NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),

  -- Evidence
  sample_size INTEGER NOT NULL, -- Number of events/sessions analyzed
  first_detected TIMESTAMP WITH TIME ZONE NOT NULL,
  last_confirmed TIMESTAMP WITH TIME ZONE NOT NULL,
  detection_frequency TEXT, -- consistent, occasional, rare

  -- Correlations (from research)
  personality_correlation JSONB, -- Big Five trait correlations
  behavioral_indicators JSONB, -- Specific behaviors that trigger this pattern

  -- Temporal Analysis
  time_of_day_pattern JSONB, -- When this pattern is most prominent
  day_of_week_pattern JSONB, -- Which days show this pattern

  -- Context
  contexts TEXT[], -- work, leisure, shopping, research, social
  platforms TEXT[], -- Domains where pattern is observed

  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),

  CONSTRAINT behavioral_patterns_unique UNIQUE (user_id, pattern_type, pattern_name)
);

CREATE INDEX idx_behavioral_patterns_user_id ON behavioral_patterns(user_id);
CREATE INDEX idx_behavioral_patterns_type ON behavioral_patterns(pattern_type);
CREATE INDEX idx_behavioral_patterns_confidence ON behavioral_patterns(confidence_score DESC);
CREATE INDEX idx_behavioral_patterns_last_confirmed ON behavioral_patterns(last_confirmed DESC);

-- 4. USER BEHAVIORAL EMBEDDINGS
-- Vector embeddings of behavioral sessions for semantic similarity
CREATE TABLE IF NOT EXISTS user_behavioral_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES soul_observer_sessions(id) ON DELETE CASCADE,

  -- Vector Embedding (1536 dimensions for OpenAI embeddings)
  embedding vector(1536),

  -- Behavioral Fingerprint Text (for embedding generation)
  fingerprint_text TEXT NOT NULL, -- Summarized behavioral patterns as text

  -- Metadata for Filtering
  session_date DATE NOT NULL,
  primary_activity TEXT, -- browsing, working, shopping, etc.
  dominant_patterns TEXT[], -- Main behavioral patterns in this session
  personality_snapshot JSONB, -- Big Five indicators at this time

  -- Context
  contexts TEXT[], -- work, leisure, shopping, etc.
  domains TEXT[], -- Domains visited in session

  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_behavioral_embeddings_user_id ON user_behavioral_embeddings(user_id);
CREATE INDEX idx_behavioral_embeddings_session_id ON user_behavioral_embeddings(session_id);
CREATE INDEX idx_behavioral_embeddings_date ON user_behavioral_embeddings(session_date DESC);

-- Vector similarity search index (HNSW for fast approximate nearest neighbor search)
CREATE INDEX ON user_behavioral_embeddings USING hnsw (embedding vector_cosine_ops);

-- 5. LLM BEHAVIORAL CONTEXT
-- RAG context for feeding user's personal LLM
CREATE TABLE IF NOT EXISTS llm_behavioral_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  twin_id UUID REFERENCES digital_twins(id) ON DELETE CASCADE,

  -- Context Entry
  context_type TEXT NOT NULL CHECK (context_type IN (
    'behavioral_summary', 'pattern_insight', 'personality_trait',
    'work_style', 'decision_style', 'productivity_pattern',
    'cognitive_profile', 'temporal_rhythm'
  )),
  context_text TEXT NOT NULL, -- Natural language context for LLM

  -- Source Data
  source_sessions UUID[], -- Sessions this context is derived from
  source_patterns UUID[], -- Patterns this context is based on

  -- Importance & Relevance
  importance_score FLOAT DEFAULT 0.5 CHECK (importance_score >= 0 AND importance_score <= 1),
  relevance_contexts TEXT[], -- When this context is most relevant

  -- Vector Embedding for Semantic Retrieval
  embedding vector(1536),

  -- Temporal Validity
  valid_from TIMESTAMP WITH TIME ZONE NOT NULL,
  valid_until TIMESTAMP WITH TIME ZONE, -- NULL = still valid

  -- Usage Tracking
  times_retrieved INTEGER DEFAULT 0,
  last_used TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_llm_behavioral_context_user_id ON llm_behavioral_context(user_id);
CREATE INDEX idx_llm_behavioral_context_twin_id ON llm_behavioral_context(twin_id);
CREATE INDEX idx_llm_behavioral_context_type ON llm_behavioral_context(context_type);
CREATE INDEX idx_llm_behavioral_context_importance ON llm_behavioral_context(importance_score DESC);
CREATE INDEX idx_llm_behavioral_context_valid_from ON llm_behavioral_context(valid_from DESC);
CREATE INDEX ON llm_behavioral_context USING hnsw (embedding vector_cosine_ops);

-- 6. SOUL OBSERVER INSIGHTS (Real-time AI insights cache)
CREATE TABLE IF NOT EXISTS soul_observer_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES soul_observer_sessions(id) ON DELETE CASCADE,

  -- Insight Details
  insight_category TEXT NOT NULL CHECK (insight_category IN (
    'writing_style', 'decision_making', 'information_processing',
    'work_style', 'attention_pattern', 'reading_comprehension',
    'productivity', 'stress_level', 'cognitive_state'
  )),
  insight_text TEXT NOT NULL, -- "Confident writer with minimal corrections"
  insight_data JSONB, -- Supporting data/metrics

  -- Confidence & Evidence
  confidence FLOAT NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  evidence_count INTEGER NOT NULL, -- Number of events supporting this insight

  -- Timing
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  applicable_period TSTZRANGE, -- Time range when this insight is valid

  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_soul_observer_insights_user_id ON soul_observer_insights(user_id);
CREATE INDEX idx_soul_observer_insights_session_id ON soul_observer_insights(session_id);
CREATE INDEX idx_soul_observer_insights_category ON soul_observer_insights(insight_category);
CREATE INDEX idx_soul_observer_insights_generated_at ON soul_observer_insights(generated_at DESC);

-- ============================================================================
-- HELPER FUNCTIONS FOR SOUL OBSERVER
-- ============================================================================

-- Function: Search similar behavioral sessions
CREATE OR REPLACE FUNCTION search_similar_behavioral_sessions(
  query_embedding vector(1536),
  match_user_id UUID,
  match_activity TEXT DEFAULT NULL,
  match_count INTEGER DEFAULT 10,
  similarity_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  id UUID,
  session_id UUID,
  fingerprint_text TEXT,
  primary_activity TEXT,
  session_date DATE,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.session_id,
    e.fingerprint_text,
    e.primary_activity,
    e.session_date,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM user_behavioral_embeddings e
  WHERE e.user_id = match_user_id
    AND (match_activity IS NULL OR e.primary_activity = match_activity)
    AND 1 - (e.embedding <=> query_embedding) > similarity_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Function: Get behavioral summary for LLM context
CREATE OR REPLACE FUNCTION get_behavioral_summary(target_user_id UUID, days_back INTEGER DEFAULT 7)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  summary JSONB;
BEGIN
  WITH recent_sessions AS (
    SELECT *
    FROM soul_observer_sessions
    WHERE user_id = target_user_id
      AND started_at >= NOW() - (days_back || ' days')::INTERVAL
      AND ai_analyzed = TRUE
  ),
  session_stats AS (
    SELECT
      COUNT(*) as total_sessions,
      AVG(typing_speed_wpm) as avg_typing_speed,
      AVG(typing_correction_rate) as avg_correction_rate,
      AVG(focus_avg_duration) as avg_focus_duration,
      AVG(multitasking_score) as avg_multitasking,
      MODE() WITHIN GROUP (ORDER BY mouse_movement_pattern) as common_mouse_pattern,
      MODE() WITHIN GROUP (ORDER BY scroll_pattern) as common_scroll_pattern,
      MODE() WITHIN GROUP (ORDER BY work_style_analysis) as common_work_style,
      MODE() WITHIN GROUP (ORDER BY decision_making_style) as common_decision_style
    FROM recent_sessions
  ),
  pattern_summary AS (
    SELECT
      pattern_type,
      COUNT(*) as frequency,
      AVG(confidence_score) as avg_confidence,
      array_agg(DISTINCT pattern_name) as patterns
    FROM behavioral_patterns
    WHERE user_id = target_user_id
      AND last_confirmed >= NOW() - (days_back || ' days')::INTERVAL
    GROUP BY pattern_type
  )
  SELECT jsonb_build_object(
    'time_period', jsonb_build_object(
      'days', days_back,
      'sessions_analyzed', (SELECT total_sessions FROM session_stats)
    ),
    'typing_profile', jsonb_build_object(
      'avg_wpm', (SELECT avg_typing_speed FROM session_stats),
      'correction_rate', (SELECT avg_correction_rate FROM session_stats)
    ),
    'behavioral_profile', jsonb_build_object(
      'mouse_pattern', (SELECT common_mouse_pattern FROM session_stats),
      'scroll_pattern', (SELECT common_scroll_pattern FROM session_stats),
      'work_style', (SELECT common_work_style FROM session_stats),
      'decision_style', (SELECT common_decision_style FROM session_stats),
      'avg_focus_duration', (SELECT avg_focus_duration FROM session_stats),
      'multitasking_tendency', (SELECT avg_multitasking FROM session_stats)
    ),
    'detected_patterns', (
      SELECT jsonb_object_agg(pattern_type, jsonb_build_object(
        'frequency', frequency,
        'confidence', avg_confidence,
        'patterns', patterns
      ))
      FROM pattern_summary
    )
  ) INTO summary;

  RETURN COALESCE(summary, '{}'::JSONB);
END;
$$;

-- Function: Aggregate session metrics for AI analysis
CREATE OR REPLACE FUNCTION calculate_session_metrics(target_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  metrics JSONB;
BEGIN
  WITH session_events AS (
    SELECT *
    FROM soul_observer_events
    WHERE session_id = target_session_id
  ),
  typing_stats AS (
    SELECT
      COUNT(*) as typing_events,
      AVG((event_data->>'speed')::FLOAT) as avg_speed,
      AVG((event_data->>'corrections')::FLOAT) as correction_rate,
      AVG((event_data->>'pauseDuration')::FLOAT) as avg_pause
    FROM session_events
    WHERE event_type = 'typing'
  ),
  mouse_stats AS (
    SELECT
      COUNT(*) as mouse_events,
      AVG((event_data->>'speed')::FLOAT) as avg_speed,
      AVG((event_data->>'distance')::FLOAT) as avg_distance,
      COUNT(*) FILTER (WHERE event_data->>'pattern' = 'erratic') as erratic_count
    FROM session_events
    WHERE event_type IN ('mouse_move', 'mouse_click')
  ),
  scroll_stats AS (
    SELECT
      COUNT(*) as scroll_events,
      AVG((event_data->>'speed')::FLOAT) as avg_speed,
      COUNT(*) FILTER (WHERE event_data->>'direction' = 'up') as backscroll_count
    FROM session_events
    WHERE event_type = 'scroll'
  ),
  focus_stats AS (
    SELECT
      COUNT(*) as focus_events,
      AVG(duration_ms / 1000.0) as avg_focus_duration,
      MAX(duration_ms / 1000.0) as max_focus_duration
    FROM session_events
    WHERE event_type = 'focus'
  )
  SELECT jsonb_build_object(
    'typing', (SELECT row_to_json(typing_stats.*) FROM typing_stats),
    'mouse', (SELECT row_to_json(mouse_stats.*) FROM mouse_stats),
    'scroll', (SELECT row_to_json(scroll_stats.*) FROM scroll_stats),
    'focus', (SELECT row_to_json(focus_stats.*) FROM focus_stats)
  ) INTO metrics;

  RETURN COALESCE(metrics, '{}'::JSONB);
END;
$$;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all Soul Observer tables
ALTER TABLE soul_observer_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE soul_observer_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE behavioral_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_behavioral_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_behavioral_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE soul_observer_insights ENABLE ROW LEVEL SECURITY;

-- Users can only access their own Soul Observer data
CREATE POLICY soul_observer_events_policy ON soul_observer_events
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY soul_observer_sessions_policy ON soul_observer_sessions
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY behavioral_patterns_policy ON behavioral_patterns
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY user_behavioral_embeddings_policy ON user_behavioral_embeddings
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY llm_behavioral_context_policy ON llm_behavioral_context
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY soul_observer_insights_policy ON soul_observer_insights
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- TRIGGER FUNCTIONS
-- ============================================================================

-- Update sessions.updated_at on changes
CREATE OR REPLACE FUNCTION update_soul_observer_sessions_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_soul_observer_sessions_updated_at
BEFORE UPDATE ON soul_observer_sessions
FOR EACH ROW EXECUTE FUNCTION update_soul_observer_sessions_timestamp();

-- Update behavioral_patterns.updated_at on changes
CREATE OR REPLACE FUNCTION update_behavioral_patterns_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_behavioral_patterns_updated_at
BEFORE UPDATE ON behavioral_patterns
FOR EACH ROW EXECUTE FUNCTION update_behavioral_patterns_timestamp();

-- ============================================================================
-- TABLE COMMENTS (Documentation)
-- ============================================================================

COMMENT ON TABLE soul_observer_events IS 'Raw browser activity events (typing, clicks, scrolls, focus) for comprehensive behavioral tracking';
COMMENT ON TABLE soul_observer_sessions IS 'Aggregated browsing sessions with AI-analyzed behavioral patterns and insights';
COMMENT ON TABLE behavioral_patterns IS 'Detected behavioral patterns with confidence scores and personality correlations (research-backed)';
COMMENT ON TABLE user_behavioral_embeddings IS 'Vector embeddings of behavioral sessions for semantic similarity and pattern matching';
COMMENT ON TABLE llm_behavioral_context IS 'RAG context entries derived from behavioral data for feeding user LLM';
COMMENT ON TABLE soul_observer_insights IS 'Real-time AI-generated insights cached for dashboard display';

COMMENT ON FUNCTION search_similar_behavioral_sessions IS 'Semantic search for similar behavioral sessions using vector embeddings';
COMMENT ON FUNCTION get_behavioral_summary IS 'Returns comprehensive behavioral summary for LLM context (last N days)';
COMMENT ON FUNCTION calculate_session_metrics IS 'Aggregates session events into metrics for AI analysis';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Soul Observer Mode database architecture is now ready
-- Research-backed behavioral tracking with:
-- - Time-series event storage (optimized for high-volume inserts)
-- - AI-powered session analysis with personality indicators
-- - Pattern detection with confidence scoring
-- - Vector embeddings for semantic similarity
-- - RAG context for LLM feeding
-- - Complete privacy controls via RLS
-- ============================================================================
