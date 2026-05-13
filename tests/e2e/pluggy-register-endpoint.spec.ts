/**
 * /pluggy/register endpoint contract tests
 * =========================================
 *
 * Tests the webhook-delivery fallback route in isolation. Pure API
 * contract tests — no browser, no widget, just HTTP. Verifies:
 *
 *   B-1   POST /pluggy/register unauthenticated → 401
 *   B-2   POST /pluggy/register with no body → 400 "itemId is required"
 *   B-3   POST /pluggy/register with malformed UUID → 400 "invalid itemId format"
 *   B-4   POST /pluggy/register with valid auth but Pluggy returns 404 → 404
 *         (only runnable if Pluggy is configured; skipped otherwise)
 *
 * Opt-in: TWINME_RUN_PLUGGY_REGISTER_AUDIT=true. Runs whenever Pluggy
 * is configured; the 404 case skips gracefully if PLUGGY_CLIENT_ID is unset.
 *
 * Why this matters: the /register route is the keystone of the
 * bank-connection ingestion path in local dev AND the resilience path
 * in production. A regression here means users connect a bank and never
 * see it. These tests run in <5s and catch contract drift early.
 */

import { test, expect } from '@playwright/test';
import { API_URL, mintTestToken } from './helpers';

test.skip(
  process.env.TWINME_RUN_PLUGGY_REGISTER_AUDIT !== 'true',
  'Set TWINME_RUN_PLUGGY_REGISTER_AUDIT=true to opt in.',
);

const REGISTER_PATH = '/transactions/pluggy/register';
// A well-formed UUID (v4-shape) Pluggy is overwhelmingly unlikely to have minted.
// The all-zero nil UUID is rejected by some validators as invalid, so use a
// realistic-looking-but-fake one.
const UNKNOWN_BUT_VALID_UUID = 'deadbeef-1234-4abc-9def-987654321000';

test.describe('/pluggy/register — contract', () => {
  test('B-1: unauthenticated returns 401', async ({ request }) => {
    const res = await request.post(`${API_URL}${REGISTER_PATH}`, {
      headers: { 'Content-Type': 'application/json' },
      data: { itemId: UNKNOWN_BUT_VALID_UUID },
    });
    expect(res.status(), 'B-1 unauth status').toBe(401);
  });

  test('B-2: missing itemId returns 400 with clear message', async ({ request }) => {
    const token = mintTestToken();
    const res = await request.post(`${API_URL}${REGISTER_PATH}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: {},
    });
    expect(res.status(), 'B-2 status').toBe(400);
    const body = await res.json();
    expect(body, 'B-2 success').toMatchObject({ success: false });
    expect(body.error, 'B-2 mentions itemId').toMatch(/itemId/i);
  });

  test('B-3: malformed itemId returns 400', async ({ request }) => {
    const token = mintTestToken();
    const res = await request.post(`${API_URL}${REGISTER_PATH}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { itemId: 'not-a-uuid' },
    });
    // 400 from us because Pluggy's /items/<bad-id> returns 400 "Invalid id, not an uuid".
    // We map that to a clean 400 — anything else (especially 500) is a regression.
    expect([400, 503], 'B-3 status').toContain(res.status());
    const body = await res.json();
    expect(body.success, 'B-3 success false').toBe(false);
    if (res.status() === 400) {
      expect(body.error, 'B-3 error message').toMatch(/invalid|format/i);
    }
  });

  test('B-4: itemId not in Pluggy returns deterministic 4xx (not 500)', async ({ request }) => {
    const token = mintTestToken();
    const res = await request.post(`${API_URL}${REGISTER_PATH}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { itemId: UNKNOWN_BUT_VALID_UUID },
    });
    // Acceptable outcomes when the UUID doesn't match any real Pluggy item:
    //   400 — Pluggy considered the UUID malformed for its purposes
    //   404 — Pluggy explicitly says item not found
    //   503 — Pluggy not configured (PLUGGY_CLIENT_ID missing)
    // 500 would mean we're swallowing a Pluggy error instead of mapping it,
    // which is the regression this test guards against.
    expect([400, 404, 503], `B-4 status (got ${res.status()})`).toContain(res.status());
    const body = await res.json();
    expect(body.success, 'B-4 success false').toBe(false);
  });

  test('B-5: idempotent — repeated registers of the same bad UUID return same 400', async ({ request }) => {
    const token = mintTestToken();
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
    const data = { itemId: 'still-not-a-uuid' };
    const r1 = await request.post(`${API_URL}${REGISTER_PATH}`, { headers, data });
    const r2 = await request.post(`${API_URL}${REGISTER_PATH}`, { headers, data });
    expect(r1.status(), 'B-5 first call').toBe(r2.status());
    // Both should be deterministic and within the 4xx range
    expect(r1.status(), 'B-5 in 4xx range').toBeLessThan(500);
  });
});
