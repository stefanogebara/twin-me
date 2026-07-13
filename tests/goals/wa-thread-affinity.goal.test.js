/**
 * GOAL: WhatsApp thread affinity — the twin only sends from a number the user
 * can reply to.
 * ==========================================================================
 * Shipped: wrong-thread fix (2026-07-13). Incident: deliver-insights sent via
 * the Kapso -> Meta-direct fallback inside sendWhatsAppMessage. In prod those
 * are TWO DIFFERENT WhatsApp numbers, and only the Kapso number's webhook
 * feeds whatsappInboundPipeline (where thread approvals live). The insight
 * arrived from the Meta number in a separate thread; the user replied "yes"
 * there and the reply never reached the backend. The armed proposal sat
 * unresolved until a second "yes" in the real conversational thread.
 *
 * The invariant a user would feel break: every message the twin sends arrives
 * in the thread where replying actually works. Two halves:
 *
 *   (a) send side — sendWhatsAppMessage never switches sender number midway:
 *       a failed Kapso send with a DIFFERENT Meta number configured must fail
 *       (messageRouter retries, then email fallback) instead of delivering
 *       from the wrong number. Fallback stays allowed when both transports
 *       share one phone_number_id (same number == same thread).
 *   (b) inbound side — every provider sendWhatsAppMessage can select
 *       (Z-API / Evolution / Kapso) has its webhook route wired into
 *       processInboundWhatsApp, so a "yes" in the delivery thread reaches
 *       thread approvals. (The legacy whatsapp-twin route is NOT wired, which
 *       is exactly why the meta-direct sender is quarantined in (a).)
 *
 * External webhook REGISTRATION (provider dashboard -> prod URL) cannot be
 * pinned from a unit test; that is covered by live re-send verification.
 */
// whatsappService imports the supabase config module, which requires these at
// import time. Stub if absent (mirrors ci.yml); no query ever runs here — the
// supabase module itself is mocked below. Per-file isolation (vitest
// isolate:true) keeps these stubs from leaking to other files.
process.env.SUPABASE_URL ||= 'https://goals-stub.supabase.co';
process.env.SUPABASE_ANON_KEY ||= 'goals-stub-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'goals-stub-service-role-key';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';

const axiosPost = vi.fn();
const axiosGet = vi.fn();
vi.mock('axios', () => ({
  default: { post: (...a) => axiosPost(...a), get: (...a) => axiosGet(...a) },
}));

// logOutbound writes here — make it a no-op that never throws.
vi.mock('../../api/config/supabase.js', () => ({
  supabaseAdmin: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) },
}));

const PROVIDER_ENV_VARS = [
  'ZAPI_INSTANCE_ID', 'ZAPI_INSTANCE_TOKEN', 'ZAPI_CLIENT_TOKEN',
  'EVOLUTION_API_URL', 'EVOLUTION_API_KEY', 'EVOLUTION_INSTANCE',
  'KAPSO_API_KEY', 'KAPSO_PHONE_NUMBER_ID',
  'TWINME_WHATSAPP_PHONE_NUMBER_ID', 'TWINME_WHATSAPP_ACCESS_TOKEN',
  'TWINME_DISABLE_OUTBOUND_SEND',
];

// Provider flags (USE_KAPSO etc.) are resolved at module load, so each env
// shape needs a fresh import.
async function importServiceWithEnv(env) {
  vi.resetModules();
  for (const k of PROVIDER_ENV_VARS) delete process.env[k];
  Object.assign(process.env, env);
  return import('../../api/services/whatsappService.js');
}

// Prod shape: Kapso conversational number and a DIFFERENT Meta-direct number.
const PROD_SHAPED_ENV = {
  KAPSO_API_KEY: 'goal-kapso-key',
  KAPSO_PHONE_NUMBER_ID: '104000000000000',
  TWINME_WHATSAPP_PHONE_NUMBER_ID: '882000000000000',
  TWINME_WHATSAPP_ACCESS_TOKEN: 'goal-meta-token',
};

