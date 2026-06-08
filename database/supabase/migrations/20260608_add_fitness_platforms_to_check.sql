-- Add fitness platforms (strava, oura) to the user_platform_data platform CHECK.
--
-- Bug (2026-06-08 audit): observationFetchers/strava.js (platform:'strava', :121)
-- and observationFetchers/oura.js (platform:'oura', :42) write structured rows to
-- user_platform_data, but the prior CHECK constraint omitted both. The inserts are
-- fire-and-forget (`.catch(() => {})`), so the constraint violation was swallowed
-- silently — starving stravaExtractor.js / ouraExtractor.js of structured data and
-- forcing their degraded text-regex fallback. Memory-stream observations (user_memories,
-- unconstrained) were unaffected, which is why the failure was invisible.
--
-- Note: garmin/fitbit fetchers do NOT write to user_platform_data (memory-stream only),
-- so they are intentionally not added here.

ALTER TABLE user_platform_data DROP CONSTRAINT IF EXISTS user_platform_data_platform_check;
ALTER TABLE user_platform_data ADD CONSTRAINT user_platform_data_platform_check
CHECK (platform = ANY (ARRAY[
  'spotify', 'youtube', 'github', 'discord', 'reddit', 'gmail', 'calendar',
  'linkedin', 'slack', 'teams', 'twitter', 'instagram', 'tiktok', 'netflix',
  'goodreads', 'twitch', 'whoop', 'web', 'hbo', 'amazon', 'disney',
  'google_calendar', 'google_gmail', 'outlook',
  'disneyplus', 'hbomax', 'hulu', 'primevideo',
  'strava', 'oura'
]));
