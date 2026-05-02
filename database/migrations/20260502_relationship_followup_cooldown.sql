-- Add `relationship_followup` to the per-category cooldown enforced by the
-- enforce_insight_cooldown trigger. 24-hour window so the daily relationships
-- cron can refresh once per day; on-demand refresh paths must use the upsert
-- pattern (see api/services/inboxIntelligenceService.js for prior art).

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
    WHEN 'relationship_followup' THEN 23
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
