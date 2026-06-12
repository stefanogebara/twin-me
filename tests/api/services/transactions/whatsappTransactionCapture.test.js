/**
 * Unit tests for api/services/transactions/whatsappTransactionCapture.js
 * =======================================================================
 * The Magie-lite WhatsApp capture pipeline (replan-2026-06-12). Contract under
 * test:
 *   - Stage A classifier: forwarded bank texts and past-tense expense
 *     statements are candidates; FUTURE purchase intent ("vou comprar") and
 *     amount-less texts are NOT (they must keep flowing to the reflection /
 *     twin-chat branches in the webhook).
 *   - validateExtractedTx: amount bounds, confidence floor, date clamping,
 *     currency fallback, direction mapping.
 *   - extractTransactionFromText: JSON parsing (fenced/malformed/refusal),
 *     tier + skipCache wiring.
 *   - storeWhatsAppTransaction: upsert payload shape, stable external_id,
 *     duplicate short-circuit, tagger invocation.
 *   - checkAndBumpCaptureQuota: caps + day rollover.
 *   - buildConfirmationMessage: deterministic copy, habit line, no emojis.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
process.env.NODE_ENV = 'test';

// ── Mocks ────────────────────────────────────────────────────────────────────
const completeMock = vi.fn();
vi.mock('../../../../api/services/llmGateway.js', () => ({
  complete: (...a) => completeMock(...a),
  TIER_EXTRACTION: 'extraction',
  TIER_VISION: 'vision',
}));

const downloadMediaMock = vi.fn();
vi.mock('../../../../api/services/whatsappService.js', () => ({
  downloadWhatsAppMedia: (...a) => downloadMediaMock(...a),
}));

const detectRecurringMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../api/services/transactions/recurrenceDetector.js', () => ({
  detectAndMarkRecurring: (...a) => detectRecurringMock(...a),
}));

const tagBatchMock = vi.fn().mockResolvedValue({ tagged: 1, errors: 0 });
vi.mock('../../../../api/services/transactions/transactionEmotionTagger.js', () => ({
  tagTransactionsBatch: (...a) => tagBatchMock(...a),
}));

// Chainable supabase stub: every method returns the builder; awaiting resolves
// the next queued result; upsert payloads are recorded for assertions.
const resultQueue = [];
const upsertCalls = [];
function makeBuilder(table) {
  const builder = { _table: table };
  const chain = ['select', 'eq', 'neq', 'gte', 'lte', 'lt', 'gt', 'in', 'order', 'limit', 'maybeSingle', 'single'];
  for (const m of chain) builder[m] = vi.fn(() => builder);
  builder.upsert = vi.fn((rows, opts) => {
    upsertCalls.push({ table, rows: Array.isArray(rows) ? rows : [rows], opts });
    return builder;
  });
  builder.then = (resolve, reject) => {
    const next = resultQueue.length ? resultQueue.shift() : { data: [], error: null };
    return Promise.resolve(next).then(resolve, reject);
  };
  return builder;
}
vi.mock('../../../../api/services/database.js', () => ({
  supabaseAdmin: { from: vi.fn((table) => makeBuilder(table)) },
}));

const {
  classifyTransactionText,
  validateExtractedTx,
  extractTransactionFromText,
  extractTransactionFromImage,
  storeWhatsAppTransaction,
  checkAndBumpCaptureQuota,
  buildConfirmationMessage,
  TEXT_DAILY_CAP,
  IMAGE_DAILY_CAP,
} = await import('../../../../api/services/transactions/whatsappTransactionCapture.js');

beforeEach(() => {
  vi.clearAllMocks();
  resultQueue.length = 0;
  upsertCalls.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Stage A classifier ───────────────────────────────────────────────────────
describe('classifyTransactionText', () => {
  it('classifies forwarded Pix/bank notifications as forwarded', () => {
    expect(classifyTransactionText('Pix enviado: R$ 150,00 para Maria Silva')).toEqual({ isCandidate: true, kind: 'forwarded' });
    expect(classifyTransactionText('Nubank: Compra aprovada no valor de R$ 89,90 em IFOOD')).toEqual({ isCandidate: true, kind: 'forwarded' });
    expect(classifyTransactionText('Comprovante de transferência\nValor: R$ 1.234,56')).toEqual({ isCandidate: true, kind: 'forwarded' });
    expect(classifyTransactionText('Você pagou R$ 45,00 via PicPay')).toEqual({ isCandidate: true, kind: 'forwarded' });
  });

  it('classifies past-tense expense statements as natural', () => {
    expect(classifyTransactionText('gastei R$ 80 no ifood')).toEqual({ isCandidate: true, kind: 'natural' });
    expect(classifyTransactionText('comprei um tênis por R$ 300')).toEqual({ isCandidate: true, kind: 'natural' });
    expect(classifyTransactionText('paguei 45,50 reais na farmácia')).toEqual({ isCandidate: true, kind: 'natural' });
    expect(classifyTransactionText('spent $20 at starbucks')).toEqual({ isCandidate: true, kind: 'natural' });
  });

  it('rejects FUTURE purchase intent — must keep flowing to the reflection branch', () => {
    expect(classifyTransactionText('vou comprar um tênis de R$ 300').isCandidate).toBe(false);
    expect(classifyTransactionText('pensando em comprar um fone de R$ 200').isCandidate).toBe(false);
    expect(classifyTransactionText('thinking about buying a $50 keyboard').isCandidate).toBe(false);
  });

  it('rejects texts with no amount-looking token', () => {
    expect(classifyTransactionText('comprei um carro').isCandidate).toBe(false);
    expect(classifyTransactionText('gastei muito hoje').isCandidate).toBe(false);
    expect(classifyTransactionText('oi tudo bem?').isCandidate).toBe(false);
  });

  it('rejects ordinary chat even when it contains an amount', () => {
    expect(classifyTransactionText('o ingresso custa R$ 80, será que vale?').isCandidate).toBe(false);
  });

  it('handles null/non-string input', () => {
    expect(classifyTransactionText(null).isCandidate).toBe(false);
    expect(classifyTransactionText(undefined).isCandidate).toBe(false);
    expect(classifyTransactionText(42).isCandidate).toBe(false);
  });
});

// ── Validation ───────────────────────────────────────────────────────────────
describe('validateExtractedTx', () => {
  const base = { is_transaction: true, amount: 80, currency: 'BRL', merchant: 'iFood', date: null, direction: 'out', category_hint: 'food_delivery', confidence: 0.9 };

  it('accepts a clean extraction', () => {
    const v = validateExtractedTx(base);
    expect(v.valid).toBe(true);
    expect(v.tx).toMatchObject({ amount: 80, currency: 'BRL', merchant: 'iFood', direction: 'out', categoryHint: 'food_delivery' });
  });

  it('rejects out-of-range amounts', () => {
    expect(validateExtractedTx({ ...base, amount: 0 }).valid).toBe(false);
    expect(validateExtractedTx({ ...base, amount: 2_000_000 }).valid).toBe(false);
    expect(validateExtractedTx({ ...base, amount: null }).errors).toContain('amount_out_of_range');
  });

  it('rejects below the confidence floor', () => {
    expect(validateExtractedTx({ ...base, confidence: 0.5 }).errors).toContain('low_confidence');
    expect(validateExtractedTx({ ...base, confidence: undefined }).valid).toBe(false);
  });

  it('falls back to BRL for unknown currency', () => {
    expect(validateExtractedTx({ ...base, currency: 'XYZ' }).tx.currency).toBe('BRL');
  });

  it('clamps out-of-window dates to today', () => {
    const ancient = validateExtractedTx({ ...base, date: '2020-01-01' });
    expect(ancient.tx.dateIso.slice(0, 10)).toBe(new Date().toISOString().slice(0, 10));
    const future = validateExtractedTx({ ...base, date: '2030-01-01' });
    expect(future.tx.dateIso.slice(0, 10)).toBe(new Date().toISOString().slice(0, 10));
  });

  it('keeps valid recent dates', () => {
    const recent = new Date(Date.now() - 2 * 86400_000).toISOString().slice(0, 10);
    expect(validateExtractedTx({ ...base, date: recent }).tx.dateIso.slice(0, 10)).toBe(recent);
  });

  it('maps direction: only explicit "in" is inflow', () => {
    expect(validateExtractedTx({ ...base, direction: 'in' }).tx.direction).toBe('in');
    expect(validateExtractedTx({ ...base, direction: 'sideways' }).tx.direction).toBe('out');
  });

  it('drops unknown category hints', () => {
    expect(validateExtractedTx({ ...base, category_hint: 'crypto_gambling' }).tx.categoryHint).toBeNull();
  });
});

// ── Text extraction ──────────────────────────────────────────────────────────
describe('extractTransactionFromText', () => {
  const goodJson = JSON.stringify({ is_transaction: true, amount: 80, currency: 'BRL', merchant: 'iFood', date: null, direction: 'out', category_hint: 'food_delivery', confidence: 0.92 });

  it('passes TIER_EXTRACTION + skipCache and returns the validated tx', async () => {
    completeMock.mockResolvedValue({ content: goodJson });
    const r = await extractTransactionFromText('user-1', 'gastei 80 no ifood');
    expect(r.ok).toBe(true);
    expect(r.tx.amount).toBe(80);
    const call = completeMock.mock.calls[0][0];
    expect(call.tier).toBe('extraction');
    expect(call.skipCache).toBe(true);
    expect(call.temperature).toBe(0);
  });

  it('strips markdown fences from the model output', async () => {
    completeMock.mockResolvedValue({ content: '```json\n' + goodJson + '\n```' });
    const r = await extractTransactionFromText('user-1', 'gastei 80 no ifood');
    expect(r.ok).toBe(true);
  });

  it('returns clarifying question on malformed JSON', async () => {
    completeMock.mockResolvedValue({ content: 'sorry I cannot' });
    const r = await extractTransactionFromText('user-1', 'gastei 80 no ifood');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('parse_failed');
    expect(r.clarifyingQuestion).toMatch(/quanto foi/i);
  });

  it('respects is_transaction=false without a clarifying question', async () => {
    completeMock.mockResolvedValue({ content: JSON.stringify({ is_transaction: false }) });
    const r = await extractTransactionFromText('user-1', 'o jantar custou caro demais');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('not_a_transaction');
    expect(r.clarifyingQuestion).toBeUndefined();
  });

  it('low confidence -> clarifying question, nothing stored', async () => {
    completeMock.mockResolvedValue({ content: JSON.stringify({ is_transaction: true, amount: 80, confidence: 0.3 }) });
    const r = await extractTransactionFromText('user-1', 'acho que gastei uns 80');
    expect(r.ok).toBe(false);
    expect(r.clarifyingQuestion).toBeTruthy();
  });
});

// ── Image extraction ─────────────────────────────────────────────────────────
describe('extractTransactionFromImage', () => {
  it('downloads media, sends multimodal content to TIER_VISION', async () => {
    downloadMediaMock.mockResolvedValue({ ok: true, buffer: Buffer.from('fake-image-bytes') });
    completeMock.mockResolvedValue({ content: JSON.stringify({ is_transaction: true, amount: 150, currency: 'BRL', merchant: 'Maria Silva', date: null, direction: 'out', category_hint: 'transfer', confidence: 0.95 }) });

    const r = await extractTransactionFromImage('user-1', { mediaId: 'media-1', mimeType: 'image/jpeg' });
    expect(r.ok).toBe(true);
    expect(downloadMediaMock).toHaveBeenCalledWith('media-1');
    const call = completeMock.mock.calls[0][0];
    expect(call.tier).toBe('vision');
    expect(Array.isArray(call.messages[0].content)).toBe(true);
    expect(call.messages[0].content[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('rejects unsupported mime types without downloading', async () => {
    const r = await extractTransactionFromImage('user-1', { mediaId: 'media-1', mimeType: 'application/pdf' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('unsupported_mime');
    expect(downloadMediaMock).not.toHaveBeenCalled();
  });

  it('rejects oversized images', async () => {
    downloadMediaMock.mockResolvedValue({ ok: true, buffer: Buffer.alloc(5 * 1024 * 1024) });
    const r = await extractTransactionFromImage('user-1', { mediaId: 'media-1', mimeType: 'image/png' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('too_large');
    expect(completeMock).not.toHaveBeenCalled();
  });

  it('propagates download failure', async () => {
    downloadMediaMock.mockResolvedValue({ ok: false, error: 'boom' });
    const r = await extractTransactionFromImage('user-1', { mediaId: 'media-1', mimeType: 'image/png' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('download_failed');
  });
});

// ── Store path ───────────────────────────────────────────────────────────────
describe('storeWhatsAppTransaction', () => {
  const tx = { amount: 80, currency: 'BRL', merchant: 'iFood *Restaurante', dateIso: new Date().toISOString(), direction: 'out', categoryHint: null, confidence: 0.9 };

  it('upserts with source=whatsapp, negative amount, normalized merchant, then tags', async () => {
    resultQueue.push({ data: [], error: null });   // findLikelyDuplicate -> none
    resultQueue.push({ data: [{ id: 'tx-new', amount: -80, currency: 'BRL', merchant_normalized: 'iFood', category: 'food_delivery', transaction_date: tx.dateIso }], error: null }); // upsert

    const r = await storeWhatsAppTransaction('user-1', tx);
    expect(r.stored).toBe(true);
    expect(r.duplicate).toBe(false);

    const up = upsertCalls.find(c => c.table === 'user_transactions');
    expect(up).toBeTruthy();
    const row = up.rows[0];
    expect(row.source).toBe('whatsapp');
    expect(row.amount).toBe(-80);
    expect(row.merchant_normalized).toBe('iFood');
    expect(row.external_id).toMatch(/^wa:[0-9a-f]{40}$/);
    expect(up.opts.onConflict).toBe('user_id,external_id');

    expect(detectRecurringMock).toHaveBeenCalledWith('user-1');
    expect(tagBatchMock).toHaveBeenCalledWith('user-1', ['tx-new']);
  });

  it('produces a stable external_id for identical inputs (retry dedup)', async () => {
    resultQueue.push({ data: [], error: null });
    resultQueue.push({ data: [{ id: 'a', amount: -80, currency: 'BRL', merchant_normalized: 'iFood', category: 'food_delivery', transaction_date: tx.dateIso }], error: null });
    await storeWhatsAppTransaction('user-1', tx);
    resultQueue.push({ data: [], error: null });
    resultQueue.push({ data: [{ id: 'a', amount: -80, currency: 'BRL', merchant_normalized: 'iFood', category: 'food_delivery', transaction_date: tx.dateIso }], error: null });
    await storeWhatsAppTransaction('user-1', tx);
    expect(upsertCalls[0].rows[0].external_id).toBe(upsertCalls[1].rows[0].external_id);
  });

  it('short-circuits on a cross-source duplicate', async () => {
    resultQueue.push({ data: [{ id: 'dup-1', amount: -80, merchant_normalized: 'iFood', currency: 'BRL', source: 'notification', transaction_date: tx.dateIso }], error: null });
    const r = await storeWhatsAppTransaction('user-1', tx);
    expect(r.stored).toBe(false);
    expect(r.duplicate).toBe(true);
    expect(r.txRow.id).toBe('dup-1');
    expect(upsertCalls).toHaveLength(0);
    expect(tagBatchMock).not.toHaveBeenCalled();
  });

  it('inflow (Pix recebido) skips duplicate check and stores positive amount', async () => {
    resultQueue.push({ data: [{ id: 'tx-in', amount: 500, currency: 'BRL', merchant_normalized: 'desconhecido', category: 'other', transaction_date: tx.dateIso }], error: null });
    const r = await storeWhatsAppTransaction('user-1', { ...tx, direction: 'in', amount: 500, merchant: 'salario' });
    expect(r.stored).toBe(true);
    expect(upsertCalls[0].rows[0].amount).toBe(500);
  });

  it('LLM category hint only fills in when dictionary says other', async () => {
    resultQueue.push({ data: [], error: null });
    resultQueue.push({ data: [{ id: 'x', amount: -30, currency: 'BRL', merchant_normalized: 'Padaria do Zé', category: 'groceries', transaction_date: tx.dateIso }], error: null });
    await storeWhatsAppTransaction('user-1', { ...tx, merchant: 'Padaria do Zé', categoryHint: 'groceries' });
    // dictionary won't know "Padaria do Zé" -> category 'other' -> hint wins
    expect(upsertCalls[0].rows[0].category).toBe('groceries');
  });
});

// ── Quota ────────────────────────────────────────────────────────────────────
describe('checkAndBumpCaptureQuota', () => {
  const today = new Date().toISOString().slice(0, 10);

  it('allows under the cap and bumps the counter', async () => {
    resultQueue.push({ data: { raw_data: { day_date: today, text_count: 5, image_count: 0 } }, error: null });
    resultQueue.push({ data: null, error: null }); // upsert ack
    const r = await checkAndBumpCaptureQuota('user-1', 'text');
    expect(r.allowed).toBe(true);
    expect(r.used).toBe(6);
    const up = upsertCalls.find(c => c.table === 'user_platform_data');
    expect(up.rows[0].raw_data.text_count).toBe(6);
  });

  it('blocks at the text cap', async () => {
    resultQueue.push({ data: { raw_data: { day_date: today, text_count: TEXT_DAILY_CAP, image_count: 0 } }, error: null });
    const r = await checkAndBumpCaptureQuota('user-1', 'text');
    expect(r.allowed).toBe(false);
    expect(upsertCalls).toHaveLength(0);
  });

  it('blocks at the image cap independently', async () => {
    resultQueue.push({ data: { raw_data: { day_date: today, text_count: 0, image_count: IMAGE_DAILY_CAP } }, error: null });
    const r = await checkAndBumpCaptureQuota('user-1', 'image');
    expect(r.allowed).toBe(false);
  });

  it('rolls over to a fresh day', async () => {
    resultQueue.push({ data: { raw_data: { day_date: '2020-01-01', text_count: TEXT_DAILY_CAP, image_count: IMAGE_DAILY_CAP } }, error: null });
    resultQueue.push({ data: null, error: null });
    const r = await checkAndBumpCaptureQuota('user-1', 'text');
    expect(r.allowed).toBe(true);
    expect(r.used).toBe(1);
  });
});

// ── Confirmation copy ────────────────────────────────────────────────────────
describe('buildConfirmationMessage', () => {
  const row = { amount: -80, currency: 'BRL', merchant_normalized: 'iFood', category: 'food_delivery', transaction_date: new Date().toISOString() };

  it('renders the deterministic ack for today', () => {
    const msg = buildConfirmationMessage(row, { weeklyCount: 1 });
    expect(msg).toMatch(/^Anotei: R\$\s?80,00 — iFood \(food delivery\), hoje\.$/);
  });

  it('adds the habit line from the third occurrence', () => {
    expect(buildConfirmationMessage(row, { weeklyCount: 2 })).not.toMatch(/vez essa semana/);
    expect(buildConfirmationMessage(row, { weeklyCount: 3 })).toMatch(/Terceira vez essa semana\./);
  });

  it('renders the duplicate ack', () => {
    const msg = buildConfirmationMessage(row, { duplicate: true });
    expect(msg).toMatch(/^Já tinha anotado essa — R\$\s?80,00 iFood\.$/);
  });

  it('contains no emojis (user preference: NO EMOJIS)', () => {
    const msg = buildConfirmationMessage(row, { weeklyCount: 3 });
    expect(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(msg)).toBe(false);
  });
});
