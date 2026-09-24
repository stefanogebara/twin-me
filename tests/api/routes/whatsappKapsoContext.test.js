/**
 * The Kapso webhook hands the pipeline the message a reply quotes (Meta
 * `context.id`), so a family member's reply to a Presence digest can become a
 * note. The pipeline is mocked; bodies are signed as Kapso signs them.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import crypto from 'crypto';

process.env.NODE_ENV = 'test';
process.env.KAPSO_WEBHOOK_SECRET = 'test-webhook-secret';

const processInboundWhatsApp = vi.fn().mockResolvedValue({ handled: true });
vi.mock('../../../api/_app/services/whatsappInboundPipeline.js', () => ({ processInboundWhatsApp: (...a) => processInboundWhatsApp(...a) }));
vi.mock('../../../api/_app/services/whatsappService.js', () => ({ sendWhatsAppMessage: vi.fn().mockResolvedValue({ success: true }) }));
vi.mock('../../../api/_app/services/connectLinkService.js', () => ({ connectAliasFromReplyId: () => null }));
vi.mock('../../../api/_app/services/logger.js', () => ({ createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) }));

const webhookRoutes = (await import('../../../api/_app/routes/whatsapp-kapso-webhook.js')).default;

function createApp() {
  const app = express();
  app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
  app.use('/api/whatsapp', webhookRoutes);
  return app;
}

const sign = (raw) => crypto.createHmac('sha256', process.env.KAPSO_WEBHOOK_SECRET).update(raw).digest('hex');
const post = (raw) => request(createApp()).post('/api/whatsapp/webhook')
  .set('Content-Type', 'application/json').set('X-Webhook-Signature', sign(raw))
  .set('X-Idempotency-Key', `key-${Math.random().toString(36).slice(2)}`).send(raw);

beforeEach(() => {
  processInboundWhatsApp.mockClear();
});

describe('whatsapp kapso webhook — the quoted message', () => {
  it('passes the id of the message a Kapso v2 text replies to', async () => {
    const raw = JSON.stringify({ message: { id: 'wamid.r1', from: '5511999990000', type: 'text', text: { body: 'Diga que eu vou domingo.' }, context: { id: 'wamid.t1', from: '15550001111' }, kapso: { direction: 'inbound' } } });

    const res = await post(raw);

    expect(res.status).toBe(200);
    expect(processInboundWhatsApp).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '5511999990000', text: 'Diga que eu vou domingo.', messageId: 'wamid.r1', context: { messageId: 'wamid.t1', forwarded: false } }),
      expect.anything(),
    );
  });

  it('passes a null context for a text that replies to nothing', async () => {
    const raw = JSON.stringify({ message: { id: 'wamid.r2', from: '5511999990000', type: 'text', text: { body: 'oi' }, kapso: { direction: 'inbound' } } });

    await post(raw);

    expect(processInboundWhatsApp.mock.calls[0][0]).toMatchObject({ context: { messageId: null } });
  });

  it('passes the quoted id on a Meta-native text too', async () => {
    const raw = JSON.stringify({ entry: [{ changes: [{ value: { contacts: [{ profile: { name: 'Ana' } }], messages: [{ id: 'wamid.r3', from: '5511999990000', type: 'text', text: { body: 'nota: comprei o remédio' }, context: { id: 'wamid.t2' } }] } }] }] });

    await post(raw);

    expect(processInboundWhatsApp.mock.calls[0][0]).toMatchObject({ text: 'nota: comprei o remédio', context: { messageId: 'wamid.t2' } });
  });

  it('passes the id of a tapped reply button', async () => {
    const raw = JSON.stringify({ message: { id: 'wamid.b1', from: '34600000000', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'mo:11111111-1111-4111-8111-111111111111', title: '1. Not mine: Glovo,' } }, kapso: { direction: 'inbound' } } });
    const res = await post(raw);
    expect(res.status).toBe(200);
    expect(processInboundWhatsApp).toHaveBeenCalledWith(expect.objectContaining({ replyId: 'mo:11111111-1111-4111-8111-111111111111', text: '1. Not mine: Glovo,' }), expect.anything());
  });

  it('says when WhatsApp marks a message as forwarded', async () => {
    const raw = JSON.stringify({ message: { id: 'wamid.f1', from: '34600000000', type: 'text', text: { body: 'Your order shipped' }, context: { forwarded: true }, kapso: { direction: 'inbound' } } });
    await post(raw);
    expect(processInboundWhatsApp).toHaveBeenCalledWith(expect.objectContaining({ context: { messageId: null, forwarded: true } }), expect.anything());
  });
});

describe('whatsapp kapso webhook - a reaction', () => {
  it('passes the reacted message and the emoji, with no text', async () => {
    const raw = JSON.stringify({ message: { id: 'wamid.rx1', from: '34600000000', type: 'reaction', reaction: { message_id: 'wamid.buttons', emoji: '\u{1F44D}' } } });
    await post(raw);
    expect(processInboundWhatsApp).toHaveBeenCalledTimes(1);
    const parsed = processInboundWhatsApp.mock.calls[0][0];
    expect(parsed).toMatchObject({ phone: '34600000000', text: null, messageId: 'wamid.rx1', format: 'kapso_v2_reaction', reaction: { messageId: 'wamid.buttons', emoji: '\u{1F44D}' } });
  });
});

describe('whatsapp kapso webhook - a voice note', () => {
  it('passes the audio id, its type and whether it is a voice note, with no text', async () => {
    const raw = JSON.stringify({ message: { id: 'wamid.a1', from: '34600000000', type: 'audio', audio: { id: 'media-9', mime_type: 'audio/ogg; codecs=opus', voice: true } } });
    await post(raw);
    const parsed = processInboundWhatsApp.mock.calls[0][0];
    expect(parsed).toMatchObject({ phone: '34600000000', text: null, messageId: 'wamid.a1', format: 'kapso_v2_audio', audio: { id: 'media-9', mimeType: 'audio/ogg; codecs=opus', voice: true } });
  });
});
