-- Drop the legacy single-column refresh-token hash on users (audit S6, 2026-09-26).
--
-- Superseded by user_refresh_tokens (20260422_user_refresh_tokens.sql, one row per
-- device, with rotation and reuse detection). That migration's own TODO said this
-- column should go 30 days later, "earliest safe date: 2026-05-22", but auth-simple.js
-- kept writing every rotated hash into it and reading it back with no expiry check.
-- That is what undid reuse detection: when a stolen token's successor got rotated in,
-- deleting the row a victim's reuse attempt revoked left the successor still matching
-- this column, so the thief's session kept working; an expired token, refused once,
-- was accepted through the column on a second try. The code that read and wrote it is
-- removed in the same change as this migration, and works whether the column exists
-- or not, so apply this by hand (Supabase SQL editor / MCP apply_migration) any time
-- after that code deploys -- there is no ordering hazard, only no further reason to
-- keep the column around.

DROP INDEX IF EXISTS idx_users_refresh_token;

ALTER TABLE public.users DROP COLUMN IF EXISTS refresh_token_hash;
