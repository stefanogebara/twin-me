/**
 * Coverage as a number, for the product.
 *
 * The audit of 19 September found no coverage threshold anywhere and coverage never run in
 * CI. This config narrows the measurement to the money core and its pages and holds a floor
 * at the value measured the day it was introduced, so the number can only rise: CI fails when
 * it falls below (milestone M0-1, docs/roadmap/PROGRESS.md). Raise the floor when it is
 * beaten; never lower it without a Decisions entry.
 *
 *   npx vitest run --config vitest.money.config.ts --coverage
 *
 * Written as an override of the base config rather than a merge: mergeConfig concatenates
 * arrays, so a narrowed `include` merged with the base one ran the whole suite (2026-09-19).
 */
import { defineConfig } from 'vitest/config';
import base from './vitest.config';

const baseTest = (base as { test?: Record<string, unknown> }).test || {};

export default defineConfig({
  ...(base as object),
  test: {
    ...baseTest,
    include: [
      'tests/api/services/money/**/*.test.js',
      'tests/api/routes/cronMoney*.test.js',
      'tests/api/routes/money*.test.js',
      'tests/frontend/**/*.test.{ts,tsx}',
      'tests/goals/money-*.goal.test.js',
    ],
    exclude: ['**/*.integration.test.js', '**/node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary'],
      include: ['api/services/money/**/*.js', 'api/routes/money.js', 'api/routes/cron-money-*.js', 'src/pages/money/**/*.{ts,tsx}'],
      exclude: ['**/node_modules/**', '**/*.d.ts'],
      reportsDirectory: 'coverage/money',
      /* The floor: measured 2026-09-19 over 67 files and 815 tests -- lines 65.19%, functions
         58.78%, branches 52.41%, statements 61.52% -- and set a hair under so the first run
         holds. Raise it when it is beaten. */
      thresholds: { lines: 65, functions: 58, branches: 52, statements: 61 },
    },
  },
});
