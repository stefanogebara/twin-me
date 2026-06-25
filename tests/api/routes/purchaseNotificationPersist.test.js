/**
 * Tests for the notification-listener purchase persistence in
 * api/routes/purchase-notification.js (replan-2026-06-12).
 *
 * Contract: every authed /trigger call with a parseable amount inserts a
 * user_transactions row (source='notification', negative amount) BEFORE any
 * cooldown/filter gating — storage is unconditional, messaging stays gated.
 * No amount -> no insert, reflection flow untouched. Cross-source duplicate
 * within ±2h -> insert skipped.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
process.env.NODE_ENV = 'test';
process.env.PURCHASE_BOT_ENABLED = 'false'; // messaging path quiet — storage is what's under test

// ── Mocks ────────────────────────────────────────────────────────────────────
const dupMock = vi.fn().mockResolvedValue(null);
vi.mock('../../../api/services/transactions/whatsappTransactionCapture.js', () => ({
  findLikelyDuplicate: (...a) => dupMock(...a),
}));

const tagBatchMock = vi.fn().mockResolvedValue({ tagged: 1, errors: 0 });
vi.mock('../../../api/services/transactions/transactionEmotionTagger.js', () => ({
  tagTransactionsBatch: (...a) => tagBatchMock(...a),
}));

vi.mock('../../../api/services/purchaseContextBuilder.js', () => ({
  buildPurchaseContext: vi.fn().mockResolvedValue({ schedule: { available: false } }),
}));
vi.mock('../../../api/services/purchaseReflection.js', () => ({
  generatePurchaseReflection: vi.fn().mockResolvedValue({ text: 'r', lang: 'pt-BR' }),
}));
vi.mock('../../../api/services/whatsappService.js', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock('../../../api/services/purchaseCooldown.js', () => ({
  loadPurchaseCooldown: vi.fn().mockResolvedValue({ last_sent_at: null, day_date: null, daily_count: 0 }),
  savePurchaseCooldown: vi.fn().mockResolvedValue(undefined),
  COOLDOWN_MS: 300000,
  MAX_DAILY: 2,
}));
vi.mock('../../../api/middleware/auth.js', () => ({
  authenticateUser: (req, res, next) => {
    try {
      const payload = jwt.verify((req.headers.authorization || '').replace(/^Bearer\s+/i, ''), 'test-secret');
      req.user = { id: payload.id };
      return next();
    } catch {
      return res.status(401).json({ error: 'unauthorized' });
    }
  },
}));

const resultQueue = [];
const upsertCalls = [];
vi.mock('../../../api/services/database.js', () => {
  function makeBuilder(table) {
    const builder = {};
    const chain = ['select', 'eq', 'neq', 'in', 'gte', 'lte', 'lt', 'order', 'limit', 'maybeSingle', 'single', 'insert'];
    for (const m of chain) builder[m] = vi.fn(() => builder);
    builder.upsert = vi.fn((rows, opts) => {
      upsertCalls.push({ table, rows: Array.isArray(rows) ? rows : [rows], opts });
      return builder;
    });
    builder.then = (resolve, reject) => {
      const next = resultQueue.length ? resultQueue.shift() : { data: [], error: null };
      return Promise.resolve(next).then(resolve, reject);
    };
    return builder;
  }
  return { supabaseAdmin: { from: vi.fn((table) => makeBuilder(table)) } };
});

const routes = (await import('../../../api/routes/purchase-notification.js')).default;

const TEST_USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const token = () => jwt.sign({ id: TEST_USER }, 'test-secret', { expiresIn: '1h' });

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/purchase-notification', routes);
  return app;
}

function trigger(body) {
  return request(createApp())
    .post('/api/purchase-notification/trigger')
    .set('Authorization', `Bearer ${token()}`)
    .send(body);
}

beforeEach(() => {
  vi.clearAllMocks();
  dupMock.mockResolvedValue(null);
  resultQueue.length = 0;
  upsertCalls.length = 0;
});

describe('purchase-notification persistence', () => {
  it('inserts a notification transaction before the messaging gates', async () => {
    resultQueue.push({ data: [{ id: 'tx-notif-1' }], error: null }); // upsert .select('id')
    const res = await trigger({ appName: 'iFood', notificationText: 'Pedido confirmado — R$ 45,50', amount: 'R$ 45,50' });
    expect(res.status).toBe(200);

    const up = upsertCalls.find(c => c.table === 'user_transactions');
    expect(up).toBeTruthy();
    const row = up.rows[0];
    expect(row.source).toBe('notification');
    expect(row.amount).toBeCloseTo(-45.5);
    expect(row.currency).toBe('BRL');
    expect(row.account_type).toBe('credit_card');
    expect(row.merchant_normalized).toBe('iFood');
    expect(row.external_id).toMatch(/^notif:[0-9a-f]{40}$/);
    expect(up.opts.onConflict).toBe('user_id,external_id');
    expect(tagBatchMock).toHaveBeenCalledWith(TEST_USER, ['tx-notif-1']);
  });

  it('storage happens even when the reflection is gated off (kill switch)', async () => {
    // PURCHASE_BOT_ENABLED=false in env: route may still gate messaging via
    // its own flow; storage must have happened regardless.
    resultQueue.push({ data: [{ id: 'tx-2' }], error: null });
    await trigger({ appName: 'Rappi', notificationText: 'Compra realizada R$ 200,00', amount: 'R$ 200,00' });
    expect(upsertCalls.some(c => c.table === 'user_transactions')).toBe(true);
  });

  it('no parseable amount -> no insert, endpoint still responds', async () => {
    const res = await trigger({ appName: 'iFood', notificationText: 'Seu pedido saiu para entrega' });
    expect(res.status).toBe(200);
    expect(upsertCalls.filter(c => c.table === 'user_transactions')).toHaveLength(0);
    expect(tagBatchMock).not.toHaveBeenCalled();
  });

  it('cross-source duplicate within the window skips the insert', async () => {
    dupMock.mockResolvedValue({ id: 'existing-wa-tx', source: 'whatsapp' });
    const res = await trigger({ appName: 'iFood', notificationText: 'Pedido confirmado — R$ 45,50', amount: 'R$ 45,50' });
    expect(res.status).toBe(200);
    expect(dupMock).toHaveBeenCalledWith(TEST_USER, expect.objectContaining({ amount: -45.5, excludeSource: 'notification' }));
    expect(upsertCalls.filter(c => c.table === 'user_transactions')).toHaveLength(0);
  });

  it('insert failure is non-fatal — the endpoint still completes', async () => {
    resultQueue.push({ data: null, error: { message: 'insert exploded' } });
    const res = await trigger({ appName: 'iFood', notificationText: 'Pedido confirmado — R$ 45,50', amount: 'R$ 45,50' });
    expect(res.status).toBe(200);
    expect(tagBatchMock).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(createApp())
      .post('/api/purchase-notification/trigger')
      .send({ notificationText: 'x' });
    expect(res.status).toBe(401);
  });
});
