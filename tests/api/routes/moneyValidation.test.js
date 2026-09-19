/** Every money write route answers a bad body with a 400 that names the field (M1-2). */
import { expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
const owner = '00000000-0000-4000-8000-000000000001';
vi.mock('../../../api/middleware/auth.js', () => ({ authenticateUser: (req, _res, next) => { req.user = { id: owner }; next(); } }));
import router from '../../../api/routes/money.js';
const app = express(); app.use(express.json()); app.use('/money', router);

const cases = [
  ['post', '/money/transactions/not-a-uuid/verdict', { verdict: 'worth_it' }, 'id'],
  ['post', `/money/transactions/${owner}/verdict`, { verdict: 'maybe' }, 'verdict'],
  ['post', '/money/bank/connect', { country: 'ESP' }, 'country'],
  ['post', `/money/bank/accounts/${owner}/cards/12/type`, { type: 'debit' }, 'last4'],
  ['post', '/money/statement/accounts', { name: '' }, 'name'],
  ['post', '/money/places/lookup', { limit: 'lots' }, 'limit'],
  ['post', '/money/places/x/category', { category: 'a'.repeat(41) }, 'category'],
  ['post', '/money/questions/answer', { kind: '' }, 'kind'],
  ['post', '/money/questions/answer', { kind: 'income', day: 40 }, 'day'],
  ['post', '/money/chat', { message: '' }, 'message'],
  ['post', '/money/chat/stream', { message: 'x', history: [{ role: 'system', text: 'x' }] }, 'history.0.role'],
  ['post', '/money/chat/act', { action: { kind: 1 } }, 'action.kind'],
  ['post', '/money/calendar/feed', { url: '' }, 'url'],
  ['post', '/money/home', { lat: 200 }, 'lat'],
  ['post', '/money/readings/r1/verdict', { verdict: 'wrong' }, 'verdict'],
];
for (const [method, path, body, field] of cases) {
  it(`${method.toUpperCase()} ${path} names ${field}`, async () => {
    const r = await request(app)[method](path).send(body);
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ success: false, error: 'Invalid request', field });
  });
}
