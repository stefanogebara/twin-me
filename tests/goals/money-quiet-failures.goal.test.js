/**
 * Goal: no error in the money code is swallowed without a name (audit M1-3, 2026-09-19).
 * `.catch(() => [])` made a failed read look like an empty one; every such catch now goes
 * through quietly('name', fallback), which logs and counts it.
 */
import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';

const ROOT = new URL('../../', import.meta.url).pathname;
const ANONYMOUS = String.raw`\.catch\(\(\) => (null|undefined|false|\[\]|\(\{\}\)|new Set\(\)|\{\s*(/\*[^*]*\*/)?\s*\})\)`;

describe('the money code names its quiet failures', () => {
  it('has no anonymous swallowing catch', () => {
    let out = '';
    try { out = execSync(`grep -rnE '${ANONYMOUS}' api/services/money api/routes/money.js api/routes/cron-money-*.js`, { cwd: ROOT, encoding: 'utf8' }); } catch (e) { out = e.stdout || ''; }
    const code = out.split('\n').filter((l) => l && !/^\S+:\d+:\s*(\*|\/\/|\/\*)/.test(l) && !l.includes('`'));
    expect(code).toEqual([]);
  });
  it('gives every quiet failure a name of its own', () => {
    const names = execSync(`grep -rhoE "quietly\\('[^']+'" api/services/money api/routes/money.js`, { cwd: ROOT, encoding: 'utf8' }).trim().split('\n');
    expect(names.length).toBeGreaterThanOrEqual(26);
    expect(new Set(names).size).toBe(names.length);
  });
});
