/**
 * A file handed to the chat is read on the machinery that already exists, and nothing it
 * says can put a number on the screen the document did not contain.
 */
import { describe, it, expect, vi } from 'vitest';
import { readAttachment, gateSummary, acceptsAttachment, attachmentRef, MAX_ATTACHMENT_BYTES } from '../../../../api/services/money/attachments.js';
import { receiptToSighting } from '../../../../api/services/money/inbox.js';

const USER = 'u1';
const deps = (over = {}) => ({
  extractText: vi.fn(async () => ({ ok: true, method: 'vision-llm', text: 'Mercadona\nTotal 23,45 EUR\n12/09/2026\nPan 1,20\nLeche 2,10' })),
  extractReceipt: vi.fn(async () => null),
  receiptToSighting,
  ingestSighting: vi.fn(async (_u, s) => ({ action: 'create', transaction: { id: 'tx1', merchant_raw: s.merchant_raw, amount: -s.amount, occurred_at: s.occurred_at } })),
  ingestSightings: vi.fn(async (_u, s) => ({ seen: s.length, created: s.length, attached: 0 })),
  parseStatement: vi.fn(() => ({ sightings: [], skipped: [], header: null })),
  complete: vi.fn(async () => ({ content: 'NONE' })),
  listFacts: vi.fn(async () => []),
  rememberNote: vi.fn(async (_u, n) => ({ id: 'f1', ...n })),
  afterLedgerChange: vi.fn(async () => {}),
  ...over,
});
const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

describe('acceptsAttachment', () => {
  it('takes photos, PDFs, text and bank exports and nothing else', () => {
    expect(acceptsAttachment('ticket.jpg')).toBe(true);
    expect(acceptsAttachment('lease.PDF')).toBe(true);
    expect(acceptsAttachment('movimientos.xlsx')).toBe(true);
    expect(acceptsAttachment('photo', 'image/heic')).toBe(true);
    expect(acceptsAttachment('setup.exe')).toBe(false);
    expect(acceptsAttachment('song.mp3', 'audio/mpeg')).toBe(false);
  });
  it('the reference is the file, so the same receipt twice is one row', () => {
    expect(attachmentRef(jpg)).toBe(attachmentRef(Buffer.from(jpg)));
    expect(attachmentRef(jpg)).toMatch(/^upload:[0-9a-f]{32}$/);
    expect(attachmentRef(jpg)).not.toBe(attachmentRef(Buffer.from([1, 2])));
  });
});

describe('gateSummary', () => {
  const text = 'Contrato de arrendamiento. Renta mensual 650 EUR, pagadera el dia 5. Fianza 1300 EUR.';
  it('keeps a sentence whose every figure is in the document', () => {
    expect(gateSummary('The rent is 650 EUR a month, due on the 5th, with a 1300 EUR deposit.', text)).toBe('The rent is 650 EUR a month, due on the 5th, with a 1300 EUR deposit.');
  });
  it('refuses a figure the document does not hold, NONE, and a paragraph', () => {
    expect(gateSummary('The rent is 700 EUR a month.', text)).toBeNull();
    expect(gateSummary('NONE', text)).toBeNull();
    expect(gateSummary('none.', text)).toBeNull();
    expect(gateSummary('x'.repeat(201), text)).toBeNull();
    expect(gateSummary('  "Rent 650 EUR."  ', text)).toBe('Rent 650 EUR.');
  });
});

