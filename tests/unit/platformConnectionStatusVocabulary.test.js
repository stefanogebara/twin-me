/**
 * Every status value the code writes to platform_connections must be
 * permitted by the CHECK constraint migration.
 *
 * Prod incident 2026-08-25: the live constraint allowed only
 * ('connected','disconnected','error','pending','expired') while six call
 * sites wrote 'needs_reauth' and one wrote 'auth_failed'. Postgres rejected
 * those UPDATEs, every caller swallowed the error into a log.warn, and so
 * connections that lost auth were never flagged for reconnect — the retry
 * storms just continued.
 *
 * The unit tests around those call sites all mock Supabase, so they assert
 * the code *attempts* the write and can never catch the database refusing
 * the value. This test closes that gap statically: it reads the vocabulary
 * out of the migration and out of the source, and fails if they diverge.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = 'database/migrations/20260825_platform_connections_status_needs_reauth.sql';

function allowedStatuses() {
  const sql = readFileSync(MIGRATION, 'utf8');
  const check = sql.match(/CHECK \(status IN \(([^)]+)\)\)/);
  if (!check) throw new Error(`Could not parse the CHECK constraint out of ${MIGRATION}`);
  return new Set([...check[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));
}

function jsFilesUnder(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...jsFilesUnder(full));
    else if (entry.endsWith('.js')) out.push(full);
  }
  return out;
}

/**
 * Find `status: '<value>'` literals that sit within a bounded window after a
 * `.from('platform_connections')`, ignoring `last_sync_status:` (a different
 * column with its own, wider constraint).
 */
function statusesWrittenToPlatformConnections() {
  const found = new Map();
  for (const file of jsFilesUnder('api')) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!line.includes("from('platform_connections')")) return;
      for (const win of lines.slice(i, i + 12)) {
        for (const m of win.matchAll(/(?<!last_sync_)status:\s*'([a-z_]+)'/g)) {
          if (!found.has(m[1])) found.set(m[1], `${file}:${i + 1}`);
        }
      }
    });
  }
  return found;
}

describe('platform_connections.status vocabulary', () => {
  it('permits the values the migration is meant to add', () => {
    const allowed = allowedStatuses();
    expect(allowed.has('needs_reauth')).toBe(true);
    expect(allowed.has('auth_failed')).toBe(true);
  });

  it('keeps every value already present in live rows', () => {
    const allowed = allowedStatuses();
    for (const status of ['connected', 'disconnected', 'expired']) {
      expect(allowed.has(status)).toBe(true);
    }
  });

  it('allows every status the code writes to platform_connections', () => {
    const allowed = allowedStatuses();
    const written = statusesWrittenToPlatformConnections();

    // Guard against the scan silently matching nothing and passing vacuously.
    expect(written.has('needs_reauth')).toBe(true);

    const rejected = [...written.entries()]
      .filter(([status]) => !allowed.has(status))
      .map(([status, where]) => `${status} (first written at ${where})`);

    expect(rejected).toEqual([]);
  });
});
