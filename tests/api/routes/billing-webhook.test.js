/**
 * Unit tests for the 4 event-type branches inside api/routes/billing.js
 * /webhook handler.
 *
 * Strategy: real Stripe SDK signature verification (using a test webhook
 * secret we sign payloads with), mocked supabase chain that captures every
 * upsert/update + their arguments, mocked stripe.subscriptions.retrieve to
 * return a realistic subscription object.
 *
 * Covers what the contract spec (billing-comprehensive) can NOT cover —
 * the actual DB writes that happen per event type, including the C1
 * idempotency table interaction.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import crypto from 'crypto';

// ── env ────────────────────────────────────────────────────────────────────────
process.env.NODE_ENV = 'test';
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_unused_in_unit';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_' + crypto.randomBytes(16).toString('hex');
process.env.VITE_APP_URL = 'https://example.com';

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// ── shared mock state — every test resets these ────────────────────────────────
let subscriptionsRetrieveImpl;
let supabaseCalls; // array of {table, method, args}
let existingByStripeSubId; // map sub id → user_id row
let webhookEventsTable; // Set of inserted event ids
let webhookEventInsertError; // optional: simulate insert failure

beforeEach(() => {
  subscriptionsRetrieveImpl = vi.fn().mockResolvedValue({
    id: 'sub_test_default',
    current_period_end: undefined, // mimic Stripe 2025+ API behaviour
    items: {
      data: [{
        price: { id: 'price_test_default' },
        current_period_end: 1781906231, // ~28 days out
      }],
    },
  });
  supabaseCalls = [];
  existingByStripeSubId = new Map();
  webhookEventsTable = new Set();
  webhookEventInsertError = null;
});

// ── module mocks ───────────────────────────────────────────────────────────────
vi.mock('stripe', () => {
  // Wrap the real Stripe SDK so constructEvent does real HMAC verification,
  // but stub subscriptions.retrieve so we don't hit Stripe's API in unit tests.
  return {
    default: class FakeStripe {
      constructor() {
        this.webhooks = {
          constructEvent: (...args) => realConstructEvent(...args),
        };
        this.subscriptions = {
          retrieve: (...args) => subscriptionsRetrieveImpl(...args),
        };
      }
    },
  };
});

// Capture real constructEvent by importing the real Stripe SDK BEFORE the mock takes effect.
// Easiest: re-implement the verification ourselves using crypto, mirroring Stripe's algorithm.
function realConstructEvent(rawBody, sigHeader, secret) {
  if (!sigHeader) throw new Error('No signature header');
  // Parse t= and v1= from header
  const parts = sigHeader.split(',').reduce((acc, p) => {
    const [k, v] = p.split('=');
    if (k && v) (acc[k] ||= []).push(v);
    return acc;
  }, {});
  const ts = parts.t?.[0];
  const sigs = parts.v1 || [];
  if (!ts || !sigs.length) throw new Error('Malformed signature header');
  const tolerance = 5 * 60; // 5 min (Stripe default)
  if (Math.abs(Math.floor(Date.now() / 1000) - parseInt(ts, 10)) > tolerance) {
    throw new Error('Timestamp outside the tolerance zone');
  }
  const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  const signedPayload = `${ts}.${body}`;
  const expected = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');
  const ok = sigs.some((s) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(s, 'hex'));
    } catch { return false; }
  });
  if (!ok) throw new Error('No signatures found matching the expected signature');
  return JSON.parse(body);
}

vi.mock('../../../api/services/database.js', () => {
  // Build a supabase chain that records every operation against
  // user_subscriptions and stripe_webhook_events, while supporting the
  // single() lookup by stripe_subscription_id used by the handler.
  function table(name) {
    const ctx = { name, lastEq: null };
    const chain = {
      insert: (row) => {
        supabaseCalls.push({ table: name, method: 'insert', args: row });
        if (name === 'stripe_webhook_events') {
          if (webhookEventInsertError) return Promise.resolve({ error: webhookEventInsertError });
          if (webhookEventsTable.has(row.event_id)) {
            return Promise.resolve({ error: { code: '23505', message: 'duplicate key' } });
          }
          webhookEventsTable.add(row.event_id);
          return Promise.resolve({ error: null });
        }
        return Promise.resolve({ error: null });
      },
      upsert: (row, opts) => {
        supabaseCalls.push({ table: name, method: 'upsert', args: row, opts });
        return Promise.resolve({ error: null });
      },
      update: (row) => {
        const next = {
          eq: (col, val) => {
            supabaseCalls.push({ table: name, method: 'update', args: row, where: { [col]: val } });
            return Promise.resolve({ error: null });
          },
        };
        return next;
      },
      delete: () => ({
        eq: (col, val) => {
          supabaseCalls.push({ table: name, method: 'delete', where: { [col]: val } });
          return Promise.resolve({ error: null });
        },
      }),
      select: () => ({
        eq: (col, val) => ({
          single: () => {
            if (name === 'user_subscriptions' && col === 'stripe_subscription_id') {
              const row = existingByStripeSubId.get(val);
              return Promise.resolve({ data: row || null, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          },
        }),
      }),
    };
    return chain;
  }
  return {
    supabaseAdmin: {
      from: (name) => table(name),
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    },
  };
});

vi.mock('../../../api/services/subscriptionService.js', () => ({
  getUserSubscription: vi.fn().mockResolvedValue({ plan: 'free', status: 'active' }),
  PLAN_DISPLAY_NAMES: { free: 'Free', pro: 'Plus', max: 'Pro' },
}));

vi.mock('../../../api/middleware/auth.js', () => ({
  authenticateToken: (req, _res, next) => { req.user = { id: 'mock-user' }; next(); },
  userRateLimit: () => (_req, _res, next) => next(),
}));

vi.mock('../../../api/services/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

// ── helpers ────────────────────────────────────────────────────────────────────
function signPayload(payload, secret = WEBHOOK_SECRET) {
  const ts = Math.floor(Date.now() / 1000);
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const signed = `${ts}.${body}`;
  const sig = crypto.createHmac('sha256', secret).update(signed, 'utf8').digest('hex');
  return { header: `t=${ts},v1=${sig}`, body };
}

function findCall(table, method, predicate = () => true) {
  return supabaseCalls.find((c) => c.table === table && c.method === method && predicate(c));
}

// ── import billing route AFTER mocks ───────────────────────────────────────────
const billingRoutes = (await import('../../../api/routes/billing.js')).default;

function app() {
  const a = express();
  // Match server mount order — billing BEFORE express.json (raw body for /webhook).
  a.use('/api/billing', billingRoutes);
  a.use(express.json());
  return a;
}

// ═════════════════════════════════════════════════════════════════════════════════
// Branch 1 — checkout.session.completed
// ═════════════════════════════════════════════════════════════════════════════════

describe('webhook: checkout.session.completed', () => {
  it('upserts user_subscriptions with plan=pro, stores period_end from items[0]', async () => {
    const event = {
      id: 'evt_test_co_complete_' + Date.now(),
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_xxx',
          customer: 'cus_test_xxx',
          subscription: 'sub_test_xxx',
          metadata: { userId: '167c27b5', plan: 'pro' },
        },
      },
    };
    const { header, body } = signPayload(event);
    const res = await request(app())
      .post('/api/billing/webhook')
      .set('stripe-signature', header)
      .set('content-type', 'application/json')
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: true });

    // Idempotency record inserted
    expect(findCall('stripe_webhook_events', 'insert', (c) => c.args.event_id === event.id)).toBeTruthy();

    // user_subscriptions upserted with the expected fields
    const upsert = findCall('user_subscriptions', 'upsert');
    expect(upsert).toBeTruthy();
    expect(upsert.args).toMatchObject({
      user_id: '167c27b5',
      plan: 'pro',
      status: 'active',
      stripe_customer_id: 'cus_test_xxx',
      stripe_subscription_id: 'sub_test_xxx',
      stripe_price_id: 'price_test_default',
    });
    // current_period_end was resolved via the items[0] path (defensive accessor)
    expect(upsert.args.current_period_end).toBe(new Date(1781906231 * 1000).toISOString());
    expect(upsert.opts).toMatchObject({ onConflict: 'user_id' });
  });

  it('rejects bad metadata.plan as a safety net (logs + no DB write)', async () => {
    const event = {
      id: 'evt_test_bad_plan_' + Date.now(),
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_yyy',
          customer: 'cus_y',
          subscription: 'sub_y',
          metadata: { userId: 'u1', plan: 'plus' }, // 'plus' is the FE display name — never reaches webhook in normal flow
        },
      },
    };
    const { header, body } = signPayload(event);
    const res = await request(app())
      .post('/api/billing/webhook')
      .set('stripe-signature', header)
      .set('content-type', 'application/json')
      .send(body);

    expect(res.status).toBe(200);
    expect(findCall('user_subscriptions', 'upsert')).toBeFalsy(); // no DB write
  });

  it('replayed event with same event.id is short-circuited to 200', async () => {
    const event = {
      id: 'evt_test_replay_' + Date.now(),
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_r', customer: 'cus_r', subscription: 'sub_r', metadata: { userId: 'u', plan: 'pro' } } },
    };
    const { header, body } = signPayload(event);

    // first delivery
    const r1 = await request(app()).post('/api/billing/webhook').set('stripe-signature', header).set('content-type', 'application/json').send(body);
    expect(r1.status).toBe(200);
    expect(r1.body.duplicate).toBeUndefined();
    const upsertsAfterFirst = supabaseCalls.filter((c) => c.table === 'user_subscriptions' && c.method === 'upsert').length;

    // second delivery with same id (Stripe retry / replay attempt)
    const r2 = await request(app()).post('/api/billing/webhook').set('stripe-signature', header).set('content-type', 'application/json').send(body);
    expect(r2.status).toBe(200);
    expect(r2.body).toMatchObject({ received: true, duplicate: true });

    // No second upsert
    const upsertsAfterSecond = supabaseCalls.filter((c) => c.table === 'user_subscriptions' && c.method === 'upsert').length;
    expect(upsertsAfterSecond).toBe(upsertsAfterFirst);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════
// Branch 2 — customer.subscription.updated
// ═════════════════════════════════════════════════════════════════════════════════

describe('webhook: customer.subscription.updated', () => {
  it('updates status + current_period_end + cancel_at_period_end on the matching row', async () => {
    existingByStripeSubId.set('sub_existing', { user_id: 'user-abc' });

    const event = {
      id: 'evt_test_sub_upd_' + Date.now(),
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_existing',
          status: 'past_due',
          cancel_at_period_end: true,
          // 2025+ API shape — current_period_end only on items[0]
          items: { data: [{ current_period_end: 1781999999 }] },
        },
      },
    };
    const { header, body } = signPayload(event);
    const res = await request(app()).post('/api/billing/webhook').set('stripe-signature', header).set('content-type', 'application/json').send(body);

    expect(res.status).toBe(200);
    const upd = findCall('user_subscriptions', 'update', (c) => c.where?.user_id === 'user-abc');
    expect(upd).toBeTruthy();
    expect(upd.args).toMatchObject({
      status: 'past_due',
      cancel_at_period_end: true,
      current_period_end: new Date(1781999999 * 1000).toISOString(),
    });
  });

  it('no-ops silently when the subscription is unknown', async () => {
    const event = {
      id: 'evt_test_sub_upd_unknown_' + Date.now(),
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_NOT_IN_DB', status: 'active', cancel_at_period_end: false, items: { data: [{ current_period_end: 1782000000 }] } } },
    };
    const { header, body } = signPayload(event);
    const res = await request(app()).post('/api/billing/webhook').set('stripe-signature', header).set('content-type', 'application/json').send(body);

    expect(res.status).toBe(200);
    expect(findCall('user_subscriptions', 'update')).toBeFalsy();
  });
});

// ═════════════════════════════════════════════════════════════════════════════════
// Branch 3 — invoice.payment_failed
// ═════════════════════════════════════════════════════════════════════════════════

describe('webhook: invoice.payment_failed', () => {
  it('sets status to past_due on the user_subscriptions row', async () => {
    existingByStripeSubId.set('sub_failing', { user_id: 'user-fail' });
    const event = {
      id: 'evt_test_inv_fail_' + Date.now(),
      type: 'invoice.payment_failed',
      data: { object: { id: 'in_xxx', subscription: 'sub_failing' } },
    };
    const { header, body } = signPayload(event);
    const res = await request(app()).post('/api/billing/webhook').set('stripe-signature', header).set('content-type', 'application/json').send(body);

    expect(res.status).toBe(200);
    const upd = findCall('user_subscriptions', 'update', (c) => c.where?.user_id === 'user-fail');
    expect(upd).toBeTruthy();
    expect(upd.args).toMatchObject({ status: 'past_due' });
  });

  it('does nothing for an invoice with no subscription (one-off invoice)', async () => {
    const event = {
      id: 'evt_test_inv_no_sub_' + Date.now(),
      type: 'invoice.payment_failed',
      data: { object: { id: 'in_oneoff', subscription: null } },
    };
    const { header, body } = signPayload(event);
    const res = await request(app()).post('/api/billing/webhook').set('stripe-signature', header).set('content-type', 'application/json').send(body);

    expect(res.status).toBe(200);
    expect(findCall('user_subscriptions', 'update')).toBeFalsy();
  });
});

// ═════════════════════════════════════════════════════════════════════════════════
// Branch 4 — customer.subscription.deleted
// ═════════════════════════════════════════════════════════════════════════════════

describe('webhook: customer.subscription.deleted', () => {
  it('downgrades to free and clears stripe_subscription_id', async () => {
    existingByStripeSubId.set('sub_canceled', { user_id: 'user-canceled' });
    const event = {
      id: 'evt_test_sub_del_' + Date.now(),
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_canceled' } },
    };
    const { header, body } = signPayload(event);
    const res = await request(app()).post('/api/billing/webhook').set('stripe-signature', header).set('content-type', 'application/json').send(body);

    expect(res.status).toBe(200);
    const upd = findCall('user_subscriptions', 'update', (c) => c.where?.user_id === 'user-canceled');
    expect(upd).toBeTruthy();
    expect(upd.args).toMatchObject({
      plan: 'free',
      status: 'canceled',
      stripe_subscription_id: null,
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════════
// Generic — signature failures
// ═════════════════════════════════════════════════════════════════════════════════

describe('webhook: signature gate', () => {
  it('400s when stripe-signature header is missing', async () => {
    const res = await request(app()).post('/api/billing/webhook').set('content-type', 'application/json').send('{}');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Invalid webhook signature' });
  });

  it('400s when signature is wrong', async () => {
    const res = await request(app())
      .post('/api/billing/webhook')
      .set('stripe-signature', 't=1700000000,v1=00000000000000000000000000000000')
      .set('content-type', 'application/json')
      .send('{}');
    expect(res.status).toBe(400);
  });

  it('400s when payload was tampered after signing', async () => {
    const event = { id: 'e', type: 'x', data: { object: {} } };
    const { header, body } = signPayload(event);
    const tampered = body.replace('"x"', '"checkout.session.completed"');
    const res = await request(app())
      .post('/api/billing/webhook')
      .set('stripe-signature', header)
      .set('content-type', 'application/json')
      .send(tampered);
    expect(res.status).toBe(400);
  });
});
