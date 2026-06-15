/**
 * Evolution API provider path in whatsappService — outbound send + base64 media
 * download (getBase64FromMediaMessage). Env set BEFORE import (USE_EVOLUTION
 * resolves at load). Z-API/Kapso env intentionally unset so Evolution wins.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.EVOLUTION_API_URL = 'https://evo.example.com';
process.env.EVOLUTION_API_KEY = 'EVOKEY';
process.env.EVOLUTION_INSTANCE = 'twinme';
delete process.env.ZAPI_INSTANCE_ID;
delete process.env.ZAPI_INSTANCE_TOKEN;
delete process.env.KAPSO_API_KEY;
delete process.env.TWINME_DISABLE_OUTBOUND_SEND;

const axiosPost = vi.fn();
const axiosGet = vi.fn();
vi.mock('axios', () => ({
  default: { post: (...a) => axiosPost(...a), get: (...a) => axiosGet(...a) },
}));
vi.mock('../../../api/config/supabase.js', () => ({
  supabaseAdmin: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) },
}));

const { sendWhatsAppMessage, downloadWhatsAppMedia } = await import(
  '../../../api/services/whatsappService.js'
);

describe('sendWhatsAppMessage via Evolution API', () => {
  beforeEach(() => { axiosPost.mockReset(); axiosGet.mockReset(); });

  it('POSTs to /message/sendText/{instance} with number+text and apikey header', async () => {
    axiosPost.mockResolvedValue({ status: 201, data: { key: { id: 'EVO_MSG_1' }, status: 'PENDING' } });

    const res = await sendWhatsAppMessage('+55 11 99900-2121', 'oi');

    expect(res).toEqual({ success: true, messageId: 'EVO_MSG_1', provider: 'evolution' });
    const [url, body, opts] = axiosPost.mock.calls[0];
    expect(url).toBe('https://evo.example.com/message/sendText/twinme');
    expect(body).toEqual({ number: '5511999002121', text: 'oi' }); // digits only
    expect(opts.headers.apikey).toBe('EVOKEY');
  });

  it('returns a failure envelope (no throw) when Evolution errors', async () => {
    axiosPost.mockRejectedValue({ response: { status: 400, data: { message: 'instance not connected' } } });
    const res = await sendWhatsAppMessage('5511999002121', 'oi');
    expect(res.success).toBe(false);
    expect(res.provider).toBe('evolution');
  });
});

describe('downloadWhatsAppMedia for Evolution (evolution:<id>)', () => {
  beforeEach(() => { axiosPost.mockReset(); axiosGet.mockReset(); });

  it('POSTs the message key to getBase64FromMediaMessage and decodes base64', async () => {
    const payload = Buffer.from('OFXBYTES').toString('base64');
    axiosPost.mockResolvedValue({ data: { base64: payload, mimetype: 'application/x-ofx' } });

    const buf = await downloadWhatsAppMedia('evolution:EVO_MSG_1');

    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.toString()).toBe('OFXBYTES');
    const [url, body, opts] = axiosPost.mock.calls[0];
    expect(url).toBe('https://evo.example.com/chat/getBase64FromMediaMessage/twinme');
    expect(body).toEqual({ message: { key: { id: 'EVO_MSG_1' } }, convertToMp4: false });
    expect(opts.headers.apikey).toBe('EVOKEY');
  });

  it('returns null when no base64 comes back', async () => {
    axiosPost.mockResolvedValue({ data: {} });
    expect(await downloadWhatsAppMedia('evolution:EVO_MSG_2')).toBe(null);
  });

  it('returns null (no throw) when the media endpoint errors', async () => {
    axiosPost.mockRejectedValue(new Error('500'));
    expect(await downloadWhatsAppMedia('evolution:EVO_MSG_3')).toBe(null);
  });
});
