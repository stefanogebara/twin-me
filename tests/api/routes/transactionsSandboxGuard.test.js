/**
 * Sandbox render guard — replan-2026-06-10 Track D P0.
 *
 * Bug being pinned: 644/651 of the test user's transactions came from a Plaid
 * SANDBOX connection (ins_109508 "First Platypus Bank") and rendered as REAL
 * money (+1,234,467% P&L) on /money. The DB purge happens separately; these
 * tests guarantee sandbox-flagged connections can never render as real again:
 *
 *   1. GET /api/transactions (+ /timeline-analysis) excludes plaid-sourced
 *      rows when the user's only Plaid connections are sandbox and the
 *      runtime is production (NODE_ENV=production or PLAID_ENV!=sandbox).
 *   2. GET /api/plaid/holdings skips sandbox connections entirely (no Plaid
 *      call, no fake portfolio).
 *   3. GET /api/transactions/pluggy/connections hides sandbox rows so the FE
 *      renders the connect/empty state instead of "First Platypus CONNECTED".
 *   4. Sandbox-dev runtime (PLAID_ENV=sandbox, non-production) is unaffected.
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

// ── per-test table state + query log ────────────────────────────────────────
let tableData;
let queryLog;

const CHAIN_METHODS = [
  'select', 'eq', 'neq', 'is', 'not', 'in', 'or', 'gte', 'lte', 'lt',
  'order', 'range', 'limit', 'update', 'upsert',
];

function makeBuilder(table) {
  const builder = {};
  for (const m of CHAIN_METHODS) {
    builder[m] = (...args) => {
      queryLog.push({ table, method: m, args });
      return builder;
    };
  }
  builder.maybeSingle = async () => ({ data: (tableData[table] || [])[0] ?? null, error: null });
  builder.single = async () => ({ data: (tableData[table] || [])[0] ?? null, error: null });
  // Awaiting the builder resolves the whole table — filtering is asserted via
  // queryLog (the DB applies filters in prod; here we pin that they were sent).
  builder.then = (resolve, reject) =>
    Promise.resolve({ data: tableData[table] || [], error: null }).then(resolve, reject);
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

// Keep the transactions route import light — none of these are under test.
vi.mock('../../../api/services/transactions/parserDispatcher.js', () => ({
  parseBankStatement: vi.fn(),
}));
vi.mock('../../../api/services/transactions/transactionEmotionTagger.js', () => ({
  tagTransactionsBatch: vi.fn(),
  getEffectiveEventTime: vi.fn(),
}));
vi.mock('../../../api/services/transactions/platformSignalExtractor.js', () => ({
  syncAllSignals: vi.fn(),
}));
vi.mock('../../../api/services/transactions/merchantNormalizer.js', () => ({
  normalizeMerchant: vi.fn((s) => ({ brand: s, category: 'other' })),
}));
vi.mock('../../../api/services/transactions/recurrenceDetector.js', () => ({
  detectAndMarkRecurring: vi.fn(),
  isNonSubscriptionRow: () => false,
}));
vi.mock('../../../api/services/transactions/pluggyClient.js', () => ({
  isPluggyConfigured: () => false,
  createConnectToken: vi.fn(),
  deleteItem: vi.fn(),
}));
// Plaid routes are parked behind the default-off money_plaid flag
// (replan-2026-06-10 Track D). Enable it here — the flag gate has its own
// dedicated test (plaidFlagGate.test.js); these tests pin the sandbox guard.
vi.mock('../../../api/services/featureFlagsService.js', () => ({
  getFeatureFlags: vi.fn(async () => ({ money_plaid: true })),
}));
vi.mock('../../../api/services/transactions/pluggyIngestion.js', () => ({
  upsertConnectionFromItem: vi.fn(),
  seedItemTransactions: vi.fn(),
}));

const TEST_USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const signToken = () => jwt.sign({ id: TEST_USER }, 'test-secret', { expiresIn: '1h' });

const transactionsRoutes = (await import('../../../api/routes/transactions.js')).default;
const plaidRoutes = (await import('../../../api/routes/plaid.js')).default;
const pluggyRoutes = (await import('../../../api/routes/pluggy.js')).default;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/transactions/pluggy', pluggyRoutes);
  app.use('/api/transactions', transactionsRoutes);
  app.use('/api/plaid', plaidRoutes);
  return app;
}

const SANDBOX_CONNECTION = {
  id: 'conn-sandbox-1',
  user_id: TEST_USER,
  provider: 'plaid',
  plaid_item_id: 'item-sandbox-1',
  plaid_institution_id: 'ins_109508',
  plaid_access_token_encrypted: 'enc:sandbox-token',
  connector_name: 'First Platypus Bank',
  is_sandbox: true,
  status: 'CONNECTED',
  deleted_at: null,
  created_at: '2026-05-17T00:00:00Z',
};

const LIVE_CONNECTION = {
  id: 'conn-live-1',
  user_id: TEST_USER,
  provider: 'plaid',
  plaid_item_id: 'item-live-1',
  plaid_institution_id: 'ins_56',
  plaid_access_token_encrypted: 'enc:live-token',
  connector_name: 'Chase',
  is_sandbox: false,
  status: 'CONNECTED',
  deleted_at: null,
  created_at: '2026-06-01T00:00:00Z',
};

function txExclusionCalls() {
  return queryLog.filter(
    (q) => q.table === 'user_transactions' && q.method === 'or' &&
      String(q.args[0] || '').includes('source_bank.neq.plaid'),
  );
}

describe('sandbox render guard (replan-2026-06-10 Track D P0)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryLog = [];
    tableData = {
      users: [{ email_verified: true, created_at: new Date().toISOString() }],
      user_bank_connections: [],
      user_transactions: [],
    };
    process.env.PLAID_ENV = 'production'; // guard-active runtime by default
  });

  it('GET /api/transactions excludes plaid rows when only sandbox connections exist', async () => {
    tableData.user_bank_connections = [SANDBOX_CONNECTION];
    const res = await request(createApp())
      .get('/api/transactions')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(txExclusionCalls().length).toBeGreaterThan(0);
  });

  it('GET /api/transactions/timeline-analysis applies the same exclusion', async () => {
    tableData.user_bank_connections = [SANDBOX_CONNECTION];
    const res = await request(createApp())
      .get('/api/transactions/timeline-analysis?window_days=30')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.window_days).toBe(30);
    expect(txExclusionCalls().length).toBeGreaterThan(0);
  });

  it('GET /api/transactions does NOT exclude plaid rows when a live plaid connection exists', async () => {
    tableData.user_bank_connections = [SANDBOX_CONNECTION, LIVE_CONNECTION];
    const res = await request(createApp())
      .get('/api/transactions')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(200);
    expect(txExclusionCalls().length).toBe(0);
  });

  it('GET /api/transactions leaves sandbox-dev runtime untouched', async () => {
    process.env.PLAID_ENV = 'sandbox';
    tableData.user_bank_connections = [SANDBOX_CONNECTION];
    const res = await request(createApp())
      .get('/api/transactions')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(200);
    expect(txExclusionCalls().length).toBe(0);
  });

  it('GET /api/plaid/holdings skips sandbox connections without calling Plaid', async () => {
    tableData.user_bank_connections = [SANDBOX_CONNECTION];
    const res = await request(createApp())
      .get('/api/plaid/holdings')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.holdings).toEqual([]);
    expect(res.body.itemsScanned).toBe(0);
    expect(getInvestmentHoldingsMock).not.toHaveBeenCalled();
  });

  it('GET /api/plaid/holdings still serves live (non-sandbox) connections', async () => {
    tableData.user_bank_connections = [LIVE_CONNECTION];
    getInvestmentHoldingsMock.mockResolvedValue({ accounts: [], securities: [], holdings: [] });
    const res = await request(createApp())
      .get('/api/plaid/holdings')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.itemsScanned).toBe(1);
    expect(getInvestmentHoldingsMock).toHaveBeenCalledTimes(1);
  });

  it('GET /api/transactions/pluggy/connections hides sandbox connections', async () => {
    tableData.user_bank_connections = [SANDBOX_CONNECTION];
    const res = await request(createApp())
      .get('/api/transactions/pluggy/connections')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.connections).toEqual([]);
  });

  it('GET /api/transactions/pluggy/connections keeps sandbox rows visible in sandbox dev', async () => {
    process.env.PLAID_ENV = 'sandbox';
    tableData.user_bank_connections = [SANDBOX_CONNECTION];
    const res = await request(createApp())
      .get('/api/transactions/pluggy/connections')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.connections.length).toBe(1);
  });
});

describe('sandboxGuard helpers', () => {
  it('flags known Plaid sandbox institutions and stored is_sandbox rows', async () => {
    const { isSandboxConnection } = await import('../../../api/services/transactions/sandboxGuard.js');
    expect(isSandboxConnection({ provider: 'plaid', plaid_institution_id: 'ins_109508' })).toBe(true);
    expect(isSandboxConnection({ provider: 'plaid', plaid_institution_id: 'ins_56', is_sandbox: true })).toBe(true);
    expect(isSandboxConnection({ provider: 'plaid', plaid_institution_id: 'ins_56' })).toBe(false);
    expect(isSandboxConnection({ provider: 'pluggy', plaid_institution_id: null })).toBe(false);
    expect(isSandboxConnection(null)).toBe(false);
  });

  it('shouldHideSandboxData follows NODE_ENV/PLAID_ENV', async () => {
    const { shouldHideSandboxData } = await import('../../../api/services/transactions/sandboxGuard.js');
    expect(shouldHideSandboxData({ NODE_ENV: 'production', PLAID_ENV: 'sandbox' })).toBe(true);
    expect(shouldHideSandboxData({ NODE_ENV: 'test', PLAID_ENV: 'production' })).toBe(true);
    expect(shouldHideSandboxData({ NODE_ENV: 'test', PLAID_ENV: 'sandbox' })).toBe(false);
    expect(shouldHideSandboxData({ NODE_ENV: 'development' })).toBe(false); // PLAID_ENV defaults to sandbox
  });
});
