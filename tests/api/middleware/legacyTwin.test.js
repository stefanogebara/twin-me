/** The legacy twin's crons behind one switch: nothing changes until LEGACY_TWIN_ENABLED=false; then they answer 200 and do no work. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { legacyTwinGate, legacyTwinParked, LEGACY_TWIN_CRONS } from '../../../api/middleware/legacyTwin.js';

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
  it('stands in front of every twin cron the schedule runs, and no money cron', () => {
    const server = readFileSync(new URL('../../../api/server.js', import.meta.url), 'utf8');
    const crons = JSON.parse(readFileSync(new URL('../../../vercel.json', import.meta.url), 'utf8')).crons.map((c) => c.path);
    for (const path of LEGACY_TWIN_CRONS) {
      expect(crons, `${path} is scheduled`).toContain(path);
      expect(server, `${path} is gated`).toMatch(new RegExp(`app\\.(use|all)\\('${path}', legacyTwinGate, `));
    }
    for (const path of ['/api/cron/money-pull', '/api/cron/money-learn', '/api/cron/presence-calls']) expect(server).not.toMatch(new RegExp(`'${path}', legacyTwinGate`));
  });
});
