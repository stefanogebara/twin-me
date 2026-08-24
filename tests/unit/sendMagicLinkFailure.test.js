import { describe, it, expect, vi, beforeEach } from 'vitest';

// Repro for the silent magic-link outage (2026-08-24): the Resend SDK does
// NOT throw on API errors — it resolves with { data, error }. sendMagicLink
// only try/caught, so a rejected send (unverified domain, bad from address,
// quota) still "succeeded" and the route told the user to check their email.

const sendMock = vi.fn();

vi.mock('resend', () => ({
  Resend: class {
    constructor() {
      this.emails = { send: sendMock };
    }
  },
}));

async function importFreshEmailService() {
  vi.resetModules();
  vi.stubEnv('RESEND_API_KEY', 're_test_key');
  return import('../../api/services/emailService.js');
}

describe('sendMagicLink vs the Resend {data, error} contract', () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it('returns true when Resend accepts the send', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email_123' }, error: null });
    const { sendMagicLink } = await importFreshEmailService();
    await expect(
      sendMagicLink({ toEmail: 'user@example.com', link: 'https://twinme.me/api/auth/magic-link/verify?token=t' }),
    ).resolves.toBe(true);
    expect(sendMock).toHaveBeenCalledOnce();
  });

  it('returns false when Resend resolves with an error object (does not throw)', async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { statusCode: 403, name: 'validation_error', message: 'Domain is not verified' },
    });
    const { sendMagicLink } = await importFreshEmailService();
    await expect(
      sendMagicLink({ toEmail: 'user@example.com', link: 'https://twinme.me/api/auth/magic-link/verify?token=t' }),
    ).resolves.toBe(false);
  });

  it('returns false when the send rejects outright (network failure)', async () => {
    sendMock.mockRejectedValue(new Error('fetch failed'));
    const { sendMagicLink } = await importFreshEmailService();
    await expect(
      sendMagicLink({ toEmail: 'user@example.com', link: 'https://twinme.me/api/auth/magic-link/verify?token=t' }),
    ).resolves.toBe(false);
  });
});
