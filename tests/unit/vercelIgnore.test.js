/**
 * The rule that decides whether Vercel builds a commit.
 *
 * It lived inline in vercel.json for one hour and broke every deployment: the schema caps
 * `ignoreCommand` at 256 characters, a deployment that fails validation never reaches a
 * build log, and production stopped deploying with no output to say why (2026-09-22).
 * A file can be tested; 256 characters of shell in a JSON string cannot.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const ROOT = new URL('../../', import.meta.url).pathname;
const config = JSON.parse(fs.readFileSync(`${ROOT}vercel.json`, 'utf8'));

/** Exit 0 skips the build; exit 1 builds it. */
const run = (ref, range = 'HEAD HEAD') => {
  try {
    /* An empty range by default, so the answer does not depend on what this tree's last
       commit happened to touch; a test that wants a real diff passes one. */
    const out = execFileSync('bash', ['scripts/ci/vercel-ignore.sh'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, VERCEL_GIT_COMMIT_REF: ref, VERCEL_IGNORE_RANGE: range } });
    return { code: 0, out: out.trim() };
  } catch (e) { return { code: e.status, out: String(e.stdout || '').trim() }; }
};

describe('what Vercel builds', () => {
  it('keeps ignoreCommand inside the 256 characters the schema allows', () => {
    expect(config.ignoreCommand.length).toBeLessThan(256);
    expect(config.ignoreCommand).toBe('bash scripts/ci/vercel-ignore.sh');
  });

  it('skips every branch that is not main', () => {
    expect(run('claude/anything')).toMatchObject({ code: 0 });
    expect(run('')).toMatchObject({ code: 0 });
    expect(run('codex/anything').out).toMatch(/not main/);
  });

  it('builds a bisect branch, so a change to what gets deployed can be proven first', () => {
    expect(run('bisect/api-orphan-functions')).toMatchObject({ code: 1 });
    expect(run('bisect/anything').out).toMatch(/deployment experiment/);
  });

  it('builds main when the range touches code, and skips it when the range is empty', () => {
    expect(run('main', 'HEAD HEAD')).toMatchObject({ code: 0 });
    expect(run('main', 'HEAD HEAD').out).toMatch(/only docs, tests or workflows/);
  });

  it('skips a branch even when its change touches the money pages (D21: no previews until a gate reads them)', () => {
    /* A commit on this repository known to touch src/pages/money: the term strip (#490). */
    const strip = execFileSync('git', ['log', '--format=%H', '-1', '--', 'src/pages/money/views/plan/TermStrip.tsx'], { cwd: ROOT, encoding: 'utf8' }).trim();
    const got = run('claude/anything', `${strip}^ ${strip}`);
    expect(got).toMatchObject({ code: 0 });
    expect(got.out).toMatch(/not main/);
  });

  it('is executable and says which way it went', () => {
    expect(fs.statSync(`${ROOT}scripts/ci/vercel-ignore.sh`).mode & 0o111).toBeTruthy();
    expect(run('claude/x').out).toMatch(/^skip:/);
  });
});
