/**
 * inngestSelfHeal — self-healing re-registration for the Inngest fan-out.
 *
 * Context: the ingestion cron fans out one Inngest event per user, but if the
 * app's Inngest registration is stale/rejected (recurring after deploys, and
 * after the 3-week plan-cap outage), the events "send" but nothing runs — only
 * the starvation fallback keeps ingestion alive. When the cron detects
 * starvation it fires a best-effort, rate-limited PUT to its own /api/inngest
 * serve endpoint to force re-registration. This must never throw and must not
 * hammer the endpoint.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  shouldAttemptResync,
  selfHealInngestRegistration,
  getSelfBaseUrl,
  RESYNC_TIMEOUT_MS,
  __resetResyncStateForTests,
} from '../../api/services/inngestSelfHeal.js';

const MIN = 30 * 60 * 1000;
const __dirname = dirname(fileURLToPath(import.meta.url));
const CRON_SRC = readFileSync(
  resolve(__dirname, '../../api/routes/cron-observation-ingestion.js'),
  'utf8'
);
const INNGEST_ROUTE_SRC = readFileSync(
  resolve(__dirname, '../../api/routes/inngest.js'),
  'utf8'
);

describe('shouldAttemptResync (pure rate-limit decision)', () => {
  it('allows the first attempt (no prior attempt)', () => {
    expect(shouldAttemptResync(0, 1_000_000, MIN)).toBe(true);
  });
  it('blocks a second attempt within the interval', () => {
    expect(shouldAttemptResync(1_000_000, 1_000_000 + MIN - 1, MIN)).toBe(false);
  });
  it('allows again once the interval has fully elapsed', () => {
    expect(shouldAttemptResync(1_000_000, 1_000_000 + MIN, MIN)).toBe(true);
  });
});

describe('getSelfBaseUrl', () => {
  it('strips trailing slashes and falls back to the canonical host', () => {
    const prev = process.env.PUBLIC_APP_URL;
    delete process.env.PUBLIC_APP_URL;
    delete process.env.VITE_APP_URL;
    delete process.env.APP_URL;
    expect(getSelfBaseUrl()).toBe('https://www.twinme.me');
    if (prev !== undefined) process.env.PUBLIC_APP_URL = prev;
  });
});

describe('selfHealInngestRegistration', () => {
  beforeEach(() => __resetResyncStateForTests());

  it('PUTs the /api/inngest serve endpoint on the first call', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 200 });
    const out = await selfHealInngestRegistration({ now: 1_000_000, fetchImpl });
    expect(out.attempted).toBe(true);
    expect(out.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toMatch(/\/api\/inngest$/);
    expect(opts.method).toBe('PUT');
  });

  it('is rate-limited: a second immediate call does not fetch', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 200 });
    await selfHealInngestRegistration({ now: 1_000_000, fetchImpl });
    const out = await selfHealInngestRegistration({ now: 1_000_000 + 5, fetchImpl });
    expect(out.attempted).toBe(false);
    expect(out.reason).toBe('rate_limited');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('fires again once the interval elapses', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 200 });
    await selfHealInngestRegistration({ now: 1_000_000, fetchImpl });
    const out = await selfHealInngestRegistration({ now: 1_000_000 + MIN, fetchImpl });
    expect(out.attempted).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('never throws when fetch rejects; reports the error', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));
    const out = await selfHealInngestRegistration({ now: 2_000_000, fetchImpl });
    expect(out.attempted).toBe(true);
    expect(out.error).toMatch(/network down/);
  });
});

/**
 * Static wiring canary — this exact code path caused a 3-week silent outage
 * (2026-06). Guard against a regression that drops the self-heal call or
 * reverts the starvation threshold back to the unreliable 90-minute window.
 */
describe('goal: ingestion cron wires the #167 fixes', () => {
  it('fires the Inngest self-heal on detected starvation', () => {
    expect(CRON_SRC).toContain('selfHealInngestRegistration');
  });

  it('uses the named 40-min starvation threshold, not a bare 90', () => {
    const m = CRON_SRC.match(/const STARVATION_STALE_MINUTES\s*=\s*(\d+)/);
    expect(m, 'STARVATION_STALE_MINUTES constant must exist').toBeTruthy();
    expect(Number(m[1])).toBeLessThanOrEqual(40);
    // The starvation check must be parameterised by the constant, never a literal.
    expect(CRON_SRC).toMatch(/getStarvedIngestionUserIds\(eligibleUserIds,\s*STARVATION_STALE_MINUTES\)/);
  });
});

/**
 * The re-registration PUT must be allowed to COMPLETE. The serve endpoint took
 * ~6.6s for a bare GET in prod (cold Vercel start); the PUT round-trips to
 * Inngest Cloud on top. The original 8s abort routinely killed the handshake
 * mid-flight, leaving a half-applied registration — the app showed "synced /
 * 12 functions" while events arrived and ZERO functions ran (the 2026-07
 * outage). Guard both the headroom and the 60s-maxDuration ceiling it fits under.
 */
describe('RESYNC_TIMEOUT_MS — headroom for a cold re-registration, bounded by the cron budget', () => {
  it('is exported so the budget is an explicit, testable contract', () => {
    expect(typeof RESYNC_TIMEOUT_MS).toBe('number');
  });

  it('gives a cold serve endpoint real time to finish the register handshake (>= 30s)', () => {
    expect(RESYNC_TIMEOUT_MS).toBeGreaterThanOrEqual(30_000);
  });

  it('stays under the cron 60s maxDuration (it runs in Promise.all with the inline fallback)', () => {
    expect(RESYNC_TIMEOUT_MS).toBeLessThanOrEqual(45_000);
  });
});

/**
 * Static wiring canary — the serve endpoint must register a STABLE, reachable
 * callback host. A week of "could not reach your URL" unattached syncs (2026-07)
 * came from deploy-time syncs registering the deployment-protected *.vercel.app
 * host. `serveHost` pins the reachable production origin regardless of which host
 * the sync arrived on, reusing the SAME canonical resolver the self-heal PUTs to
 * (so the registered host and the resync target can never drift apart).
 */
describe('goal: serve endpoint pins a stable registration host (serveHost)', () => {
  it('sets serveHost + the /api/inngest servePath', () => {
    expect(INNGEST_ROUTE_SRC).toMatch(/serveHost:/);
    expect(INNGEST_ROUTE_SRC).toMatch(/servePath:\s*['"]\/api\/inngest['"]/);
  });

  it('derives the host from getSelfBaseUrl (shared with the self-heal — no drift)', () => {
    expect(INNGEST_ROUTE_SRC).toContain('getSelfBaseUrl');
  });
});
