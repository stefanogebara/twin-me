/**
 * sendWhatsAppTemplate — BODY variable components.
 * A static template (statement_nag) sends name+language only; a parameterized
 * template attaches a body component with {{1}}..{{n}} parameters in order.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Enable the Kapso path before whatsappService is imported (USE_KAPSO is
// evaluated at module load from KAPSO_API_KEY).
process.env.KAPSO_API_KEY = 'test-key';
process.env.KAPSO_PHONE_NUMBER_ID = 'pn-123';
delete process.env.TWINME_DISABLE_OUTBOUND_SEND;

const { sendTemplateSpy } = vi.hoisted(() => ({ sendTemplateSpy: vi.fn() }));

vi.mock('@kapso/whatsapp-cloud-api', () => ({
  WhatsAppClient: class {
    constructor() { this.messages = { sendTemplate: sendTemplateSpy }; }
  },
}));

// logOutbound writes to Supabase — make it a no-op.
vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) },
}));

const { sendWhatsAppTemplate } = await import('../../../api/services/whatsappService.js');

beforeEach(() => {
  sendTemplateSpy.mockReset();
  sendTemplateSpy.mockResolvedValue({ messages: [{ id: 'm1' }], contacts: [{ wa_id: 'w1' }] });
});

describe('sendWhatsAppTemplate variable components', () => {
  it('sends a static template with NO components', async () => {
    const out = await sendWhatsAppTemplate('+5511999', 'statement_nag', 'en');
    expect(out.success).toBe(true);
    const arg = sendTemplateSpy.mock.calls[0][0];
    expect(arg.template.name).toBe('statement_nag');
    expect(arg.template.language).toEqual({ code: 'en' });
    expect(arg.template.components).toBeUndefined();
  });

  it('attaches a BODY component with parameters in {{1}}..{{n}} order', async () => {
    const out = await sendWhatsAppTemplate('+5511999', 'reengage', 'pt_BR', ['Stefano', 'your statement closed']);
    expect(out.success).toBe(true);
    const arg = sendTemplateSpy.mock.calls[0][0];
    expect(arg.template.language).toEqual({ code: 'pt_BR' });
    expect(arg.template.components).toEqual([{
      type: 'body',
      parameters: [
        { type: 'text', text: 'Stefano' },
        { type: 'text', text: 'your statement closed' },
      ],
    }]);
  });

  it('coerces non-string variables to text', async () => {
    await sendWhatsAppTemplate('+5511999', 'reengage', 'en', [42]);
    const arg = sendTemplateSpy.mock.calls[0][0];
    expect(arg.template.components[0].parameters[0]).toEqual({ type: 'text', text: '42' });
  });

  it('returns success:false when the Kapso send throws (caller can fall back)', async () => {
    sendTemplateSpy.mockRejectedValue(new Error('template not approved'));
    const out = await sendWhatsAppTemplate('+5511999', 'statement_nag', 'en');
    expect(out.success).toBe(false);
    expect(out.error).toContain('template not approved');
  });
});
