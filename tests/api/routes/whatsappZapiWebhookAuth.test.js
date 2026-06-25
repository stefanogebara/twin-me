/**
 * Z-API webhook auth gate — the ACTIVE Brazilian money-flow inbound (forwarded
 * Pix receipts + bank statements land here). Audit QW4: the lower-risk Kapso
 * route had a 403 test; this money-carrying route had none. Pins the
 * constant-time shared-secret gate: fail-closed when unset, 403 on mismatch,
 * pipeline only runs on the correct secret.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';

const sendMock = vi.fn().mockResolvedValue({ success: true });
vi.mock('../../../api/services/whatsappService.js', () => ({
  sendWhatsAppMessage: (...a) => sendMock(...a),
  downloadWhatsAppMedia: vi.fn(),
}));
const processMock = vi.fn().mockResolvedValue({ handled: true, kind: 'chat' });
vi.mock('../../../api/services/whatsappInboundPipeline.js', () => ({
  processInboundWhatsApp: (...a) => processMock(...a),
}));
const parseMock = vi.fn();
vi.mock('../../../api/services/zapiParse.js', () => ({
  parseZapiMessage: (...a) => parseMock(...a),
}));

const { default: router } = await import('../../../api/routes/whatsapp-zapi-webhook.js');
const app = express();
app.use(express.json());
app.use('/api/whatsapp-zapi', router);

const SECRET = 'zapi-test-secret';
let mid = 0;
const body = (extra = {}) => ({ messageId: `m-${++mid}`, type: 'ReceivedCallback', text: { message: 'oi' }, ...extra });

beforeEach(() => {
  sendMock.mockClear();
  processMock.mockClear();
  parseMock.mockReset().mockReturnValue({ phone: '5511', text: 'oi' });
  process.env.ZAPI_WEBHOOK_SECRET = SECRET;
  delete process.env.ZAPI_INSTANCE_ID;
});

describe('Z-API webhook auth gate', () => {
  it('fails closed (403, no processing) when ZAPI_WEBHOOK_SECRET is unset', async () => {
    delete process.env.ZAPI_WEBHOOK_SECRET;
    const res = await request(app).post('/api/whatsapp-zapi/webhook?secret=anything').send(body());
    expect(res.status).toBe(403);
    expect(processMock).not.toHaveBeenCalled();
  });

  it('rejects a secret mismatch with 403 and runs no pipeline', async () => {
    const res = await request(app).post('/api/whatsapp-zapi/webhook?secret=wrong').send(body());
    expect(res.status).toBe(403);
    expect(processMock).not.toHaveBeenCalled();
  });

  it('accepts the correct secret → 200 and invokes the inbound pipeline', async () => {
    const res = await request(app).post(`/api/whatsapp-zapi/webhook?secret=${SECRET}`).send(body());
    expect(res.status).toBe(200);
    expect(processMock).toHaveBeenCalledTimes(1);
  });

  it('ignores an unparseable callback (200, no pipeline call)', async () => {
    parseMock.mockReturnValue(null);
    const res = await request(app).post(`/api/whatsapp-zapi/webhook?secret=${SECRET}`).send(body());
    expect(res.status).toBe(200);
    expect(processMock).not.toHaveBeenCalled();
  });
});
