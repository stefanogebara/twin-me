/**
 * connectLinkService — alias→integration resolution and per-user connect-link
 * generation (reusing the Nango connect session).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const createConnectSessionMock = vi.fn();
vi.mock('../../../api/services/nangoService.js', () => ({
  createConnectSession: (...a) => createConnectSessionMock(...a),
  PLATFORM_CONFIGS: {
    spotify: { providerConfigKey: 'spotify', name: 'Spotify' },
    'google-mail': { providerConfigKey: 'google-mail', name: 'Gmail' },
    github: { providerConfigKey: 'github-getting-started', name: 'GitHub' },
  },
}));
vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { email: 'stefano@x.com' } }) }) }) }) },
}));

const { buildConnectLink, resolveIntegrationId, SUPPORTED_CONNECT_PLATFORMS, classifyConnectIntent } =
  await import('../../../api/services/connectLinkService.js');

beforeEach(() => {
  createConnectSessionMock.mockReset();
  createConnectSessionMock.mockResolvedValue({ success: true, token: 't', connectLink: 'https://connect.nango.dev?session_token=t' });
});

describe('resolveIntegrationId', () => {
  it('maps pt/en aliases to Nango integration ids', () => {
    expect(resolveIntegrationId('spotify')).toBe('spotify');
    expect(resolveIntegrationId('Gmail')).toBe('google-mail');
    expect(resolveIntegrationId('agenda')).toBe('google-calendar');
    expect(resolveIntegrationId('github')).toBe('github-getting-started');
    expect(resolveIntegrationId('música')).toBe('spotify');
  });
  it('returns null for unknown platforms', () => {
    expect(resolveIntegrationId('myspace')).toBeNull();
    expect(resolveIntegrationId('')).toBeNull();
  });
  it('exposes a deduped supported list', () => {
    expect(SUPPORTED_CONNECT_PLATFORMS).toContain('google-mail');
    expect(new Set(SUPPORTED_CONNECT_PLATFORMS).size).toBe(SUPPORTED_CONNECT_PLATFORMS.length);
  });
});

describe('buildConnectLink', () => {
  it('builds a scoped connect link for a known platform', async () => {
    const out = await buildConnectLink('u1', 'gmail');
    expect(out.success).toBe(true);
    expect(out.platform).toBe('Gmail');
    expect(out.integrationId).toBe('google-mail');
    expect(out.url).toContain('connect.nango.dev');
    // scoped to the single integration + carries the user's email for display
    expect(createConnectSessionMock).toHaveBeenCalledWith('u1', 'stefano@x.com', { integrationId: 'google-mail' });
  });

  it('rejects an unknown platform without calling Nango', async () => {
    const out = await buildConnectLink('u1', 'myspace');
    expect(out.success).toBe(false);
    expect(out.error).toBe('unknown_platform');
    expect(createConnectSessionMock).not.toHaveBeenCalled();
  });

  it('propagates a Nango connect-session failure', async () => {
    createConnectSessionMock.mockResolvedValue({ success: false, error: 'Reached maximum number of allowed connections', code: 'resource_capped' });
    const out = await buildConnectLink('u1', 'spotify');
    expect(out.success).toBe(false);
    expect(out.message).toMatch(/maximum number/i);
  });
});

describe('classifyConnectIntent', () => {
  it('detects a connect verb + known platform (pt + en)', () => {
    expect(classifyConnectIntent('conecta meu spotify')).toEqual({ platform: 'spotify' });
    expect(classifyConnectIntent('connect my gmail please')).toEqual({ platform: 'gmail' });
    expect(classifyConnectIntent('link my github')).toEqual({ platform: 'github' });
    expect(classifyConnectIntent('quero conectar meu calendário')).toEqual({ platform: 'calendário' });
  });

  it('returns platform:null for a generic "connect my accounts"', () => {
    expect(classifyConnectIntent('connect my accounts')).toEqual({ platform: null });
    expect(classifyConnectIntent('quero conectar minhas contas')).toEqual({ platform: null });
  });

  it('does NOT fire on "liga pro restaurante" (that is a phone call, not connect)', () => {
    expect(classifyConnectIntent('liga pro restaurante e reserva uma mesa')).toBeNull();
  });

  it('does NOT fire on unrelated messages or a bare connect verb', () => {
    expect(classifyConnectIntent('qual meu saldo?')).toBeNull();
    expect(classifyConnectIntent('conecta')).toBeNull();
    expect(classifyConnectIntent('')).toBeNull();
  });
});
