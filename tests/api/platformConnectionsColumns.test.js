/**
 * Drift guard: no source file may write a `last_sync` COLUMN on platform_connections.
 *
 * The table has `last_sync_at`; there is no `last_sync` column (verified against
 * information_schema 2026-08-02). Postgres rejects an UPDATE naming an unknown
 * column, and it rejects the WHOLE statement — so a payload like
 *
 *   .update({ last_sync: ..., last_sync_status: 'success', last_sync_error: null })
 *
 * silently discarded the status and error fields too, leaving stale sync errors
 * pinned on connections forever. Nine call sites had this shape across
 * soul-extraction, platformPollingService and webhookReceiverService.
 *
 * `last_sync` nested inside the `metadata` JSONB column is FINE and intentional —
 * calendar-oauth.js writes `last_sync_at` (column) alongside `metadata.last_sync`.
 * This guard therefore only flags top-level keys, not metadata keys.
 *
 * Note `soul_data_sources` genuinely does have a `last_sync` column, so this
 * guard is deliberately scoped to platform_connections blocks only.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { globSync } from 'glob';

const REPO_ROOT = join(import.meta.dirname, '..', '..');

/**
 * Find top-level `last_sync:` keys inside object literals that belong to a
 * platform_connections query. Walks forward from each `.from('platform_connections')`,
 * tracking brace depth so keys nested under `metadata: {` are ignored.
 */
function findLastSyncColumnWrites(source) {
  const lines = source.split('\n');
  const violations = [];

  for (let i = 0; i < lines.length; i++) {
    if (!/\.from\(['"]platform_connections['"]\)/.test(lines[i])) continue;

    // Scan the query that follows as one string, so a single-line
    // `.update({ last_sync: ... })` is handled the same as a multi-line payload.
    const window = lines.slice(i + 1, i + 60).join('\n');

    let depth = 0;
    let started = false;
    let end = window.length;
    for (let p = 0; p < window.length; p++) {
      if (window[p] === '{') { depth++; started = true; }
      else if (window[p] === '}') {
        depth--;
        if (started && depth <= 0) { end = p; break; }
      }
    }

    // A top-level column key sits at depth 1 — inside the payload object but
    // not nested under `metadata: {`.
    for (const m of window.slice(0, end).matchAll(/\blast_sync\s*:/g)) {
      let d = 0;
      for (let p = 0; p < m.index; p++) {
        if (window[p] === '{') d++;
        else if (window[p] === '}') d--;
      }
      if (d !== 1) continue;
      const lineOffset = window.slice(0, m.index).split('\n').length - 1;
      const absolute = i + 1 + lineOffset;
      violations.push({ line: absolute + 1, text: lines[absolute].trim() });
    }
  }

  return violations;
}

describe('platform_connections column names', () => {
  const files = globSync('api/**/*.js', {
    cwd: REPO_ROOT,
    absolute: true,
    ignore: ['**/node_modules/**'],
  });

  it('finds source files to scan', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  // Explicit timeout: this test cold-reads ~650 source files. On Windows the
  // first open of each file goes through Defender real-time scanning; measured
  // >100s cold under full-suite FS contention vs ~0.5s warm. The 5s default
  // made this test fail nondeterministically depending on cache state and
  // parallel-worker load — the scan itself is deterministic.
  it('never writes a top-level last_sync column on platform_connections', { timeout: 120_000 }, () => {
    const offenders = [];
    for (const file of files) {
      const found = findLastSyncColumnWrites(readFileSync(file, 'utf8'));
      for (const v of found) {
        offenders.push(`${file.slice(REPO_ROOT.length + 1).replace(/\\/g, '/')}:${v.line}  ${v.text}`);
      }
    }

    expect(
      offenders,
      `platform_connections has no "last_sync" column — use "last_sync_at".\n` +
        `Postgres rejects the entire UPDATE on an unknown column, so sibling\n` +
        `fields in the same payload are silently dropped too. Offenders:\n` +
        offenders.map((o) => `  ${o}`).join('\n')
    ).toEqual([]);
  });

  it('still allows last_sync as a metadata JSONB key', () => {
    // calendar-oauth.js is the canonical correct shape: real column + metadata key.
    const sample = `
      .from('platform_connections')
      .update({
        last_sync_at: new Date().toISOString(),
        metadata: {
          last_sync: new Date().toISOString(),
        }
      })
    `;
    expect(findLastSyncColumnWrites(sample)).toEqual([]);
  });

  it('detects a top-level last_sync write', () => {
    const sample = `
      .from('platform_connections')
      .update({
        last_sync: new Date().toISOString(),
      })
    `;
    expect(findLastSyncColumnWrites(sample)).toHaveLength(1);
  });
});
