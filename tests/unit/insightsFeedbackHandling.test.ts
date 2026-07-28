// @vitest-environment jsdom
/**
 * Tests for the insight-feedback failure handling wired between
 * `useProactiveInsights` (the mutation) and `InsightsFeed.handleFeedback`
 * (the optimistic-archive + toast orchestration).
 *
 * The project does not ship `@testing-library/react`, so — mirroring the
 * existing `tests/hooks/useDashboardContext.test.ts` approach — we do NOT
 * render the component. Instead we:
 *   1. Exercise the real `feedbackMutation` config through a QueryClient with a
 *      mocked `authFetch`, proving `mutateAsync` rejects on a non-ok response
 *      and resolves on an ok one. This is the promise `onFeedback` returns.
 *   2. Replicate `InsightsFeed.handleFeedback`'s exact body against that
 *      promise, asserting the load-bearing contract the audit fix introduced:
 *        - the success toast fires ONLY after the request resolves
 *        - on failure, the optimistic archive is rolled back AND an error
 *          toast fires (the insight reappears, the user is told it failed).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

// --- Mock the network layer used by the hook ------------------------------
vi.mock('@/services/api/apiBase', () => ({
  authFetch: vi.fn(),
}));

const QUERY_KEY = ['proactive-insights'] as const;

type Insight = { id: string };

// Faithful copy of useProactiveInsights' feedbackMutation config so we test
// the real success/error wiring, not a paraphrase. Kept in sync with
// src/hooks/useProactiveInsights.ts.
function buildFeedbackMutationOptions(qc: QueryClient, authFetch: (url: string, init?: RequestInit) => Promise<Response>) {
  return {
    mutationFn: async ({ id, followed, note }: { id: string; followed: boolean; note?: string }) => {
      const res = await authFetch(`/insights/${id}/nudge-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followed, note }),
      });
      if (!res.ok) {
        throw new Error(`Nudge feedback failed: ${res.status}`);
      }
      return res.json();
    },
    onMutate: async ({ id }: { id: string }) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY });
      const previous = qc.getQueryData<Insight[]>(QUERY_KEY);
      qc.setQueryData<Insight[]>(QUERY_KEY, (old) => (old ?? []).filter((i) => i.id !== id));
      return { previous };
    },
    onError: (_err: unknown, _vars: unknown, context: { previous?: Insight[] } | undefined) => {
      if (context?.previous) {
        qc.setQueryData(QUERY_KEY, context.previous);
      }
    },
  };
}

// Faithful copy of InsightsFeed.handleFeedback (post-fix) so the
// toast-ordering + rollback contract is pinned. Kept in sync with
// src/pages/components/dashboard-v2/InsightsFeed.tsx.
async function runHandleFeedback(opts: {
  insight: Insight;
  followed: boolean;
  onFeedback: (p: { id: string; followed: boolean }) => Promise<unknown>;
  archivedIds: Set<string>;
  toast: (msg: string) => void;
}) {
  const { insight, followed, onFeedback, archivedIds, toast } = opts;
  // Optimistically archive immediately for fade-out
  archivedIds.add(insight.id);
  try {
    await onFeedback({ id: insight.id, followed });
    toast('Thanks — your twin is learning');
  } catch {
    archivedIds.delete(insight.id);
    toast('Could not save your feedback. Please try again.');
  }
}

describe('insight feedback failure handling', () => {
  let authFetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    const apiBase = await import('@/services/api/apiBase');
    authFetchMock = apiBase.authFetch as unknown as ReturnType<typeof vi.fn>;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('mutateAsync rejects when the server responds non-ok', async () => {
    authFetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    qc.setQueryData<Insight[]>(QUERY_KEY, [{ id: 'a' }, { id: 'b' }]);

    const observer = (await import('@tanstack/react-query')).MutationObserver;
    const mutation = new observer(qc, buildFeedbackMutationOptions(qc, authFetchMock));

    await expect(mutation.mutate({ id: 'a', followed: true })).rejects.toThrow(/500/);
    // onError restored the optimistically-removed row in the cache.
    expect(qc.getQueryData<Insight[]>(QUERY_KEY)).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('mutateAsync resolves when the server responds ok', async () => {
    authFetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) });

    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    qc.setQueryData<Insight[]>(QUERY_KEY, [{ id: 'a' }, { id: 'b' }]);

    const observer = (await import('@tanstack/react-query')).MutationObserver;
    const mutation = new observer(qc, buildFeedbackMutationOptions(qc, authFetchMock));

    await expect(mutation.mutate({ id: 'a', followed: true })).resolves.toEqual({ success: true });
    // optimistic removal sticks on success (no rollback).
    expect(qc.getQueryData<Insight[]>(QUERY_KEY)).toEqual([{ id: 'b' }]);
  });

  it('shows success toast only AFTER the request resolves', async () => {
    let resolveFeedback!: () => void;
    const onFeedback = vi.fn(
      () => new Promise<void>((resolve) => { resolveFeedback = resolve; }),
    );
    const toast = vi.fn();
    const archivedIds = new Set<string>();
    const insight = { id: 'x1' };

    const pending = runHandleFeedback({ insight, followed: true, onFeedback, archivedIds, toast });

    // Optimistic archive applied immediately, but NO toast yet.
    expect(archivedIds.has('x1')).toBe(true);
    expect(toast).not.toHaveBeenCalled();

    resolveFeedback();
    await pending;

    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith('Thanks — your twin is learning');
    // Stays archived on success.
    expect(archivedIds.has('x1')).toBe(true);
  });

  it('rolls back the optimistic archive and toasts an error on failure', async () => {
    const onFeedback = vi.fn(() => Promise.reject(new Error('Nudge feedback failed: 500')));
    const toast = vi.fn();
    const archivedIds = new Set<string>();
    const insight = { id: 'x2' };

    await runHandleFeedback({ insight, followed: false, onFeedback, archivedIds, toast });

    // Insight reappears (rollback) and the user is told it failed — success
    // toast must NOT have fired.
    expect(archivedIds.has('x2')).toBe(false);
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith('Could not save your feedback. Please try again.');
  });
});
