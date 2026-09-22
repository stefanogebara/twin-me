/** Every sign-in door carries the limiter, the magic-link verify included (2026-09-22). */
import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../../api/routes/auth-simple.js', import.meta.url), 'utf8');

it('rate-limits GET /magic-link/verify like /signin and /signup', () => {
  expect(source).toMatch(/router\.get\('\/magic-link\/verify', authLimiter,/);
  expect(source).toMatch(/router\.post\('\/signin', authLimiter,/);
  expect(source).toMatch(/router\.post\('\/signup', authLimiter,/);
});
