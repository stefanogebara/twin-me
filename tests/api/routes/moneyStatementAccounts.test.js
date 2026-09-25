import { beforeEach, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
const owner = '00000000-0000-4000-8000-000000000001';
const account = '00000000-0000-4000-8000-000000000010';
const f = vi.hoisted(() => ({ owned: vi.fn(), check: vi.fn(), ingest: vi.fn(), complete: vi.fn() }));
vi.mock('../../../api/_app/middleware/auth.js', () => ({ authenticateUser: (req, _res, next) => { req.user = { id: '00000000-0000-4000-8000-000000000001' }; next(); } }));
vi.mock('../../../api/_app/services/money/statements/accounts.js', async (original) => ({ ...(await original()), ownedStatementAccount: (...args) => f.owned(...args), checkStatementEvidence: (...args) => f.check(...args) }));
vi.mock('../../../api/_app/services/money/store.js', async (original) => ({ ...(await original()), ingestSightings: (...args) => f.ingest(...args), refreshRecurring: vi.fn(async () => []), refreshReadings: vi.fn(async () => []) }));
vi.mock('../../../api/_app/services/llmGateway.js', async (original) => ({ ...(await original()), complete: (...args) => f.complete(...args) }));
import { StatementInputError } from '../../../api/_app/services/money/statements/accounts.js';
import router from '../../../api/_app/routes/money.js';
const app = express(); app.use(express.json()); app.use('/money', router);
const file = Buffer.from('Fecha;Concepto;Importe\n17/09/2026;Cafe;-5,00');
const splitPlan = { index: 0, columns: { date: 0, concept: 1, debit: 2, credit: 3 } };
const custom = Buffer.from('When;What;Spent;Received\n2026-09-20;Cafe;5;0');
beforeEach(() => {
  vi.clearAllMocks();
  f.owned.mockResolvedValue({ id: account, currency: 'EUR' });
  f.check.mockResolvedValue(undefined);
  f.complete.mockResolvedValue({ content: JSON.stringify(splitPlan) });
  f.ingest.mockResolvedValue({ created: 1, attached: 0 });
});
it('binds the multipart statement to the authenticated owner and selected account', async () => {
  const r = await request(app).post('/money/statement').field('accountId', account).field('userId', 'forged').attach('file', file, 'payments.csv');
  expect(r.status).toBe(200);
  expect(f.owned).toHaveBeenCalledWith(owner, account);
  expect(f.complete).not.toHaveBeenCalled();
  expect(f.ingest).toHaveBeenCalledWith(owner, [expect.objectContaining({ account_id: account, currency: 'EUR', amount: 5 })]);
});
it('does not import when account ownership cannot be established', async () => {
  f.owned.mockRejectedValueOnce(new StatementInputError('Choose one of your own accounts.', 404));
  const r = await request(app).post('/money/statement').field('accountId', account).attach('file', file, 'payments.csv');
  expect(r.status).toBe(404);
  expect(f.ingest).not.toHaveBeenCalled();
});
it('surfaces historical ambiguity instead of reporting a successful import', async () => {
  f.check.mockRejectedValueOnce(new StatementInputError('Review the earlier import.', 409));
  const r = await request(app).post('/money/statement').field('accountId', account).attach('file', file, 'payments.csv');
  expect(r.status).toBe(409);
  expect(r.body.success).toBe(false);
  expect(f.ingest).not.toHaveBeenCalled();
});

it('holds a model debit/credit mapping for review even when there are no questions', async () => {
  const r = await request(app).post('/money/statement').field('accountId', account).field('confirm', 'true').attach('file', custom, 'budget.csv');
  expect(r.status).toBe(200);
  expect(r.body.data.needs).toMatchObject({ questions: [], read: 1, skipped: 0, reviewRequired: true, preview: [{ name: 'Cafe', amount: 5, direction: 'out' }] });
  expect(f.complete).toHaveBeenCalledOnce();
  expect(f.ingest).not.toHaveBeenCalled();
  expect(f.check).not.toHaveBeenCalled();
});

it('keeps answered payments in review until separately confirmed, then imports that plan', async () => {
  const unsigned = Buffer.from('When;What;How much\n21/09;Cafe;5');
  const plan = { index: 0, columns: { date: 0, concept: 1, amount: 2 } };
  const answers = { sign: 'all_out', year: '2026' };
  const post = () => request(app).post('/money/statement').field('accountId', account).field('plan', JSON.stringify(plan)).field('answers', JSON.stringify(answers));
  const review = await post().attach('file', unsigned, 'budget.csv');
  expect(review.body.data.needs).toMatchObject({ questions: [], reviewRequired: true, read: 1, skipped: 0, preview: [{ day: '2026-09-21', amount: 5, direction: 'out' }] });
  expect(f.ingest).not.toHaveBeenCalled();
  const confirmed = await post().field('confirm', 'true').attach('file', unsigned, 'budget.csv');
  expect(confirmed.status).toBe(200);
  expect(confirmed.body.data).toMatchObject({ read: 1, created: 1 });
  expect(f.ingest).toHaveBeenCalledWith(owner, [expect.objectContaining({ amount: 5, direction: 'out', account_id: account })]);
  expect(f.complete).not.toHaveBeenCalled();
});

it('confirmation cannot bypass unresolved questions', async () => {
  const plan = { index: 0, columns: { date: 0, concept: 1, amount: 2 }, sign: 'all_in' };
  const unsigned = Buffer.from('When;What;How much\n21/09;Cafe;5');
  const r = await request(app).post('/money/statement').field('accountId', account).field('plan', JSON.stringify(plan)).field('confirm', 'true').attach('file', unsigned, 'budget.csv');
  expect(r.body.data.needs.reviewRequired).toBe(true);
  expect(r.body.data.needs.questions.map((q) => q.id)).toEqual(expect.arrayContaining(['year', 'sign']));
  expect(f.ingest).not.toHaveBeenCalled();
});

it('limits review rows, reports whole-file counts, and masks labelled card references', async () => {
  const rows = ['When;What;Spent;Received', ...Array.from({ length: 8 }, (_, i) => `2026-09-20;Cafe ${i} card 1234567812345678;5;0`), 'not a date;Bad;5;0'];
  const r = await request(app).post('/money/statement').field('accountId', account).attach('file', Buffer.from(rows.join('\n')), 'budget.csv');
  expect(r.body.data.needs).toMatchObject({ read: 8, skipped: 1, reviewRequired: true });
  expect(r.body.data.needs.preview).toHaveLength(5);
  expect(JSON.stringify(r.body.data.needs.preview)).not.toContain('1234567812345678');
  expect(r.body.data.needs.preview[0].name).toContain('****5678');
  expect(Object.keys(r.body.data.needs.preview[0]).sort()).toEqual(['amount', 'currency', 'day', 'direction', 'name']);
  expect(f.ingest).not.toHaveBeenCalled();
});

it('checks ownership before calling a model for an unfamiliar sheet', async () => {
  f.owned.mockRejectedValueOnce(new StatementInputError('Choose one of your own accounts.', 404));
  const r = await request(app).post('/money/statement').field('accountId', account).attach('file', custom, 'budget.csv');
  expect(r.status).toBe(404);
  expect(f.complete).not.toHaveBeenCalled();
  expect(f.ingest).not.toHaveBeenCalled();
});
