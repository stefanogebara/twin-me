/**
 * Pin tests for POST /api/extension/capture/:platform (api/routes/extension-data.js).
 *
 * Context (lint audit 2026-07-02): the route file carried two duplicate-key
 * lint errors — 'capture' appeared twice in the mapEventType mapping object,
 * and `dataType` appeared twice in the success response literal. In JS the
 * LATER key wins, so runtime behavior was:
 *   - mapEventType('capture') → 'activity'   (NOT 'extension_video_watch')
 *   - response.dataType → the RAW client value (NOT the mapped data_type)
 * The fix removes the EARLIER (dead) key in each pair, which must be
 * byte-identical in behavior. These tests pin that current behavior so the
 * cleanup cannot silently flip either value.
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

const { insertMock, singleMock, ingestWebObservationsMock } = vi.hoisted(() => ({
  insertMock: vi.fn(),
  singleMock: vi.fn(),
  ingestWebObservationsMock: vi.fn(),
}));

vi.mock('../../../api/config/supabase.js', () => {
  const builder = {
    insert: (...args) => {
      insertMock(...args);
      return builder;
    },
    select: () => builder,
    single: (...args) => singleMock(...args),
  };
  return {
    supabase: {},
    supabaseAdmin: { from: () => builder },
    default: {},
  };
});

vi.mock('../../../api/services/observationIngestion.js', () => ({
  ingestWebObservations: (...a) => ingestWebObservationsMock(...a),
}));

// auth middleware's email-verification check dynamically imports services/database.js
vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { email_verified: true, created_at: new Date().toISOString() },
        error: null,
      }),
    })),
  },
  serverDb: {},
}));

const TEST_USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const signToken = () => jwt.sign({ id: TEST_USER }, 'test-secret', { expiresIn: '1h' });

const extensionRoutes = (await import('../../../api/routes/extension-data.js')).default;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/extension', extensionRoutes);
  return app;
}

describe('POST /api/extension/capture/:platform — duplicate-key behavior pins', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    singleMock.mockResolvedValue({ data: { id: 'row-1' }, error: null });
    ingestWebObservationsMock.mockResolvedValue(undefined);
  });

  it("maps eventType 'capture' to data_type 'activity' (later duplicate key won)", async () => {
    const res = await request(createApp())
      .post('/api/extension/capture/netflix')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ eventType: 'capture', title: 'Some Show' });

    expect(res.status).toBe(200);
    expect(insertMock).toHaveBeenCalledTimes(1);
    // Pin: 'capture' → 'activity', NOT 'extension_video_watch' (the dead earlier key)
    expect(insertMock.mock.calls[0][0]).toMatchObject({
      user_id: TEST_USER,
      platform: 'netflix',
      data_type: 'activity',
    });
  });

  it('response dataType echoes the RAW client value, not the mapped data_type (later duplicate key won)', async () => {
    const res = await request(createApp())
      .post('/api/extension/capture/netflix')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ data_type: 'watch', title: 'Some Show' });

    expect(res.status).toBe(200);
    // DB insert stores the MAPPED value...
    expect(insertMock.mock.calls[0][0]).toMatchObject({ data_type: 'extension_video_watch' });
    // ...but the response returns the raw client value (current behavior — pinned)
    expect(res.body).toMatchObject({
      success: true,
      id: 'row-1',
      platform: 'netflix',
      dataType: 'watch',
    });
  });

  it("response dataType falls back to 'capture' when the client sends neither data_type nor eventType", async () => {
    const res = await request(createApp())
      .post('/api/extension/capture/netflix')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ title: 'Some Show' });

    expect(res.status).toBe(200);
    expect(insertMock.mock.calls[0][0]).toMatchObject({ data_type: 'activity' });
    expect(res.body.dataType).toBe('capture');
  });
});
