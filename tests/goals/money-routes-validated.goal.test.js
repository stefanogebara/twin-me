/**
 * Goal: every write route on the money router runs validate() before its handler (M1-2,
 * 2026-09-19), except the two that read a raw or multipart body their own way.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const FILES = {
  'money.js': new Set(['/inbox/resend', '/chat/attach', '/bank/refresh-if-stale', '/calendar/learn', '/statement']),
  /* The legacy slice (2026-09-20): sign-in, the extension and the directives. desktop-handoff reads no body. */
  'auth-simple.js': new Set(['/desktop-handoff']),
  'extension-data.js': new Set(),
  'twin-directives.js': new Set(),
};
const read = (f) => readFileSync(new URL(`../../api/routes/${f}`, import.meta.url), 'utf8');

describe('the write routes are validated', () => {
  for (const [file, exempt] of Object.entries(FILES)) {
    it(`${file}: validate() runs on every post, delete and patch that reads a body or a parameter`, () => {
      const src = read(file);
      const routes = [...src.matchAll(/^router\.(post|delete|patch|put)\('([^']+)'([^\n]*)/gm)].map((m) => ({ path: m[2], rest: m[3] }));
      expect(routes.length).toBeGreaterThan(1);
      const bare = routes.filter((r) => !exempt.has(r.path) && !/validate\(\{/.test(r.rest)).map((r) => r.path);
      expect(bare).toEqual([]);
    });
  }
});
