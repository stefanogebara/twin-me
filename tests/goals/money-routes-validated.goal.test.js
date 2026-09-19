/**
 * Goal: every write route on the money router runs validate() before its handler (M1-2,
 * 2026-09-19), except the two that read a raw or multipart body their own way.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../../api/routes/money.js', import.meta.url), 'utf8');
const EXEMPT = new Set(['/inbox/resend', '/chat/attach', '/bank/refresh-if-stale', '/calendar/learn', '/statement']);

describe('the money write routes are validated', () => {
  it('runs validate() on every post, delete and patch that reads a body or a parameter', () => {
    const routes = [...src.matchAll(/^router\.(post|delete|patch)\('([^']+)'([^\n]*)/gm)].map((m) => ({ path: m[2], rest: m[3] }));
    expect(routes.length).toBeGreaterThan(15);
    const bare = routes.filter((r) => !EXEMPT.has(r.path) && !/validate\(\{/.test(r.rest)).map((r) => r.path);
    expect(bare).toEqual([]);
  });
});
