/**
 * Plaid park gate — replan-2026-06-10 Track D.
 *
 * Plaid is sandbox-only in every deployment, so the whole /api/plaid router
 * sits behind the per-user `money_plaid` feature flag (default OFF, explicit
 * opt-in — same `=== true` pattern as llm_wiki). These tests pin:
 *
 *   1. Flag absent (default)  → every plaid endpoint 503s with PLAID_PARKED
 *      and never touches Plaid or the DB.
 *   2. Flag explicitly false  → same 503.
 *   3. Flag explicitly true   → requests pass through to the real handlers.
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
process.env.PLAID_CLIENT_ID = 'test-plaid-client';
process.env.PLAID_SECRET = 'test-plaid-secret';

// Mutable per-test flag state consumed by the featureFlagsService mock.
let mockFlags;

vi.mock('../../../api/services/featureFlagsService.js', () => ({
  getFeatureFlags: vi.fn(async () => mockFlags),
}));

// Minimal DB stub — only exercised when the gate lets a request through.
const dbCalls = [];
function makeBuilder(table) {
  const builder = {};
  for (const m of ['select', 'eq', 'is', 'not', 'order', 'limit', 'update']) {
    builder[m] = (...args) => {
      dbCalls.push({ table, method: m, args });
      return builder;
    };
  }
  builder.maybeSingle = async () => ({ data: null, error: null });
  builder.single = async () => ({ data: null, error: null });
  builder.then = (resolve, reject) =>
    Promise.resolve({ data: [], error: null }).then(resolve, reject);
  return builder;
}

vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: { from: (table) => makeBuilder(table) },
  serverDb: {},
}));

vi.mock('../../../api/services/encryption.js', () => ({
  decryptToken: () => 'plaid-access-token',
  encryptToken: (s) => `enc:${s}`,
}));

const getInvestmentHoldingsMock = vi.fn();
vi.mock('../../../api/services/transactions/plaidClient.js', () => ({
  isPlaidConfigured: () => true,
  createLinkToken: vi.fn(),
  exchangePublicToken: vi.fn(),
  removeItem: vi.fn(),
  getInvestmentHoldings: (...a) => getInvestmentHoldingsMock(...a),
}));

vi.mock('../../../api/services/transactions/plaidIngestion.js', () => ({
  bootstrapItem: vi.fn(),
  syncItem: vi.fn(),
}));

const TEST_USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const signToken = () => jwt.sign({ id: TEST_USER }, 'test-secret', { expiresIn: '1h' });

const plaidRoutes = (await import('../../../api/routes/plaid.js')).default;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/plaid', plaidRoutes);
  return app;
}

describe('plaid router money_plaid flag gate (replan-2026-06-10 Track D)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbCalls.length = 0;
    mockFlags = {}; // default: no rows → flag OFF
    process.env.PLAID_ENV = 'sandbox';
  });

  it('503s every endpoint with PLAID_PARKED when the flag is absent (default off)', async () => {
    const app = createApp();
    const endpoints = [
      { method: 'post', path: '/api/plaid/link/token' },
      { method: 'post', path: '/api/plaid/link/exchange' },
      { method: 'get', path: '/api/plaid/holdings' },
      { method: 'get', path: '/api/plaid/investment-activity' },
      { method: 'post', path: '/api/plaid/sync/conn-1' },
      { method: 'delete', path: '/api/plaid/connections/conn-1' },
    ];
    for (const { method, path } of endpoints) {
      const res = await request(app)[method](path)
        .set('Authorization', `Bearer ${signToken()}`);
      expect(res.status, `${method.toUpperCase()} ${path}`).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('PLAID_PARKED');
    }
    // Gate must short-circuit before any Plaid or DB work happens. (The auth
    // middleware's email-verification lookup hits `users` — that one is
    // upstream of the gate and allowed.)
    expect(getInvestmentHoldingsMock).not.toHaveBeenCalled();
    expect(dbCalls.filter((c) => c.table !== 'users').length).toBe(0);
  });

  it('503s when the flag row exists but is explicitly false', async () => {
    mockFlags = { money_plaid: false };
    const res = await request(createApp())
      .get('/api/plaid/holdings')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('PLAID_PARKED');
  });

  it('passes through to the real handler when money_plaid is explicitly true', async () => {
    mockFlags = { money_plaid: true };
    const res = await request(createApp())
      .get('/api/plaid/holdings')
      .set('Authorization', `Bearer ${signToken()}`);
    // No connections in the stub DB → empty holdings shape, NOT a 503.
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.holdings).toEqual([]);
    expect(dbCalls.some((c) => c.table === 'user_bank_connections')).toBe(true);
  });

  it('still requires auth before the flag gate (401 wins over 503)', async () => {
    const res = await request(createApp()).get('/api/plaid/holdings');
    expect(res.status).toBe(401);
  });
});
