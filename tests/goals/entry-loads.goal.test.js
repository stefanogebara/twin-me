/**
 * Goal: the thing Vercel runs can actually be loaded.
 * ===================================================
 * On 2026-09-24 `sheet.js` imported `listOwnTransactions` from `store.js`, which re-exported
 * every neighbouring name but that one. Production answered FUNCTION_INVOCATION_FAILED for
 * twelve hours while every suite stayed green, because a missing named export is a link-time
 * error only in a real ES module graph: vitest resolves through Vite's transform, where the
 * same import is merely `undefined`, and every unit test mocks the store anyway.
 *
 * So this test does not import anything itself. It runs Node the way Vercel does, on the same
 * entry (`api/index.js`), in a child process, and asks the process whether the graph linked.
 * Nothing listens: the entry exports the app, and the server only listens when it is the main
 * module. Configuration it cannot do without is stubbed, because what is proved here is
 * linkage, not deployment.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const STUBS = {
  JWT_SECRET: 'entry-loads-goal-test-secret-of-at-least-32-chars',
  ENCRYPTION_KEY: '0'.repeat(64),
  TOKEN_ENCRYPTION_KEY: '0'.repeat(64),
  /* server.js exits on REQUIRED_ENV_VARS before anything can report; the list is four long. */
  OPENROUTER_API_KEY: 'entry-loads-openrouter-key',
  SUPABASE_URL: 'https://entry-loads.supabase.co',
  VITE_SUPABASE_URL: 'https://entry-loads.supabase.co',
  SUPABASE_ANON_KEY: 'entry-loads-anon-key',
  VITE_SUPABASE_ANON_KEY: 'entry-loads-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'entry-loads-service-role-key',
};

/**
 * Loads one module in its own Node process and returns its verdict. The child always exits 0 and
 * answers between markers, because everything here writes to the console on the way up: dotenv
 * prints a banner to stdout, Redis and Sentry warn on stderr, and neither an exit code nor the
 * first line of either stream can tell a warning from a broken link.
 */
function loadInNode(file) {
  const code = `import(${JSON.stringify(path.join(ROOT, file))})
    .then(() => { process.stdout.write('@@LOADED@@'); })
    .catch((e) => { process.stdout.write('@@LOADERROR ' + (e && e.message ? e.message : String(e)).split('\\n')[0] + '@@'); })
    .finally(() => process.exit(0));`;
  const run = { cwd: ROOT, encoding: 'utf8', timeout: 90000, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...Object.fromEntries(Object.entries(STUBS).filter(([k]) => !process.env[k])), DISABLE_BACKGROUND_JOBS: 'true', NODE_ENV: 'test' } };
  let out;
  try {
    out = execFileSync(process.execPath, ['--input-type=module', '-e', code], run);
  } catch (e) {
    /* A module that calls process.exit on the way up never reaches the marker, and its own last
       words are the reason: they sit at the end of stderr, under every warning. */
    const why = String(e.stderr || e.stdout || e.message).split('\n').map((l) => l.trim()).filter(Boolean).slice(-3).join(' | ');
    return `the child died: ${why.slice(0, 300)}`;
  }
  const said = /@@(LOADED|LOADERROR[^@]*)@@/.exec(out);
  return said ? said[1] : `the child said nothing: ${out.trim().slice(-200)}`;
}

describe('the deployed entry loads', () => {
  it('api/index.js, the file Vercel runs, and every module it reaches', () => {
    expect(loadInNode('api/index.js')).toBe('LOADED');
  }, 90000);

  it('api/_app/routes/money.js, the product itself', () => {
    expect(loadInNode('api/_app/routes/money.js')).toBe('LOADED');
  }, 90000);
});
