/**
 * Goal: every API mount is either reachable from the product or parked (audit M1-A, 2026-09-22).
 *
 * The 22 September audit found 639 of 735 backend files unreachable from the money routes
 * and every one of them still mounted, with 342 write handlers and four files validating
 * their input. Parking the crons (D1) had left all of that live. Now: the product's entry
 * points are written down (scripts/ci/staying-roots.txt), everything they reach stays, and a
 * mount whose router none of them reach must be in LEGACY_TWIN_ROUTES, where the gate answers
 * it 410. Drift in either direction fails here.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { reachable, readRoots, mounts } from '../../scripts/ci/reach.mjs';
import { LEGACY_TWIN_ROUTES, parkedPath } from '../../api/_app/middleware/legacyTwin.js';

const ROOT = path.resolve(new URL('../../', import.meta.url).pathname);
const roots = readRoots(path.join(ROOT, 'scripts/ci/staying-roots.txt'));
const staying = reachable(roots, { root: ROOT });
const all = mounts(fs.readFileSync(path.join(ROOT, 'api/_app/server.js'), 'utf8')).filter((m) => m.file);

describe('the product and the parked twin, complete against each other', () => {
  it('names only roots that exist', () => {
    expect(roots.filter((r) => !fs.existsSync(path.join(ROOT, r)))).toEqual([]);
    expect(roots.length).toBeGreaterThan(20);
  });

  it('parks every mount the product does not reach', () => {
    const unreached = all.filter((m) => !staying.has(m.file));
    const notParked = [...new Set(unreached.filter((m) => !parkedPath(m.path)).map((m) => `${m.path} -> ${m.file}`))];
    expect(notParked, 'mounted, unreachable from the product, and not in LEGACY_TWIN_ROUTES').toEqual([]);
  });

  it('never parks a mount the product reaches', () => {
    const reached = all.filter((m) => staying.has(m.file));
    const parked = [...new Set(reached.filter((m) => parkedPath(m.path)).map((m) => `${m.path} -> ${m.file}`))];
    expect(parked, 'reachable from the product but caught by the gate').toEqual([]);
  });

  /* Since 2026-09-24 the parked routers are deleted (M2-B): the list is the map of addresses the
     route gate answers with 410, and nothing may mount one of them again. */
  it('mounts none of the parked addresses: the gate alone answers them', () => {
    const mounted = new Set(all.map((m) => m.path));
    const remounted = LEGACY_TWIN_ROUTES.filter((prefix) => [...mounted].some((p) => p === prefix || p.startsWith(`${prefix}/`)));
    expect(remounted, 'in LEGACY_TWIN_ROUTES and mounted again').toEqual([]);
  });

  it('installs the gate ahead of every mount', () => {
    const server = fs.readFileSync(path.join(ROOT, 'api/_app/server.js'), 'utf8');
    const gateAt = server.indexOf("app.use('/api', legacyTwinRouteGate)");
    const firstMount = server.search(/app\.use\(\s*['"]\/api\/[^'"]+['"]\s*,\s*\w+Routes/);
    expect(gateAt).toBeGreaterThan(0);
    expect(gateAt).toBeLessThan(firstMount);
  });

  it('leaves the money surface a fraction of what is mounted', () => {
    /* The audit's number, so a regression that mounts twin code into the product shows. */
    const reachedMounts = new Set(all.filter((m) => staying.has(m.file)).map((m) => m.path)).size;
    expect(reachedMounts).toBeLessThanOrEqual(40);
  });
});
