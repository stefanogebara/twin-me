/**
 * A PDF is previewed before anything is written.
 * ==============================================
 * A PDF's columns are inferred from where its text was drawn, never read from the file. The
 * first rebuild (#596) read 6 of 22 rows of a realistic statement with dates where the shops'
 * names belonged, and because the header dictionary still recognised the titles, the upload
 * would have written them with no preview (2026-09-25). These pin the route: a PDF is shown,
 * and only a separate confirmation imports it.
 */
import { beforeEach, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const owner = '00000000-0000-4000-8000-000000000001';
const account = '00000000-0000-4000-8000-000000000010';
const f = vi.hoisted(() => ({ owned: vi.fn(), check: vi.fn(), ingest: vi.fn(), complete: vi.fn(), extract: vi.fn() }));
vi.mock('../../../api/_app/middleware/auth.js', () => ({ authenticateUser: (req, _res, next) => { req.user = { id: '00000000-0000-4000-8000-000000000001' }; next(); } }));
vi.mock('../../../api/_app/services/money/statements/accounts.js', async (original) => ({ ...(await original()), ownedStatementAccount: (...args) => f.owned(...args), checkStatementEvidence: (...args) => f.check(...args) }));
vi.mock('../../../api/_app/services/money/store.js', async (original) => ({ ...(await original()), ingestSightings: (...args) => f.ingest(...args), refreshRecurring: vi.fn(async () => []), refreshReadings: vi.fn(async () => []) }));
vi.mock('../../../api/_app/services/llmGateway.js', async (original) => ({ ...(await original()), complete: (...args) => f.complete(...args) }));
vi.mock('../../../api/_app/services/documentExtractionService.js', async (original) => ({ ...(await original()), extractDocumentText: (...args) => f.extract(...args) }));
import router from '../../../api/_app/routes/money.js';

const app = express(); app.use(express.json()); app.use('/money', router);
const pdf = (name) => readFileSync(resolve(process.cwd(), 'tests/fixtures/statements', name));
const post = (buffer, name, confirm) => {
  const r = request(app).post('/money/statement').field('accountId', account);
  if (confirm) r.field('confirm', 'true');
  return r.attach('file', buffer, name);
};

beforeEach(() => {
  vi.clearAllMocks();
  f.owned.mockResolvedValue({ id: account, currency: 'EUR' });
  f.check.mockResolvedValue(undefined);
  f.ingest.mockImplementation(async (_user, sightings) => ({ created: sightings.length, attached: 0 }));
  f.extract.mockResolvedValue({ ok: false, text: '' });
});

it('shows a statement PDF first, even when its titles are ones the dictionary knows', async () => {
  const r = await post(pdf('extracto-web.pdf'), 'extracto.pdf');
  expect(r.status).toBe(200);
  expect(r.body.data.needs).toMatchObject({ questions: [], reviewRequired: true, read: 22 });
  expect(r.body.data.needs.preview[0]).toMatchObject({ day: '2026-09-01', amount: 48.2, direction: 'out' });
  expect(r.body.data.needs.plan).toMatchObject({ columns: { valueDate: 1, concept: 2, amount: 3 } });
  expect(f.ingest).not.toHaveBeenCalled();
  expect(f.check).not.toHaveBeenCalled();
  /* The columns came from geometry and the titles from the dictionary: no model was asked. */
  expect(f.complete).not.toHaveBeenCalled();
});

it('imports it on a separate confirmation, every row of it', async () => {
  const r = await post(pdf('extracto-web.pdf'), 'extracto.pdf', true);
  expect(r.status).toBe(200);
  expect(r.body.data).toMatchObject({ read: 22, created: 22 });
  const [, sightings] = f.ingest.mock.calls[0];
  const out = sightings.filter((s) => s.direction === 'out').reduce((n, s) => n + s.amount, 0);
  const incoming = sightings.filter((s) => s.direction === 'in').reduce((n, s) => n + s.amount, 0);
  expect(Math.round(out * 100) / 100).toBe(510.6);
  expect(incoming).toBe(1350);
  expect(sightings.every((s) => s.account_id === account && s.source === 'statement')).toBe(true);
});

it('treats a monospace statement the same way', async () => {
  const shown = await post(pdf('extracto-mono.pdf'), 'mono.pdf');
  expect(shown.body.data.needs).toMatchObject({ reviewRequired: true, read: 6, skipped: 0 });
  expect(f.ingest).not.toHaveBeenCalled();
  const done = await post(pdf('extracto-mono.pdf'), 'mono.pdf', true);
  expect(done.body.data).toMatchObject({ read: 6, created: 6 });
});

it('says plainly when nothing can be read out of a PDF, and writes nothing', async () => {
  const r = await post(Buffer.from('%PDF-1.4 not really a pdf'), 'scan.pdf');
  expect(r.status).toBe(422);
  expect(r.body.error).toMatch(/Nothing could be read out of that PDF/);
  expect(f.ingest).not.toHaveBeenCalled();
});

it('still imports a bank spreadsheet with no preview, as it always has', async () => {
  const r = await request(app).post('/money/statement').field('accountId', account)
    .attach('file', Buffer.from('Fecha;Concepto;Importe\n17/09/2026;Cafe;-5,00'), 'payments.csv');
  expect(r.status).toBe(200);
  expect(r.body.data).toMatchObject({ read: 1, created: 1 });
  expect(f.ingest).toHaveBeenCalledWith(owner, [expect.objectContaining({ amount: 5, direction: 'out' })]);
});

it('refuses a file it cannot read with the reason, not a blank 500', async () => {
  const r = await request(app).post('/money/statement').field('accountId', account)
    .attach('file', Buffer.from('not a statement'), 'notes.docx');
  expect(r.status).toBe(415);
  expect(r.body).toEqual({ success: false, error: 'Upload a statement exported as Excel, CSV or PDF.' });
  expect(f.ingest).not.toHaveBeenCalled();
});
