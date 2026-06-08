-- Add 'strava' to the platform_connections.platform CHECK constraint.
--
-- Bug (2026-06-08 audit): Strava has a real observation fetcher + feature
-- extractor and is offered as a live tile in the connect UI, but the
-- platform_connections.platform CHECK omitted 'strava'. So storing a Strava
-- connection row fails the constraint — for BOTH the Nango verify-connection
-- upsert and the direct-OAuth path. Add it (mirrors the existing list).

ALTER TABLE platform_connections DROP CONSTRAINT IF EXISTS platform_connections_platform_check;
ALTER TABLE platform_connections ADD CONSTRAINT platform_connections_platform_check
CHECK (platform = ANY (ARRAY[
  'spotify', 'discord', 'github', 'youtube', 'netflix', 'reddit', 'google',
  'google_gmail', 'google_calendar', 'linkedin', 'slack', 'twitch', 'steam',
  'goodreads', 'tiktok', 'instagram', 'apple_music', 'hbo', 'prime_video',
  'disney_plus', 'microsoft_teams', 'whoop', 'oura', 'outlook', 'garmin',
  'polar', 'suunto', 'apple_health', 'gmail',
  'strava'
]));
