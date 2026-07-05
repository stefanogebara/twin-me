/**
 * Smoke tests for api/routes/user-rules.js
 * Covers: auth guard, list shape, add validation (min length, max rules,
 * duplicate 409), delete index validation, downstream 500.
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

const getBlocksMock = vi.fn();
const updateBlockMock = vi.fn();

vi.mock('../../../api/services/coreMemoryService.js', () => ({
  getBlocks: (...a) => getBlocksMock(...a),
  updateBlock: (...a) => updateBlockMock(...a),
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

const userRulesRoutes = (await import('../../../api/routes/user-rules.js')).default;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/user-rules', userRulesRoutes);
  return app;
}

describe('user-rules routes smoke', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects unauthenticated GET with 401', async () => {
    const res = await request(createApp()).get('/api/user-rules');
    expect(res.status).toBe(401);
  });

  it('returns { rules, count, maxRules } list shape', async () => {
    getBlocksMock.mockResolvedValue({ user_rules: { content: "I'm vegan\nnever mention my ex" } });
    const res = await request(createApp())
      .get('/api/user-rules')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.rules)).toBe(true);
    expect(res.body.count).toBe(2);
    expect(res.body.maxRules).toBe(20);
  });

  it('returns 400 when rule is shorter than 3 chars', async () => {
    const res = await request(createApp())
      .post('/api/user-rules')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ rule: 'ab' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least 3 characters/i);
  });

  it('returns 400 when max rules reached', async () => {
    const twenty = Array.from({ length: 20 }, (_, i) => `rule ${i}`).join('\n');
    getBlocksMock.mockResolvedValue({ user_rules: { content: twenty } });
    const res = await request(createApp())
      .post('/api/user-rules')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ rule: 'one more rule' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Maximum 20 rules/i);
  });

  it('returns 409 when the rule already exists (case-insensitive)', async () => {
    getBlocksMock.mockResolvedValue({ user_rules: { content: "I'm Vegan" } });
    const res = await request(createApp())
      .post('/api/user-rules')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ rule: "i'm vegan" });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });

  it('adds a rule and returns { success, rules, count }', async () => {
    getBlocksMock.mockResolvedValue({ user_rules: { content: '' } });
    updateBlockMock.mockResolvedValue(undefined);
    const res = await request(createApp())
      .post('/api/user-rules')
      .set('Authorization', `Bearer ${signToken()}`)
      .send({ rule: 'I love hiking' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.rules).toContain('I love hiking');
    expect(res.body.count).toBe(1);
  });

  it('returns 400 for out-of-range delete index', async () => {
    getBlocksMock.mockResolvedValue({ user_rules: { content: 'only one rule' } });
    const res = await request(createApp())
      .delete('/api/user-rules/5')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid index/i);
  });

  it('returns 500 when getBlocks throws', async () => {
    getBlocksMock.mockRejectedValue(new Error('core memory down'));
    const res = await request(createApp())
      .get('/api/user-rules')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to fetch rules');
  });
});
