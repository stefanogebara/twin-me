/**
 * Smoke tests for api/routes/device-tokens.js
 * Covers: auth guard, token/platform/token_type validation, happy path, delete, 500.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
process.env.ENCRYPTION_KEY = '0'.repeat(64);
process.env.NODE_ENV = 'test';

const registerDeviceTokenMock = vi.fn();
const deleteEqMock = vi.fn().mockResolvedValue({ error: null });

vi.mock('../../../api/services/pushNotificationService.js', () => ({
  registerDeviceToken: (...a) => registerDeviceTokenMock(...a),
}));

vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      // auth middleware path: select().eq().single()
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { email_verified: true, created_at: new Date().toISOString() }, error: null }),
      // delete path: delete().eq().eq()
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn(function chain() { return this; }),
    })),
  },
  serverDb: {},
}));

const TEST_USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const signToken = () => jwt.sign({ id: TEST_USER }, 'test-secret', { expiresIn: '1h' });

const deviceTokenRoutes = (await import('../../../api/routes/device-tokens.js')).default;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/device-tokens', deviceTokenRoutes);
  return app;
}

describe('device-tokens routes smoke', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects unauthenticated POST with 401', async () => {
    const res = await request(createApp())
      .post('/api/device-tokens')
      .send({ token: 'abc', platform: 'ios' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when token is missing', async () => {
    const res = await request(createApp())
      .post('/api/device-tokens')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ platform: 'ios' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/token required/i);
  });

  it('returns 400 when platform is not android/ios', async () => {
    const res = await request(createApp())
      .post('/api/device-tokens')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ token: 'abc', platform: 'windows' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/platform must be android or ios/i);
  });

  it('returns 400 when token_type is invalid', async () => {
    const res = await request(createApp())
      .post('/api/device-tokens')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ token: 'abc', platform: 'ios', token_type: 'apns' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/token_type must be expo or fcm/i);
  });

  it('returns { success: true } on valid registration', async () => {
    registerDeviceTokenMock.mockResolvedValue(undefined);
    const res = await request(createApp())
      .post('/api/device-tokens')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ token: 'ExponentPushToken[abc]', platform: 'android' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(registerDeviceTokenMock).toHaveBeenCalledWith(TEST_USER, 'ExponentPushToken[abc]', 'android', 'expo');
  });

  it('DELETE /:token returns { success: true }', async () => {
    const res = await request(createApp())
      .delete('/api/device-tokens/sometoken')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 500 when registerDeviceToken throws', async () => {
    registerDeviceTokenMock.mockRejectedValue(new Error('push service down'));
    const res = await request(createApp())
      .post('/api/device-tokens')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ token: 'abc', platform: 'ios' });
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Failed to register device token');
  });
});
