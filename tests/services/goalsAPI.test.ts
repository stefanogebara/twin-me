/**
 * Tests for src/services/api/goalsAPI.ts — focused on the shared json<T>()
 * response helper (audit-2026-07-03 error-ux).
 *
 * The helper is private, so we exercise it through the exported fetchers.
 * The load-bearing behavior: it must guard res.ok BEFORE res.json(), so a
 * 401/500 with a non-JSON body surfaces a CLEAR error ("Request failed (500)")
 * instead of an opaque SyntaxError from parsing HTML/empty bodies. That opaque
 * error is what made these failures "silent" in the UI — the toast showed
 * "Unexpected token < in JSON" instead of anything actionable.
 *
 * Strategy mirrors transactionsAPI.test.ts: mock apiBase so authFetch is
 * deterministic; no DOM, no real fetch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let authFetchCalls: Array<{ url: string; init?: RequestInit }>;
let authFetchImpl: (url: string, init?: RequestInit) => Promise<Response>;

beforeEach(() => {
  authFetchCalls = [];
  authFetchImpl = async () =>
    new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
});

vi.mock('../../src/services/api/apiBase', () => ({
  API_URL: 'http://test-api.local/api',
  getAuthHeaders: () => ({ Authorization: 'Bearer test_token' }),
  authFetch: (url: string, init?: RequestInit) => {
    authFetchCalls.push({ url, init });
    return authFetchImpl(url, init);
  },
}));

const { fetchGoals, acceptGoal, fetchGoalSummary } = await import(
  '../../src/services/api/goalsAPI'
);

/** ok JSON Response. */
function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('goalsAPI json<T> helper — res.ok guard before parse', () => {
  it('throws a clear status-tagged error (NOT a JSON parse error) on a 500 with an HTML body', async () => {
    // Simulate a gateway/500 that returns an HTML error page — the classic
    // case where res.json() would throw "Unexpected token < in JSON".
    authFetchImpl = async () =>
      new Response('<!doctype html><title>500</title>', {
        status: 500,
        headers: { 'Content-Type': 'text/html' },
      });
    await expect(fetchGoals()).rejects.toThrow(/Request failed \(500\)/);
    // And crucially, NOT a SyntaxError about JSON tokens.
    await expect(fetchGoals()).rejects.not.toThrow(/Unexpected token|JSON/i);
  });

  it('throws with the backend error message on a 401 with a JSON error body', async () => {
    authFetchImpl = async () =>
      new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    await expect(acceptGoal('g1')).rejects.toThrow(/Unauthorized/);
  });

  it('throws a status-tagged error on a 500 with an empty body', async () => {
    authFetchImpl = async () => new Response(null, { status: 500 });
    await expect(fetchGoalSummary()).rejects.toThrow(/Request failed \(500\)/);
  });

  it('throws on a 200 with success=false, using the server error field', async () => {
    authFetchImpl = async () => ok({ success: false, error: 'no_goals' });
    await expect(fetchGoals()).rejects.toThrow(/no_goals/);
  });

  it('resolves normally on a 200 success envelope', async () => {
    authFetchImpl = async () => ok({ success: true, goals: [{ id: 'g1' }] });
    const goals = await fetchGoals();
    expect(goals).toEqual([{ id: 'g1' }]);
  });

  it('defaults to [] when a success response omits the goals key', async () => {
    authFetchImpl = async () => ok({ success: true });
    expect(await fetchGoals()).toEqual([]);
  });
});
