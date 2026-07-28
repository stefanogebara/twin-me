import { describe, it, expect, vi } from 'vitest';
import {
  revokeProviderGrant,
  getProviderClientCreds,
  GOOGLE_PROVIDERS,
  REVOCABLE_PROVIDERS,
} from '../../api/services/oauthRevocation.js';

const ok = (status = 200) => ({ ok: true, status });
const nonOk = (status = 400) => ({ ok: false, status });

describe('revokeProviderGrant (best-effort provider-side OAuth revocation)', () => {
  it('Google: POSTs the token to the Google revoke endpoint (prefers refresh token)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok());
    const res = await revokeProviderGrant({ provider: 'youtube', accessToken: 'at', refreshToken: 'rt', fetchImpl });
    expect(res).toEqual({ revoked: true, status: 200 });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/revoke');
    expect(init.method).toBe('POST');
    expect(init.body.toString()).toContain('token=rt');
  });

  it('all google-family keys route to Google', () => {
    for (const k of ['google', 'google_gmail', 'google_calendar', 'youtube', 'gmail', 'calendar']) {
      expect(GOOGLE_PROVIDERS.has(k)).toBe(true);
    }
  });

  it('GitHub: DELETEs the app grant with Basic auth + access_token body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    const res = await revokeProviderGrant({
      provider: 'github', accessToken: 'gho_abc', clientId: 'cid', clientSecret: 'csec', fetchImpl,
    });
    expect(res).toEqual({ revoked: true, status: 204 });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.github.com/applications/cid/grant');
    expect(init.method).toBe('DELETE');
    expect(init.headers.Authorization).toBe('Basic ' + Buffer.from('cid:csec').toString('base64'));
    expect(JSON.parse(init.body)).toEqual({ access_token: 'gho_abc' });
  });

  it('GitHub: skips when client credentials are missing (no network call)', async () => {
    const fetchImpl = vi.fn();
    const res = await revokeProviderGrant({ provider: 'github', accessToken: 'gho_abc', fetchImpl });
    expect(res.skipped).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('Discord: POSTs token + client creds with token_type_hint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok());
    const res = await revokeProviderGrant({
      provider: 'discord', accessToken: 'at', clientId: 'cid', clientSecret: 'csec', fetchImpl,
    });
    expect(res.revoked).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://discord.com/api/oauth2/token/revoke');
    const body = init.body.toString();
    expect(body).toContain('token=at');
    expect(body).toContain('client_id=cid');
    expect(body).toContain('token_type_hint=access_token');
  });

  it('Spotify: skipped (no revocation endpoint), no network call', async () => {
    const fetchImpl = vi.fn();
    const res = await revokeProviderGrant({ provider: 'spotify', accessToken: 'at', fetchImpl });
    expect(res).toEqual({ revoked: false, skipped: true, reason: 'Spotify has no token-revocation endpoint' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('unknown provider: skipped with reason, no network call', async () => {
    const fetchImpl = vi.fn();
    const res = await revokeProviderGrant({ provider: 'myspace', accessToken: 'at', fetchImpl });
    expect(res.skipped).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('missing provider: skipped', async () => {
    const res = await revokeProviderGrant({});
    expect(res.skipped).toBe(true);
  });

  it('provider non-ok response: revoked=false with status', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(nonOk(500));
    const res = await revokeProviderGrant({ provider: 'youtube', accessToken: 'at', fetchImpl });
    expect(res).toEqual({ revoked: false, status: 500, reason: 'provider returned non-ok' });
  });

  it('network error: never throws, returns error result', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    const res = await revokeProviderGrant({
      provider: 'discord', accessToken: 'at', clientId: 'c', clientSecret: 's', fetchImpl,
    });
    expect(res.revoked).toBe(false);
    expect(res.error).toContain('ECONNRESET');
  });

  it('Google: skips when no token present', async () => {
    const fetchImpl = vi.fn();
    const res = await revokeProviderGrant({ provider: 'gmail', fetchImpl });
    expect(res.skipped).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('getProviderClientCreds', () => {
  it('maps google-family to GOOGLE_* env', () => {
    const origId = process.env.GOOGLE_CLIENT_ID;
    const origSecret = process.env.GOOGLE_CLIENT_SECRET;
    try {
      process.env.GOOGLE_CLIENT_ID = 'gid';
      process.env.GOOGLE_CLIENT_SECRET = 'gsec';
      expect(getProviderClientCreds('google_calendar')).toEqual({ clientId: 'gid', clientSecret: 'gsec' });
    } finally {
      process.env.GOOGLE_CLIENT_ID = origId;
      process.env.GOOGLE_CLIENT_SECRET = origSecret;
    }
  });
  it('returns empty for unmapped provider', () => {
    expect(getProviderClientCreds('myspace')).toEqual({});
  });
});

describe('REVOCABLE_PROVIDERS', () => {
  it('includes github/discord/whoop + google family; excludes spotify', () => {
    expect(REVOCABLE_PROVIDERS.has('github')).toBe(true);
    expect(REVOCABLE_PROVIDERS.has('discord')).toBe(true);
    expect(REVOCABLE_PROVIDERS.has('whoop')).toBe(true);
    expect(REVOCABLE_PROVIDERS.has('youtube')).toBe(true);
    expect(REVOCABLE_PROVIDERS.has('spotify')).toBe(false);
  });
});
