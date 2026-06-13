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
    for (const m of ['select', 'eq', 'in', 'order']) b[m] = () => b;
    b.insert = () => ({ then: (r) => Promise.resolve({ error: null }).then(r) });
    b.limit = () => {
      if (table === 'messaging_channels') return Promise.resolve({ data: channelRows, error: null });
      return Promise.resolve({ data: [], error: null }); // user_memories history
    };
    return b;
  }
  return { supabaseAdmin: { from: (t) => builder(t) } };
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

const { processInboundWhatsApp } = await import('../../../api/services/whatsappInboundPipeline.js');

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
    process.env.PURCHASE_BOT_ENABLED = 'false';
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

  it('rejects an unsupported document with a helpful nudge', async () => {
    isStatementDocument.mockReturnValue(false);
    const { send, calls } = makeSend();
    const r = await processInboundWhatsApp(
      { phone: '5511777', document: { id: 'https://m/x.pdf', filename: 'x.pdf' } },
      { send },
    );
    expect(r.kind).toBe('document_unsupported');
    expect(calls[0].text).toMatch(/OFX, CSV, or XLSX/);
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
