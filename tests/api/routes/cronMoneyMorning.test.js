import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../../api/services/logger.js', () => ({ createLogger: () => ({ warn() {}, error() {}, info() {}, debug() {} }) }));
vi.mock('../../../api/services/cronLogger.js', () => ({ logCronExecution: vi.fn() }));
vi.mock('../../../api/services/money/chat.js', () => ({ gather: vi.fn() }));
vi.mock('../../../api/services/money/channelStore.js', () => ({ morningRecipients: vi.fn(), claimMorningSend: vi.fn(), finishMorningSend: vi.fn() }));
vi.mock('../../../api/services/whatsappService.js', () => ({ sendWhatsAppTemplate: vi.fn() }));
vi.mock('../../../api/services/money/morningLine.js', () => ({ morningLine: vi.fn(), MORNING_TEMPLATE: 'money_morning' }));
import { runMorning } from '../../../api/routes/cron-money-morning.js';

let deps;
const now = new Date('2026-09-22T06:30:00Z');
beforeEach(() => {
  deps = {
    morningRecipients: vi.fn().mockResolvedValue([{ userId: 'u1', phone: '+34600000000' }, { userId: 'u2', phone: '+34600000001' }]),
    gather: vi.fn().mockResolvedValue({ language: 'es' }),
    morningLine: vi.fn().mockReturnValue({ variables: ['14,60 €', 'Nada vence hoy ni mañana.'], language: 'es', due: 'none' }),
    claimMorningSend: vi.fn().mockResolvedValue('send-1'),
    finishMorningSend: vi.fn().mockResolvedValue(),
    sendTemplate: vi.fn().mockResolvedValue({ success: true, messageId: 'wamid.s1' }),
  };
});

describe('the morning run', () => {
  it('sends one template per person with the two variables', async () => {
    const r = await runMorning({ now, deps });
    expect(deps.sendTemplate).toHaveBeenCalledWith('+34600000000', 'money_morning', 'es', ['14,60 €', 'Nada vence hoy ni mañana.']);
    expect(deps.claimMorningSend).toHaveBeenCalledWith('u1', '2026-09-22', { template: 'money_morning', language: 'es' });
    expect(deps.finishMorningSend).toHaveBeenCalledWith('send-1', { providerMessageId: 'wamid.s1' });
    expect(r).toMatchObject({ recipients: 2, sent: 2, skipped: 0, failed: 0 });
  });
  it('does not send twice on the same day', async () => {
    deps.claimMorningSend.mockResolvedValue(null);
    const r = await runMorning({ now, deps });
    expect(deps.sendTemplate).not.toHaveBeenCalled();
    expect(r).toMatchObject({ sent: 0, skipped: 2 });
  });
  it('claims nothing for a person whose number cannot be said', async () => {
    deps.morningLine.mockReturnValue(null);
    const r = await runMorning({ now, deps });
    expect(deps.claimMorningSend).not.toHaveBeenCalled();
    expect(r).toMatchObject({ sent: 0, skipped: 2 });
  });
  it('keeps the provider\'s refusal on the row and counts it', async () => {
    deps.sendTemplate.mockResolvedValue({ success: false, error: 'template not approved' });
    const r = await runMorning({ now, deps });
    expect(deps.finishMorningSend).toHaveBeenCalledWith('send-1', { error: 'template not approved' });
    expect(r.failed).toBe(2);
  });
  it('one person failing does not stop the next', async () => {
    deps.gather.mockRejectedValueOnce(new Error('offline'));
    const r = await runMorning({ now, deps });
    expect(r).toMatchObject({ sent: 1, failed: 1 });
  });
});
