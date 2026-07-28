// api/routes/billing.js
//
// Stripe billing routes. Security model:
//   - All routes except /webhook require JWT auth (Bearer header — sent
//     from localStorage by the FE). This means CSRF is structurally
//     impossible: a cross-origin form can't set custom headers.
//   - /webhook is intentionally unauthenticated — Stripe is the caller —
//     and the only barrier is the HMAC signature check (constructEvent)
//     plus the 5-minute timestamp tolerance Stripe enforces.
//
import express from 'express';
import Stripe from 'stripe';
import { authenticateToken, userRateLimit } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/database.js';
import { getUserSubscription } from '../services/subscriptionService.js';
import { createLogger } from '../services/logger.js';
import { assertProdAppUrl } from '../utils/prodEnvAssertions.js';

const log = createLogger('Billing');

const router = express.Router();
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const APP_URL = process.env.VITE_APP_URL || 'http://localhost:8086';
const isDev = process.env.NODE_ENV === 'development';
const safeError = (err) => isDev ? err.message : 'Internal server error';

if (!stripe) {
  log.warn('STRIPE_SECRET_KEY not set — billing routes disabled');
}

// Audit L2: if APP_URL falls back to localhost in production, every Stripe
// checkout redirect (success_url, cancel_url, billingPortal return_url)
// would point at localhost — users paying through Stripe land on a dead
// URL after success. Loud-fail at module load instead of silently shipping
// the broken redirect.
assertProdAppUrl(process.env, log);

// The billing router is mounted in api/server.js BEFORE express.json because
// the /webhook route needs the raw request body for Stripe signature
// verification. That means every other billing route is reached BEFORE the
// global JSON parser runs — re-add it per-route for JSON-body routes here.
const jsonBody = express.json({ limit: '32kb' });

// Per-user limit on the Stripe-touching mutating routes. The general
// per-IP apiLimiter would let an authed attacker create hundreds of
// checkout/portal sessions across NAT'd peers. 6/min is enough headroom for
// a fat-finger double-click + a couple of retries; anything beyond that is
// abuse.
const billingMutateLimiter = userRateLimit(6, 60 * 1000);

// Stripe moved current_period_end from the subscription root to the
// subscription item in newer API versions (2025-01.acacia and later).
// Read defensively so we don't crash on whichever version Stripe picks up
// from the account.
function getCurrentPeriodEnd(stripeSub) {
  return stripeSub?.current_period_end
    ?? stripeSub?.items?.data?.[0]?.current_period_end
    ?? null;
}
function periodEndIso(stripeSub) {
  const ts = getCurrentPeriodEnd(stripeSub);
  return ts ? new Date(ts * 1000).toISOString() : null;
}

// ─── Webhook idempotency ────────────────────────────────────────────────────
//
// Audit C1: without this, a Stripe retry of customer.subscription.deleted
// could downgrade a paying user a second time. constructEvent verifies the
// signature, but says nothing about "already saw this event".
//
// Strategy:
//   1. Try to INSERT event.id into stripe_webhook_events.
//   2. On unique-violation (23505), short-circuit to 200 — already processed.
//   3. On any other DB error (table missing, DB down), DO NOT block the
//      webhook. Log and continue. The downstream handlers use UPSERTs and
//      tolerate duplicate runs, so we degrade gracefully when the
//      idempotency table is unavailable.
//   4. On processing failure AFTER the record was inserted, delete the
//      record so the next Stripe retry can re-process. Otherwise the
//      handler would silently no-op on retry and the state would never
//      recover.
//
// The table is created by database/supabase/migrations/20260515_create_stripe_webhook_events.sql.

async function markEventReceived(eventId, eventType) {
  const { error } = await supabaseAdmin
    .from('stripe_webhook_events')
    .insert({ event_id: eventId, event_type: eventType });

  if (!error) return 'inserted';
  if (error.code === '23505') return 'duplicate';
  // Anything else: log + continue without the idempotency guard.
  log.warn('webhook: idempotency record failed, processing anyway', {
    eventId, eventType, code: error.code, message: error.message,
  });
  return 'best-effort';
}

async function rollbackEventReceived(eventId) {
  // Only the first delivery's INSERT lands; on subsequent retries the
  // INSERT short-circuits before processing, so deleting here is always
  // safe.
  const { error } = await supabaseAdmin
    .from('stripe_webhook_events')
    .delete()
    .eq('event_id', eventId);
  if (error) {
    log.warn('webhook: idempotency rollback failed', {
      eventId, code: error.code, message: error.message,
    });
  }
}

