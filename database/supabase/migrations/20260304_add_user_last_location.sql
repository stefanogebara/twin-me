-- Add last_location JSONB to users table
-- Stores current lat/lng/timezone/sun_phase for twin context + sun-driven background
-- Updated by frontend SunContext when GPS/IP location is resolved

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS last_location jsonb DEFAULT NULL;

-- Example value:
-- {
--   "latitude": 48.86,
--   "longitude": 2.35,
--   "timezone": "Europe/Paris",
--   "sun_phase": "morning",
--   "source": "gps",
--   "updated_at": "2026-03-04T10:30:00Z"
-- }

COMMENT ON COLUMN public.users.last_location IS 'Current location context: lat/lng/timezone/sun_phase. Updated by frontend, consumed by twin chat for temporal/geographic awareness.';
