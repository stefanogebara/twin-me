/**
 * Coverage as a number, for everything the product reaches.
 *
 * vitest.money.config.ts holds the money core to a floor of its own (M0-1). This one measures
 * the whole staying set: every API file reachable from scripts/ci/staying-roots.txt (the same
 * walk the unmount uses) and everything under src/, and holds the floor at the value measured
 * the day it was introduced (M0-C, 2026-09-22: lines 36.24%, statements 36.71%, functions
 * 36.68%, branches 32.44%, over 505 test files). Raise the floor when it is beaten; never
 * lower it without a Decisions entry.
 *
 *   npx vitest run --config vitest.staying.config.ts --coverage
 */
import { defineConfig } from 'vitest/config';
import path from 'node:path';
import base from './vitest.config';
import { reachable, readRoots } from './scripts/ci/reach.mjs';

const baseTest = (base as { test?: Record<string, unknown> }).test || {};
const ROOT = process.cwd();
const staying = [...reachable(readRoots(path.join(ROOT, 'scripts/ci/staying-roots.txt')), { root: ROOT })].filter((f) => f.endsWith('.js'));

export default defineConfig({
  ...(base as object),
  test: {
    ...baseTest,
    include: ['tests/**/*.test.{ts,tsx,js}'],
    exclude: ['**/*.integration.test.js', '**/node_modules/**', 'tests/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary'],
      include: [...staying, 'src/**/*.{ts,tsx}'],
      exclude: ['**/node_modules/**', '**/*.d.ts'],
      reportsDirectory: 'coverage/staying',
      thresholds: { lines: 36, functions: 36, branches: 32, statements: 36 },
    },
  },
});
