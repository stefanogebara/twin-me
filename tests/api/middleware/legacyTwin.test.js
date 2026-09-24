/** The legacy twin's crons behind one switch: nothing changes until LEGACY_TWIN_ENABLED=false; then they answer 200 and do no work. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { legacyTwinGate, legacyTwinParked, LEGACY_TWIN_CRONS, legacyTwinRouteGate, parkedPath, LEGACY_TWIN_ROUTES, PARKED_MESSAGE } from '../../../api/_app/middleware/legacyTwin.js';

const res = () => { const r = { statusCode: 200, body: null }; r.status = (c) => { r.statusCode = c; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };
afterEach(() => vi.unstubAllEnvs());

describe('the legacy twin gate', () => {
  it('lets every run through unless the switch says false', () => {
    for (const v of [undefined, '', 'true', 'yes', '0']) {
      vi.stubEnv('LEGACY_TWIN_ENABLED', v);
      const next = vi.fn(); legacyTwinGate({ baseUrl: '/api/cron/x' }, res(), next);
      expect(next).toHaveBeenCalled();
      expect(legacyTwinParked()).toBe(false);
    }
  });
  it('answers a parked run at once, 200, and calls no handler', () => {
    vi.stubEnv('LEGACY_TWIN_ENABLED', 'FALSE');
    const next = vi.fn(); const r = res();
    legacyTwinGate({ baseUrl: '/api/cron/deliver-insights' }, r, next);
    expect(next).not.toHaveBeenCalled();
    expect(r.statusCode).toBe(200);
    expect(r.body).toMatchObject({ success: true, skipped: expect.stringContaining('parked') });
  });
  it('keeps every twin cron unscheduled and unmounted, and no money cron behind the gate', () => {
    const server = readFileSync(new URL('../../../api/_app/server.js', import.meta.url), 'utf8');
    const crons = JSON.parse(readFileSync(new URL('../../../vercel.json', import.meta.url), 'utf8')).crons.map((c) => c.path);
    /* Since 2026-09-22 a parked cron is not scheduled at all: ten wake-ups a day for a
       200 { skipped } were ten lines to delete. The gate stays in front of the route. */
    for (const path of LEGACY_TWIN_CRONS) {
      expect(crons, `${path} is no longer scheduled`).not.toContain(path);
      /* Since 2026-09-24 the parked cron's router is deleted (M2-B api): nothing mounts the path, the route gate answers it. */
      expect(server, `${path} is not mounted`).not.toMatch(new RegExp(`'${path}'`));
    }
    for (const path of ['/api/cron/money-pull', '/api/cron/money-learn', '/api/cron/presence-calls']) expect(server).not.toMatch(new RegExp(`'${path}', legacyTwinGate`));
  });
});

describe('the route gate (M1-A, 2026-09-22)', () => {
  const OLD = process.env.LEGACY_TWIN_ENABLED;
  afterEach(() => { if (OLD === undefined) delete process.env.LEGACY_TWIN_ENABLED; else process.env.LEGACY_TWIN_ENABLED = OLD; });
  const res = () => { const r = { code: null, body: null }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };

  it('answers a parked route 410 with the way to the product, and touches nothing else', () => {
    process.env.LEGACY_TWIN_ENABLED = 'false';
    for (const path of ['/api/twin/chat', '/api/soul-signature', '/api/goals/1', '/api/transactions', '/api/desktop/summary', '/api/whatsapp-zapi/webhook']) {
      const r = res(); let passed = false;
      /* As Express hands it over under app.use('/api', gate): path stripped, originalUrl whole. */
      legacyTwinRouteGate({ path: path.replace(/^\/api/, ''), originalUrl: `${path}?x=1`, method: 'POST' }, r, () => { passed = true; });
      expect(passed, path).toBe(false);
      expect(r.code, path).toBe(410);
      expect(r.body).toMatchObject({ success: false, parked: true, error: PARKED_MESSAGE, product: '/money' });
    }
    for (const path of ['/api/money/page', '/api/auth/verify', '/api/presence/home', '/api/billing/portal', '/api/desktop-download', '/api/whatsapp/webhook', '/api/health', '/api/webhooks/stripe', '/api/purchase-notification/trigger']) {
      let passed = false;
      legacyTwinRouteGate({ path: path.replace(/^\/api/, ''), originalUrl: path, method: 'GET' }, res(), () => { passed = true; });
      expect(passed, path).toBe(true);
    }
  });

  it('does nothing while the twin is not parked', () => {
    delete process.env.LEGACY_TWIN_ENABLED;
    let passed = false;
    legacyTwinRouteGate({ path: '/twin/chat', originalUrl: '/api/twin/chat', method: 'GET' }, res(), () => { passed = true; });
    expect(passed).toBe(true);
  });

  it('matches by segment: /api/desktop parks /api/desktop/x and not /api/desktop-download', () => {
    expect(parkedPath('/api/desktop/summary')).toBe(true);
    expect(parkedPath('/api/desktop-download')).toBe(false);
    expect(parkedPath('/api/webhooks/vapi')).toBe(true);
    expect(parkedPath('/api/webhooks/stripe')).toBe(false);
    expect(parkedPath('/api/twin?x=1')).toBe(true);
  });

  it('keeps the parked list sorted, unique and long', () => {
    expect([...LEGACY_TWIN_ROUTES]).toEqual([...LEGACY_TWIN_ROUTES].sort());
    expect(new Set(LEGACY_TWIN_ROUTES).size).toBe(LEGACY_TWIN_ROUTES.length);
    expect(LEGACY_TWIN_ROUTES.length).toBeGreaterThan(100);
  });
});
