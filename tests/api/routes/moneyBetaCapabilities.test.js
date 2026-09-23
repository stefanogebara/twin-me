import { afterEach, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
const owner = '00000000-0000-4000-8000-000000000001';
const f = vi.hoisted(() => ({ hold: vi.fn(), optIn: vi.fn(), accounts: vi.fn(async () => []) }));
vi.mock('../../../api/services/money/legacyCapture.js', () => ({ holdUndatedCapture: (...args) => f.hold(...args) }));
vi.mock('../../../api/services/money/channelStore.js', () => ({ recordOptIn: (...args) => f.optIn(...args) }));
vi.mock('../../../api/middleware/auth.js', () => ({ authenticateUser: (req, _res, next) => { req.user = { id: owner }; next(); } }));
vi.mock('../../../api/services/money/store.js', async (importOriginal) => ({ ...(await importOriginal()), listBankAccounts: async () => f.accounts(), personProfileCached: async () => ({ timezone: 'Europe/Madrid', country: 'ES', currency: 'EUR', language: null }) }));
vi.mock('../../../api/services/money/feeds/enableBanking.js', async (importOriginal) => ({ ...(await importOriginal()), applicationCountries: async () => ['ES', 'PT'] }));
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
it('keeps the bank closed for an unlisted person while the application is restricted, and says why; phone capture is open to everyone', async () => {
  vi.stubEnv('MONEY_ADVANCED_BETA_USER_IDS', '00000000-4000-4000-8000-000000000002');
  vi.stubEnv('ENABLE_BANKING_APP_ID', 'configured'); vi.stubEnv('ENABLE_BANKING_PRIVATE_KEY', 'configured');
  vi.stubEnv('ENABLE_BANKING_UNRESTRICTED', '');
  const capabilities = await request(app).get('/money/capabilities');
  expect(capabilities.body.data).toEqual({ bank: false, why: 'restricted', capture: true, whatsapp: false });
  const refused = await request(app).post('/money/bank/connect').send({});
  expect(refused.status).toBe(403);
  expect(refused.body.error).toMatch(/once our bank access is cleared/);
  f.hold.mockResolvedValueOnce(undefined);
  expect((await request(app).post('/money/capture').send({ text: 'Compra 5,00 EUR en Cafe' })).status).toBe(202);
});
it('fails closed without configuration; opens for the listed owner, for a person already linked, and for everyone once unrestricted, country permitting', async () => {
  vi.stubEnv('MONEY_ADVANCED_BETA_USER_IDS', '');
  vi.stubEnv('ENABLE_BANKING_APP_ID', ''); vi.stubEnv('ENABLE_BANKING_PRIVATE_KEY', '');
  expect((await request(app).get('/money/capabilities')).body.data).toEqual({ bank: false, why: 'unconfigured', capture: true, whatsapp: false });
  vi.stubEnv('ENABLE_BANKING_APP_ID', 'configured'); vi.stubEnv('ENABLE_BANKING_PRIVATE_KEY', 'configured');
  vi.stubEnv('MONEY_ADVANCED_BETA_USER_IDS', ` ${owner} `);
  expect((await request(app).get('/money/capabilities')).body.data).toEqual({ bank: true, why: 'listed', capture: true, whatsapp: false });
  vi.stubEnv('MONEY_ADVANCED_BETA_USER_IDS', '');
  f.accounts.mockResolvedValueOnce([{ provider: 'enablebanking' }]);
  expect((await request(app).get('/money/capabilities')).body.data).toEqual({ bank: true, why: 'linked', capture: true, whatsapp: false });
  vi.stubEnv('ENABLE_BANKING_UNRESTRICTED', 'true');
  expect((await request(app).get('/money/capabilities')).body.data).toEqual({ bank: true, why: 'open', capture: true, whatsapp: false });
});
it('opts a listed WhatsApp person in, and refuses one outside the list', async () => {
  vi.stubEnv('MONEY_WHATSAPP_USER_IDS', owner);
  f.optIn.mockResolvedValueOnce(true);
  const ok = await request(app).post('/money/channel/opt-in').send({});
  expect(ok.status).toBe(200);
  expect(ok.body).toEqual({ success: true });
  expect(f.optIn).toHaveBeenCalledWith(owner);

  vi.stubEnv('MONEY_WHATSAPP_USER_IDS', '00000000-0000-4000-8000-000000000002');
  const refused = await request(app).post('/money/channel/opt-in').send({});
  expect(refused.status).toBe(403);
});
it('refuses an opt-in body with an unexpected key', async () => {
  vi.stubEnv('MONEY_WHATSAPP_USER_IDS', owner);
  const callsBefore = f.optIn.mock.calls.length;
  const res = await request(app).post('/money/channel/opt-in').send({ extra: true });
  expect(res.status).toBe(400);
  expect(f.optIn.mock.calls.length).toBe(callsBefore);
});
