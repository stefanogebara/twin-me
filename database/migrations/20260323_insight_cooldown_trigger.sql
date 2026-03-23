-- Database-level cooldown enforcement for proactive_insights.
-- Prevents spam regardless of source (test scripts, stale Vercel instances, concurrent Inngest runs).
-- Silently rejects inserts that violate per-user per-category cooldown.

CREATE OR REPLACE FUNCTION enforce_insight_cooldown()
RETURNS TRIGGER AS $$
DECLARE
  cooldown_hours INT;
  recent_count INT;
BEGIN
  cooldown_hours := CASE NEW.category
    WHEN 'music_mood_match' THEN 6
    WHEN 'briefing' THEN 20
    WHEN 'evening_recap' THEN 20
    WHEN 'email_triage' THEN 20
    ELSE 1
  END;

  SELECT count(*) INTO recent_count
  FROM proactive_insights
  WHERE user_id = NEW.user_id
    AND category = NEW.category
    AND created_at >= NOW() - (cooldown_hours || ' hours')::INTERVAL;

  IF recent_count > 0 THEN
    RAISE NOTICE 'Insight cooldown active for user % category % (% existing in last %h)',
      NEW.user_id, NEW.category, recent_count, cooldown_hours;
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_insight_cooldown
  BEFORE INSERT ON proactive_insights
  FOR EACH ROW
  EXECUTE FUNCTION enforce_insight_cooldown();
