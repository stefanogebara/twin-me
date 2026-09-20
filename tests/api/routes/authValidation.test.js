/** The sign-in routes refuse an absurd body before any handler reads it, and keep their own messages for the ordinary ones (M1-2). */
import { expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-unit-tests-only';
vi.mock('express-rate-limit', () => ({ default: () => (req, res, next) => next() }));
vi.mock('../../../api/config/supabase.js', () => ({ supabase: {}, supabaseAdmin: {} }));
vi.mock('../../../api/services/inngestClient.js', () => ({ inngest: { send: async () => {} }, EVENTS: {} }));
vi.mock('../../../api/services/emailService.js', () => ({ sendWelcomeEmail: async () => {}, sendMagicLink: async () => {} }));
vi.mock('../../../api/services/redisClient.js', () => ({ getRedisClient: () => null, isRedisAvailable: () => false }));
const { default: router } = await import('../../../api/routes/auth-simple.js');
const app = express(); app.use(express.json()); app.use('/auth', router);

it('a 10 KB email is refused at the door, with the field named', async () => {
  const r = await request(app).post('/auth/signin').send({ email: 'a'.repeat(10240), password: 'x' });
  expect(r.status).toBe(400);
  expect(r.body).toMatchObject({ success: false, error: 'Invalid request', field: 'email' });
});
it('a wrong type is refused the same way', async () => {
  expect((await request(app).post('/auth/signup').send({ email: ['a'], password: 'Abcdefg1' })).body.field).toBe('email');
  expect((await request(app).post('/auth/oauth/callback').send({ provider: 12 })).body.field).toBe('provider');
});
it('an ordinary bad sign-in keeps the handler own message', async () => {
  const r = await request(app).post('/auth/signin').send({ email: 'nobody', password: '' });
  expect(r.status).toBe(400);
  expect(r.body.error).toBe('Email and password are required');
});
