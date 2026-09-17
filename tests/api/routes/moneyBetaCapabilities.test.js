import { afterEach, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
const owner = '00000000-0000-4000-8000-000000000001';
vi.mock('../../../api/middleware/auth.js', () => ({ authenticateUser: (req, _res, next) => { req.user = { id: owner }; next(); } }));
import router from '../../../api/routes/money.js';
const app = express(); app.use(express.json()); app.use('/money', router);
afterEach(() => vi.unstubAllEnvs());
it('denies live bank connections and phone capture for an unlisted beta user', async () => {
  vi.stubEnv('MONEY_ADVANCED_BETA_USER_IDS', '00000000-0000-4000-8000-000000000002');
  vi.stubEnv('ENABLE_BANKING_APP_ID', 'configured'); vi.stubEnv('ENABLE_BANKING_PRIVATE_KEY', 'configured');
  const capabilities = await request(app).get('/money/capabilities');
  expect(capabilities.body.data).toEqual({ bank: false, capture: false });
  expect((await request(app).post('/money/bank/connect').send({})).status).toBe(403);
  expect((await request(app).post('/money/capture').send({ source: 'shortcut' })).status).toBe(403);
});
it('fails closed without configuration and enables only the exact allowlisted owner', async () => {
  vi.stubEnv('MONEY_ADVANCED_BETA_USER_IDS', '');
  expect((await request(app).get('/money/capabilities')).body.data).toEqual({ bank: false, capture: false });
  vi.stubEnv('MONEY_ADVANCED_BETA_USER_IDS', ` ${owner} `);
  vi.stubEnv('ENABLE_BANKING_APP_ID', 'configured'); vi.stubEnv('ENABLE_BANKING_PRIVATE_KEY', 'configured');
  expect((await request(app).get('/money/capabilities')).body.data).toEqual({ bank: true, capture: true });
});