describe('goal: WhatsApp thread affinity', () => {
  beforeEach(() => {
    axiosPost.mockReset();
    axiosGet.mockReset();
  });

  it('a failed Kapso send NEVER falls through to a different Meta number (the wrong-thread incident)', async () => {
    const { sendWhatsAppMessage } = await importServiceWithEnv(PROD_SHAPED_ENV);
    axiosPost.mockRejectedValue({ response: { status: 400, data: { error: { message: 'Re-engagement message' } } } });

    const res = await sendWhatsAppMessage('+5511999002121', 'morning brief');

    expect(res.success).toBe(false);
    expect(res.provider).toBe('kapso');
    // Exactly one attempt, to Kapso — no second send from the other number.
    expect(axiosPost).toHaveBeenCalledTimes(1);
    expect(axiosPost.mock.calls[0][0]).toContain('api.kapso.ai');
    expect(axiosPost.mock.calls.some(([url]) => url.includes('graph.facebook.com'))).toBe(false);
  });

  it('a successful Kapso send goes out via the conversational number', async () => {
    const { sendWhatsAppMessage } = await importServiceWithEnv(PROD_SHAPED_ENV);
    axiosPost.mockResolvedValue({ status: 200, data: { messages: [{ id: 'wamid.OK' }], contacts: [{ wa_id: '5511999002121' }] } });

    const res = await sendWhatsAppMessage('+5511999002121', 'morning brief');

    expect(res).toMatchObject({ success: true, messageId: 'wamid.OK', provider: 'kapso' });
    expect(axiosPost).toHaveBeenCalledTimes(1);
  });

  it('Meta-direct fallback stays available when both transports share ONE number (same thread)', async () => {
    const { sendWhatsAppMessage } = await importServiceWithEnv({
      ...PROD_SHAPED_ENV,
      // Same phone_number_id on both transports — fallback is thread-safe.
      TWINME_WHATSAPP_PHONE_NUMBER_ID: PROD_SHAPED_ENV.KAPSO_PHONE_NUMBER_ID,
    });
    axiosPost
      .mockRejectedValueOnce({ response: { status: 500, data: { error: 'kapso down' } } })
      .mockResolvedValueOnce({ status: 200, data: { messages: [{ id: 'wamid.META' }] } });

    const res = await sendWhatsAppMessage('+5511999002121', 'morning brief');

    expect(res).toMatchObject({ success: true, messageId: 'wamid.META', provider: 'meta' });
    expect(axiosPost).toHaveBeenCalledTimes(2);
    expect(axiosPost.mock.calls[1][0]).toContain('graph.facebook.com');
    expect(axiosPost.mock.calls[1][0]).toContain(PROD_SHAPED_ENV.KAPSO_PHONE_NUMBER_ID);
  });

  it('every selectable provider webhook feeds whatsappInboundPipeline (thread approvals rail)', () => {
    // If a provider can be the outbound sender, a reply in its thread must
    // reach processInboundWhatsApp. The legacy whatsapp-twinme-webhook.js is
    // deliberately absent here — it is NOT wired, which is why the guard in
    // sendWhatsAppMessage refuses to send from its number.
    const wiredRoutes = [
      'api/routes/whatsapp-kapso-webhook.js',
      'api/routes/whatsapp-zapi-webhook.js',
      'api/routes/whatsapp-evolution-webhook.js',
    ];
    for (const route of wiredRoutes) {
      const src = fs.readFileSync(new URL(`../../${route}`, import.meta.url), 'utf8');
      expect(src, `${route} must import the shared inbound pipeline`).toMatch(/whatsappInboundPipeline\.js/);
      expect(src, `${route} must hand inbound messages to processInboundWhatsApp`).toMatch(/processInboundWhatsApp\(/);
    }
  });
});
