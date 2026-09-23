/** GET /money/page: the page in one read, the failed parts named, a strange view refused. */
import { expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
const owner = '00000000-0000-4000-8000-000000000001';
const f = vi.hoisted(() => ({ readPage: vi.fn() }));
vi.mock('../../../api/_app/services/money/pageRead.js', () => ({ readPage: f.readPage, accountsView: vi.fn(), PAGE_VIEWS: new Set(['today', 'month', 'you']) }));
vi.mock('../../../api/_app/middleware/auth.js', () => ({ authenticateUser: (req, _res, next) => { req.user = { id: owner }; next(); } }));
import router from '../../../api/_app/routes/money.js';
const app = express(); app.use(express.json()); app.use('/money', router);

it('returns every part and the names of the failed ones', async () => {
  f.readPage.mockResolvedValueOnce({ data: { forecast: { spent: 1 }, today: null, ledger: [] }, failed: ['today'] });
  const res = await request(app).get('/money/page?view=month');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ success: true, data: { forecast: { spent: 1 }, today: null, ledger: [], failed: ['today'] } });
  expect(f.readPage).toHaveBeenCalledWith(owner, { view: 'month' });
});
it('defaults to today and refuses a view it does not know', async () => {
  f.readPage.mockResolvedValueOnce({ data: {}, failed: [] });
  await request(app).get('/money/page');
  expect(f.readPage).toHaveBeenLastCalledWith(owner, { view: 'today' });
  expect((await request(app).get('/money/page?view=plan')).status).toBe(400);
});
it('is a 500 when the read itself throws, never an empty page', async () => {
  f.readPage.mockRejectedValueOnce(new Error('db'));
  expect((await request(app).get('/money/page')).status).toBe(500);
});
