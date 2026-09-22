/**
 * Static audit for multi-device refresh token refactor.
 *
 * Asserts that auth-simple.js:
 *   1. References the new user_refresh_tokens table
 *   2. Uses the new-table lookup pattern in refresh handler (token_hash WHERE)
 *   3. Still references users.refresh_token_hash for backward-compat fallback
 *
 * This is intentionally a static source audit — no DB or network. It guards
 * against accidental regressions where someone rips out either the new path
 * (breaking multi-device) or the legacy fallback (invalidating in-flight
 * cookies during rollout).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = resolve(__dirname, '../../api/routes/auth-simple.js');
const MIGRATION_FILE = resolve(
  __dirname,
  '../../database/supabase/migrations/20260422_user_refresh_tokens.sql'
);

const authSource = readFileSync(AUTH_FILE, 'utf8');
const migrationSource = readFileSync(MIGRATION_FILE, 'utf8');

describe('user_refresh_tokens — multi-device session refactor', () => {
  describe('auth-simple.js, through api/services/auth/authStore.js (M2-D, 2026-09-22)', () => {
    /* The table calls live in the store now; the route calls the store by name. Both are read,
       so a regression on either side (the route stops persisting, or the store stops filtering
       by hash) fails here. */
    const storeSource = readFileSync(resolve(__dirname, '../../api/services/auth/authStore.js'), 'utf8');

    it('the store owns the user_refresh_tokens table', () => {
      expect(storeSource).toMatch(/from\('user_refresh_tokens'\)/);
      expect(authSource).not.toMatch(/\.from\(/);
    });

    it('inserts into user_refresh_tokens on signup/signin', () => {
      expect(authSource).toMatch(/insertRefreshToken\(/);
      expect(storeSource).toMatch(/from\('user_refresh_tokens'\)\.insert\(row\)/);
    });

    it('refresh handler selects from user_refresh_tokens by token_hash', () => {
      expect(authSource).toMatch(/findRefreshToken\(tokenHash\)/);
      expect(storeSource).toMatch(/from\('user_refresh_tokens'\)\.select\([^)]*\)\.eq\('token_hash', hash\)\.single\(\)/);
    });

    it('preserves legacy users.refresh_token_hash fallback for in-flight cookies', () => {
      // Backward-compat: tokens issued before the migration must still work.
      expect(authSource).toMatch(/findUserByLegacyRefreshHash\(/);
      expect(storeSource).toMatch(/eq\('refresh_token_hash', hash\)/);
    });

    it('logout deletes a specific row (not a column null-out)', () => {
      expect(authSource).toMatch(/deleteRefreshTokenByHash\(rtHash\)/);
      expect(storeSource).toMatch(/from\('user_refresh_tokens'\)\.delete\(\)\.eq\('token_hash', hash\)/);
    });

    it('captures device_label from user-agent header', () => {
      expect(authSource).toMatch(/user-agent/i);
      expect(authSource).toMatch(/device_label/);
    });
  });

  describe('migration 20260422_user_refresh_tokens.sql', () => {
    it('creates the user_refresh_tokens table', () => {
      expect(migrationSource).toMatch(/CREATE TABLE IF NOT EXISTS public\.user_refresh_tokens/);
    });

    it('backfills from users.refresh_token_hash', () => {
      expect(migrationSource).toMatch(/INSERT INTO public\.user_refresh_tokens[\s\S]+FROM public\.users/);
    });

    it('enables RLS with a service_role policy', () => {
      expect(migrationSource).toMatch(/ENABLE ROW LEVEL SECURITY/);
      expect(migrationSource).toMatch(/FOR ALL TO service_role/);
    });

    it('does NOT drop users.refresh_token_hash yet (rollout safety)', () => {
      expect(migrationSource).not.toMatch(/DROP\s+COLUMN\s+refresh_token_hash/i);
      expect(migrationSource).not.toMatch(/DROP\s+COLUMN\s+IF\s+EXISTS\s+refresh_token_hash/i);
    });
  });
});
