/**
 * Persistence must not hold the chat HTTP response.
 *
 * Observed live 2026-08-03: the twin generated a 909-char reply in 18.8s,
 * then the route sat on `await persistChatTurn(...)` for another ~39s
 * (memory-stream dedup + HyDE merges over 75 candidates + an LLM importance
 * call — all work that scales with memory-stream size). The 58s request cap
 * in server.js fired first and returned 504, discarding a reply that had
 * been ready for 39 seconds. Completing the 8-chapter life-story interview
 * (79 new memories) is what pushed persistence past the budget.
 *
 * settlePersistenceWithinBudget bounds how long the response is willing to
 * wait: fast persistence keeps today's exact semantics (caller learns
 * messagesInserted and can clean up an orphan conversation inline); slow
 * persistence yields PERSISTENCE_PENDING so the route can answer and let
 * the write finish in the background.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  settlePersistenceWithinBudget,
  PERSISTENCE_PENDING,
  PERSIST_RESPONSE_BUDGET_MS,
} from '../../../api/services/twinChatPersistence.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('settlePersistenceWithinBudget', () => {
  it('returns the persistence result when it resolves inside the budget', async () => {
    const result = { lzScore: 0.5, messagesInserted: true };
    const settled = await settlePersistenceWithinBudget(Promise.resolve(result), 1000);
    expect(settled).toBe(result);
  });

  it('preserves a falsy messagesInserted so the caller can still clean up an orphan', async () => {
    const result = { lzScore: null, messagesInserted: false };
    const settled = await settlePersistenceWithinBudget(Promise.resolve(result), 1000);
    expect(settled.messagesInserted).toBe(false);
  });

  it('yields PERSISTENCE_PENDING instead of waiting out slow persistence', async () => {
    vi.useFakeTimers();
    // Never settles within the budget — the live case took ~39s.
    const slow = new Promise((resolve) => setTimeout(() => resolve({ messagesInserted: true }), 60_000));
    const settledPromise = settlePersistenceWithinBudget(slow, 8000);
    await vi.advanceTimersByTimeAsync(8000);
    expect(await settledPromise).toBe(PERSISTENCE_PENDING);
  });

  it('does not swallow the underlying promise — a late result stays observable', async () => {
    vi.useFakeTimers();
    let landed = null;
    const slow = new Promise((resolve) => setTimeout(() => resolve({ messagesInserted: false }), 30_000));
    slow.then((r) => { landed = r; });

    const settledPromise = settlePersistenceWithinBudget(slow, 8000);
    await vi.advanceTimersByTimeAsync(8000);
    expect(await settledPromise).toBe(PERSISTENCE_PENDING);
    expect(landed).toBeNull();

    // The route attaches its background handler to the same promise; it must
    // still fire so a late failure can trigger orphan cleanup.
    await vi.advanceTimersByTimeAsync(22_000);
    expect(landed).toEqual({ messagesInserted: false });
  });

  it('surfaces a rejection rather than hanging the response', async () => {
    await expect(
      settlePersistenceWithinBudget(Promise.reject(new Error('write failed')), 1000)
    ).rejects.toThrow('write failed');
  });

  it('clears its timer once persistence wins, leaving no pending handle', async () => {
    vi.useFakeTimers();
    const settled = await settlePersistenceWithinBudget(
      Promise.resolve({ messagesInserted: true }),
      8000
    );
    expect(settled.messagesInserted).toBe(true);
    // If the budget timer leaked, it would still be queued here.
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ships a budget well under the 58s request cap in server.js', () => {
    expect(PERSIST_RESPONSE_BUDGET_MS).toBeGreaterThan(0);
    expect(PERSIST_RESPONSE_BUDGET_MS).toBeLessThan(58_000);
  });
});
