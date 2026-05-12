/**
 * Tests for M11 — twin-summary-refresh batched parallelization.
 *
 * The cron pushed 52.6s on its 2026-05-12 daily run because each
 * generateTwinSummary call took 3-5s and it processed up to 7 users
 * sequentially. With batched parallel execution (BATCH_SIZE=3), wall-time
 * drops to ~slowest-in-batch and stays well under the 45s time budget.
 *
 * The route file is a default-export handler and pulls in heavy
 * dependencies (supabase, llmGateway, etc) at import time. Rather than
 * exercising the whole handler, this test asserts the invariant that
 * matters: batched Promise.allSettled with concurrency 3 over a sequence
 * of slow async calls completes in ~ceil(N/3) × slowest-per-batch time.
 */
import { describe, it, expect } from 'vitest';

async function batchedParallel(items, batchSize, worker) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const settled = await Promise.allSettled(batch.map(worker));
    for (const r of settled) results.push(r);
  }
  return results;
}

function slowWorker(delayMs) {
  return () => new Promise((resolve) => setTimeout(() => resolve('ok'), delayMs));
}

describe('M11 batched parallel twin summary refresh', () => {
  it('processes 7 users in 3 batches of (3,3,1) — wall-time ~3x per-call, not 7x', async () => {
    const PER_CALL_MS = 100;
    const N = 7;
    const BATCH = 3;
    const items = Array.from({ length: N }, (_, i) => i);

    const start = Date.now();
    const results = await batchedParallel(items, BATCH, slowWorker(PER_CALL_MS));
    const wallTime = Date.now() - start;

    expect(results).toHaveLength(N);
    for (const r of results) expect(r.status).toBe('fulfilled');

    // Sequential would be 7 × 100ms = 700ms.
    // Batched parallel with BATCH=3 is ceil(7/3) = 3 batches × 100ms = 300ms.
    // Allow generous slack for CI jitter but assert it's clearly sub-sequential.
    expect(wallTime).toBeLessThan(500);
    expect(wallTime).toBeGreaterThanOrEqual(3 * PER_CALL_MS - 20);
  });

  it('a single slow user in a batch does not stop the rest of the batch from completing', async () => {
    const items = ['fast1', 'slow', 'fast2'];
    const start = Date.now();
    const results = await batchedParallel(items, 3, (id) => {
      const delay = id === 'slow' ? 300 : 50;
      return new Promise((resolve) => setTimeout(() => resolve({ id, delay }), delay));
    });
    const wallTime = Date.now() - start;

    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    // Wall-time is bounded by the slowest in the batch (~300ms), not the sum.
    expect(wallTime).toBeLessThan(500);
    expect(wallTime).toBeGreaterThanOrEqual(280);
  });

  it('a rejection in one user is captured per-result, others still fulfill', async () => {
    const items = ['ok1', 'err', 'ok2'];
    const results = await batchedParallel(items, 3, (id) => {
      if (id === 'err') return Promise.reject(new Error('boom'));
      return Promise.resolve(id);
    });

    expect(results).toHaveLength(3);
    const byStatus = results.map((r) => r.status);
    // Promise.allSettled keeps both fulfilled and rejected entries.
    expect(byStatus).toContain('rejected');
    expect(byStatus.filter((s) => s === 'fulfilled')).toHaveLength(2);
  });
});
