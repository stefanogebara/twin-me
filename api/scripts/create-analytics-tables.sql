-- Analytics Events Table
CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(100) NOT NULL,
  event_data JSONB DEFAULT '{}',
  user_id VARCHAR(255),
  session_id VARCHAR(255) NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  page_url TEXT,
  user_agent TEXT,
  referrer TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  INDEX idx_analytics_events_user_id (user_id),
  INDEX idx_analytics_events_session_id (session_id),
  INDEX idx_analytics_events_timestamp (timestamp),
  INDEX idx_analytics_events_event_type (event_type)
);

-- Analytics Sessions Table
CREATE TABLE IF NOT EXISTS analytics_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR(255) UNIQUE NOT NULL,
  user_id VARCHAR(255),
  start_time TIMESTAMPTZ DEFAULT NOW(),
  end_time TIMESTAMPTZ,
  page_count INTEGER DEFAULT 0,
  event_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  INDEX idx_analytics_sessions_user_id (user_id),
  INDEX idx_analytics_sessions_session_id (session_id),
  INDEX idx_analytics_sessions_start_time (start_time)
);

-- Function to update session metrics
CREATE OR REPLACE FUNCTION update_session_metrics()
RETURNS TRIGGER AS $$
BEGIN
  -- Update session event count and page count when new events are added
  INSERT INTO analytics_sessions (session_id, user_id, event_count, page_count)
  VALUES (
    NEW.session_id,
    NEW.user_id,
    1,
    CASE WHEN NEW.event_type = 'page_view' THEN 1 ELSE 0 END
  )
  ON CONFLICT (session_id)
  DO UPDATE SET
    event_count = analytics_sessions.event_count + 1,
    page_count = analytics_sessions.page_count +
      CASE WHEN NEW.event_type = 'page_view' THEN 1 ELSE 0 END,
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update session metrics
DROP TRIGGER IF EXISTS trigger_update_session_metrics ON analytics_events;
CREATE TRIGGER trigger_update_session_metrics
  AFTER INSERT ON analytics_events
  FOR EACH ROW
  EXECUTE FUNCTION update_session_metrics();

-- Views for common analytics queries
CREATE OR REPLACE VIEW analytics_dashboard AS
SELECT
  DATE_TRUNC('day', timestamp) as date,
  COUNT(*) as total_events,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(DISTINCT session_id) as unique_sessions,
  COUNT(CASE WHEN event_type = 'page_view' THEN 1 END) as page_views,
  COUNT(CASE WHEN event_type = 'user_action' THEN 1 END) as user_actions,
  COUNT(CASE WHEN event_type = 'twin_interaction' THEN 1 END) as twin_interactions,
  COUNT(CASE WHEN event_type = 'conversation_session' THEN 1 END) as conversations
FROM analytics_events
WHERE timestamp >= NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', timestamp)
ORDER BY date DESC;

CREATE OR REPLACE VIEW popular_twins AS
SELECT
  event_data->>'twin_id' as twin_id,
  event_data->>'twin_name' as twin_name,
  COUNT(*) as interaction_count,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(CASE WHEN event_type = 'conversation_session' THEN 1 END) as conversations,
  AVG(CASE WHEN event_data->>'duration_seconds' IS NOT NULL
    THEN (event_data->>'duration_seconds')::INTEGER END) as avg_conversation_duration
FROM analytics_events
WHERE event_type IN ('twin_interaction', 'conversation_session')
  AND event_data->>'twin_id' IS NOT NULL
  AND timestamp >= NOW() - INTERVAL '7 days'
GROUP BY event_data->>'twin_id', event_data->>'twin_name'
ORDER BY interaction_count DESC;

CREATE OR REPLACE VIEW user_engagement AS
SELECT
  user_id,
  COUNT(*) as total_events,
  COUNT(DISTINCT session_id) as sessions,
  COUNT(CASE WHEN event_type = 'page_view' THEN 1 END) as page_views,
  COUNT(CASE WHEN event_type = 'conversation_session' THEN 1 END) as conversations,
  MIN(timestamp) as first_visit,
  MAX(timestamp) as last_visit,
  EXTRACT(EPOCH FROM (MAX(timestamp) - MIN(timestamp))) / 3600 as lifetime_hours
FROM analytics_events
WHERE user_id IS NOT NULL
  AND timestamp >= NOW() - INTERVAL '30 days'
GROUP BY user_id
ORDER BY total_events DESC;