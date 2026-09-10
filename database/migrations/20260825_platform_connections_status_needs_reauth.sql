-- Widen platform_connections.status to the vocabulary the code actually writes.
--
-- Context (prod, found 2026-08-25): the live CHECK allowed only
-- ('connected','disconnected','error','pending','expired'), but six call
-- sites write 'needs_reauth' and one writes 'auth_failed':
--
--   api/services/userContextAggregator.js       (legacy Whoop undecryptable)
--   api/services/tokenRefreshService.js:351     (refresh decrypt failure)
--   api/services/platformPollingService.js:157  (401 from platform)
--   api/cron/platform-polling.js                (401 from platform)
--   api/services/tokenManagers/githubTokenManager.js
--   api/services/observationFetchers/github.js
--   api/services/observationIngestion.js:650    ('auth_failed')
--
-- Every one of those UPDATEs was rejected by the constraint and swallowed by
-- an `if (error) log.warn(...)` branch, so a connection that lost auth was
-- never flagged: platformStateService.js:66 reads status === 'needs_reauth'
-- to surface the reconnect prompt and never saw it, and the callers kept
-- retrying the dead connection on every request. Prod bore this out — the
-- table held only connected/disconnected/expired, never needs_reauth.
--
-- The repo's own 004_add_status_column_to_platform_connections.sql declared
-- 'needs_reauth' from the start; the live DB drifted from it (it has
-- 'pending'/'expired' where 004 had 'token_expired'/'needs_reauth'). This
-- migration reconciles the two: keep every value currently in the live
-- constraint (existing rows use connected/disconnected/expired) and add the
-- two the code needs.

ALTER TABLE platform_connections
  DROP CONSTRAINT IF EXISTS platform_connections_status_check;

ALTER TABLE platform_connections
  ADD CONSTRAINT platform_connections_status_check
  CHECK (status IN (
    'connected',
    'disconnected',
    'error',
    'pending',
    'expired',
    'needs_reauth',
    'auth_failed'
  ));

-- Refresh PostgREST's schema cache.
NOTIFY pgrst, 'reload schema';
