import { it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const f = vi.hoisted(() => ({ gather: vi.fn(), openers: vi.fn() }));
vi.mock('../../../api/_app/services/money/chat.js', async (importOriginal) => ({ ...(await importOriginal()), gather: (...a) => f.gather(...a) }));
vi.mock('../../../api/_app/services/money/next.js', async (importOriginal) => ({ ...(await importOriginal()), openers: (...a) => f.openers(...a) }));
vi.mock('../../../api/_app/middleware/auth.js', () => ({ authenticateUser: (req, _res, next) => { req.user = { id: 'u1' }; next(); } }));
const router = (await import('../../../api/_app/routes/money.js')).default;
const app = express(); app.use(express.json()); app.use('/money', router);

it('GET /money/chat/openers reads the ledger once and answers the three questions with their figures', async () => {
  f.gather.mockResolvedValue({ language: 'en' });
  f.openers.mockReturnValue([{ ask: 'Where did the money go?', figure: '138,25 € in September so far' }]);
  const res = await request(app).get('/money/chat/openers');
  expect(res.status).toBe(200);
  expect(res.body.data).toEqual([{ ask: 'Where did the money go?', figure: '138,25 € in September so far' }]);
  expect(f.gather).toHaveBeenCalledWith('u1', expect.any(Date));
});
it('is a 500 when the read fails, never an empty list', async () => {
  f.gather.mockRejectedValue(new Error('down'));
  expect((await request(app).get('/money/chat/openers')).status).toBe(500);
});
