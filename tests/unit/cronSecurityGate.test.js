/**
 * Static audit: every api/routes/cron-*.js MUST call verifyCronSecret().
 *
 * Regression guard for the 2026-04-21 bug where cron-bank-consent shipped
 * without an auth gate (router.get('/', async (_req, res) => { ... })
 * with no CRON_SECRET check). `curl` with no Authorization returned 200,
 * letting anyone trigger the cron — DDoS vector hitting Supabase + spam
 * push-notification fanout.
 *
 * This test fails at CI time if anyone adds a new cron route without
 * wiring the gate. No more drift.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROUTES_DIR = join(process.cwd(), 'api', 'routes');

function listCronFiles() {
  return readdirSync(ROUTES_DIR)
    .filter((name) => name.startsWith('cron-') && name.endsWith('.js'))
    .map((name) => ({
      name,
      path: join(ROUTES_DIR, name),
      src: readFileSync(join(ROUTES_DIR, name), 'utf8'),
    }));
}

describe('cron route security gates', () => {
  const files = listCronFiles();

  it('finds at least 10 cron routes (sanity check)', () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  it.each(files)('$name imports verifyCronSecret', ({ src }) => {
    // Must import from the shared middleware — no ad-hoc copies.
    expect(src).toMatch(
      /import\s*\{[^}]*verifyCronSecret[^}]*\}\s*from\s*['"][^'"]*verifyCronSecret(?:\.js)?['"]/,
    );
  });

  it.each(files)('$name calls verifyCronSecret(req) in its handler', ({ src }) => {
    // Actual invocation — not just the import. Requires parentheses with
    // something that looks like a request argument.
    expect(src).toMatch(/verifyCronSecret\s*\(\s*\w+\s*\)/);
  });

  it.each(files)('$name checks authResult.authorized before running the cron body', ({ src }) => {
    // Early-return on unauthorized. We check for the standard pattern used
    // across the codebase: "if (!authResult.authorized) return ..." or
    // equivalent. A cron that imports verifyCronSecret but discards its
    // result would still be exploitable.
    expect(src).toMatch(/if\s*\(\s*!\s*\w+\.authorized/);
  });
});
