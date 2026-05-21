/**
 * Permanent Stripe Checkout end-to-end driver (TEST mode only).
 * ===============================================================
 *
 * Replaces the one-off `_stripe-checkout-chase.spec.ts` that was deleted
 * after the manual 2026-05 audit. This version is in CI so the next time
 * `STRIPE_PRICE_*` keys get rotated, an unsupported coupon flag lands, or
 * Stripe ships a breaking UI change, the breakage shows up in the test
 * report — not in a real prod failed-charge ticket.
 *
 * What this covers (no other test does):
 *   - A real Stripe Checkout Session is creatable via the Stripe API with
 *     the env-configured TEST price ID, the documented metadata shape
 *     (userId + plan = DB key), and `payment_method_collection=if_required`.
 *   - The Stripe-hosted Checkout page actually loads at the returned URL
 *     (not "Session could not be found" — the bug that hit MCP browser).
 *   - The TEST100 100%-off coupon zeroes the amount and lets the user
 *     submit without a card (mandatory for any test that wants to assert
 *     the success_url redirect without a real card).
 *   - The "Pay" button click redirects to the success_url with the
 *     {CHECKOUT_SESSION_ID} placeholder substituted.
 *   - The session, when re-fetched, has status='complete' and
 *     payment_status='paid' (no_payment_required for the $0 case).
 *
 * Gating:
 *   This test hits the real Stripe TEST API. It is OPT-IN. CI runs it only
 *   when STRIPE_E2E=1 AND the required TEST-mode secrets are present.
 *   Default behaviour: skipped, no network calls, no side effects.
 *
 * Required env (when STRIPE_E2E=1):
 *   STRIPE_TEST_SECRET_KEY   - sk_test_... (TEST mode secret or restricted key)
 *   STRIPE_TEST_PRICE_PRO    - price_test_... ($20 Plus equivalent in TEST mode)
 *   STRIPE_TEST100_COUPON    - id of a 100%-off TEST mode coupon. Create with:
 *     curl -u "$STRIPE_TEST_SECRET_KEY:" https://api.stripe.com/v1/coupons \
 *       -d percent_off=100 -d duration=once -d id=E2E_FREE -d name='E2E coupon'
 *     If the coupon has a max_redemptions ceiling and the test runs N times,
 *     the cap exhausts and Stripe returns coupon_expired. Prefer a coupon
 *     with max_redemptions=null.
 *
 * Why a sentinel success_url:
 *   Pointing success_url at example.com (which has no app server) lets the
 *   test assert the redirect-on-success contract without depending on the
 *   twinme.me deploy being up, the JWT layer being seeded, or the webhook
 *   handler having processed the event yet. Pure UI-level assertion of
 *   "Stripe followed our success_url".
 */
import { expect, test } from '@playwright/test';

const STRIPE_API = 'https://api.stripe.com/v1';
const SUCCESS_BASE = 'https://example.com/__success__';
const CANCEL_URL = 'https://example.com/__cancel__';

const enabled = process.env.STRIPE_E2E === '1';
const SECRET = process.env.STRIPE_TEST_SECRET_KEY || '';
const PRICE_ID = process.env.STRIPE_TEST_PRICE_PRO || '';
const COUPON_ID = process.env.STRIPE_TEST100_COUPON || '';

// Skip the entire file unless explicitly enabled + secrets present. We
// intentionally do NOT throw on missing secrets — keeps CI from going red
// for environments that legitimately don't have TEST-mode keys.
test.skip(
  !enabled,
  'STRIPE_E2E=1 not set. This test hits the real Stripe TEST API and is opt-in.',
);
test.skip(
  enabled && (!SECRET || !PRICE_ID || !COUPON_ID),
  'STRIPE_E2E=1 set but missing STRIPE_TEST_SECRET_KEY / STRIPE_TEST_PRICE_PRO / STRIPE_TEST100_COUPON.',
);

/** form-urlencode a flat object (Stripe API only takes form bodies, not JSON). */
function toForm(obj: Record<string, string | number | boolean>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
}

