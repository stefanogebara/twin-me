/**
 * Observation Ingestion Cron E2E Test
 *
 * Verifies POST /api/cron/ingest-observations exists and enforces bearer
 * auth. We deliberately send an INVALID bearer so the endpoint short-circuits
 * with 401 in ~30ms. Sending the real CRON_SECRET triggers a full ingestion
 * job that runs for minutes — too slow for a smoke test and not what we're
 * trying to verify here (cron correctness is covered by unit tests of the
 * handler itself).
 *
 * Expected contract:
 *  - 401 when the bearer token is missing or wrong → endpoint exists + auth wired.
 *  - Any non-401 status is a regression (route unmounted, auth bypassed, etc.).
 */

import { test, expect, request } from '@playwright/test';
import { API_URL } from './helpers';

test.describe('Observation Ingestion Cron', () => {
  test('POST /api/cron/ingest-observations rejects invalid bearer with 401', async () => {
    const ctx = await request.newContext();
    const res = await ctx.post(`${API_URL}/cron/ingest-observations`, {
      headers: {
        Authorization: 'Bearer intentionally-invalid-token-for-smoke-test',
        'Content-Type': 'application/json',
      },
      data: {},
      timeout: 10000,
    });

    const status = res.status();
    console.log('[Cron] ingest-observations status:', status);

    expect(status).toBe(401);

    await ctx.dispose();
  });
});
