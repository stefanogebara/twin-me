-- Fix: morning briefing cron was only finding 1 active user due to missing DISTINCT.
-- The JS query used .limit(200) without DISTINCT, so high-volume users (Stefano: 2860
-- memories/week) consumed all 200 slots, leaving other users invisible.
CREATE OR REPLACE FUNCTION get_active_user_ids(since_timestamp TIMESTAMPTZ)
RETURNS TABLE(user_id UUID) AS $$
  SELECT DISTINCT user_id FROM user_memories WHERE created_at >= since_timestamp;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;
