/**
 * The staying routes refuse an absurd body before any handler reads it (M1-B, 2026-09-22),
 * and keep their own messages for the ordinary one. Four small routers, mocked at their
 * services; the goal test covers the rest of the set by reading the source.
 */
import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const owner = '00000000-0000-4000-8000-000000000001';
vi.mock('express-rate-limit', () => ({ default: () => (req, res, next) => next() }));
vi.mock('../../../api/_app/middleware/auth.js', () => ({ authenticateUser: (req, _res, next) => { req.user = { id: owner }; next(); }, authenticateToken: (req, _res, next) => { req.user = { id: owner }; next(); } }));
vi.mock('../../../api/_app/services/logger.js', () => ({ createLogger: () => ({ warn() {}, info() {}, error() {}, debug() {} }) }));
const f = vi.hoisted(() => ({ setFeatureFlag: vi.fn(), getFeatureFlags: vi.fn(), validateInviteCode: vi.fn(), addToWaitlist: vi.fn() }));
vi.mock('../../../api/_app/services/featureFlagsService.js', () => ({ getFeatureFlags: f.getFeatureFlags, setFeatureFlag: f.setFeatureFlag }));
vi.mock('../../../api/_app/services/betaInviteService.js', () => ({ validateInviteCode: f.validateInviteCode, addToWaitlist: f.addToWaitlist }));
vi.mock('../../../api/_app/services/database.js', () => ({ supabaseAdmin: { from: () => ({ update: () => ({ eq: async () => ({ error: null }) }), select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) } }));
vi.mock('../../../api/_app/services/soulSignatureService.js', () => ({ getAllSoulSignatures: async () => [] }));

const { default: flags } = await import('../../../api/_app/routes/feature-flags.js');
const { default: betaPublic } = await import('../../../api/_app/routes/beta-public.js');
const { default: account } = await import('../../../api/_app/routes/account.js');
const app = express(); app.use(express.json()); app.use('/flags', flags); app.use('/beta', betaPublic); app.use('/account', account);

describe('a bad body is a 400 that names the field', () => {
  it('feature flag with a flag name that is not a string', async () => {
    const r = await request(app).post('/flags').send({ flag: { nested: true }, value: true });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ success: false, error: 'Invalid request', field: 'flag' });
    expect(f.setFeatureFlag).not.toHaveBeenCalled();
  });

  it('a 10 KB invite code and a 10 KB email at the beta door', async () => {
    expect((await request(app).post('/beta/validate').send({ code: 'x'.repeat(10240) })).body.field).toBe('code');
    expect((await request(app).post('/beta/waitlist').send({ email: 'a'.repeat(10240), name: 'x' })).body.field).toBe('email');
    expect(f.validateInviteCode).not.toHaveBeenCalled();
    expect(f.addToWaitlist).not.toHaveBeenCalled();
  });

  it('an account language that is an array', async () => {
    const r = await request(app).patch('/account/language').send({ language: ['es'] });
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('language');
  });
});

describe('an ordinary body still reaches the handler with its own rules', () => {
  it('lets a plain language through to the handler', async () => {
    const r = await request(app).patch('/account/language').send({ language: 'es' });
    expect(r.status).not.toBe(400);
  });
  it('lets a plain invite code through to the service', async () => {
    f.validateInviteCode.mockResolvedValue({ valid: false });
    const r = await request(app).post('/beta/validate').send({ code: 'ABC123' });
    expect(r.status).not.toBe(400);
    expect(f.validateInviteCode).toHaveBeenCalled();
  });
});