// POST /api/billing/webhook  (raw body — must be mounted BEFORE express.json)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Billing not configured' });
  }
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    log.error('STRIPE_WEBHOOK_SECRET not configured');
    return res.status(503).json({ error: 'Webhook verification not configured' });
  }
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  const seen = await markEventReceived(event.id, event.type);
  if (seen === 'duplicate') {
    log.info('webhook: duplicate event ignored', { eventId: event.id, type: event.type });
    return res.status(200).json({ received: true, duplicate: true });
  }

  let recordedThisRun = seen === 'inserted';

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const { userId, plan } = session.metadata || {};
        // Metadata.plan is now always a DB enum value ('pro' or 'max') — the
        // /checkout handler maps display names ('plus'/'pro') to DB values
        // before passing them to Stripe. Belt-and-suspenders: reject anything
        // outside the enum so a bad metadata write can never poison the row.
        if (!userId || !['pro', 'max'].includes(plan)) {
          log.error('checkout.session.completed: invalid metadata', {
            sessionId: session.id, userId, plan,
          });
          break;
        }
        const stripeSub = await stripe.subscriptions.retrieve(session.subscription);
        await supabaseAdmin.from('user_subscriptions').upsert({
          user_id: userId, plan, status: 'active',
          stripe_customer_id: session.customer,
          stripe_subscription_id: session.subscription,
          stripe_price_id: stripeSub.items.data[0].price.id,
          current_period_end: periodEndIso(stripeSub),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const { data: existing } = await supabaseAdmin
          .from('user_subscriptions').select('user_id').eq('stripe_subscription_id', sub.id).single();
        if (existing) {
          await supabaseAdmin.from('user_subscriptions').update({
            status: sub.status,
            current_period_end: periodEndIso(sub),
            cancel_at_period_end: sub.cancel_at_period_end,
            updated_at: new Date().toISOString(),
          }).eq('user_id', existing.user_id);
        }
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const sub = invoice.subscription;
        if (sub) {
          const { data: existing } = await supabaseAdmin
            .from('user_subscriptions').select('user_id').eq('stripe_subscription_id', sub).single();
          if (existing) {
            await supabaseAdmin.from('user_subscriptions').update({
              status: 'past_due',
              updated_at: new Date().toISOString(),
            }).eq('user_id', existing.user_id);
            log.warn('Payment failed', { userId: existing.user_id, invoice: invoice.id });
          }
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const { data: existing } = await supabaseAdmin
          .from('user_subscriptions').select('user_id').eq('stripe_subscription_id', sub.id).single();
        if (existing) {
          await supabaseAdmin.from('user_subscriptions').update({
            plan: 'free', status: 'canceled',
            stripe_subscription_id: null,
            updated_at: new Date().toISOString(),
          }).eq('user_id', existing.user_id);
        }
        break;
      }
    }
    res.json({ received: true });
  } catch (err) {
    // Audit M2: log structured fields, NOT the raw err object — error objects
    // from Stripe/Supabase can carry query fragments, object IDs, or other
    // internals that don't belong in log aggregators.
    log.error('webhook processing failed', {
      eventId: event.id,
      type: event.type,
      message: err.message,
      code: err.code,
      stripeType: err.type,
    });
    // Roll back the idempotency record so Stripe's retry can re-process.
    if (recordedThisRun) await rollbackEventReceived(event.id);
    res.status(500).json({ error: safeError(err) });
  }
});

