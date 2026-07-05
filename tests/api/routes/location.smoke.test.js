/**
 * Smoke tests for api/routes/location.js
 * Covers: auth guard, POST /clusters non-empty-array validation, POST /current
 * lat/lng-number validation, happy paths, GET /status shape.
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

const ingestLocationClustersMock = vi.fn().mockResolvedValue(undefined);

// Terminal results for the route's own queries
let updateResult = { error: null };
let statusCountResult = { count: 3, error: null };

vi.mock('../../../api/services/observationIngestion.js', () => ({
  ingestLocationClusters: (...a) => ingestLocationClustersMock(...a),
}));

vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: {
    from: vi.fn((table) => {
      if (table === 'users') {
        // Shared by both the auth middleware (select().eq().single()) and
        // POST /current (update().eq()). Chain returns terminal results.
        return {
          select: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          eq: vi.fn(function (col) {
            // auth path ends on .single(); /current path ends on .eq()
            // Return a thenable so `await db.from('users').update().eq()` resolves.
            return {
              single: vi.fn().mockResolvedValue({ data: { email_verified: true, created_at: new Date().toISOString() }, error: null }),
              then: (resolve) => resolve(updateResult),
            };
          }),
          single: vi.fn().mockResolvedValue({ data: { email_verified: true, created_at: new Date().toISOString() }, error: null }),
        };
      }
      // user_location_clusters: upsert (allSettled) + status count query
      return {
        upsert: vi.fn(() => Promise.resolve({ error: null })),
        select: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve(statusCountResult)),
        })),
      };
    }),
  },
  serverDb: {},
}));

const TEST_USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const signToken = () => jwt.sign({ id: TEST_USER }, 'test-secret', { expiresIn: '1h' });

const locationRoutes = (await import('../../../api/routes/location.js')).default;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/location', locationRoutes);
  return app;
}

describe('location routes smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateResult = { error: null };
    statusCountResult = { count: 3, error: null };
  });

  it('rejects unauthenticated POST /clusters with 401', async () => {
    const res = await request(createApp())
      .post('/api/location/clusters')
      .send({ clusters: [{ cluster_key: 'home' }] });
    expect(res.status).toBe(401);
  });

  it('POST /clusters returns 400 when clusters is empty', async () => {
    const res = await request(createApp())
      .post('/api/location/clusters')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ clusters: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/non-empty array/i);
  });

  it('POST /clusters returns 400 when clusters is not an array', async () => {
    const res = await request(createApp())
      .post('/api/location/clusters')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ clusters: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/non-empty array/i);
  });

  it('POST /clusters returns { success, clustersReceived } on valid input', async () => {
    const res = await request(createApp())
      .post('/api/location/clusters')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ clusters: [{ cluster_key: 'home', centroid_lat: 1, centroid_lng: 2 }] });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.clustersReceived).toBe(1);
    expect(ingestLocationClustersMock).toHaveBeenCalled();
  });

  it('POST /current returns 400 when latitude/longitude are not numbers', async () => {
    const res = await request(createApp())
      .post('/api/location/current')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ latitude: 'x', longitude: 'y' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/latitude and longitude are required numbers/i);
  });

  it('POST /current returns { success: true } on valid coords', async () => {
    const res = await request(createApp())
      .post('/api/location/current')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ latitude: 37.77, longitude: -122.41 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /status returns { success, clusterCount }', async () => {
    const res = await request(createApp())
      .get('/api/location/status')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.clusterCount).toBe(3);
  });
});
