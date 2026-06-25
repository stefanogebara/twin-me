/**
 * Post-aggregator-removal smoke tests for api/routes/transactions.js
 * ===================================================================
 * Receipt for replan-2026-06-12: bank aggregators (Pluggy/Plaid/TrueLayer)
 * were removed. These tests prove the provider-agnostic transaction surface
 * survived the surgery:
 *   1. The route module's import graph resolves (no dangling imports of
 *      deleted modules like sandboxGuard / pluggyClient / plaidClient).
 *   2. GET /summary, /, /timeline-analysis, /recurring-subscriptions return
 *      the standard envelope with CSV-sourced fixture rows (no sandbox
 *      filtering required anymore — fake rows were purged in the DB).
 *   3. Auth guard intact.
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

// Chainable, awaitable supabase query stub. Every chained method returns the
// builder; awaiting it resolves { data, error } from the queue (FIFO) so a
// route that runs several queries in one request gets distinct results.
const resultQueue = [];
function makeBuilder() {
  const builder = {};
  const chain = [
    'select', 'eq', 'neq', 'gte', 'lte', 'lt', 'gt', 'in', 'is', 'not',
    'order', 'limit', 'range', 'single', 'maybeSingle', 'insert', 'upsert',
    'update', 'delete', 'like', 'ilike',
  ];
  for (const m of chain) builder[m] = vi.fn(() => builder);
  builder.then = (resolve, reject) => {
    const next = resultQueue.length ? resultQueue.shift() : { data: [], error: null };
    return Promise.resolve(next).then(resolve, reject);
  };
  return builder;
}

vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: { from: vi.fn(() => makeBuilder()) },
  serverDb: {},
}));

// auth middleware hits the users table via its own import of database.js —
// the same mock serves it; authenticateUser only needs the JWT to decode.
vi.mock('../../../api/middleware/auth.js', () => ({
  authenticateUser: (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.replace(/^Bearer\s+/i, '');
    try {
      const payload = jwt.verify(token, 'test-secret');
      req.user = { id: payload.id || payload.userId };
      return next();
    } catch {
      return res.status(401).json({ success: false, error: 'unauthorized' });
    }
  },
}));

const TEST_USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const signToken = () => jwt.sign({ id: TEST_USER }, 'test-secret', { expiresIn: '1h' });

// The import itself is assertion #1: it throws if any deleted aggregator
// module (sandboxGuard, pluggyClient, plaidClient, ...) is still imported.
const transactionsRoutes = (await import('../../../api/routes/transactions.js')).default;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/transactions', transactionsRoutes);
  return app;
}

const CSV_ROW = {
  id: 'tx-1',
  amount: -120.5,
  currency: 'BRL',
  merchant_raw: 'IFOOD *RESTAURANTE',
  merchant_normalized: 'iFood',
  category: 'food_delivery',
  transaction_date: new Date().toISOString(),
  source_bank: 'santander',
  source: 'csv_upload',
  account_type: 'checking',
  is_recurring: false,
  created_at: new Date().toISOString(),
  emotional_context: null,
};

describe('transactions routes after aggregator removal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resultQueue.length = 0;
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(createApp()).get('/api/transactions/summary');
    expect(res.status).toBe(401);
  });

  it('GET /summary returns 200 envelope from CSV-sourced rows (no sandbox guard)', async () => {
    resultQueue.push({ data: [CSV_ROW], error: null });
    const res = await request(createApp())
      .get('/api/transactions/summary')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.transaction_count).toBe(1);
    expect(res.body.total_outflow).toBeCloseTo(120.5);
  });

  it('GET / returns 200 list envelope', async () => {
    resultQueue.push({ data: [CSV_ROW], error: null });
    const res = await request(createApp())
      .get('/api/transactions')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.transactions ?? res.body.data)).toBe(true);
  });

  it('GET /timeline-analysis returns 200 envelope', async () => {
    resultQueue.push({ data: [CSV_ROW], error: null });
    const res = await request(createApp())
      .get('/api/transactions/timeline-analysis')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /recurring-subscriptions returns 200 envelope', async () => {
    resultQueue.push({ data: [], error: null });
    const res = await request(createApp())
      .get('/api/transactions/recurring-subscriptions')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