// GET /api/billing/subscription
router.get('/subscription', authenticateToken, async (req, res) => {
  try {
    const sub = await getUserSubscription(req.user?.id);
    res.json({ subscription: sub });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// Plan naming mapping (single source of truth):
//   FE sends a DISPLAY name ('plus' or 'pro'). The server translates to a
//   DB enum value ('pro' or 'max') and a Stripe price ID. There is NO
//   alternate path that accepts DB keys directly — accepting both
//   vocabularies was the M1 audit finding, because 'pro' is ambiguous
//   (display Pro = $100 = DB max  vs  legacy DB pro = $20).
//
//   Display "Plus" ($20/mo) → DB 'pro' → env STRIPE_PRICE_PRO   (DB-keyed)
//   Display "Pro"  ($100/mo) → DB 'max' → env STRIPE_PRICE_MAX  (DB-keyed)
//
// IMPORTANT: env vars are DB-keyed to match the historical Vercel config.
// Earlier I switched the canonical names to display-keyed (STRIPE_PRICE_PLUS /
// STRIPE_PRICE_PRO) but discovered prod was charging $20 for "Pro" clicks
// because STRIPE_PRICE_PRO in Vercel had been set to the $20 Plus price
// 79 days ago under the DB-keyed convention. Reverting to DB-keyed canonicals
// here is the surgical fix — no env var renames, no transition window.
// Display-keyed aliases (STRIPE_PRICE_PLUS / STRIPE_PRICE_PRO_HIGH) are
// accepted as overrides for environments that prefer that vocabulary.
const PLAN_DISPLAY_TO_DB = Object.freeze({ plus: 'pro', pro: 'max' });

function priceIdForDbPlan(dbPlan) {
  if (dbPlan === 'pro') {
    // $20 Plus tier. STRIPE_PRICE_PRO is the canonical (DB-keyed) name;
    // STRIPE_PRICE_PLUS is the display-keyed alias for environments that
    // prefer it. Legacy: STRIPE_PLUS_PRICE_ID, STRIPE_PRO_PRICE_ID.
    return process.env.STRIPE_PRICE_PRO
        || process.env.STRIPE_PRICE_PLUS
        || process.env.STRIPE_PLUS_PRICE_ID
        || process.env.STRIPE_PRO_PRICE_ID
        || null;
  }
  // $100 Pro tier. STRIPE_PRICE_MAX is the canonical (DB-keyed) name;
  // STRIPE_PRICE_PRO_HIGH is the display-keyed alias. Legacy:
  // STRIPE_PRO_PRICE_ID_100, STRIPE_MAX_PRICE_ID.
  return process.env.STRIPE_PRICE_MAX
      || process.env.STRIPE_PRICE_PRO_HIGH
      || process.env.STRIPE_PRO_PRICE_ID_100
      || process.env.STRIPE_MAX_PRICE_ID
      || null;
}

// POST /api/billing/checkout
// jsonBody is added explicitly here — the router is mounted before the
// global express.json() so /webhook can use raw body for Stripe signature.
router.post('/checkout', jsonBody, authenticateToken, billingMutateLimiter, async (req, res) => {
  // Validate input BEFORE the Stripe-configured check — a malformed request
  // should always get a 400, regardless of whether the service is enabled.
  const { plan } = req.body || {};
  const dbPlan = PLAN_DISPLAY_TO_DB[plan];
  if (!dbPlan) return res.status(400).json({ error: 'Invalid plan' });

  if (!stripe) {
    return res.status(503).json({ error: 'Billing not configured' });
  }

  const priceId = priceIdForDbPlan(dbPlan);
  if (!priceId) {
    log.error('checkout: missing Stripe price env var', { dbPlan });
    return res.status(503).json({ error: 'Billing not configured', code: 'PRICE_NOT_CONFIGURED' });
  }

  try {
    const { data: existingSub } = await supabaseAdmin
      .from('user_subscriptions').select('stripe_customer_id').eq('user_id', req.user?.id).single();
    const { data: user } = await supabaseAdmin
      .from('users').select('email, first_name').eq('id', req.user?.id).single();

    let customerId = existingSub?.stripe_customer_id;
    if (!customerId) {
      // Audit C2: use a Stripe idempotency key keyed on userId so two
      // simultaneous /checkout calls (double-click, parallel tabs, retry)
      // resolve to the SAME Stripe customer — Stripe dedupes server-side.
      // Without this, a race created two customers and the losing upsert
      // orphaned one in Stripe forever.
      const customer = await stripe.customers.create(
        { email: user.email, name: user.first_name, metadata: { userId: req.user?.id } },
        { idempotencyKey: `cust-create:${req.user?.id}` },
      );
      customerId = customer.id;
      // Upsert (not update) — the trigger normally creates a 'free' row on
      // signup, but if it didn't, plain UPDATE would write zero rows and the
      // customer ID would be lost. Upsert guarantees the row exists, and is
      // race-safe because both racers end up writing the same customer ID.
      await supabaseAdmin.from('user_subscriptions').upsert(
        { user_id: req.user?.id, stripe_customer_id: customerId },
        { onConflict: 'user_id' },
      );
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      // Redirect to /identity (not /me) — /me is a <Navigate replace> that
      // discards the query string, so ?upgraded=1 never reached the page.
      // /identity is the real surviving route that can read the param.
      success_url: `${APP_URL}/identity?upgraded=1`,
      cancel_url: `${APP_URL}/identity?upgrade_canceled=1`,
      // Enable the "Add promotion code" link on the Stripe checkout page.
      // Operationally useful for TEST100 / launch coupons / friends-and-family,
      // and required to drive a free end-to-end test of the webhook -> DB ->
      // success_url path without putting a real card through.
      allow_promotion_codes: true,
      // CRITICAL: store the DB enum value (pro/max), not the FE display name
      // (plus/pro). The webhook upserts this directly into the
      // user_subscriptions.plan enum column.
      metadata: { userId: req.user?.id, plan: dbPlan },
    });

    res.json({ url: session.url });
  } catch (err) {
    log.error('Checkout error', { message: err.message, code: err.code, type: err.type });
    res.status(500).json({ error: safeError(err) });
  }
});

// POST /api/billing/portal
router.post('/portal', jsonBody, authenticateToken, billingMutateLimiter, async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Billing not configured' });
  }
  try {
    const { data: sub } = await supabaseAdmin
      .from('user_subscriptions').select('stripe_customer_id').eq('user_id', req.user?.id).single();
    if (!sub?.stripe_customer_id) return res.status(400).json({ error: 'No billing account found' });

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${APP_URL}/settings`,
    });
    res.json({ url: session.url });
  } catch (err) {
    log.error('Portal error', { message: err.message, code: err.code, type: err.type });
    res.status(500).json({ error: safeError(err) });
  }
});

export default router;
