/**
 * A bank's PDF dropped in the chat reads as the statement it is.
 * ==============================================================
 * Since #597 a PDF statement uploaded on Sources is read by pdfGrid and shown before it joins.
 * The chat's own door for files read every PDF as prose: its text went to the receipt reader,
 * which could keep one line of a statement as a payment, or to a one-sentence note, and never
 * as rows (2026-09-26). Tested through the route with the real fixture, as #597 taught.
 */
import { beforeEach, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const f = vi.hoisted(() => ({ ingest: vi.fn(), ingestOne: vi.fn(), complete: vi.fn(), extract: vi.fn(), receipt: vi.fn(), turn: vi.fn(), language: vi.fn() }));
vi.mock('../../../api/_app/middleware/auth.js', () => ({ authenticateUser: (req, _res, next) => { req.user = { id: '00000000-0000-4000-8000-000000000001' }; next(); } }));
vi.mock('../../../api/_app/services/money/store.js', async (original) => ({
  ...(await original()),
  ingestSightings: (...args) => f.ingest(...args), ingestSighting: (...args) => f.ingestOne(...args),
  saveChatTurn: (...args) => f.turn(...args), userLanguage: (...args) => f.language(...args),
  refreshRecurring: vi.fn(async () => []), refreshReadings: vi.fn(async () => []), listFacts: vi.fn(async () => []),
}));
vi.mock('../../../api/_app/services/money/inbox.js', async (original) => ({ ...(await original()), extractReceipt: (...args) => f.receipt(...args) }));
vi.mock('../../../api/_app/services/llmGateway.js', async (original) => ({ ...(await original()), complete: (...args) => f.complete(...args) }));
vi.mock('../../../api/_app/services/documentExtractionService.js', async (original) => ({ ...(await original()), extractDocumentText: (...args) => f.extract(...args) }));
import router from '../../../api/_app/routes/money.js';

const app = express(); app.use(express.json()); app.use('/money', router);
const pdf = (name) => readFileSync(resolve(process.cwd(), 'tests/fixtures/statements', name));
const attach = (buffer, name, type = 'application/pdf') => request(app).post('/money/chat/attach').attach('file', buffer, { filename: name, contentType: type });

beforeEach(() => {
  vi.clearAllMocks();
  f.language.mockResolvedValue('en');
  f.turn.mockResolvedValue(null);
  f.receipt.mockResolvedValue(null);
  f.complete.mockResolvedValue({ content: 'NONE' });
  f.extract.mockResolvedValue({ ok: true, method: 'pdf-text', text: 'Fecha Concepto Importe 01/09/2026 MERCADONA -48,20' });
});

it('reads a statement PDF with the statement reader and sends it to Sources, writing nothing', async () => {
  const r = await attach(pdf('extracto-web.pdf'), 'extracto.pdf');
  expect(r.status).toBe(200);
  expect(r.body.data.said).toMatch(/22 payments/);
  expect(r.body.data.said).toMatch(/Sources/);
  expect(r.body.data.receipts).toEqual([]);
  /* not a receipt, not a note, and nothing joins the ledger before its rows are checked */
  expect(f.receipt).not.toHaveBeenCalled();
  expect(f.complete).not.toHaveBeenCalled();
  expect(f.ingest).not.toHaveBeenCalled();
  expect(f.ingestOne).not.toHaveBeenCalled();
});

it('says it in the language the person chose', async () => {
  f.language.mockResolvedValue('es');
  const r = await attach(pdf('extracto-mono.pdf'), 'mono.pdf');
  expect(r.status).toBe(200);
  expect(r.body.data.said).toMatch(/6 pagos/);
  expect(r.body.data.said).toMatch(/Fuentes/);
});

it('a PDF that is not a statement still reads as a document', async () => {
  const r = await attach(Buffer.from('%PDF-1.4 not really a pdf'), 'contrato.pdf');
  expect(r.status).toBe(200);
  expect(f.extract).toHaveBeenCalled();
  expect(f.receipt).toHaveBeenCalled();
  expect(f.ingest).not.toHaveBeenCalled();
});
