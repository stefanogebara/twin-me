/**
 * Tappable connect menu — interactive list of connectable platforms.
 * Covers the menu-row builder + reply-id parser (pure) and sendWhatsAppList
 * (native Meta interactive list via Kapso with a text-menu fallback).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Kapso-only path (same setup as whatsappCtaButton.test.js).
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
vi.mock('../../../api/config/supabase.js', () => ({
  supabaseAdmin: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) },
}));

const { sendWhatsAppList } = await import('../../../api/services/whatsappService.js');
const { buildConnectMenuRows, connectAliasFromReplyId, resolveIntegrationId } =
  await import('../../../api/services/connectLinkService.js');

beforeEach(() => {
  axiosPostMock.mockReset();
  axiosPostMock.mockResolvedValue({ data: { messages: [{ id: 'wamid.1' }] }, status: 200 });
});

describe('buildConnectMenuRows', () => {
  it('returns a row per connectable platform with resolvable connect ids', () => {
    const rows = buildConnectMenuRows();
    expect(rows.length).toBeGreaterThanOrEqual(8);
    for (const row of rows) {
      expect(row.id).toMatch(/^connect:/);
      expect(typeof row.title).toBe('string');
      expect(row.title.length).toBeGreaterThan(0);
      expect(row.title.length).toBeLessThanOrEqual(24); // Meta list-row title cap
      // the alias embedded in the id must resolve to a real Nango integration
      const alias = row.id.slice('connect:'.length);
      expect(resolveIntegrationId(alias)).toBeTruthy();
    }
    // includes Spotify
    expect(rows.some((r) => r.id === 'connect:spotify')).toBe(true);
  });
});

describe('connectAliasFromReplyId', () => {
  it('extracts a known alias from a connect: reply id', () => {
    expect(connectAliasFromReplyId('connect:spotify')).toBe('spotify');
    expect(connectAliasFromReplyId('connect:gmail')).toBe('gmail');
  });
  it('returns null for unknown or malformed ids', () => {
    expect(connectAliasFromReplyId('connect:bogus')).toBeNull();
    expect(connectAliasFromReplyId('random-button')).toBeNull();
    expect(connectAliasFromReplyId('')).toBeNull();
    expect(connectAliasFromReplyId(null)).toBeNull();
  });
});

describe('sendWhatsAppList', () => {
  const sections = [{ title: 'Platforms', rows: [
    { id: 'connect:spotify', title: 'Spotify' },
    { id: 'connect:gmail', title: 'Gmail' },
  ] }];

  it('sends a native interactive list via Kapso', async () => {
    const out = await sendWhatsAppList('+5511999', { body: 'Which one?', buttonText: 'Choose', sections });
    expect(out.success).toBe(true);
    expect(out.interactive).toBe(true);
    const [url, payload, cfg] = axiosPostMock.mock.calls[0];
    expect(url).toContain('api.kapso.ai');
    expect(payload.type).toBe('interactive');
    expect(payload.interactive.type).toBe('list');
    expect(payload.interactive.action.button).toBe('Choose');
    expect(payload.interactive.action.sections[0].rows[0].id).toBe('connect:spotify');
    expect(cfg.headers['X-API-Key']).toBe('kapso-key');
  });

  it('caps the list button label at 20 chars', async () => {
    await sendWhatsAppList('+5511999', { body: 'x', buttonText: 'Choose a platform to connect now', sections });
    const payload = axiosPostMock.mock.calls[0][1];
    expect(payload.interactive.action.button.length).toBeLessThanOrEqual(20);
  });

  it('falls back to a text menu when the interactive send fails', async () => {
    axiosPostMock.mockRejectedValueOnce(new Error('list unsupported'));
    axiosPostMock.mockResolvedValueOnce({ data: { messages: [{ id: 'wamid.2' }] }, status: 200 });
    const out = await sendWhatsAppList('+5511999', { body: 'Which one?', buttonText: 'Choose', sections });
    expect(out.success).toBe(true);
    const textPayload = axiosPostMock.mock.calls[1][1];
    expect(textPayload.type).toBe('text');
    expect(textPayload.text.body).toContain('Spotify');
    expect(textPayload.text.body).toContain('Gmail');
  });

  it('short-circuits when outbound is disabled', async () => {
    process.env.TWINME_DISABLE_OUTBOUND_SEND = 'true';
    const out = await sendWhatsAppList('+5511999', { body: 'x', buttonText: 'y', sections });
    expect(out.suppressed).toBe(true);
    expect(axiosPostMock).not.toHaveBeenCalled();
    delete process.env.TWINME_DISABLE_OUTBOUND_SEND;
  });
});
