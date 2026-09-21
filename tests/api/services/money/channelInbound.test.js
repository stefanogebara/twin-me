import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../../../api/services/logger.js', () => ({ createLogger: () => ({ warn() {}, error() {}, info() {}, debug() {} }) }));
vi.mock('../../../../api/services/money/chat.js', () => ({ answer: vi.fn(), act: vi.fn(), looksLikeInstruction: () => false }));
vi.mock('../../../../api/services/money/store.js', () => ({ listChatTurns: vi.fn(), userLanguage: vi.fn() }));
vi.mock('../../../../api/services/money/channelStore.js', () => ({ claimInbound: vi.fn(), markReplied: vi.fn(), setMorningMuted: vi.fn() }));
vi.mock('../../../../api/services/whatsappService.js', () => ({ sendWhatsAppCtaButton: vi.fn() }));
import { handleMoneyInbound } from '../../../../api/services/money/channelInbound.js';

let send; let deps;
beforeEach(() => {
  send = vi.fn().mockResolvedValue({ success: true });
  deps = {
    claimInbound: vi.fn().mockResolvedValue(true),
    markReplied: vi.fn().mockResolvedValue(),
    setMorningMuted: vi.fn().mockResolvedValue(),
    userLanguage: vi.fn().mockResolvedValue('en'),
    listChatTurns: vi.fn().mockResolvedValue([{ role: 'user', text: 'hi', figures: [] }, { role: 'twin', text: 'Hello.' }]),
    answer: vi.fn().mockResolvedValue({ text: '**Groceries** took 120,40 €.', figures: [], actions: [] }),
    sendCta: vi.fn().mockResolvedValue({ success: true }),
  };
});

describe('a message on the channel', () => {
  it('asks the ledger with the kept turns as history and sends plain words', async () => {
    const r = await handleMoneyInbound({ phone: '34600000000', text: 'how much on groceries', messageId: 'wamid.1' }, { userId: 'u1', send, deps });
    expect(deps.answer).toHaveBeenCalledWith('u1', 'how much on groceries', [{ role: 'user', text: 'hi' }, { role: 'twin', text: 'Hello.' }]);
    expect(send).toHaveBeenCalledWith('34600000000', 'Groceries took 120,40 €.');
    expect(deps.sendCta).not.toHaveBeenCalled();
    expect(r).toEqual({ handled: true, kind: 'money_chat', userId: 'u1' });
  });
  it('does nothing on a second delivery of the same message', async () => {
    deps.claimInbound.mockResolvedValue(false);
    const r = await handleMoneyInbound({ phone: '34600000000', text: 'hi', messageId: 'wamid.1' }, { userId: 'u1', send, deps });
    expect(deps.answer).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(r.kind).toBe('money_duplicate');
  });
  it('sends a link button when the answer drew a figure', async () => {
    deps.answer.mockResolvedValue({ text: 'Three months side by side.', figures: [{ kind: 'months' }], actions: [] });
    await handleMoneyInbound({ phone: '34600000000', text: 'compare months', messageId: 'wamid.2' }, { userId: 'u1', send, deps });
    expect(deps.sendCta).toHaveBeenCalledWith('34600000000', expect.objectContaining({ body: 'The chart is on the page.', buttonText: 'Open TwinMe', url: expect.stringMatching(/\/money$/) }));
  });
  it('mutes on stop and says so, without asking the ledger', async () => {
    deps.userLanguage.mockResolvedValue('es');
    const r = await handleMoneyInbound({ phone: '34600000000', text: 'para', messageId: 'wamid.3' }, { userId: 'u1', send, deps });
    expect(deps.setMorningMuted).toHaveBeenCalledWith('u1', true);
    expect(send).toHaveBeenCalledWith('34600000000', expect.stringMatching(/volver/));
    expect(deps.answer).not.toHaveBeenCalled();
    expect(r.kind).toBe('money_mute');
  });
  it('records that the person wrote, for the morning line\'s measure', async () => {
    await handleMoneyInbound({ phone: '34600000000', text: 'hi', messageId: 'wamid.4' }, { userId: 'u1', send, deps });
    expect(deps.markReplied).toHaveBeenCalledWith('u1');
  });
});
