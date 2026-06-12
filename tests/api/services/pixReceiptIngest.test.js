/**
 * Unit tests for Pix receipt ingestion (strategy Phase 3).
 * Vision LLM, media download, dedup query, and the ingest seam are mocked —
 * the tests pin the orchestration: extract -> validate -> dedupe -> ingest ->
 * echo confirmation (Magie pattern).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const downloadMock = vi.fn();
vi.mock('../../../api/services/whatsappService.js', () => ({
  downloadWhatsAppMedia: (...a) => downloadMock(...a),
  sendWhatsAppMessage: vi.fn(),
}));

const completeMock = vi.fn();
vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: (...a) => completeMock(...a),
  TIER_CHAT: 'chat',
  TIER_ANALYSIS: 'analysis',
  TIER_EXTRACTION: 'extraction',
}));

const ingestMock = vi.fn();
vi.mock('../../../api/services/transactions/rawIngestion.js', () => ({
  ingestRawTransactions: (...a) => ingestMock(...a),
}));

// supabaseAdmin: only the dedup range query is used.
const dedupResult = { data: [], error: null };
vi.mock('../../../api/services/database.js', () => {
  const chain = {};
  Object.assign(chain, {
    from: () => chain,
    select: () => chain,
    eq: () => chain,
    gte: () => chain,
    lte: () => chain,
    limit: () => Promise.resolve(dedupResult),
  });
  return { supabaseAdmin: chain, serverDb: {} };
});

const { handleReceiptImage } = await import(
  '../../../api/services/transactions/pixReceiptIngest.js'
);

const IMG = { id: 'media-img-1', mimeType: 'image/jpeg' };
const RECEIPT_JSON = JSON.stringify({
  is_receipt: true,
  amount: 142.5,
  currency: 'BRL',
  counterparty: 'Maria Silva',
  date: '2026-06-09',
  direction: 'sent',
  description: 'Pix transfer',
});

describe('handleReceiptImage', () => {
  beforeEach(() => {
    downloadMock.mockReset().mockResolvedValue(Buffer.from('fake-jpeg-bytes'));
    completeMock.mockReset();
    ingestMock.mockReset().mockResolvedValue({ inserted: 1, insertedIds: ['t1'], skipped: [] });
    dedupResult.data = [];
  });

  it('extracts a sent Pix, ingests it negative, and echoes a confirmation', async () => {
    completeMock.mockResolvedValue({ content: RECEIPT_JSON });

    const result = await handleReceiptImage('user-1', IMG);

    expect(result.ok).toBe(true);
    expect(result.inserted).toBe(1);
    expect(result.reply).toContain('Maria Silva');
    expect(result.reply).toContain('2026-06-09');
    expect(result.reply).toMatch(/142,50|142\.50/);

    const [userArg, metaArg, txArg] = ingestMock.mock.calls[0];
    expect(userArg).toBe('user-1');
    expect(metaArg.source).toBe('whatsapp_receipt');
    expect(txArg[0].amount).toBe(-142.5); // sent -> outflow
    expect(txArg[0].external_id).toMatch(/^pixreceipt:[a-f0-9]{32}$/);
    expect(txArg[0].transaction_date).toBe('2026-06-09');

    // The vision call must be multimodal: text prompt + data-url image part.
    const visionMessages = completeMock.mock.calls[0][0].messages[0].content;
    expect(visionMessages.some((p) => p.type === 'image_url')).toBe(true);
  });

  it('tolerates markdown fences around the model JSON', async () => {
    completeMock.mockResolvedValue({ content: '```json\n' + RECEIPT_JSON + '\n```' });
    const result = await handleReceiptImage('user-1', IMG);
    expect(result.ok).toBe(true);
    expect(ingestMock).toHaveBeenCalledTimes(1);
  });

  it('declines politely when the image is not a receipt', async () => {
    completeMock.mockResolvedValue({ content: '{"is_receipt": false}' });
    const result = await handleReceiptImage('user-1', IMG);
    expect(result.ok).toBe(false);
    expect(result.reply).toMatch(/couldn't read a payment receipt/i);
    expect(ingestMock).not.toHaveBeenCalled();
  });

  it('skips ingest and says so when a duplicate transaction exists', async () => {
    completeMock.mockResolvedValue({ content: RECEIPT_JSON });
    dedupResult.data = [{ id: 'tx-dup', merchant_normalized: 'Maria Silva', source: 'gmail_statement' }];

    const result = await handleReceiptImage('user-1', IMG);

    expect(result.ok).toBe(true);
    expect(result.inserted).toBe(0);
    expect(result.reply).toMatch(/already have this one/i);
    expect(ingestMock).not.toHaveBeenCalled();
  });

  it('asks for a sharper screenshot when extraction is garbled', async () => {
    completeMock.mockResolvedValue({ content: '{"is_receipt": true, "amount": "??", "date": "ontem"}' });
    const result = await handleReceiptImage('user-1', IMG);
    expect(result.ok).toBe(false);
    expect(result.reply).toMatch(/sharper screenshot/i);
    expect(ingestMock).not.toHaveBeenCalled();
  });

  it('asks for a resend when the media download fails', async () => {
    downloadMock.mockResolvedValue(null);
    const result = await handleReceiptImage('user-1', IMG);
    expect(result.ok).toBe(false);
    expect(result.reply).toMatch(/download/i);
    expect(completeMock).not.toHaveBeenCalled();
  });

  it('received Pix lands positive', async () => {
    completeMock.mockResolvedValue({
      content: JSON.stringify({
        is_receipt: true, amount: 300, currency: 'BRL',
        counterparty: 'Empresa XYZ', date: '2026-06-08', direction: 'received', description: '',
      }),
    });
    const result = await handleReceiptImage('user-1', IMG);
    expect(result.ok).toBe(true);
    expect(ingestMock.mock.calls[0][2][0].amount).toBe(300);
    expect(result.reply).toContain('from Empresa XYZ');
  });
});
