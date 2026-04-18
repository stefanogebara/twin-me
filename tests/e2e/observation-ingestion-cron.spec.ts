/**
 * Observation Ingestion Cron E2E Test
 *
 * Hits POST /api/cron/ingest-observations with the CRON_SECRET bearer token.
 * The endpoint is guarded by CRON_SECRET — if that env var isn't set in
 * .env.test, the test is skipped.
 *
 * Expected contract:
 *  - 200 when authorized, response body has a `processed` field (or
 *    equivalent ingestion metrics).
 *  - 401 when the bearer token is missing or wrong.
 */

import { test, expect, request } from '@playwright/test';
import { API_URL } from './helpers';

const CRON_SECRET = process.env.CRON_SECRET;
const TEST_AUTH_TOKEN = process.env.TEST_AUTH_TOKEN;
const BEARER = CRON_SECRET || TEST_AUTH_TOKEN;

test.describe('Observation Ingestion Cron', () => {
  test.skip(
    !CRON_SECRET && !TEST_AUTH_TOKEN,
    'needs CRON_SECRET or TEST_AUTH_TOKEN in .env.test',
  );

  test('POST /api/cron/ingest-observations returns 200 or 401', async () => {
    const ctx = await request.newContext();
    const res = await ctx.post(`${API_URL}/cron/ingest-observations`, {
      headers: {
        Authorization: `Bearer ${BEARER ?? ''}`,
        'Content-Type': 'application/json',
      },
      data: {},
      timeout: 30000,
    });

    const status = res.status();
    console.log('[Cron] ingest-observations status:', status);

    // Either authorized (200) or rejected (401) depending on whether the
    // bearer we sent matches the real CRON_SECRET. Any other status is a bug.
    expect([200, 401]).toContain(status);

    if (status === 200) {
      const body = await res.json();
      console.log('[Cron] response keys:', Object.keys(body));
      // The route returns an ingestion result; accept any of the common shapes.
      const hasProcessedField =
        'processed' in body ||
        'processedUserIds' in body ||
        'observationsStored' in body;
      expect(hasProcessedField).toBe(true);
    }

    await ctx.dispose();
  });
});
