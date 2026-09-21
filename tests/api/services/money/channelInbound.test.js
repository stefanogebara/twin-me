import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../../../api/services/logger.js', () => ({ createLogger: () => ({ warn() {}, error() {}, info() {}, debug() {} }) }));
vi.mock('../../../../api/services/money/chat.js', () => ({ answer: vi.fn(), act: vi.fn(), looksLikeInstruction: () => false }));
vi.mock('../../../../api/services/money/store.js', () => ({ listChatTurns: vi.fn(), userLanguage: vi.fn() }));
vi.mock('../../../../api/services/money/channelStore.js', () => ({ claimInbound: vi.fn(), markReplied: vi.fn(), setMorningMuted: vi.fn(), keepOffers: vi.fn(), takeOffer: vi.fn(), recentOffers: vi.fn(), offerSaid: vi.fn() }));
vi.mock('../../../../api/services/whatsappService.js', () => ({ sendWhatsAppCtaButton: vi.fn(), sendWhatsAppButtons: vi.fn() }));
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
    act: vi.fn().mockResolvedValue({ done: true, said: 'Glovo, 23,40 €, on 12 Sep, is marked as not yours and leaves the month.' }),
    keepOffers: vi.fn().mockResolvedValue([]),
    takeOffer: vi.fn(),
    recentOffers: vi.fn().mockResolvedValue([]),
    offerSaid: vi.fn().mockResolvedValue(),
    sendButtons: vi.fn().mockResolvedValue({ success: true }),
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

describe('offers on the channel', () => {
  const OFFER = '11111111-1111-4111-8111-111111111111';
  const action = { kind: 'not_me', transaction_id: 't1', label: 'Not mine: Glovo, 23,40 €' };
  it('keeps the offers of an answer and sends them as buttons', async () => {
    deps.answer.mockResolvedValue({ text: 'Glovo took 23,40 €.', figures: [], actions: [action] });
    deps.keepOffers.mockResolvedValue([{ id: OFFER, position: 0, action }]);
    await handleMoneyInbound({ phone: '34600000000', text: 'what is glovo', messageId: 'wamid.5' }, { userId: 'u1', send, deps });
    expect(deps.keepOffers).toHaveBeenCalledWith('u1', [action]);
    expect(deps.sendButtons).toHaveBeenCalledWith('34600000000', expect.objectContaining({ buttons: [{ id: `mo:${OFFER}`, title: '1. Not mine: Glovo,' }] }));
  });
  it('sends the setup offer as a link, never as a button', async () => {
    deps.answer.mockResolvedValue({ text: 'Nothing has been read yet.', figures: [], actions: [{ kind: 'setup', step: 'bank', label: 'Connect a bank', href: '/money/you#sources' }] });
    await handleMoneyInbound({ phone: '34600000000', text: 'hello', messageId: 'wamid.6' }, { userId: 'u1', send, deps });
    expect(deps.sendCta).toHaveBeenCalledWith('34600000000', expect.objectContaining({ body: 'Connect a bank', url: expect.stringMatching(/\/money\/you#sources$/) }));
    expect(deps.sendButtons).not.toHaveBeenCalled();
  });
  it('runs a tapped offer through act() and says what act() said', async () => {
    deps.takeOffer.mockResolvedValue({ id: OFFER, action });
    const r = await handleMoneyInbound({ phone: '34600000000', text: '1. Not mine: Glovo,', replyId: `mo:${OFFER}`, messageId: 'wamid.7' }, { userId: 'u1', send, deps });
    expect(deps.act).toHaveBeenCalledWith('u1', action);
    expect(send).toHaveBeenCalledWith('34600000000', expect.stringMatching(/not yours/));
    expect(deps.answer).not.toHaveBeenCalled();
    expect(r.kind).toBe('money_act');
  });
  it('says so when the offer was already taken', async () => {
    deps.takeOffer.mockResolvedValue(null);
    await handleMoneyInbound({ phone: '34600000000', text: 'x', replyId: `mo:${OFFER}`, messageId: 'wamid.8' }, { userId: 'u1', send, deps });
    expect(deps.act).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith('34600000000', 'That was already done.');
  });
  it('reads a bare number as the offer in that place, while the offers are fresh', async () => {
    deps.recentOffers.mockResolvedValue([{ id: OFFER, position: 0, action }]);
    deps.takeOffer.mockResolvedValue({ id: OFFER, action });
    await handleMoneyInbound({ phone: '34600000000', text: '1', messageId: 'wamid.9' }, { userId: 'u1', send, deps });
    expect(deps.takeOffer).toHaveBeenCalledWith('u1', OFFER);
    expect(deps.act).toHaveBeenCalled();
  });
  it('asks the ledger when a bare number has no fresh offers behind it', async () => {
    deps.recentOffers.mockResolvedValue([]);
    await handleMoneyInbound({ phone: '34600000000', text: '2', messageId: 'wamid.10' }, { userId: 'u1', send, deps });
    expect(deps.answer).toHaveBeenCalled();
  });
  it('gives the ledger\'s own refusal when the ledger moved', async () => {
    deps.takeOffer.mockResolvedValue({ id: OFFER, action });
    deps.act.mockRejectedValue(Object.assign(new Error('That action does not match anything in the ledger.'), { status: 400 }));
    await handleMoneyInbound({ phone: '34600000000', text: 'x', replyId: `mo:${OFFER}`, messageId: 'wamid.11' }, { userId: 'u1', send, deps });
    expect(send).toHaveBeenCalledWith('34600000000', 'That action does not match anything in the ledger.');
  });
});
