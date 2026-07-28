/**
 * Tests for onboardingWowAPI — the onboarding wow screen's client.
 * Mocks authFetch; asserts URL/method/signal and the {success,data,error}
 * envelope unwrap + error handling.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { authFetch } = vi.hoisted(() => ({ authFetch: vi.fn() }));
vi.mock('@/services/api/apiBase', () => ({ authFetch }));

const { onboardingWowAPI } = await import('@/services/api/onboardingWowAPI');

const okJson = (data: unknown) => ({ ok: true, json: async () => ({ success: true, data }) });
const errJson = (status: number, error: string) => ({ ok: false, status, json: async () => ({ success: false, error }) });

beforeEach(() => authFetch.mockReset());

describe('onboardingWowAPI', () => {
  it('generate POSTs to /onboarding/wow and unwraps the payload', async () => {
    const payload = {
      ok: true,
      voiceRead: 'You write casually, in short, punchy sentences.',
      drafts: [{ id: 'd1', status: 'pending', draft_text: 'Sounds good — Tuesday works.', why_signals: [], created_at: 't' }],
      draftsCreated: 1,
    };
    authFetch.mockResolvedValue(okJson(payload));

    const r = await onboardingWowAPI.generate();

    expect(authFetch).toHaveBeenCalledWith('/onboarding/wow', expect.objectContaining({ method: 'POST' }));
    expect(r).toEqual(payload);
  });

  it('passes the abort signal through', async () => {
    authFetch.mockResolvedValue(okJson({ ok: true, voiceRead: '', drafts: [], draftsCreated: 0 }));
    const controller = new AbortController();

    await onboardingWowAPI.generate(controller.signal);

    expect(authFetch).toHaveBeenCalledWith('/onboarding/wow', expect.objectContaining({ signal: controller.signal }));
  });

  it('throws the envelope error message on a 5xx', async () => {
    authFetch.mockResolvedValue(errJson(500, 'wow_failed'));
    await expect(onboardingWowAPI.generate()).rejects.toThrow('wow_failed');
  });

  it('throws on success:false even with a 200 status', async () => {
    authFetch.mockResolvedValue({ ok: true, json: async () => ({ success: false, error: 'missing_input' }) });
    await expect(onboardingWowAPI.generate()).rejects.toThrow('missing_input');
  });

  it('falls back to a status message when the error body is unreadable', async () => {
    authFetch.mockResolvedValue({ ok: false, status: 502, json: async () => { throw new Error('no json'); } });
    await expect(onboardingWowAPI.generate()).rejects.toThrow('Request failed (502)');
  });
});
