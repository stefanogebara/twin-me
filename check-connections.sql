SELECT 
  platform,
  last_sync_status,
  last_synced_at,
  created_at,
  CASE 
    WHEN access_token IS NOT NULL THEN 'Has Token'
    ELSE 'No Token'
  END as token_status
FROM platform_connections
WHERE user_id = 'a483a979-cf85-481d-b65b-af396c2c513a'
ORDER BY created_at DESC;
