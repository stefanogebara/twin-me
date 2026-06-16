/**
 * Z-API provider path in whatsappService — outbound send + direct-URL media
 * download. Pins: URL/body/header shape, phone normalization, success/error
 * envelope, the 24h-window-free provider priority (Z-API beats Kapso/Meta),
 * and that a media "id" that is an http URL is fetched directly.
 *
 * Env is set BEFORE importing the module because USE_ZAPI is resolved at load.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.ZAPI_INSTANCE_ID = 'INST123';
process.env.ZAPI_INSTANCE_TOKEN = 'TOK456';
process.env.ZAPI_CLIENT_TOKEN = 'CLIENT789';
delete process.env.KAPSO_API_KEY;
delete process.env.TWINME_DISABLE_OUTBOUND_SEND;

const axiosPost = vi.fn();
const axiosGet = vi.fn();
vi.mock('axios', () => ({
  default: { post: (...a) => axiosPost(...a), get: (...a) => axiosGet(...a) },
}));

// logOutbound writes here — make it a no-op that never throws.
vi.mock('../../../api/config/supabase.js', () => ({
  supabaseAdmin: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) },
}));

const { sendWhatsAppMessage, downloadWhatsAppMedia } = await import(
  '../../../api/services/whatsappService.js'
);

describe('sendWhatsAppMessage via Z-API', () => {
  beforeEach(() => {
    axiosPost.mockReset();
    axiosGet.mockReset();
  });

  it('POSTs to the instance send-text URL with phone+message and Client-Token', async () => {
    axiosPost.mockResolvedValue({ status: 200, data: { zaapId: 'z1', messageId: 'wamid.X', id: 'wamid.X' } });

    const res = await sendWhatsAppMessage('+5511999002121', 'oi');

    expect(res).toEqual({ success: true, messageId: 'wamid.X', provider: 'zapi' });
    expect(axiosPost).toHaveBeenCalledTimes(1);
    const [url, body, opts] = axiosPost.mock.calls[0];
    expect(url).toBe('https://api.z-api.io/instances/INST123/token/TOK456/send-text');
    // '+' stripped to digits only
    expect(body).toEqual({ phone: '5511999002121', message: 'oi' });
    expect(opts.headers['Client-Token']).toBe('CLIENT789');
  });

  it('returns a failure envelope (no throw) when Z-API errors', async () => {
    axiosPost.mockRejectedValue({ response: { status: 401, data: { error: 'instance not connected' } } });

    const res = await sendWhatsAppMessage('5511999002121', 'oi');

    expect(res.success).toBe(false);
    expect(res.provider).toBe('zapi');
  });

  it('suppresses send when TWINME_DISABLE_OUTBOUND_SEND=true', async () => {
    process.env.TWINME_DISABLE_OUTBOUND_SEND = 'true';
    const res = await sendWhatsAppMessage('5511999002121', 'oi');
    expect(res).toEqual({ success: true, suppressed: true });
    expect(axiosPost).not.toHaveBeenCalled();
    delete process.env.TWINME_DISABLE_OUTBOUND_SEND;
  });
});

describe('downloadWhatsAppMedia with a direct URL (Z-API media)', () => {
  beforeEach(() => {
    axiosPost.mockReset();
    axiosGet.mockReset();
  });

  it('GETs the URL and returns a Buffer', async () => {
    axiosGet.mockResolvedValue({ data: Buffer.from('PDFBYTES') });
    const buf = await downloadWhatsAppMedia('https://media.z-api.io/abc.pdf');
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.toString()).toBe('PDFBYTES');
    const [url, opts] = axiosGet.mock.calls[0];
    expect(url).toBe('https://media.z-api.io/abc.pdf');
    expect(opts.responseType).toBe('arraybuffer');
  });

  it('returns null (no throw) when the direct download fails', async () => {
    axiosGet.mockRejectedValue(new Error('403 forbidden'));
    const buf = await downloadWhatsAppMedia('https://media.z-api.io/gone.pdf');
    expect(buf).toBe(null);
  });
});
