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

// The route graph also reaches api/config/supabase.js (via
// transactionNudgeService → whatsappService), which throws at import time
// without Supabase env (CI stubs it in ci.yml; a bare checkout has no .env).
vi.mock('../../../api/config/supabase.js', () => {
  const stub = { from: () => ({ insert: () => Promise.resolve({ error: null }) }) };
  return { supabase: stub, supabaseAdmin: stub, default: stub };
});

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

  // audit-2026-07-03 (money HIGH): Santander Magie XLSX rows reached the
  // upsert with NULL external_id — the (user_id, external_id) UNIQUE
  // constraint never fires on NULLs, so re-uploading the same statement
  // duplicated every transaction (double-rendered list, double-counted
  // summary). Pin the invariant at the route boundary: every row handed to
  // the upsert carries a dedup key, and the conflict target is the
  // constraint that makes re-uploads idempotent.
  describe('POST /upload dedup-key invariant (santander XLSX)', () => {
    it('upserts every parsed row with a non-null external_id on (user_id, external_id)', async () => {
      const xlsx = (await import('xlsx')).default;
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(
        wb,
        xlsx.utils.aoa_to_sheet([
          ['', 'Data da Transação', 'Valor (R$)', 'Tipo', 'Descrição'],
          ['', '09/04/2026 14:00:00', '-1.595,34', 'Pix enviado', 'Murillo Henrique Nojosa Arruda'],
          ['', '27/04/2026 10:30:00', '-25,00', 'Pix enviado', 'Eduardo Campbell Rodrigues Barbosa'],
        ]),
        'Extrato Magie'
      );
      const fileBuf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

      // First awaited DB op in the handler is the transactions upsert.
      resultQueue.push({ data: [{ id: 'row-1' }, { id: 'row-2' }], error: null });

      const { supabaseAdmin } = await import('../../../api/services/database.js');
      const res = await request(createApp())
        .post('/api/transactions/upload')
        .set('Authorization', `Bearer ${signToken()}`)
        .attach('file', fileBuf, 'extrato-magie.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.source_bank).toBe('santander');
      expect(res.body.inserted).toBe(2);

      // Find the builder that received the upsert and inspect its payload.
      const fromMock = supabaseAdmin.from;
      const upsertCalls = fromMock.mock.results
        .map((r, i) => ({ table: fromMock.mock.calls[i][0], builder: r.value }))
        .filter((e) => e.table === 'user_transactions' && e.builder.upsert.mock.calls.length > 0)
        .flatMap((e) => e.builder.upsert.mock.calls);
      expect(upsertCalls.length).toBeGreaterThanOrEqual(1);

      const [rows, options] = upsertCalls[0];
      expect(options.onConflict).toBe('user_id,external_id');
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.external_id).toBeTruthy();
        expect(typeof row.external_id).toBe('string');
      }
      // Distinct rows, distinct keys — a constant id would collapse the batch.
      expect(new Set(rows.map((r) => r.external_id)).size).toBe(rows.length);
    });
  });
});
