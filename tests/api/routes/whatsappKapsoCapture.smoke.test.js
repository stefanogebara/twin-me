/**
 * Smoke tests for the transaction-capture hook in
 * api/routes/whatsapp-kapso-webhook.js (replan-2026-06-12).
 *
 * The capture pipeline itself is unit-tested in
 * tests/api/services/transactions/whatsappTransactionCapture.test.js — here we
 * test the WIRING and the branch ordering inside the webhook:
 *   - bad signature → 403, nothing processed
 *   - capture handled → its reply is sent, twin chat NOT invoked
 *   - future purchase intent → reflection branch still fires (regression:
 *     capture must not swallow the intent branch's traffic)
 *   - plain chat → twin chat pipeline invoked
 *   - Kapso v2 image payload → capture invoked with mediaId/mimeType
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import crypto from 'crypto';

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
process.env.KAPSO_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.TWINME_DISABLE_OUTBOUND_SEND = 'true';
process.env.PURCHASE_BOT_ENABLED = 'true';

// ── Mocks (everything heavy the route imports) ──────────────────────────────
const sendMock = vi.fn().mockResolvedValue({ success: true });
vi.mock('../../../api/services/whatsappService.js', () => ({
  sendWhatsAppMessage: (...a) => sendMock(...a),
  downloadWhatsAppMedia: vi.fn(),
}));

const captureMock = vi.fn();
vi.mock('../../../api/services/transactions/whatsappTransactionCapture.js', () => ({
  tryCaptureTransaction: (...a) => captureMock(...a),
}));

const reflectionMock = vi.fn().mockResolvedValue({ text: 'reflexao-teste', lang: 'pt-BR', elapsed_ms: 5, cost: 0 });
vi.mock('../../../api/services/purchaseReflection.js', () => ({
  generatePurchaseReflection: (...a) => reflectionMock(...a),
}));
vi.mock('../../../api/services/purchaseContextBuilder.js', () => ({
  buildPurchaseContext: vi.fn().mockResolvedValue({ moment: { band: 'evening' }, music: {}, schedule: {} }),
}));

const completeMock = vi.fn().mockResolvedValue({ content: 'twin-chat-reply', model: 'm', usage: {}, cost: 0 });
vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: (...a) => completeMock(...a),
  TIER_CHAT: 'chat',
}));
vi.mock('../../../api/services/chatRouter.js', () => ({
  classifyMessageTier: vi.fn().mockReturnValue('standard'),
  CHAT_TIER_MODELS: { standard: 'deepseek/deepseek-v3.2' },
}));
vi.mock('../../../api/services/twinContextBuilder.js', () => ({
  fetchTwinContext: vi.fn().mockResolvedValue({}),
}));
vi.mock('../../../api/services/chatRateLimiter.js', () => ({
  checkChatRateLimit: vi.fn().mockResolvedValue({ allowed: true, used: 1, limit: 200 }),
}));
vi.mock('../../../api/services/coreMemoryService.js', () => ({
  getBlocks: vi.fn().mockResolvedValue({}),
  formatBlocksForPrompt: vi.fn().mockReturnValue(''),
}));
vi.mock('../../../api/services/personalityPromptBuilder.js', () => ({
  buildPersonalityPrompt: vi.fn().mockReturnValue(''),
}));
vi.mock('../../../api/services/personalityProfileService.js', () => ({
  getProfile: vi.fn().mockResolvedValue(null),
  getSoulSignatureLayers: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../../api/services/memoryStreamService.js', () => ({
  addConversationMemory: vi.fn().mockResolvedValue(undefined),
}));

// messaging_channels lookup + conversation history + purchase_reflections
// audit insert. One permissive chainable builder serves every table: the
// channel lookup needs the user row; the rest tolerate the same shape.
vi.mock('../../../api/services/database.js', () => {
  const builder = {};
  const chain = ['select', 'eq', 'neq', 'in', 'gte', 'lte', 'lt', 'order', 'limit', 'maybeSingle', 'single', 'insert', 'upsert'];
  for (const m of chain) builder[m] = vi.fn(() => builder);
  builder.then = (resolve, reject) =>
    Promise.resolve({ data: [{ user_id: 'user-1', preferences: {} }], error: null }).then(resolve, reject);
  return { supabaseAdmin: { from: vi.fn(() => builder) } };
});

const webhookRoutes = (await import('../../../api/routes/whatsapp-kapso-webhook.js')).default;

// ── Test app: capture rawBody exactly like server.js does ───────────────────
function createApp() {
  const app = express();
  app.use(express.json({
    verify: (req, _res, buf) => { req.rawBody = buf; },
  }));
  app.use('/api/whatsapp', webhookRoutes);
  return app;
}

function sign(rawBody) {
  return crypto.createHmac('sha256', process.env.KAPSO_WEBHOOK_SECRET).update(rawBody).digest('hex');
}

function kapsoTextPayload(text, id = `msg-${Math.random().toString(36).slice(2)}`) {
  return JSON.stringify({ message: { id, from: '5511999990000', type: 'text', text: { body: text }, kapso: { direction: 'inbound' } } });
}

function kapsoImagePayload(id = `msg-${Math.random().toString(36).slice(2)}`) {
  return JSON.stringify({
    message: {
      id, from: '5511999990000', type: 'image',
      image: { id: 'media-123', mime_type: 'image/jpeg', sha256: 'abc', caption: 'comprovante' },
      kapso: { direction: 'inbound' },
    },
  });
}

async function postSigned(app, rawBody, headers = {}) {
  return request(app)
    .post('/api/whatsapp/webhook')
    .set('Content-Type', 'application/json')
    .set('X-Webhook-Signature', sign(rawBody))
    .set('X-Idempotency-Key', `key-${Math.random().toString(36).slice(2)}`)
    .set(headers)
    .send(rawBody);
}

beforeEach(() => {
  vi.clearAllMocks();
  sendMock.mockResolvedValue({ success: true });
});

describe('whatsapp kapso webhook — transaction capture wiring', () => {
  it('rejects a bad signature with 403 and never touches the pipeline', async () => {
    const raw = kapsoTextPayload('gastei 80 no ifood');
    const res = await request(createApp())
      .post('/api/whatsapp/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Webhook-Signature', 'sha256=deadbeef')
      .send(raw);
    expect(res.status).toBe(403);
    expect(captureMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('capture handled -> sends the capture reply, twin chat NOT invoked', async () => {
    captureMock.mockResolvedValue({ handled: true, reply: 'Anotei: R$ 80,00 — iFood, hoje.', stored: true });
    const res = await postSigned(createApp(), kapsoTextPayload('gastei 80 no ifood'));
    expect(res.status).toBe(200);
    expect(captureMock).toHaveBeenCalledTimes(1);
    const [userId, parsed] = captureMock.mock.calls[0];
    expect(userId).toBe('user-1');
    expect(parsed.messageType).toBe('text');
    expect(parsed.text).toBe('gastei 80 no ifood');
    expect(sendMock).toHaveBeenCalledWith('5511999990000', 'Anotei: R$ 80,00 — iFood, hoje.');
    expect(completeMock).not.toHaveBeenCalled(); // twin chat pipeline untouched
  });

  it('future purchase intent still reaches the reflection branch (capture declines)', async () => {
    captureMock.mockResolvedValue({ handled: false });
    const res = await postSigned(createApp(), kapsoTextPayload('vou comprar um tênis de R$ 300'));
    expect(res.status).toBe(200);
    expect(reflectionMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith('5511999990000', 'reflexao-teste');
  });

  it('plain chat falls through to the twin chat pipeline', async () => {
    captureMock.mockResolvedValue({ handled: false });
    const res = await postSigned(createApp(), kapsoTextPayload('oi, tudo bem?'));
    expect(res.status).toBe(200);
    expect(reflectionMock).not.toHaveBeenCalled();
    expect(completeMock).toHaveBeenCalled(); // twin chat ran
    expect(sendMock).toHaveBeenCalledWith('5511999990000', 'twin-chat-reply');
  });

  it('Kapso v2 image payload parses and reaches capture with media fields', async () => {
    captureMock.mockResolvedValue({ handled: true, reply: 'Anotei: R$ 150,00 — Maria Silva, hoje.', stored: true });
    const res = await postSigned(createApp(), kapsoImagePayload());
    expect(res.status).toBe(200);
    const [, parsed] = captureMock.mock.calls[0];
    expect(parsed.messageType).toBe('image');
    expect(parsed.mediaId).toBe('media-123');
    expect(parsed.mimeType).toBe('image/jpeg');
    expect(parsed.caption).toBe('comprovante');
    expect(sendMock).toHaveBeenCalled();
  });

  it('image that capture declines is silently skipped (no twin chat on empty text)', async () => {
    captureMock.mockResolvedValue({ handled: false });
    const res = await postSigned(createApp(), kapsoImagePayload());
    expect(res.status).toBe(200);
    expect(completeMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });
});
