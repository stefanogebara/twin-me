/**
 * whatsapp-link OTP routes — the secure verify-before-link flow.
 * /link/request issues+sends a code; /link/verify checks it and ONLY THEN
 * upserts messaging_channels. The load-bearing guarantee under test: a phone is
 * never linked without a verified code. Service internals are unit-tested
 * separately (messagingChannelOtpService.test.js); here we pin orchestration.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

process.env.NODE_ENV = 'test';

vi.mock('../../../api/middleware/auth.js', () => ({
  authenticateUser: (req, _res, next) => { req.user = { id: 'u1' }; next(); },
}));

const requestMock = vi.fn();
const verifyMock = vi.fn();
vi.mock('../../../api/services/messagingChannelOtpService.js', () => ({
  requestChannelOtp: (...a) => requestMock(...a),
  verifyChannelOtp: (...a) => verifyMock(...a),
}));

const sendMock = vi.fn();
vi.mock('../../../api/services/whatsappService.js', () => ({
  sendWhatsAppMessage: (...a) => sendMock(...a),
}));

const upsertMock = vi.fn().mockResolvedValue({ error: null });
vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: { from: () => ({ upsert: (...a) => upsertMock(...a) }) },
}));

const { default: router } = await import('../../../api/routes/whatsapp-link.js');
const app = express();
app.use(express.json());
app.use('/api/whatsapp-link', router);

const PHONE = '+5511999999999';

beforeEach(() => {
  requestMock.mockReset();
  verifyMock.mockReset();
  sendMock.mockReset().mockResolvedValue({ success: true, provider: 'test' });
  upsertMock.mockClear().mockResolvedValue({ error: null });
});

describe('POST /link/request', () => {
  it('rejects an invalid phone without issuing a code', async () => {
    const res = await request(app).post('/api/whatsapp-link/link/request').send({ phone: '12345' });
    expect(res.status).toBe(400);
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('issues a code and delivers it over WhatsApp', async () => {
    requestMock.mockResolvedValue({ success: true, code: '482913' });
    const res = await request(app).post('/api/whatsapp-link/link/request').send({ phone: PHONE });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, sent: true });
    expect(requestMock).toHaveBeenCalledWith(expect.objectContaining({ channelId: PHONE, channel: 'whatsapp' }));
    expect(sendMock).toHaveBeenCalledTimes(1);
    // the code is delivered to the phone (without leading +)
    expect(sendMock.mock.calls[0][0]).toBe('5511999999999');
    expect(sendMock.mock.calls[0][1]).toContain('482913');
  });

  it('returns 502 when the code cannot be delivered (dormant WhatsApp)', async () => {
    requestMock.mockResolvedValue({ success: true, code: '482913' });
    sendMock.mockResolvedValue({ success: false, error: 'whatsapp_not_configured' });
    const res = await request(app).post('/api/whatsapp-link/link/request').send({ phone: PHONE });
    expect(res.status).toBe(502);
    expect(res.body.success).toBe(false);
  });

  it('surfaces the resend cooldown as 429', async () => {
    requestMock.mockResolvedValue({ success: false, error: 'cooldown', retryAfterMs: 45000 });
    const res = await request(app).post('/api/whatsapp-link/link/request').send({ phone: PHONE });
    expect(res.status).toBe(429);
    expect(res.body.retryAfterMs).toBe(45000);
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe('POST /link/verify', () => {
  it('rejects a malformed code without calling the verifier', async () => {
    const res = await request(app).post('/api/whatsapp-link/link/verify').send({ phone: PHONE, code: 'abc' });
    expect(res.status).toBe(400);
    expect(verifyMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('links the channel ONLY after a successful verify', async () => {
    verifyMock.mockResolvedValue({ success: true });
    const res = await request(app).post('/api/whatsapp-link/link/verify').send({ phone: PHONE, code: '482913' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, linked: true });
    expect(verifyMock).toHaveBeenCalledWith(expect.objectContaining({ channelId: PHONE, code: '482913' }));
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock.mock.calls[0][0]).toMatchObject({ user_id: 'u1', channel: 'whatsapp', channel_id: PHONE });
  });

  it('does NOT link on an incorrect code (the security guarantee)', async () => {
    verifyMock.mockResolvedValue({ success: false, reason: 'invalid', attemptsRemaining: 3 });
    const res = await request(app).post('/api/whatsapp-link/link/verify').send({ phone: PHONE, code: '000000' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.attemptsRemaining).toBe(3);
    expect(upsertMock).not.toHaveBeenCalled(); // never linked without a valid code
  });

  it('returns 429 after the attempt cap, still no link', async () => {
    verifyMock.mockResolvedValue({ success: false, reason: 'too_many_attempts' });
    const res = await request(app).post('/api/whatsapp-link/link/verify').send({ phone: PHONE, code: '000000' });
    expect(res.status).toBe(429);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
