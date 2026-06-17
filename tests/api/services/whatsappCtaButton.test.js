/**
 * sendWhatsAppCtaButton — native Meta cta_url interactive (via Kapso) with a
 * tappable-link fallback. Verifies the interactive payload shape, the 20-char
 * display_text cap, and the outbound-suppressed short-circuit.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Kapso-only path: enable Kapso, ensure Z-API/Evolution are NOT configured so
// the native interactive branch runs (those module-load consts read env here).
process.env.KAPSO_API_KEY = 'kapso-key';
process.env.KAPSO_PHONE_NUMBER_ID = 'pn-1';
delete process.env.ZAPI_INSTANCE_ID;
delete process.env.ZAPI_INSTANCE_TOKEN;
delete process.env.EVOLUTION_API_URL;
delete process.env.EVOLUTION_API_KEY;
delete process.env.EVOLUTION_INSTANCE;
delete process.env.TWINME_DISABLE_OUTBOUND_SEND;

const axiosPostMock = vi.fn();
vi.mock('axios', () => ({ default: { post: (...a) => axiosPostMock(...a) } }));
// logOutbound writes to Supabase — make it a no-op (avoid prod audit writes).
vi.mock('../../../api/config/supabase.js', () => ({
  supabaseAdmin: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) },
}));

const { sendWhatsAppCtaButton } = await import('../../../api/services/whatsappService.js');

beforeEach(() => {
  axiosPostMock.mockReset();
  axiosPostMock.mockResolvedValue({ data: { messages: [{ id: 'wamid.1' }] }, status: 200 });
});

describe('sendWhatsAppCtaButton', () => {
  it('sends a native cta_url interactive message via Kapso', async () => {
    const out = await sendWhatsAppCtaButton('+5511999', { body: 'Connect your Spotify to TwinMe.', buttonText: 'Connect Spotify', url: 'https://connect.nango.dev?session_token=abc' });
    expect(out.success).toBe(true);
    expect(out.interactive).toBe(true);

    const [url, payload, cfg] = axiosPostMock.mock.calls[0];
    expect(url).toContain('api.kapso.ai');
    expect(payload.type).toBe('interactive');
    expect(payload.interactive.type).toBe('cta_url');
    expect(payload.interactive.body.text).toContain('Spotify');
    expect(payload.interactive.action.name).toBe('cta_url');
    expect(payload.interactive.action.parameters.url).toBe('https://connect.nango.dev?session_token=abc');
    expect(cfg.headers['X-API-Key']).toBe('kapso-key');
  });

  it('caps the button display_text at 20 chars (Meta limit)', async () => {
    await sendWhatsAppCtaButton('+5511999', { body: 'x', buttonText: 'Connect Google Calendar Now Please', url: 'https://e.x' });
    const payload = axiosPostMock.mock.calls[0][1];
    expect(payload.interactive.action.parameters.display_text.length).toBeLessThanOrEqual(20);
  });

  it('falls back to a tappable text link if the interactive send fails', async () => {
    // First call (cta_url) rejects → fallback calls sendWhatsAppMessage which
    // posts a text message (second axios call).
    axiosPostMock.mockRejectedValueOnce(new Error('cta unsupported'));
    axiosPostMock.mockResolvedValueOnce({ data: { messages: [{ id: 'wamid.2' }] }, status: 200 });
    const out = await sendWhatsAppCtaButton('+5511999', { body: 'Connect Spotify', buttonText: 'Connect', url: 'https://e.x/abc' });
    expect(out.success).toBe(true);
    const textPayload = axiosPostMock.mock.calls[1][1];
    expect(textPayload.type).toBe('text');
    expect(textPayload.text.body).toContain('https://e.x/abc');
  });

  it('short-circuits when outbound is disabled', async () => {
    process.env.TWINME_DISABLE_OUTBOUND_SEND = 'true';
    const out = await sendWhatsAppCtaButton('+5511999', { body: 'x', buttonText: 'y', url: 'z' });
    expect(out.suppressed).toBe(true);
    expect(axiosPostMock).not.toHaveBeenCalled();
    delete process.env.TWINME_DISABLE_OUTBOUND_SEND;
  });
});
