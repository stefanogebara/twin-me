import { afterEach, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
const owner = '00000000-0000-4000-8000-000000000001';
const f = vi.hoisted(() => ({ hold: vi.fn() }));
vi.mock('../../../api/services/money/legacyCapture.js', () => ({ holdUndatedCapture: (...args) => f.hold(...args) }));
vi.mock('../../../api/middleware/auth.js', () => ({ authenticateUser: (req, _res, next) => { req.user = { id: owner }; next(); } }));
import router from '../../../api/routes/money.js';
const app = express(); app.use(express.json()); app.use('/money', router);
afterEach(() => vi.unstubAllEnvs());
it('keeps undated legacy notifications before acknowledging and returns 503 if storage fails', async () => {
  vi.stubEnv('MONEY_ADVANCED_BETA_USER_IDS', owner);
  f.hold.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Storage unavailable'));
  const payload={text:'Compra 5,00 EUR en Cafe'};
  const held=await request(app).post('/money/capture').send(payload);
  expect(held.status).toBe(202);
  expect(held.body.data.outcome).toBe('needs_capture_update');
  expect(f.hold).toHaveBeenCalledWith(owner,payload);
  expect((await request(app).post('/money/capture').send(payload)).status).toBe(503);
});
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
