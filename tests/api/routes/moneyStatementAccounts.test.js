import { beforeEach, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
const owner = '00000000-0000-4000-8000-000000000001';
const account = '00000000-0000-4000-8000-000000000010';
const f = vi.hoisted(() => ({ owned: vi.fn(), check: vi.fn(), ingest: vi.fn() }));
vi.mock('../../../api/_app/middleware/auth.js', () => ({ authenticateUser: (req, _res, next) => { req.user = { id: '00000000-0000-4000-8000-000000000001' }; next(); } }));
vi.mock('../../../api/_app/services/money/statements/accounts.js', async (original) => ({ ...(await original()), ownedStatementAccount: (...args) => f.owned(...args), checkStatementEvidence: (...args) => f.check(...args) }));
vi.mock('../../../api/_app/services/money/store.js', async (original) => ({ ...(await original()), ingestSightings: (...args) => f.ingest(...args), refreshRecurring: vi.fn(async () => []), refreshReadings: vi.fn(async () => []) }));
import { StatementInputError } from '../../../api/_app/services/money/statements/accounts.js';
import router from '../../../api/_app/routes/money.js';
const app = express(); app.use(express.json()); app.use('/money', router);
const file = Buffer.from('Fecha;Concepto;Importe\n17/09/2026;Cafe;-5,00');
beforeEach(() => {
  vi.clearAllMocks();
  f.owned.mockResolvedValue({ id: account, currency: 'EUR' });
  f.check.mockResolvedValue(undefined);
  f.ingest.mockResolvedValue({ created: 1, attached: 0 });
});
it('binds the multipart statement to the authenticated owner and selected account', async () => {
  const r = await request(app).post('/money/statement').field('accountId', account).field('userId', 'forged').attach('file', file, 'payments.csv');
  expect(r.status).toBe(200);
  expect(f.owned).toHaveBeenCalledWith(owner, account);
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
