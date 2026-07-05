/**
 * Smoke tests for api/routes/journal.js
 * Covers: auth guard, POST content/mood/energy validation, PUT invalid-UUID,
 * list happy-path pagination shape, downstream 500.
 *
 * Note: journal.js constructs its own supabase client via createClient(), so
 * @supabase/supabase-js is mocked to yield a chainable stub. The auth
 * middleware's client (../services/database.js) is mocked separately.
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

// Result holder for journal.js's own client (list query terminates on .range()).
let listResult = { data: [], error: null, count: 0 };

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn(() => Promise.resolve(listResult)),
    })),
  })),
}));

vi.mock('../../../api/services/llmGateway.js', () => ({
  complete: vi.fn().mockResolvedValue({ content: '{}' }),
  TIER_ANALYSIS: 'analysis',
}));

vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { email_verified: true, created_at: new Date().toISOString() }, error: null }),
    })),
  },
  serverDb: {},
}));

const TEST_USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const signToken = () => jwt.sign({ id: TEST_USER }, 'test-secret', { expiresIn: '1h' });

const journalRoutes = (await import('../../../api/routes/journal.js')).default;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/journal', journalRoutes);
  return app;
}

describe('journal routes smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listResult = { data: [], error: null, count: 0 };
  });

  it('rejects unauthenticated GET /entries with 401', async () => {
    const res = await request(createApp()).get('/api/journal/entries');
    expect(res.status).toBe(401);
  });

  it('returns { entries, pagination } list shape', async () => {
    listResult = { data: [{ id: 'e1', content: 'hi' }], error: null, count: 1 };
    const res = await request(createApp())
      .get('/api/journal/entries')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.entries)).toBe(true);
    expect(res.body.pagination).toMatchObject({ page: 1, total: 1 });
  });

  it('POST /entries returns 400 when content is empty', async () => {
    const res = await request(createApp())
      .post('/api/journal/entries')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ content: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Content is required/i);
  });

  it('POST /entries returns 400 when content exceeds 10,000 chars', async () => {
    const res = await request(createApp())
      .post('/api/journal/entries')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ content: 'x'.repeat(10001) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/under 10,000 characters/i);
  });

  it('POST /entries returns 400 for an invalid mood', async () => {
    const res = await request(createApp())
      .post('/api/journal/entries')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ content: 'a good day', mood: 'euphoric' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid mood/i);
  });

  it('POST /entries returns 400 when energy_level is out of range', async () => {
    const res = await request(createApp())
      .post('/api/journal/entries')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ content: 'a good day', energy_level: 9 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Energy level must be between 1 and 5/i);
  });

  it('PUT /entries/:id returns 400 for a non-UUID id', async () => {
    const res = await request(createApp())
      .put('/api/journal/entries/not-a-uuid')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ content: 'updated' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid entry ID/i);
  });

  it('returns 500 when the list query errors', async () => {
    listResult = { data: null, error: { message: 'db down' }, count: null };
    const res = await request(createApp())
      .get('/api/journal/entries')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to fetch journal entries');
  });
});
