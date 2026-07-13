/**
 * Provider affinity for WhatsApp sends — the sender-mismatch fix.
 * =================================================================
 * Live incident (2026-07-13, habit-loop smoke): outbound sends pick a provider
 * by static global priority (Z-API -> Evolution -> Kapso), with no knowledge of
 * which number the user actually converses on. whatsappInboundPipeline.js even
 * documents the invariant ("replies go back out the SAME provider the message
 * arrived on") but every route injected the generic priority-chain sender.
 * A reply/delivery leaving from a different number lands in a thread the user
 * doesn't watch, and their yes/skip reply goes into the void.
 *
 * These tests pin:
 *   1. sendWhatsAppMessage honors an explicit provider hint over the priority
 *      chain (the FIX - fails on the old signature which ignored opts).
 *   2. No hint -> existing priority order unchanged (no regression).
 *   3. A stale hint for an unconfigured provider degrades to the default chain
 *      (deliver from a new number rather than not at all).
 *   4. deriveWaProvider maps inbound `format` provenance to a send provider.
 *   5. isServiceWindowError classifies Kapso/Meta's 422 "outside the 24-hour
 *      window" - the failure that was silently masked for three weeks because
 *      deliverInsight marks delivered when ANY channel succeeds.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub Supabase env before any import chain touches api/config/supabase.js.
process.env.SUPABASE_URL ||= 'https://affinity-stub.supabase.co';
process.env.SUPABASE_ANON_KEY ||= 'affinity-stub-anon';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'affinity-stub-service';

// No real network: axios is mocked, and the outbound audit sink is a no-op.
vi.mock('axios', () => ({
  default: {
    post: vi.fn(async () => ({
      data: { messageId: 'zapi-m1', id: 'zapi-m1', messages: [{ id: 'kapso-m1' }], contacts: [] },
      status: 200,
    })),
  },
}));
vi.mock('../../../api/config/supabase.js', () => ({
  supabaseAdmin: { from: () => ({ insert: async () => ({}) }) },
}));

import axios from 'axios';

const ZAPI_ENV = { ZAPI_INSTANCE_ID: 'inst1', ZAPI_INSTANCE_TOKEN: 'tok1' };
const KAPSO_ENV = { KAPSO_API_KEY: 'kapso-key', KAPSO_PHONE_NUMBER_ID: 'pn123' };
const ALL_PROVIDER_KEYS = [
  'ZAPI_INSTANCE_ID', 'ZAPI_INSTANCE_TOKEN', 'ZAPI_CLIENT_TOKEN',
  'EVOLUTION_API_URL', 'EVOLUTION_API_KEY', 'EVOLUTION_INSTANCE',
  'KAPSO_API_KEY', 'KAPSO_PHONE_NUMBER_ID',
  'TWINME_WHATSAPP_PHONE_NUMBER_ID', 'TWINME_WHATSAPP_ACCESS_TOKEN',
  'TWINME_DISABLE_OUTBOUND_SEND',
];

/** Fresh import of the service with exactly the given provider env. */
async function importServiceWithEnv(envPatch) {
  for (const k of ALL_PROVIDER_KEYS) delete process.env[k];
  Object.assign(process.env, envPatch);
  vi.resetModules();
  return import('../../../api/services/whatsappService.js');
}

beforeEach(() => {
  axios.post.mockClear();
});

describe('sendWhatsAppMessage provider affinity', () => {
  it('honors an explicit kapso hint even when Z-API would win the priority chain', async () => {
    const svc = await importServiceWithEnv({ ...ZAPI_ENV, ...KAPSO_ENV });
    const res = await svc.sendWhatsAppMessage('+5511999002121', 'hello', { provider: 'kapso' });
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(axios.post.mock.calls[0][0]).toContain('api.kapso.ai');
    expect(res.provider).toBe('kapso');
  });

  it('without a hint, the existing priority order is unchanged (Z-API first)', async () => {
    const svc = await importServiceWithEnv({ ...ZAPI_ENV, ...KAPSO_ENV });
    const res = await svc.sendWhatsAppMessage('+5511999002121', 'hello');
    expect(axios.post.mock.calls[0][0]).toContain('api.z-api.io');
    expect(res.provider).toBe('zapi');
  });

  it('a stale hint for an unconfigured provider degrades to the default chain', async () => {
    // zapi affinity recorded historically, but only Kapso is configured now:
    // deliver from the configured number rather than black-holing the message.
    const svc = await importServiceWithEnv({ ...KAPSO_ENV });
    const res = await svc.sendWhatsAppMessage('+5511999002121', 'hello', { provider: 'zapi' });
    expect(axios.post.mock.calls[0][0]).toContain('api.kapso.ai');
    expect(res.provider).toBe('kapso');
  });

  it('zapi hint routes via Z-API when configured', async () => {
    const svc = await importServiceWithEnv({ ...ZAPI_ENV, ...KAPSO_ENV });
    const res = await svc.sendWhatsAppMessage('+5511999002121', 'hello', { provider: 'zapi' });
    expect(axios.post.mock.calls[0][0]).toContain('api.z-api.io');
    expect(res.provider).toBe('zapi');
  });
});

describe('deriveWaProvider (inbound provenance -> send provider)', () => {
  it('maps route format families to providers', async () => {
    const svc = await importServiceWithEnv({ ...KAPSO_ENV });
    expect(svc.deriveWaProvider('kapso_v2')).toBe('kapso');
    expect(svc.deriveWaProvider('kapso_v2_interactive')).toBe('kapso');
    expect(svc.deriveWaProvider('meta_native')).toBe('kapso'); // same WABA number, kapso-proxied sends
    expect(svc.deriveWaProvider('zapi_text')).toBe('zapi');
    expect(svc.deriveWaProvider('evolution_text')).toBe('evolution');
    expect(svc.deriveWaProvider(undefined)).toBe(null);
    expect(svc.deriveWaProvider('telegram')).toBe(null);
  });
});

describe('isServiceWindowError (the 3-week silent failure)', () => {
  it('classifies the Kapso 422 window rejection', async () => {
    const svc = await importServiceWithEnv({ ...KAPSO_ENV });
    expect(svc.isServiceWindowError('Cannot send non-template messages outside the 24-hour window.')).toBe(true);
    expect(svc.isServiceWindowError('Authentication Error')).toBe(false);
    expect(svc.isServiceWindowError(null)).toBe(false);
  });
});
