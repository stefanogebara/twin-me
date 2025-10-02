-- Twin AI Learn - Data Integration Architecture
-- Migration 002: Data-Driven Digital Twins (Fixed for Supabase)

-- ====================================================================
-- DATA CONNECTORS SYSTEM
-- ====================================================================

-- User's connected data sources (OAuth tokens, sync status)
CREATE TABLE IF NOT EXISTS data_connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN (
    'google_gmail', 'google_calendar', 'google_drive',
    'microsoft_outlook', 'microsoft_teams', 'microsoft_onedrive',
    'slack', 'discord', 'linkedin', 'twitter', 'instagram',
    'netflix', 'spotify', 'youtube', 'github', 'notion'
  )),

  -- OAuth credentials (encrypted)
  access_token TEXT, -- Encrypted OAuth access token
  refresh_token TEXT, -- Encrypted OAuth refresh token
  expires_at TIMESTAMP,

  -- Connection metadata
  connected_at TIMESTAMP DEFAULT NOW(),
  last_sync TIMESTAMP,
  sync_frequency INTERVAL DEFAULT '15 minutes',
  is_active BOOLEAN DEFAULT true,

  -- Data permissions granted by user
  permissions JSONB DEFAULT '{}', -- e.g., {"read_emails": true, "read_calendar": true}

  -- Sync statistics
  total_synced INTEGER DEFAULT 0,
  last_sync_status TEXT DEFAULT 'pending', -- pending, success, error, rate_limited
  error_count INTEGER DEFAULT 0,

  -- Indexes for efficient querying
  UNIQUE(user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_connectors_user_active ON data_connectors (user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_connectors_sync_due ON data_connectors (last_sync, sync_frequency) WHERE is_active = true;

-- ====================================================================
-- RAW DATA STORAGE
-- ====================================================================

-- Raw data ingested from various sources
CREATE TABLE IF NOT EXISTS user_data_raw (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  connector_id UUID REFERENCES data_connectors(id) ON DELETE CASCADE,

  -- Data classification
  data_type TEXT NOT NULL CHECK (data_type IN (
    'email', 'calendar_event', 'slack_message', 'teams_message',
    'document', 'social_post', 'media_consumption', 'code_commit',
    'search_query', 'location', 'file_activity'
  )),

  -- Content storage
  content JSONB NOT NULL, -- Raw data from API
  metadata JSONB DEFAULT '{}', -- Additional context (sender, recipients, etc.)

  -- Processing status
  processed BOOLEAN DEFAULT false,
  processing_error TEXT,
  quality_score DECIMAL(3,2), -- 0.00-1.00 data quality assessment

  -- Temporal data
  source_timestamp TIMESTAMP NOT NULL, -- When the original data was created
  ingested_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP,

  -- Privacy and retention
  sensitivity_level TEXT DEFAULT 'medium' CHECK (sensitivity_level IN ('low', 'medium', 'high', 'critical')),
  retention_until TIMESTAMP -- Auto-delete date
);

CREATE INDEX IF NOT EXISTS idx_raw_data_user_type ON user_data_raw (user_id, data_type);
CREATE INDEX IF NOT EXISTS idx_raw_data_processing ON user_data_raw (processed, processing_error) WHERE NOT processed;
CREATE INDEX IF NOT EXISTS idx_raw_data_retention ON user_data_raw (retention_until) WHERE retention_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_raw_data_temporal ON user_data_raw (source_timestamp DESC);

-- ====================================================================
-- PERSONALITY INSIGHTS ENGINE
-- ====================================================================

-- Processed insights about user's personality and behavior
CREATE TABLE IF NOT EXISTS personality_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,

  -- Insight categorization
  insight_type TEXT NOT NULL CHECK (insight_type IN (
    'writing_style', 'communication_pattern', 'expertise_area', 'interest',
    'social_behavior', 'work_pattern', 'decision_making', 'emotional_tone',
    'response_timing', 'collaboration_style', 'learning_preference', 'creativity_level'
  )),

  -- The actual insight data
  insight_data JSONB NOT NULL, -- Structured insight (tone, formality, expertise level, etc.)

  -- Confidence and validation
  confidence_score DECIMAL(3,2) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
  source_data_count INTEGER NOT NULL, -- How many data points contributed
  source_data_ids UUID[], -- References to user_data_raw

  -- Temporal evolution tracking
  valid_from TIMESTAMP DEFAULT NOW(),
  valid_until TIMESTAMP, -- For insights that become outdated
  supersedes_insight_id UUID REFERENCES personality_insights(id), -- Tracks insight evolution

  -- Quality metadata
  analysis_method TEXT NOT NULL, -- 'ai_analysis', 'pattern_detection', 'user_feedback'
  last_updated TIMESTAMP DEFAULT NOW(),
  update_trigger TEXT -- 'new_data', 'drift_detection', 'user_correction'
);

CREATE INDEX IF NOT EXISTS idx_insights_user_type ON personality_insights (user_id, insight_type);
CREATE INDEX IF NOT EXISTS idx_insights_confidence ON personality_insights (confidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_insights_validity ON personality_insights (valid_from, valid_until) WHERE valid_until IS NULL;
CREATE INDEX IF NOT EXISTS idx_insights_evolution ON personality_insights (supersedes_insight_id) WHERE supersedes_insight_id IS NOT NULL;

-- ====================================================================
-- DIGITAL TWIN EVOLUTION TRACKING
-- ====================================================================

-- Track how the digital twin evolves over time
CREATE TABLE IF NOT EXISTS twin_evolution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  twin_id UUID REFERENCES digital_twins(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,

  -- Change tracking
  change_type TEXT NOT NULL CHECK (change_type IN (
    'personality_update', 'expertise_expansion', 'style_drift', 'new_interest',
    'behavior_pattern_change', 'user_correction', 'confidence_adjustment'
  )),

  -- Change details
  old_value JSONB,
  new_value JSONB,
  change_summary TEXT,
  confidence_impact DECIMAL(3,2), -- How much this changed overall twin confidence

  -- Source of change
  trigger_source TEXT NOT NULL, -- 'data_analysis', 'user_feedback', 'drift_detection'
  source_data_ids UUID[], -- What data caused this change

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  applied_at TIMESTAMP,
  rolled_back_at TIMESTAMP -- If user disagreed with the change
);

CREATE INDEX IF NOT EXISTS idx_evolution_twin ON twin_evolution_log (twin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_evolution_changes ON twin_evolution_log (change_type, created_at DESC);

-- ====================================================================
-- SMART ACTIONS & AUTOMATION
-- ====================================================================

-- User's preferences for automated actions
CREATE TABLE IF NOT EXISTS automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,

  -- Rule definition
  rule_name TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN (
    'auto_email_response', 'social_post_draft', 'calendar_management',
    'message_prioritization', 'content_recommendation', 'meeting_preparation'
  )),

  -- Conditions and actions
  conditions JSONB NOT NULL, -- When to trigger (sender, keywords, urgency, etc.)
  actions JSONB NOT NULL, -- What to do (reply template, escalation rules, etc.)

  -- Safety and control
  confidence_threshold DECIMAL(3,2) DEFAULT 0.8, -- Minimum confidence to auto-execute
  requires_approval BOOLEAN DEFAULT true,
  max_daily_executions INTEGER DEFAULT 10,

  -- Performance tracking
  executions_count INTEGER DEFAULT 0,
  success_rate DECIMAL(3,2),
  user_satisfaction_score DECIMAL(3,2),

  -- Status
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  last_triggered TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_automation_user_active ON automation_rules (user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_automation_type ON automation_rules (rule_type, is_active);

-- ====================================================================
-- DATA QUALITY & PROCESSING METRICS
-- ====================================================================

-- Track data quality and processing performance
CREATE TABLE IF NOT EXISTS data_quality_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  connector_id UUID REFERENCES data_connectors(id),

  -- Quality assessment
  metric_date DATE DEFAULT CURRENT_DATE,
  total_data_points INTEGER DEFAULT 0,
  processed_successfully INTEGER DEFAULT 0,
  processing_errors INTEGER DEFAULT 0,
  duplicate_data_points INTEGER DEFAULT 0,

  -- Content quality scores
  avg_content_quality DECIMAL(3,2),
  signal_to_noise_ratio DECIMAL(3,2), -- How much useful vs junk data

  -- Processing performance
  avg_processing_time_ms INTEGER,
  api_rate_limit_hits INTEGER DEFAULT 0,

  -- Insights generation
  insights_generated INTEGER DEFAULT 0,
  insight_confidence_avg DECIMAL(3,2),

  -- Indexes
  UNIQUE(user_id, connector_id, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_quality_metrics_date ON data_quality_metrics (metric_date DESC);

-- ====================================================================
-- REAL-TIME SYNC QUEUE
-- ====================================================================

-- Queue for real-time data processing
CREATE TABLE IF NOT EXISTS sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  connector_id UUID REFERENCES data_connectors(id),

  -- Queue item details
  queue_type TEXT NOT NULL CHECK (queue_type IN (
    'initial_sync', 'incremental_sync', 'webhook_event', 'manual_refresh',
    'error_retry', 'drift_analysis', 'insight_recompute', 'quality_assessment', 'cleanup_completed'
  )),

  -- Processing metadata
  priority INTEGER DEFAULT 5 CHECK (priority >= 1 AND priority <= 10), -- 1 = highest
  payload JSONB,

  -- Status tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,

  -- Timing
  created_at TIMESTAMP DEFAULT NOW(),
  scheduled_for TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,

  -- Error handling
  error_message TEXT,
  retry_after TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_processing ON sync_queue (status, priority DESC, scheduled_for ASC) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_sync_queue_user ON sync_queue (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_queue_cleanup ON sync_queue (completed_at) WHERE status IN ('completed', 'failed');

-- ====================================================================
-- VIEWS FOR COMMON QUERIES
-- ====================================================================

-- Active user data sources summary
CREATE OR REPLACE VIEW user_data_sources AS
SELECT
  user_id,
  COUNT(*) as total_connectors,
  COUNT(*) FILTER (WHERE is_active) as active_connectors,
  STRING_AGG(provider, ', ') FILTER (WHERE is_active) as connected_services,
  MIN(last_sync) as oldest_sync,
  MAX(last_sync) as newest_sync
FROM data_connectors
GROUP BY user_id;

-- Recent twin personality changes
CREATE OR REPLACE VIEW recent_twin_changes AS
SELECT
  tel.*,
  dt.name as twin_name,
  pi.insight_type,
  pi.confidence_score
FROM twin_evolution_log tel
JOIN digital_twins dt ON tel.twin_id = dt.id
LEFT JOIN personality_insights pi ON pi.id = ANY(tel.source_data_ids)
WHERE tel.created_at >= NOW() - INTERVAL '7 days'
ORDER BY tel.created_at DESC;

-- Data ingestion health summary
CREATE OR REPLACE VIEW data_ingestion_health AS
SELECT
  user_id,
  COUNT(*) as total_raw_data,
  COUNT(*) FILTER (WHERE processed) as processed_data,
  COUNT(*) FILTER (WHERE NOT processed AND processing_error IS NULL) as pending_data,
  COUNT(*) FILTER (WHERE processing_error IS NOT NULL) as failed_data,
  AVG(quality_score) as avg_quality_score
FROM user_data_raw
WHERE ingested_at >= NOW() - INTERVAL '7 days'
GROUP BY user_id;

-- ====================================================================
-- SECURITY & PRIVACY FUNCTIONS
-- ====================================================================

-- Function to encrypt sensitive data (OAuth tokens)
CREATE OR REPLACE FUNCTION encrypt_token(token TEXT, key TEXT DEFAULT 'default_key')
RETURNS TEXT AS $$
BEGIN
  -- In production, use proper encryption like pgcrypto
  -- For now, simple base64 encoding as placeholder
  RETURN encode(token::bytea, 'base64');
END;
$$ LANGUAGE plpgsql;

-- Function to decrypt tokens
CREATE OR REPLACE FUNCTION decrypt_token(encrypted_token TEXT, key TEXT DEFAULT 'default_key')
RETURNS TEXT AS $$
BEGIN
  -- In production, use proper decryption
  RETURN convert_from(decode(encrypted_token, 'base64'), 'UTF8');
END;
$$ LANGUAGE plpgsql;

-- Auto-cleanup old data based on retention policies
CREATE OR REPLACE FUNCTION cleanup_expired_data()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM user_data_raw
  WHERE retention_until IS NOT NULL AND retention_until < NOW();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  -- Log cleanup activity
  INSERT INTO sync_queue (user_id, queue_type, payload)
  SELECT DISTINCT user_id, 'cleanup_completed', jsonb_build_object('deleted_records', deleted_count)
  FROM user_data_raw
  WHERE retention_until IS NOT NULL AND retention_until < NOW();

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ====================================================================
-- TRIGGERS & AUTOMATION
-- ====================================================================

-- Automatically update twin evolution when insights change
CREATE OR REPLACE FUNCTION trigger_twin_evolution()
RETURNS TRIGGER AS $$
BEGIN
  -- When a new personality insight is created, log the evolution
  IF TG_OP = 'INSERT' THEN
    INSERT INTO twin_evolution_log (twin_id, user_id, change_type, new_value, trigger_source)
    SELECT
      dt.id,
      NEW.user_id,
      'personality_update',
      NEW.insight_data,
      'data_analysis'
    FROM digital_twins dt
    WHERE dt.user_id = NEW.user_id OR dt.creator_id = NEW.user_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS personality_evolution_trigger ON personality_insights;
CREATE TRIGGER personality_evolution_trigger
  AFTER INSERT OR UPDATE ON personality_insights
  FOR EACH ROW
  EXECUTE FUNCTION trigger_twin_evolution();

-- Schedule regular data quality assessments
CREATE OR REPLACE FUNCTION schedule_quality_assessment()
RETURNS TRIGGER AS $$
BEGIN
  -- When new raw data is ingested, schedule quality assessment
  INSERT INTO sync_queue (user_id, connector_id, queue_type, priority, payload)
  VALUES (
    NEW.user_id,
    NEW.connector_id,
    'quality_assessment',
    3,
    jsonb_build_object('data_id', NEW.id, 'data_type', NEW.data_type)
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS quality_assessment_trigger ON user_data_raw;
CREATE TRIGGER quality_assessment_trigger
  AFTER INSERT ON user_data_raw
  FOR EACH ROW
  EXECUTE FUNCTION schedule_quality_assessment();

-- ====================================================================
-- ADDITIONAL PERFORMANCE INDEXES
-- ====================================================================

CREATE INDEX IF NOT EXISTS idx_raw_data_user_recent
ON user_data_raw (user_id, source_timestamp DESC)
WHERE source_timestamp >= NOW() - INTERVAL '30 days';

CREATE INDEX IF NOT EXISTS idx_insights_user_recent
ON personality_insights (user_id, last_updated DESC)
WHERE valid_until IS NULL;

-- ====================================================================
-- COMMENTS & DOCUMENTATION
-- ====================================================================

COMMENT ON TABLE data_connectors IS 'OAuth connections to external services for data ingestion';
COMMENT ON TABLE user_data_raw IS 'Raw data ingested from connected services, before AI processing';
COMMENT ON TABLE personality_insights IS 'AI-processed insights about user personality and behavior patterns';
COMMENT ON TABLE twin_evolution_log IS 'Historical log of how digital twins evolve based on new data';
COMMENT ON TABLE automation_rules IS 'User-defined rules for automated actions by their digital twin';
COMMENT ON TABLE sync_queue IS 'Processing queue for real-time data synchronization and analysis';

-- Migration complete
