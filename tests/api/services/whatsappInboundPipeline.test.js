/**
 * Provider-agnostic inbound pipeline — the brain both the Kapso and Z-API
 * webhooks call. Pins the dispatch fork: statement doc, receipt image, thread
 * approval, transaction capture, purchase intent, plain twin chat, plus the
 * unlinked-user and unparseable guards. `send` is a spy so we assert exactly
 * what goes back out the channel.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- supabase: channel lookup + conversation history ----
let channelRows;
vi.mock('../../../api/services/database.js', () => {
  function builder(table) {
    const b = { _table: table };
    for (const m of ['select', 'eq', 'in', 'order', 'update']) b[m] = () => b;
    b.insert = () => ({ then: (r) => Promise.resolve({ error: null }).then(r) });
    // The wa_provider affinity write chains .update().eq().eq().in().then() with no .limit()/
    // .insert() to resolve it — make the builder itself thenable so that chain settles too.
    b.then = (resolve) => Promise.resolve({ error: null }).then(resolve);
    b.limit = () => {
      if (table === 'messaging_channels') return Promise.resolve({ data: channelRows, error: null });
      return Promise.resolve({ data: [], error: null }); // user_memories history
    };
    return b;
  }
  return { supabaseAdmin: { from: (t) => builder(t) } };
});

// whatsappService imports supabaseAdmin from api/config/supabase.js (outbound
// audit log), which throws at import time without Supabase env (CI stubs it in
// ci.yml; a bare checkout has no .env). Stub it so the pipeline loads hermetically.
vi.mock('../../../api/config/supabase.js', () => {
  const stub = { from: () => ({ insert: () => Promise.resolve({ error: null }) }) };
  return { supabase: stub, supabaseAdmin: stub, default: stub };
});

const completeMock = vi.fn();
vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: (...a) => completeMock(...a),
  TIER_CHAT: 'chat',
}));
vi.mock('../../../api/services/chatRouter.js', () => ({
  classifyMessageTier: () => ({ tier: 'standard' }),
  CHAT_TIER_MODELS: {},
}));
vi.mock('../../../api/services/twinContextBuilder.js', () => ({ fetchTwinContext: async () => ({}) }));
vi.mock('../../../api/services/chatRateLimiter.js', () => ({ checkChatRateLimit: async () => ({ allowed: true }) }));
vi.mock('../../../api/services/coreMemoryService.js', () => ({ getBlocks: async () => ({}), formatBlocksForPrompt: () => '' }));
vi.mock('../../../api/services/personalityPromptBuilder.js', () => ({ buildPersonalityPrompt: () => '' }));
vi.mock('../../../api/services/personalityProfileService.js', () => ({ getProfile: async () => null, getSoulSignatureLayers: async () => null }));
vi.mock('../../../api/services/memoryStreamService.js', () => ({ addConversationMemory: async () => {} }));
vi.mock('../../../api/services/purchaseContextBuilder.js', () => ({ buildPurchaseContext: async () => ({}) }));
vi.mock('../../../api/services/purchaseReflection.js', () => ({ generatePurchaseReflection: async () => ({ text: 'reflect' }) }));

const classifyProtocolReply = vi.fn();
const resolveProtocolReply = vi.fn();
const offerNextProposal = vi.fn();
vi.mock('../../../api/services/threadApprovals.js', () => ({
  classifyProtocolReply: (...a) => classifyProtocolReply(...a),
  resolveProtocolReply: (...a) => resolveProtocolReply(...a),
  offerNextProposal: (...a) => offerNextProposal(...a),
}));

const tryCaptureTransaction = vi.fn();
const checkAndBumpCaptureQuota = vi.fn();
vi.mock('../../../api/services/transactions/whatsappTransactionCapture.js', () => ({
  tryCaptureTransaction: (...a) => tryCaptureTransaction(...a),
  checkAndBumpCaptureQuota: (...a) => checkAndBumpCaptureQuota(...a),
}));

const isStatementDocument = vi.fn();
const handleStatementDocument = vi.fn();
vi.mock('../../../api/services/transactions/whatsappStatementIngest.js', () => ({
  isStatementDocument: (...a) => isStatementDocument(...a),
  handleStatementDocument: (...a) => handleStatementDocument(...a),
}));

const handleReceiptImage = vi.fn();
vi.mock('../../../api/services/transactions/pixReceiptIngest.js', () => ({
  handleReceiptImage: (...a) => handleReceiptImage(...a),
}));

const handleFileUploadToDrive = vi.fn();
vi.mock('../../../api/services/transactions/whatsappFileIngest.js', () => ({
  handleFileUploadToDrive: (...a) => handleFileUploadToDrive(...a),
}));

// Workspace actions: prompt builder + chain. Default = pass-through (no actions
// in the reply, chain returns the message unchanged), matching real behavior on
// a plain chat turn. Overridden in the action test to assert the wiring.
vi.mock('../../../api/services/tools/workspaceActionParser.js', () => ({
  buildWorkspaceActionsPrompt: async () => '[AVAILABLE ACTIONS] gmail_send, calendar_create',
}));
const runWorkspaceActionChain = vi.fn(async ({ initialMessage }) => ({ assistantMessage: initialMessage }));
vi.mock('../../../api/services/workspaceActionChain.js', () => ({
  runWorkspaceActionChain: (...a) => runWorkspaceActionChain(...a),
}));

// Presence: a family member's reply to her call digest becomes a note for her
// next call, before anything else in the pipeline sees the message.
const handleFamilyReply = vi.fn();
vi.mock('../../../api/services/presenceRelay.js', () => ({
  handleFamilyReply: (...a) => handleFamilyReply(...a),
}));

// Money twin beta channel: a person on MONEY_WHATSAPP_USER_IDS is answered by
// the ledger, and by nothing below it.
const handleMoneyInbound = vi.fn();
vi.mock('../../../api/services/money/channelInbound.js', () => ({ handleMoneyInbound: (...a) => handleMoneyInbound(...a) }));

const { processInboundWhatsApp, toWhatsAppMarkdown } = await import('../../../api/services/whatsappInboundPipeline.js');

function makeSend() {
  const calls = [];
  const send = vi.fn(async (phone, text) => { calls.push({ phone, text }); });
  return { send, calls };
}

describe('processInboundWhatsApp', () => {
  beforeEach(() => {
    channelRows = [{ user_id: 'u1', preferences: {} }];
    completeMock.mockReset().mockResolvedValue({ content: 'oi! tudo bem por aqui.' });
    classifyProtocolReply.mockReset().mockReturnValue(null);
    resolveProtocolReply.mockReset();
    offerNextProposal.mockReset().mockResolvedValue(null);
    tryCaptureTransaction.mockReset().mockResolvedValue({ handled: false });
    checkAndBumpCaptureQuota.mockReset().mockResolvedValue({ allowed: true });
    isStatementDocument.mockReset();
    handleStatementDocument.mockReset();
    handleReceiptImage.mockReset();
    handleFileUploadToDrive.mockReset();
    runWorkspaceActionChain.mockReset().mockImplementation(async ({ initialMessage }) => ({ assistantMessage: initialMessage }));
    handleFamilyReply.mockReset().mockResolvedValue(null);
    process.env.PURCHASE_BOT_ENABLED = 'false';
  });

  it('turns a reply to a Presence digest into a note and does not chat', async () => {
    handleFamilyReply.mockResolvedValue('Anotado. Ela ouve na próxima ligação.');
    const { send, calls } = makeSend();
    const r = await processInboundWhatsApp(
      { phone: '5511777', text: 'Diga que eu vou domingo.', messageId: 'wamid.r1', context: { messageId: 'wamid.t1' } },
      { send },
    );
    expect(r.kind).toBe('presence_note');
    expect(handleFamilyReply).toHaveBeenCalledWith({ userId: 'u1', text: 'Diga que eu vou domingo.', contextMessageId: 'wamid.t1' });
    expect(calls[0].text).toBe('Anotado. Ela ouve na próxima ligação.');
    expect(completeMock).not.toHaveBeenCalled();
  });

  it('lets a message that is not for the Presence continue to twin chat', async () => {
    const { send } = makeSend();
    const r = await processInboundWhatsApp({ phone: '5511777', text: 'oi, tudo bem?', context: { messageId: 'wamid.other' } }, { send });
    expect(handleFamilyReply).toHaveBeenCalledWith({ userId: 'u1', text: 'oi, tudo bem?', contextMessageId: 'wamid.other' });
    expect(r.kind).toBe('chat');
    expect(completeMock).toHaveBeenCalledTimes(1);
  });

  it('drops unparseable messages without sending', async () => {
    const { send } = makeSend();
    const r = await processInboundWhatsApp({ phone: '5511', format: 'x' }, { send });
    expect(r.handled).toBe(false);
    expect(r.reason).toBe('unparseable');
    expect(send).not.toHaveBeenCalled();
  });

  it('welcomes an unlinked phone and does not chat', async () => {
    channelRows = [];
    const { send, calls } = makeSend();
    const r = await processInboundWhatsApp({ phone: '5511888', text: 'oi' }, { send });
    expect(r.reason).toBe('unlinked');
    expect(calls[0].text).toMatch(/isn't linked/i);
    expect(completeMock).not.toHaveBeenCalled();
  });

  it('routes a plain message through twin chat and offers the next proposal', async () => {
    offerNextProposal.mockResolvedValue('One more thing — want me to draft that email? Reply yes or skip.');
    const { send, calls } = makeSend();
    const r = await processInboundWhatsApp({ phone: '5511777', text: 'oi, tudo bem?' }, { send });
    expect(r.kind).toBe('chat');
    expect(completeMock).toHaveBeenCalledTimes(1);
    expect(calls[0].text).toMatch(/tudo bem por aqui/);
    expect(calls[1].text).toMatch(/want me to draft/);
  });

  it('strips emojis from the twin reply (the #1 product constraint, enforced on the WhatsApp surface)', async () => {
    completeMock.mockResolvedValue({ content: 'Boa! 🎉 tudo certo ✅ por aqui 😊' });
    const { send, calls } = makeSend();
    const r = await processInboundWhatsApp({ phone: '5511777', text: 'oi' }, { send });
    expect(r.kind).toBe('chat');
    // No emoji reaches the user (prompt rule + stripEmoji output wrap).
    expect(calls[0].text).not.toMatch(/\p{Extended_Pictographic}/u);
    // ...and the actual words are preserved.
    expect(calls[0].text).toMatch(/tudo certo/);
  });

  it('runs the workspace action chain on the reply and sends its transformed output', async () => {
    // The chain executed a tool and rewrote the reply (web parity). What the
    // user receives is the chain output, not the raw first-pass reply.
    runWorkspaceActionChain.mockResolvedValue({ assistantMessage: 'Feito — rascunhei o email pra Paula.' });
    const { send, calls } = makeSend();
    const r = await processInboundWhatsApp({ phone: '5511777', text: 'manda um email pra Paula' }, { send });
    expect(r.kind).toBe('chat');
    // Chain was invoked with the first-pass reply as initialMessage.
    expect(runWorkspaceActionChain).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', initialMessage: expect.stringMatching(/tudo bem por aqui/) }),
    );
    // The user gets the chain's transformed text.
    expect(calls[0].text).toBe('Feito — rascunhei o email pra Paula.');
  });

  it('resolves a "yes"/"skip" thread approval without hitting the LLM', async () => {
    classifyProtocolReply.mockReturnValue('yes');
    resolveProtocolReply.mockResolvedValue('Feito — agendei pra você.');
    const { send, calls } = makeSend();
    const r = await processInboundWhatsApp({ phone: '5511777', text: 'sim' }, { send });
    expect(r.kind).toBe('approval');
    expect(calls[0].text).toBe('Feito — agendei pra você.');
    expect(completeMock).not.toHaveBeenCalled();
  });

  it('ingests a forwarded bank statement document', async () => {
    isStatementDocument.mockReturnValue(true);
    handleStatementDocument.mockResolvedValue({ ok: true, reply: 'Imported 12 transactions.', inserted: 12 });
    const { send, calls } = makeSend();
    const r = await processInboundWhatsApp(
      { phone: '5511777', document: { id: 'https://m/x.ofx', filename: 'x.ofx' } },
      { send },
    );
    expect(r.kind).toBe('statement');
    expect(handleStatementDocument).toHaveBeenCalledWith('u1', expect.objectContaining({ filename: 'x.ofx' }));
    expect(calls[0].text).toBe('Imported 12 transactions.');
  });

  it('saves a non-statement document to Drive (not a rejection)', async () => {
    isStatementDocument.mockReturnValue(false);
    handleFileUploadToDrive.mockResolvedValue({ ok: true, reply: 'Saved "x.pdf" to your Drive.\nhttps://drive/x' });
    const { send, calls } = makeSend();
    const r = await processInboundWhatsApp(
      { phone: '5511777', document: { id: 'https://m/x.pdf', filename: 'x.pdf', mimeType: 'application/pdf' } },
      { send },
    );
    expect(r.kind).toBe('file_drive');
    expect(handleFileUploadToDrive).toHaveBeenCalledWith('u1', expect.objectContaining({ filename: 'x.pdf' }));
    expect(calls[0].text).toMatch(/Saved "x\.pdf" to your Drive/);
    expect(handleStatementDocument).not.toHaveBeenCalled();
  });

  it('vision-ingests a Pix receipt image (within quota)', async () => {
    handleReceiptImage.mockResolvedValue({ ok: true, reply: 'Anotei: R$ 50 pro mercado.', inserted: 1 });
    const { send, calls } = makeSend();
    const r = await processInboundWhatsApp(
      { phone: '5511777', image: { id: 'https://m/x.jpg' } },
      { send },
    );
    expect(r.kind).toBe('receipt');
    expect(handleReceiptImage).toHaveBeenCalledWith('u1', expect.objectContaining({ id: 'https://m/x.jpg' }));
    expect(calls[0].text).toMatch(/Anotei/);
  });

  it('stops a receipt image when the daily vision quota is hit', async () => {
    checkAndBumpCaptureQuota.mockResolvedValue({ allowed: false });
    const { send, calls } = makeSend();
    const r = await processInboundWhatsApp({ phone: '5511777', image: { id: 'https://m/x.jpg' } }, { send });
    expect(r.kind).toBe('image_quota');
    expect(calls[0].text).toMatch(/Limite diario/);
    expect(handleReceiptImage).not.toHaveBeenCalled();
  });

  it('uses a captured-transaction reply instead of chatting', async () => {
    tryCaptureTransaction.mockResolvedValue({ handled: true, reply: 'Anotado: -R$ 80 ifood.' });
    const { send, calls } = makeSend();
    const r = await processInboundWhatsApp({ phone: '5511777', text: 'gastei 80 no ifood' }, { send });
    expect(r.kind).toBe('chat');
    expect(calls[0].text).toBe('Anotado: -R$ 80 ifood.');
    expect(completeMock).not.toHaveBeenCalled();
  });
});

describe('the money twin\'s beta', () => {
  beforeEach(() => {
    handleFamilyReply.mockReset().mockResolvedValue(null);
    handleMoneyInbound.mockReset().mockResolvedValue({ handled: true, kind: 'money_chat', userId: 'u-money' });
  });
  it('is answered by the ledger and by nothing below it', async () => {
    process.env.MONEY_WHATSAPP_USER_IDS = 'u-money';
    channelRows = [{ user_id: 'u-money', preferences: {} }];
    const send = vi.fn().mockResolvedValue({ success: true });
    const r = await processInboundWhatsApp({ phone: '34600000000', text: 'how much is left', messageId: 'wamid.m1' }, { send, provider: 'kapso' });
    expect(handleMoneyInbound).toHaveBeenCalledWith(expect.objectContaining({ text: 'how much is left' }), expect.objectContaining({ userId: 'u-money', send }));
    expect(completeMock).not.toHaveBeenCalled();
    expect(r.kind).toBe('money_chat');
    delete process.env.MONEY_WHATSAPP_USER_IDS;
  });
  it('leaves everyone else on the path they were on', async () => {
    delete process.env.MONEY_WHATSAPP_USER_IDS;
    channelRows = [{ user_id: 'u-other', preferences: {} }];
    const send = vi.fn().mockResolvedValue({ success: true });
    await processInboundWhatsApp({ phone: '34600000001', text: 'hello', messageId: 'wamid.m2' }, { send, provider: 'kapso' });
    expect(handleMoneyInbound).not.toHaveBeenCalled();
  });
});

describe('toWhatsAppMarkdown', () => {
  it('converts **bold** to WhatsApp *bold*', () => {
    expect(toWhatsAppMarkdown('**Hoje na agenda**')).toBe('*Hoje na agenda*');
    expect(toWhatsAppMarkdown('1. **Tênis Segovia** — 16:00')).toBe('1. *Tênis Segovia* — 16:00');
  });
  it('collapses ***bolditalic*** to *x* and strips # headers', () => {
    expect(toWhatsAppMarkdown('***urgent***')).toBe('*urgent*');
    expect(toWhatsAppMarkdown('## Today\nstuff')).toBe('Today\nstuff');
  });
  it('leaves already-correct single-asterisk bold untouched', () => {
    expect(toWhatsAppMarkdown('*ok* and plain')).toBe('*ok* and plain');
  });
});