async function stripeFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${SECRET}`,
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }
  return fetch(`${STRIPE_API}${path}`, { ...init, headers });
}

test.describe('Stripe Checkout — TEST mode end-to-end', () => {
  // The default Playwright per-test timeout is 30s. The full flow here:
  // session-create (Stripe API ~1-3s) + page.goto Stripe Checkout (3-5s) +
  // wait for hydration (~5-10s) + email field interaction + button click +
  // wait for navigation to success_url (5-15s) easily totals 40-60s on a
  // healthy network and >90s on a noisy one. Bump generously.
  test.setTimeout(180_000);

  test('TEST100 coupon zeroes a Plus subscription and submit redirects to success_url', async ({ page }) => {
    // -----------------------------------------------------------------------
    // 1. Create a fresh Checkout Session via the Stripe API. We do this
    //    directly (not through /api/billing/checkout) so the test does NOT
    //    depend on the local dev server having STRIPE_SECRET_KEY wired, the
    //    JWT layer being seeded, or the rate limiter being open.
    // -----------------------------------------------------------------------
    const driverId = `e2e-driver-${Date.now().toString(36)}`;

    const createBody = toForm({
      mode: 'subscription',
      'line_items[0][price]': PRICE_ID,
      'line_items[0][quantity]': 1,
      // Match what /api/billing/checkout sends — the webhook handler reads
      // metadata.plan as the DB enum key and metadata.userId for the upsert.
      'metadata[userId]': driverId,
      'metadata[plan]': 'pro', // DB key = $20 Plus tier
      // Sentinel URLs so we don't need the app running to assert redirect.
      success_url: `${SUCCESS_BASE}?s={CHECKOUT_SESSION_ID}`,
      cancel_url: CANCEL_URL,
      'discounts[0][coupon]': COUPON_ID,
      // Pre-fill the email so the Stripe Checkout page doesn't ask for one.
      // Stripe requires an email even on $0 sessions (it's the identity for
      // the subscription record). Without this, the "Pay and subscribe"
      // button stays disabled — and the email input lives inside a Stripe-
      // hosted iframe that Playwright getByLabel can't easily pierce, so
      // pre-filling at the API level is the clean fix.
      customer_email: `${driverId}@example.com`,
      // CRITICAL for the $0 path: without this, Stripe still demands a card.
      payment_method_collection: 'if_required',
    });

    const createRes = await stripeFetch('/checkout/sessions', {
      method: 'POST',
      body: createBody,
    });
    expect(createRes.status, 'session create HTTP').toBe(200);
    const session = await createRes.json();
    expect(session.id, 'session id present').toMatch(/^cs_test_/);
    expect(session.url, 'session url present').toMatch(/^https:\/\/checkout\.stripe\.com\//);
    expect(session.amount_total, 'TEST100 coupon zeroed amount').toBe(0);

    // -----------------------------------------------------------------------
    // 2. Open the Stripe-hosted Checkout page. This is where the MCP
    //    browser previously failed with "Session could not be found" —
    //    standalone Playwright Chromium reliably loads it.
    // -----------------------------------------------------------------------
    await page.goto(session.url, { waitUntil: 'domcontentloaded' });

    // Stripe Checkout renders the submit button with text like
    // "Pay and subscribe" (paid flow) or "Subscribe" (zeroed flow). The
    // exact label has changed over the years; this regex tolerates both
    // historical and current Stripe copy.
    const submit = page.getByRole('button', {
      name: /pay(\s+and)?\s+subscribe|^subscribe$|^pay$/i,
    });
    await expect(submit, 'submit button is mounted within 30s').toBeVisible({ timeout: 30_000 });

    // Wait until the button is enabled — Stripe disables it during initial
    // hydration and re-enables it once the email passes validation.
    await expect(submit).toBeEnabled({ timeout: 15_000 });

    // -----------------------------------------------------------------------
    // 3. Submit. Wait for the navigation to the success_url sentinel.
    // -----------------------------------------------------------------------
    await Promise.all([
      page.waitForURL(new RegExp(SUCCESS_BASE.replace(/[.\/]/g, '\\$&')), { timeout: 60_000 }),
      submit.click(),
    ]);

    // Stripe substitutes {CHECKOUT_SESSION_ID} with the actual session id.
    const finalUrl = new URL(page.url());
    expect(finalUrl.origin + finalUrl.pathname).toBe(SUCCESS_BASE);
    expect(finalUrl.searchParams.get('s')).toBe(session.id);

    // -----------------------------------------------------------------------
    // 4. Confirm Stripe-side state — the session completed, payment didn't
    //    need a card. The webhook MAY or MAY NOT have been delivered yet
    //    (depends on the prod endpoint being up), so we don't assert on
    //    the DB; we assert on Stripe's view of truth.
    // -----------------------------------------------------------------------
    const verifyRes = await stripeFetch(
      `/checkout/sessions/${encodeURIComponent(session.id)}`,
      { method: 'GET' },
    );
    expect(verifyRes.status, 'session retrieve HTTP').toBe(200);
    const final = await verifyRes.json();
    expect(final.status).toBe('complete');
    // For zero-amount sessions Stripe sets payment_status='no_payment_required';
    // the historical "paid" value also lands here for sessions that did
    // collect a card. Accept either so the test survives a Stripe upgrade.
    expect(['no_payment_required', 'paid']).toContain(final.payment_status);
    // The metadata round-trip is what the webhook handler reads — assert
    // it survived intact.
    expect(final.metadata?.plan).toBe('pro');
    expect(final.metadata?.userId).toBe(driverId);
  });

  test('Session create rejects an unknown coupon (defensive — guards against silent full-price charge)', async () => {
    // Regression guard for the class of bug where a typo in the coupon env
    // var would charge the full $20 instead of $0. Stripe must reject the
    // unknown coupon at create time, not silently drop it.
    const res = await stripeFetch('/checkout/sessions', {
      method: 'POST',
      body: toForm({
        mode: 'subscription',
        'line_items[0][price]': PRICE_ID,
        'line_items[0][quantity]': 1,
        success_url: `${SUCCESS_BASE}?s={CHECKOUT_SESSION_ID}`,
        cancel_url: CANCEL_URL,
        'discounts[0][coupon]': 'coupon_definitely_does_not_exist_xxx',
        payment_method_collection: 'if_required',
      }),
    });
    expect(res.status, 'unknown coupon must be rejected').toBe(400);
    const body = await res.json();
    expect(body?.error?.code || body?.error?.type || '').toMatch(/coupon|resource_missing/i);
  });
});
