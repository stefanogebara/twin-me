/**
 * Regression tests for the 4 extractors fixed in commit 6aad5fb1 (2026-04-24).
 *
 * The bug: spotifyExtraction, discordExtraction, githubExtraction all called
 * `.from('soul_data').insert(...)` against a table with a UNIQUE constraint
 * on (user_id, platform, data_type). Every re-extraction after the first
 * silently failed. extractionOrchestrator.js had a stub case for
 * google_calendar that returned `{ success: true, itemsExtracted: 0 }` —
 * the real extractor was never called.
 *
 * These tests are deliberately source-text assertions rather than mocked
 * runtime tests. They're cheap to maintain and catch the precise revert
 * pattern: someone says "let's just use insert" and removes the upsert.
 *
 * For deep behavioral coverage, the live E2E suite at
 * tests/purchase-bot-e2e.spec.ts exercises the full extractor → DB →
 * read path against a real Supabase. This file is the static guard.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.join(__dirname, '..', '..', 'api');

function readSource(relPath) {
  return fs.readFileSync(path.join(apiDir, relPath), 'utf8');
}

describe('Extractor upsert regression (commit 6aad5fb1)', () => {
  describe('spotifyExtraction.js', () => {
    const src = readSource('services/spotifyExtraction.js');

    it('uses .upsert() not .insert() on soul_data', () => {
      // Find every line that touches soul_data
      const soulDataBlock = src.split('\n')
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => line.includes("from('soul_data')"));
      expect(soulDataBlock.length).toBeGreaterThan(0);
      // For each, look ±5 lines for the method
      for (const { i } of soulDataBlock) {
        const window = src.split('\n').slice(Math.max(0, i - 1), i + 6).join('\n');
        expect(window, 'soul_data write must use .upsert(): ' + window.slice(0, 200))
          .toMatch(/\.upsert\(/);
        expect(window, 'soul_data write MUST NOT use .insert(): ' + window.slice(0, 200))
          .not.toMatch(/\.insert\(\s*\{/);
      }
    });

    it('declares onConflict matching the actual unique constraint', () => {
      // The unique constraint on soul_data is (user_id, platform, data_type).
      // The onConflict option must list those three.
      expect(src).toMatch(/onConflict:\s*['"]user_id,platform,data_type['"]/);
    });
  });

  describe('discordExtraction.js', () => {
    const src = readSource('services/discordExtraction.js');

    it('uses .upsert() not .insert() on soul_data', () => {
      expect(src).toMatch(/from\(['"]soul_data['"]\)[\s\S]{0,80}\.upsert\(/);
      // No insert call against soul_data anywhere
      const insertNearSoulData = /from\(['"]soul_data['"]\)[\s\S]{0,80}\.insert\(/;
      expect(src).not.toMatch(insertNearSoulData);
    });

    it('declares onConflict matching the actual unique constraint', () => {
      expect(src).toMatch(/onConflict:\s*['"]user_id,platform,data_type['"]/);
    });
  });

  describe('githubExtraction.js', () => {
    const src = readSource('services/githubExtraction.js');

    it('uses .upsert() not .insert() on soul_data', () => {
      expect(src).toMatch(/from\(['"]soul_data['"]\)[\s\S]{0,80}\.upsert\(/);
      const insertNearSoulData = /from\(['"]soul_data['"]\)[\s\S]{0,80}\.insert\(/;
      expect(src).not.toMatch(insertNearSoulData);
    });

    it('declares onConflict matching the actual unique constraint', () => {
      expect(src).toMatch(/onConflict:\s*['"]user_id,platform,data_type['"]/);
    });

    it('all GitHub API calls have explicit timeout (L2 regression)', () => {
      // Find every axios.get call. Each must have a timeout option in the
      // same call to avoid hangs on slow GitHub responses.
      const calls = [...src.matchAll(/axios\.get\([^)]*\)/gm)];
      expect(calls.length).toBeGreaterThan(0);
      for (const m of calls) {
        // Check 200 chars after the start of the call to find the timeout
        const start = m.index ?? 0;
        const window = src.slice(start, start + 400);
        expect(window, `GitHub axios.get is missing timeout: ${m[0].slice(0, 80)}`)
          .toMatch(/timeout:\s*\d+/);
      }
    });
  });

  describe('extractionOrchestrator.js', () => {
    const src = readSource('services/extractionOrchestrator.js');

    it('google_calendar case calls fetchCalendarObservations (not the stub)', () => {
      // The previous stub returned { success: true, itemsExtracted: 0,
      // message: 'Calendar feature extraction removed' }. If anyone reverts,
      // this test fails loudly.
      expect(src).not.toMatch(/Calendar feature extraction removed/);
      expect(src).toMatch(/fetchCalendarObservations/);
    });

    it('does not declare a redundant `case \'calendar\':` alias (M6)', () => {
      // M6: the codebase consistently uses 'google_calendar' — the bare
      // 'calendar' alias was dead code that confused the routing surface.
      expect(src).not.toMatch(/case\s*['"]calendar['"]\s*:/);
    });
  });

  describe('observationFetchers/calendar.js', () => {
    const src = readSource('services/observationFetchers/calendar.js');

    it('writes events to user_platform_data with hour-keyed source_url (H6)', () => {
      // H6: we rotated source_url from per-day to per-hour so intraday
      // reschedules don't overwrite each other.
      expect(src).toMatch(/source_url:\s*[`'"]calendar:events:\$\{[^}]*hour/i);
    });

    it('persists raw events with platform=google_calendar, data_type=events', () => {
      expect(src).toMatch(/platform:\s*['"]google_calendar['"]/);
      expect(src).toMatch(/data_type:\s*['"]events['"]/);
    });

    it('does not call getValidAccessToken more than once (H3)', () => {
      // H3: three sequential token fetches tripled cold-start latency. The
      // function should fetch once at entry and reuse the result.
      const matches = [...src.matchAll(/await\s+getValidAccessToken\(/g)];
      expect(matches.length, 'getValidAccessToken should be awaited at most once').toBeLessThanOrEqual(1);
    });
  });
});
