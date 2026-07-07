/**
 * Tests for actionsAPI — the Today home's client for the M1 action inbox.
 * Mocks authFetch; asserts URL/method/body and the {success,data,error}
 * envelope unwrap + error handling.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { authFetch } = vi.hoisted(() => ({ authFetch: vi.fn() }));
vi.mock('@/services/api/apiBase', () => ({ authFetch }));

const { actionsAPI } = await import('@/services/api/actionsAPI');

const okJson = (data: unknown) => ({ ok: true, json: async () => ({ success: true, data }) });
const errJson = (status: number, error: string) => ({ ok: false, status, json: async () => ({ success: false, error }) });

beforeEach(() => authFetch.mockReset());

describe('actionsAPI', () => {
  it('listPending fetches the pending inbox and unwraps data', async () => {
    authFetch.mockResolvedValue(okJson([{ id: 'a1', draft_text: 'hi' }]));
    const r = await actionsAPI.listPending();
    expect(authFetch).toHaveBeenCalledWith('/actions?status=pending', expect.objectContaining({}));
    expect(r).toEqual([{ id: 'a1', draft_text: 'hi' }]);
  });

  it('send POSTs to /actions/:id/send', async () => {
    authFetch.mockResolvedValue(okJson(null));
    await actionsAPI.send('a1');
    expect(authFetch).toHaveBeenCalledWith('/actions/a1/send', { method: 'POST' });
  });

  it('edit POSTs the finalText body', async () => {
    authFetch.mockResolvedValue(okJson(null));
    await actionsAPI.edit('a1', 'See you Tue');
    expect(authFetch).toHaveBeenCalledWith('/actions/a1/edit', {
      method: 'POST',
      body: JSON.stringify({ finalText: 'See you Tue' }),
    });
  });

  it('reject POSTs the reason body', async () => {
    authFetch.mockResolvedValue(okJson(null));
    await actionsAPI.reject('a1', 'too formal');
    expect(authFetch).toHaveBeenCalledWith('/actions/a1/reject', {
      method: 'POST',
      body: JSON.stringify({ reason: 'too formal' }),
    });
  });

  it('throws the envelope error message on a 4xx', async () => {
    authFetch.mockResolvedValue(errJson(400, 'missing_final_text'));
    await expect(actionsAPI.edit('a1', '')).rejects.toThrow('missing_final_text');
  });

  it('falls back to a status message when the error body is unreadable', async () => {
    authFetch.mockResolvedValue({ ok: false, status: 500, json: async () => { throw new Error('no json'); } });
    await expect(actionsAPI.send('a1')).rejects.toThrow('Request failed (500)');
  });
});
