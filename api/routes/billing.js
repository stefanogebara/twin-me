// api/routes/billing.js
import express from 'express';
import Stripe from 'stripe';
import { authenticateToken } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/database.js';
import { getUserSubscription } from '../services/subscriptionService.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('Billing');

const router = express.Router();
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const APP_URL = process.env.VITE_APP_URL || 'http://localhost:8086';
const isDev = process.env.NODE_ENV === 'development';
const safeError = (err) => isDev ? err.message : 'Internal server error';

if (!stripe) {
  log.warn('STRIPE_SECRET_KEY not set — billing routes disabled');
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

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const { userId, plan } = session.metadata;
        const stripeSub = await stripe.subscriptions.retrieve(session.subscription);
        await supabaseAdmin.from('user_subscriptions').upsert({
          user_id: userId, plan, status: 'active',
          stripe_customer_id: session.customer,
          stripe_subscription_id: session.subscription,
          stripe_price_id: stripeSub.items.data[0].price.id,
          current_period_end: new Date(stripeSub.current_period_end * 1000).toISOString(),
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
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
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
    log.error('Webhook error:', err);
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

// POST /api/billing/checkout
router.post('/checkout', authenticateToken, async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Billing not configured' });
  }
  const { plan } = req.body;

  // Plan naming mapping:
  //   User-facing "Plus" ($20/mo) = DB value "pro"   = env STRIPE_PRICE_PLUS
  //   User-facing "Pro"  ($100/mo) = DB value "max"  = env STRIPE_PRICE_PRO
  //
  // We accept either the DB key (pro/max) or the display name (plus/pro) from the frontend.
  // DB values are NOT changed to avoid breaking existing subscriptions.
  const PLAN_DISPLAY_TO_DB = { plus: 'pro', pro: 'max' };
  const dbPlan = PLAN_DISPLAY_TO_DB[plan] || plan;
  if (!['pro', 'max'].includes(dbPlan)) return res.status(400).json({ error: 'Invalid plan' });

  // Canonical env vars: STRIPE_PRICE_PLUS (Plus $20) and STRIPE_PRICE_PRO (Pro $100)
  // Legacy fallbacks kept for backward compatibility during migration
  const priceId = dbPlan === 'pro'
    ? (process.env.STRIPE_PRICE_PLUS || process.env.STRIPE_PLUS_PRICE_ID || process.env.STRIPE_PRO_PRICE_ID)
    : (process.env.STRIPE_PRICE_PRO || process.env.STRIPE_PRO_PRICE_ID_100 || process.env.STRIPE_MAX_PRICE_ID);

  try {
    const { data: existingSub } = await supabaseAdmin
      .from('user_subscriptions').select('stripe_customer_id').eq('user_id', req.user?.id).single();
    const { data: user } = await supabaseAdmin
      .from('users').select('email, first_name').eq('id', req.user?.id).single();

    let customerId = existingSub?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email, name: user.first_name, metadata: { userId: req.user?.id },
      });
      customerId = customer.id;
      await supabaseAdmin.from('user_subscriptions').update({ stripe_customer_id: customerId }).eq('user_id', req.user?.id);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${APP_URL}/me?upgraded=1`,
      cancel_url: `${APP_URL}/me?upgrade_canceled=1`,
      metadata: { userId: req.user?.id, plan },
    });

    res.json({ url: session.url });
  } catch (err) {
    log.error('Checkout error:', err);
    res.status(500).json({ error: safeError(err) });
  }
});

// POST /api/billing/portal
router.post('/portal', authenticateToken, async (req, res) => {
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
    res.status(500).json({ error: safeError(err) });
  }
});

export default router;
