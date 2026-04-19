-- Insight provenance: track which platforms each proactive insight draws from.
-- Enables UI chips that prove the twin is cross-correlating signals across platforms.

ALTER TABLE proactive_insights
  ADD COLUMN IF NOT EXISTS sources TEXT[] DEFAULT '{}';

-- Backfill legacy rows: scan existing insight text for known platform names.
UPDATE proactive_insights SET sources = ARRAY(
  SELECT DISTINCT p FROM (VALUES
    ('Spotify'),('YouTube'),('Gmail'),('GitHub'),('Whoop'),('Calendar'),
    ('Discord'),('Reddit'),('LinkedIn'),('Twitch'),('WhatsApp'),('Netflix'),
    ('TikTok'),('Letterboxd'),('Goodreads'),('Notion'),('Pinterest')
  ) AS platforms(p)
  WHERE insight ILIKE '%' || p || '%'
) WHERE sources IS NULL OR cardinality(sources) = 0;
