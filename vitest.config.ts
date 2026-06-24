import { defineConfig } from 'vitest/config';
import os from 'node:os';
import path from 'path';

// ---------------------------------------------------------------------------
// Deterministic parallelism bound.
//
// The default fork pool spawns ~one worker per CPU. On a 16-core box each
// worker re-imports the full Express + Supabase + route module graph (the
// suite reports ~195s of *cumulative* import time), so an unbounded pool
// piles ~16 heavy resident processes onto finite RAM. The moment the machine
// is doing anything else, that tips into CPU/memory thrash — the suite slows
// ~6x and 5s-default test timeouts start cascading across unrelated files
// (JSDOM page loads, supertest round-trips). That is the intermittent CI red.
//
// Capping the pool to roughly half the cores (ceiling 6) keeps total resident
// memory and context-switching bounded regardless of what else the host is
// running, which is what makes the run deterministic. Excess forks were never
// buying speed here anyway — the work is import-bound, not CPU-bound, so more
// workers mostly duplicated import cost and contended. Override per-environment
// with VITEST_MAX_FORKS when a runner wants a different bound.
// ---------------------------------------------------------------------------
const cpuCount = os.cpus()?.length ?? 4;
const MAX_FORKS = Number(process.env.VITEST_MAX_FORKS) || Math.max(2, Math.min(6, Math.ceil(cpuCount / 2)));

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.{ts,tsx,js}'],
    pool: 'forks',
    poolOptions: {
      forks: {
        minForks: 1,
        maxForks: MAX_FORKS,
      },
    },
    // Per-file module isolation is load-bearing for correctness, not just a
    // default we inherit. Several suites set process.env at module top-level
    // (e.g. JWT_SECRET) and api/middleware/auth.js captures it once into a
    // module-level const at import. Without isolation that const leaks the
    // FIRST file's secret to every later file in the same worker, so tokens
    // signed with a different secret fail verification (401) purely based on
    // file order — a reproduced, order-dependent flake. Keep this true.
    isolate: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['api/**/*.js', 'src/**/*.{ts,tsx}'],
      exclude: [
        'api/server.js',
        'api/index.js',
        'api/config/**',
        '**/node_modules/**',
        '**/_archive/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
