import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared mutable result container — tests override per-case via a setter.
// Uses globalThis so the vi.mock factory (hoisted) and tests share the ref.
globalThis.__tokenRefreshTestResult = { data: null, error: { message: 'not found' } };
const setSingleResult = (r) => { globalThis.__tokenRefreshTestResult = r; };

vi.mock('../../../api/services/database.js', () => {
  const chain = {};
  Object.assign(chain, {
    from: () => chain,
    select: () => chain,
    insert: () => chain,
    update: () => chain,
    eq: () => chain,
    not: () => chain,
    gte: () => chain,
    lt: () => chain,
    order: () => chain,
    limit: () => Promise.resolve(globalThis.__tokenRefreshTestResult),
    single: () => Promise.resolve(globalThis.__tokenRefreshTestResult),
  });
  return { supabaseAdmin: chain, serverDb: {} };
});

vi.mock('../../../api/services/encryption.js', () => ({
  encryptToken: (t) => `enc:${t}`,
  decryptToken: (t) => (t.startsWith('enc:') ? t.slice(4) : t),
}));

vi.mock('../../../api/services/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../../../api/services/nangoService.js', () => ({
  getAccessToken: vi.fn().mockResolvedValue({ success: false, error: 'no nango' }),
}));

import { requiresTokenRefresh, getValidAccessToken } from '../../../api/services/tokenRefreshService.js';

describe('requiresTokenRefresh', () => {
  it('returns true for known OAuth providers', () => {
    expect(requiresTokenRefresh('spotify')).toBe(true);
    expect(requiresTokenRefresh('youtube')).toBe(true);
    expect(requiresTokenRefresh('google_gmail')).toBe(true);
    expect(requiresTokenRefresh('google_calendar')).toBe(true);
  });

  it('returns true for github (non-expiring but checked)', () => {
    expect(requiresTokenRefresh('github')).toBe(true);
  });

  it('returns false for unknown providers', () => {
    expect(requiresTokenRefresh('unknown_platform')).toBe(false);
    expect(requiresTokenRefresh('')).toBe(false);
  });
});

describe('getValidAccessToken', () => {
  beforeEach(() => {
    setSingleResult({ data: null, error: { message: 'not found' } });
  });

  it('returns error when no connection in DB', async () => {
    setSingleResult({ data: null, error: { message: 'not found' } });
    const result = await getValidAccessToken('user-123', 'spotify');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/No active connection/);
  });

  it('returns error when connection has no access_token', async () => {
    setSingleResult({
      data: {
        access_token: null,
        refresh_token: 'r',
        token_expires_at: null,
        connected_at: new Date().toISOString(),
        status: 'connected',
      },
      error: null,
    });
    const result = await getValidAccessToken('user-123', 'spotify');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/No access token/);
  });

  it('returns success when token is fresh (expiry > 5 min from now)', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    setSingleResult({
      data: {
        access_token: 'enc:valid_token',
        refresh_token: 'enc:refresh',
        token_expires_at: future,
        connected_at: new Date().toISOString(),
        status: 'connected',
      },
      error: null,
    });
    const result = await getValidAccessToken('user-123', 'spotify');
    expect(result.success).toBe(true);
    expect(result.accessToken).toBe('valid_token');
  });

  it('returns success when token has no expiry (never-expiring)', async () => {
    setSingleResult({
      data: {
        access_token: 'enc:tok',
        refresh_token: 'enc:refresh',
        token_expires_at: null,
        connected_at: new Date().toISOString(),
        status: 'connected',
      },
      error: null,
    });
    const result = await getValidAccessToken('user-123', 'github');
    expect(result.success).toBe(true);
    expect(result.accessToken).toBe('tok');
  });
});
