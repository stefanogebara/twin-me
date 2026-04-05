-- Add new streaming platforms to user_platform_data check constraint
-- Required for browser extension v3.3 ingestion of disneyplus, hbomax, hulu, primevideo

ALTER TABLE user_platform_data DROP CONSTRAINT IF EXISTS user_platform_data_platform_check;
ALTER TABLE user_platform_data ADD CONSTRAINT user_platform_data_platform_check
CHECK (platform = ANY (ARRAY[
  'spotify', 'youtube', 'github', 'discord', 'reddit', 'gmail', 'calendar',
  'linkedin', 'slack', 'teams', 'twitter', 'instagram', 'tiktok', 'netflix',
  'goodreads', 'twitch', 'whoop', 'web', 'hbo', 'amazon', 'disney',
  'google_calendar', 'google_gmail', 'outlook',
  'disneyplus', 'hbomax', 'hulu', 'primevideo'
]));
