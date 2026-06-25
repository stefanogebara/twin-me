/**
 * createEvent attendee-invite behavior. The fix: when an event has attendees,
 * the POST must carry ?sendUpdates=all so Google actually EMAILS the invite —
 * otherwise "schedule a call with Paula" adds her silently and never notifies.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const postMock = vi.fn();
vi.mock('axios', () => ({ default: { post: (...a) => postMock(...a), get: vi.fn() } }));
vi.mock('../../../api/services/tokenRefreshService.js', () => ({
  getValidAccessToken: async () => ({ success: true, accessToken: 'tok123' }),
}));

const { createEvent } = await import('../../../api/services/googleWorkspaceActions.js');

describe('createEvent — attendee invites', () => {
  beforeEach(() => postMock.mockReset());

  it('sends the invite (sendUpdates=all) and maps attendee emails when attendees are present', async () => {
    postMock.mockResolvedValue({ data: { id: 'evt1', htmlLink: 'https://cal/evt1', summary: 'Call', attendees: [{ email: 'paula@x.com' }] } });

    const r = await createEvent('u1', {
      summary: 'Call with Paula',
      start: '2026-06-18T14:00:00',
      attendees: 'paula@x.com',
      userTimezone: 'America/Sao_Paulo',
    });

    expect(r.success).toBe(true);
    expect(r.invitesSent).toBe(true);
    expect(r.attendees).toEqual(['paula@x.com']);

    const [url, body] = postMock.mock.calls[0];
    expect(url).toMatch(/\?sendUpdates=all$/);
    expect(body.attendees).toEqual([{ email: 'paula@x.com' }]);
  });

  it('does NOT add sendUpdates for a solo event (no attendees, no notification noise)', async () => {
    postMock.mockResolvedValue({ data: { id: 'evt2', htmlLink: 'https://cal/evt2', summary: 'Focus block' } });

    const r = await createEvent('u1', { summary: 'Focus block', start: '2026-06-18T09:00:00' });

    expect(r.success).toBe(true);
    expect(r.invitesSent).toBe(false);
    const [url] = postMock.mock.calls[0];
    expect(url).not.toMatch(/sendUpdates/);
  });
});
