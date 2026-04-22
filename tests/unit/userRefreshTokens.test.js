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
  describe('auth-simple.js', () => {
    it('references the new user_refresh_tokens table', () => {
      expect(authSource).toMatch(/user_refresh_tokens/);
    });

    it('inserts into user_refresh_tokens on signup/signin', () => {
      // At least one .from('user_refresh_tokens').insert pattern must exist
      const pattern = /from\(['"]user_refresh_tokens['"]\)\s*\.?\s*\n?\s*\.insert/;
      expect(authSource).toMatch(pattern);
    });

    it('refresh handler selects from user_refresh_tokens by token_hash', () => {
      // Must SELECT from the new table, filtering by token_hash, before
      // falling back to the legacy column.
      const hasNewTableLookup =
        /from\(['"]user_refresh_tokens['"]\)[\s\S]{0,200}\.eq\(['"]token_hash['"]/.test(authSource);
      expect(hasNewTableLookup).toBe(true);
    });

    it('preserves legacy users.refresh_token_hash fallback for in-flight cookies', () => {
      // Backward-compat: tokens issued before the migration must still work.
      expect(authSource).toMatch(/refresh_token_hash/);
    });

    it('logout deletes a specific row (not a column null-out)', () => {
      // Logout must .delete() from user_refresh_tokens — not just null the column.
      const pattern = /from\(['"]user_refresh_tokens['"]\)[\s\S]{0,200}\.delete\(/;
      expect(authSource).toMatch(pattern);
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
