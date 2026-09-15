/**
 * The relay: what the family gets on WhatsApp after each call, and what a
 * reply to it becomes. whatsappService and the store are mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const ok = (data) => ({ data, error: null });
const fail = (message) => ({ data: null, error: { message } });

const PRESENCE = { id: 'p-1', owner_user_id: 'user-1', cared_for_name: 'Lurdes', caller_name: 'Ana' };
const CONVERSATION = {
  id: 'c-1', presence_id: 'p-1', urgency: 'normal',
  summary: 'Ela estava animada, contou da feira e do bolo que fez.',
  needs_family: [],
};

const { store, log, wa } = vi.hoisted(() => ({
  store: {
    getOwnerWhatsApp: vi.fn(), setConversationDigest: vi.fn(), findConversationByDigestMessageId: vi.fn(),
    listActivePresencesOwnedBy: vi.fn(), queueNote: vi.fn(),
  },
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  wa: { sendWhatsAppMessage: vi.fn(), sendWhatsAppTemplate: vi.fn() },
}));

vi.mock('../../api/services/presenceStore.js', () => store);
vi.mock('../../api/services/logger.js', () => ({ createLogger: () => log }));
vi.mock('../../api/services/whatsappService.js', () => wa);

const { composeDigest, relayCall, relayNoAnswer, handleFamilyReply, DIGEST_TEMPLATE, URGENT_TEMPLATE } = await import('../../api/services/presenceRelay.js');

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of Object.values(store)) fn.mockResolvedValue(ok(null));
  store.getOwnerWhatsApp.mockResolvedValue(ok({ channel_id: '+5511988887777', preferences: {} }));
  wa.sendWhatsAppTemplate.mockResolvedValue({ success: true, messageId: 'wamid.t1' });
  wa.sendWhatsAppMessage.mockResolvedValue({ success: true, messageId: 'wamid.m1' });
});

describe('composeDigest', () => {
  it('is three lines at most: what she shared, what needs a person, how to reply', () => {
    const { text, templateParams } = composeDigest(PRESENCE, { ...CONVERSATION, needs_family: ['Ela pediu para marcar o exame.'] });

    expect(text.split('\n')).toEqual([
      'Ela contou que: Ela estava animada, contou da feira e do bolo que fez.',
      'Precisa de você: Ela pediu para marcar o exame.',
      'Responda esta mensagem e ela ouve na próxima ligação.',
    ]);
    expect(templateParams).toEqual(['Lurdes', 'Ela estava animada, contou da feira e do bolo que fez.', 'Ela pediu para marcar o exame.']);
  });

  it('leaves the needs line out when there is nothing, and says so in the template', () => {
    const { text, templateParams } = composeDigest(PRESENCE, CONVERSATION);

    expect(text).not.toMatch(/Precisa de você/);
    expect(templateParams[2]).toBe('nada desta vez');
  });

  it('keeps template parameters on one line and short', () => {
    const long = { ...CONVERSATION, summary: 'Linha um.\nLinha dois. ' + 'x'.repeat(500) };
    const { templateParams } = composeDigest(PRESENCE, long);

    expect(templateParams[1]).not.toMatch(/\n/);
    expect(templateParams[1].length).toBeLessThanOrEqual(300);
  });
});

describe('relayCall', () => {
  it('sends the digest as a template and remembers its message id for replies', async () => {
    const result = await relayCall(PRESENCE, CONVERSATION);

    expect(wa.sendWhatsAppTemplate).toHaveBeenCalledWith('+5511988887777', DIGEST_TEMPLATE, 'pt_BR', ['Lurdes', CONVERSATION.summary, 'nada desta vez']);
    expect(wa.sendWhatsAppMessage).not.toHaveBeenCalled();
    expect(store.setConversationDigest).toHaveBeenCalledWith('c-1', 'wamid.t1');
    expect(result).toEqual({ sent: true, via: 'template', messageId: 'wamid.t1' });
  });

  it('falls back to plain text inside the service window when the template is refused', async () => {
    wa.sendWhatsAppTemplate.mockResolvedValue({ success: false, error: 'template not approved' });

    const result = await relayCall(PRESENCE, CONVERSATION);

    expect(wa.sendWhatsAppMessage).toHaveBeenCalledWith('+5511988887777', expect.stringMatching(/^Ela contou que: /));
    expect(store.setConversationDigest).toHaveBeenCalledWith('c-1', 'wamid.m1');
    expect(result).toEqual({ sent: true, via: 'text', messageId: 'wamid.m1' });
  });

  it('sends an urgent message first when the call needs someone now', async () => {
    await relayCall(PRESENCE, { ...CONVERSATION, urgency: 'high', needs_family: ['Ela caiu no banheiro.'] });

    expect(wa.sendWhatsAppTemplate.mock.calls[0]).toEqual(['+5511988887777', URGENT_TEMPLATE, 'pt_BR', ['Lurdes', 'Ela caiu no banheiro.']]);
    expect(wa.sendWhatsAppTemplate.mock.calls[1][1]).toBe(DIGEST_TEMPLATE);
  });

  it('does nothing, and says why, when the family has no WhatsApp linked', async () => {
    store.getOwnerWhatsApp.mockResolvedValue(ok(null));

    const result = await relayCall(PRESENCE, CONVERSATION);

    expect(wa.sendWhatsAppTemplate).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: false, reason: 'no_channel' });
  });

  it('reports a send that failed both ways, and logs it', async () => {
    wa.sendWhatsAppTemplate.mockResolvedValue({ success: false, error: 'not approved' });
    wa.sendWhatsAppMessage.mockResolvedValue({ success: false, error: '24 hour window' });

    const result = await relayCall(PRESENCE, CONVERSATION);

    expect(result).toEqual({ sent: false, reason: 'send_failed' });
    expect(log.error).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ presenceId: 'p-1' }));
  });

  it('reports a channel read that failed', async () => {
    store.getOwnerWhatsApp.mockResolvedValue(fail('connection reset'));

    const result = await relayCall(PRESENCE, CONVERSATION);

    expect(result).toEqual({ sent: false, reason: 'channel_read_failed' });
  });
});

describe('relayNoAnswer', () => {
  it('tells the family she did not answer twice', async () => {
    await relayNoAnswer(PRESENCE);

    expect(wa.sendWhatsAppMessage).toHaveBeenCalledWith('+5511988887777', 'Não consegui falar com a Lurdes hoje: ela não atendeu nas duas tentativas.');
  });
});

describe('handleFamilyReply', () => {
  it('turns a reply to the digest into a note for her next call', async () => {
    store.findConversationByDigestMessageId.mockResolvedValue(ok({ id: 'c-1', presence_id: 'p-1' }));
    store.queueNote.mockResolvedValue(ok({ id: 'n-1' }));

    const reply = await handleFamilyReply({ userId: 'user-1', text: 'Diga que eu vou domingo.', contextMessageId: 'wamid.t1' });

    expect(store.queueNote).toHaveBeenCalledWith({ presence_id: 'p-1', author_user_id: 'user-1', body: 'Diga que eu vou domingo.' });
    expect(reply).toBe('Anotado. Ela ouve na próxima ligação.');
  });

  it('accepts "nota:" from a family member with one presence, with no reply context', async () => {
    store.listActivePresencesOwnedBy.mockResolvedValue(ok([{ id: 'p-1', cared_for_name: 'Lurdes' }]));
    store.queueNote.mockResolvedValue(ok({ id: 'n-1' }));

    const reply = await handleFamilyReply({ userId: 'user-1', text: 'Nota: comprei o remédio dela.', contextMessageId: null });

    expect(store.queueNote).toHaveBeenCalledWith({ presence_id: 'p-1', author_user_id: 'user-1', body: 'comprei o remédio dela.' });
    expect(reply).toBe('Anotado. Ela ouve na próxima ligação.');
  });

  it('is not ours when the message replies to nothing of ours and has no prefix', async () => {
    store.listActivePresencesOwnedBy.mockResolvedValue(ok([{ id: 'p-1', cared_for_name: 'Lurdes' }]));

    const reply = await handleFamilyReply({ userId: 'user-1', text: 'quanto gastei hoje?', contextMessageId: 'wamid.other' });

    expect(reply).toBeNull();
    expect(store.queueNote).not.toHaveBeenCalled();
  });

  it('says what happened when the note cannot be saved', async () => {
    store.findConversationByDigestMessageId.mockResolvedValue(ok({ id: 'c-1', presence_id: 'p-1' }));
    store.queueNote.mockResolvedValue(fail('connection reset'));

    const reply = await handleFamilyReply({ userId: 'user-1', text: 'Diga que eu vou domingo.', contextMessageId: 'wamid.t1' });

    expect(reply).toBe('Não deu para anotar agora. Tente de novo em instantes.');
  });
});