describe('readAttachment', () => {
  it('refuses what it cannot take before reading a byte', async () => {
    const d = deps();
    expect((await readAttachment(USER, { buffer: Buffer.alloc(0), filename: 'a.jpg' }, d)).kind).toBe('unreadable');
    expect((await readAttachment(USER, { buffer: Buffer.alloc(MAX_ATTACHMENT_BYTES + 1), filename: 'a.jpg' }, d)).said).toMatch(/over 4 MB/);
    expect((await readAttachment(USER, { buffer: jpg, filename: 'a.exe' }, d)).kind).toBe('unreadable');
    expect(d.extractText).not.toHaveBeenCalled();
  });

  it('a bank export joins the ledger through the statement importer, and the readings refresh', async () => {
    const d = deps({ parseStatement: vi.fn(() => ({ sightings: [{ source: 'statement', source_ref: 'r1', amount: 10 }, { source: 'statement', source_ref: 'r2', amount: 20 }], skipped: [], header: { index: 0 } })), ingestSightings: vi.fn(async () => ({ created: 1 })) });
    const r = await readAttachment(USER, { buffer: Buffer.from('a;b'), filename: 'movimientos.xlsx' }, d);
    expect(r.kind).toBe('statement');
    expect(r.said).toBe('Read 2 payments from movimientos.xlsx; 1 was new to the ledger.');
    expect(d.ingestSightings).toHaveBeenCalledWith(USER, expect.any(Array));
    expect(d.afterLedgerChange).toHaveBeenCalledWith(USER);
    expect(d.extractText).not.toHaveBeenCalled();
  });

  it('says it back in the language the person chose', async () => {
    /* A chat turn is a transcript of a moment, so it keeps the language it was said in; the
       page cannot say it later (2026-09-16). */
    const d = deps({ parseStatement: vi.fn(() => ({ sightings: [{ source: 'statement', source_ref: 'r1', amount: 10 }, { source: 'statement', source_ref: 'r2', amount: 20 }], skipped: [], header: { index: 0 } })), ingestSightings: vi.fn(async () => ({ created: 1 })) });
    const r = await readAttachment(USER, { buffer: Buffer.from('a;b'), filename: 'movimientos.xlsx', language: 'es' }, d);
    expect(r.said).toBe('Le\u00eddos 2 pagos de movimientos.xlsx; 1 era nuevo en el libro.');
    const pt = await readAttachment(USER, { buffer: Buffer.from('a;b'), filename: 'movimientos.xlsx', language: 'pt-BR' }, d);
    expect(pt.said).toBe('Lidos 2 pagamentos de movimientos.xlsx; 1 era novo no livro.');
  });

  it('a CSV with a header but no payments says so; one with no header is read as text', async () => {
    const withHeader = deps({ parseStatement: vi.fn(() => ({ sightings: [], skipped: [{}], header: { index: 0 } })) });
    expect((await readAttachment(USER, { buffer: Buffer.from('Fecha;Importe'), filename: 'x.csv' }, withHeader)).kind).toBe('nothing');
    const noHeader = deps();
    await readAttachment(USER, { buffer: Buffer.from('hello'), filename: 'x.csv' }, noHeader);
    expect(noHeader.extractText).toHaveBeenCalled();
  });

  it('a photo of a receipt becomes an upload sighting with the file as its reference', async () => {
    const receipt = { kind: 'receipt', payment_status: 'paid', merchant: 'Mercadona', amount: 23.45, currency: 'EUR', date: '2026-09-12T00:00:00.000Z', items: [{ label: 'Pan', amount: 1.2 }, { label: 'Leche', amount: 2.1 }], order_ref: null, plan: null, previous_amount: null, next_charge_at: null, confidence: 0.8 };
    const d = deps({ extractReceipt: vi.fn(async () => receipt) });
    const r = await readAttachment(USER, { buffer: jpg, filename: 'ticket.jpg', mimeType: 'image/jpeg', note: 'groceries for the flat' }, d);
    expect(r.kind).toBe('receipt');
    expect(r.said).toBe('Mercadona, 23,45 EUR on 12 Sept, kept as a payment. 2 items on it. Your note stays with it.');
    const s = d.ingestSighting.mock.calls[0][1];
    expect(s.source).toBe('upload');
    expect(s.source_ref).toBe(attachmentRef(jpg));
    expect(s.amount).toBe(23.45);
    expect(s.direction).toBe('out');
    expect(s.merchant_key).toBe('mercadona');
    expect(s.raw_json.items).toHaveLength(2);
    expect(s.raw_json.note).toBe('groceries for the flat');
    expect(s.raw_json.filename).toBe('ticket.jpg');
    expect(r.receipts).toEqual([{ id: 'tx1', merchant: 'Mercadona', amount: -23.45, occurred_at: '2026-09-12T00:00:00.000Z' }]);
    /* One row does not recompute the month: the request would outlive its timeout. */
    expect(d.afterLedgerChange).not.toHaveBeenCalled();
    expect(d.complete).not.toHaveBeenCalled();
  });

  it('the same receipt sent again is told so, not counted twice', async () => {
    const receipt = { kind: 'receipt', payment_status: 'paid', merchant: 'Mercadona', amount: 23.45, currency: 'EUR', date: null, items: [], confidence: 0.8 };
    const d = deps({ extractReceipt: vi.fn(async () => receipt), ingestSighting: vi.fn(async () => ({ action: 'existing', transaction: { id: 'tx1', merchant_raw: 'Mercadona', amount: -23.45, occurred_at: '2026-09-15T10:00:00Z' } })) });
    const r = await readAttachment(USER, { buffer: jpg, filename: 'ticket.jpg' }, d);
    expect(r.said).toBe('Mercadona, 23,45 EUR on today, kept as a payment. It was already in the ledger.');
  });

  it('a document that is not a receipt becomes one gated sentence, kept as a note', async () => {
    const d = deps({
      extractText: vi.fn(async () => ({ ok: true, method: 'pdf-text', text: 'Contrato de arrendamiento. Renta mensual 650 EUR, pagadera el dia 5.' })),
      complete: vi.fn(async () => ({ content: 'Your rent is 650 EUR a month, due on the 5th.' })),
    });
    const r = await readAttachment(USER, { buffer: Buffer.from('%PDF-1.4'), filename: 'contrato.pdf' }, d);
    expect(r.kind).toBe('note');
    expect(r.said).toBe('Kept from contrato.pdf: Your rent is 650 EUR a month, due on the 5th.');
    expect(d.rememberNote).toHaveBeenCalledWith(USER, { subject: expect.stringMatching(/^doc-[0-9a-f]{8}$/), text: 'Your rent is 650 EUR a month, due on the 5th.' });
    expect(d.ingestSighting).not.toHaveBeenCalled();
  });

  it('a sentence with a number the document does not hold is not kept', async () => {
    const d = deps({ complete: vi.fn(async () => ({ content: 'Your rent is 700 EUR a month.' })) });
    const r = await readAttachment(USER, { buffer: Buffer.from('%PDF-1.4'), filename: 'contrato.pdf' }, d);
    expect(r.kind).toBe('nothing');
    expect(d.rememberNote).not.toHaveBeenCalled();
  });

  it('thirty notes is the memory; the thirty-first is read but not kept', async () => {
    const d = deps({ complete: vi.fn(async () => ({ content: 'Your rent is 23,45 EUR.' })), listFacts: vi.fn(async () => Array.from({ length: 30 }, () => ({ kind: 'note' }))) });
    const r = await readAttachment(USER, { buffer: Buffer.from('%PDF-1.4'), filename: 'contrato.pdf' }, d);
    expect(r.kind).toBe('nothing');
    expect(r.said).toMatch(/thirty of your notes/);
    expect(d.rememberNote).not.toHaveBeenCalled();
  });

  it('a scan with no text says what would read, and a dead read says it could not', async () => {
    const scan = deps({ extractText: vi.fn(async () => ({ ok: false, needsOcr: true, text: '' })) });
    expect((await readAttachment(USER, { buffer: Buffer.from('%PDF-1.4'), filename: 'scan.pdf' }, scan)).said).toMatch(/A photo of the page reads/);
    const dead = deps({ extractText: vi.fn(async () => ({ ok: false, text: '' })) });
    expect((await readAttachment(USER, { buffer: jpg, filename: 'blur.jpg' }, dead)).kind).toBe('unreadable');
  });
});
