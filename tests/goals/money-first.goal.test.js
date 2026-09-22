/**
 * Money is the product: a signed-in person lands on /money, whatever door they came in by.
 *
 * Stefano, 2026-09-19: "twinme money is the first product for twinme ... even when the user
 * logs in it should redirect to the money page, its money first, and then we think about
 * twinme." The twin stays reachable at its own addresses; it is never the front door.
 *
 * Read from source, like the other goals: the routes are declared, not computed, so the
 * declaration is the invariant.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const app = readFileSync('src/App.tsx', 'utf8');
const guard = readFileSync('src/components/ProtectedRoute.tsx', 'utf8');
const index = readFileSync('src/pages/Index.tsx', 'utf8');
const auth = readFileSync('src/pages/CustomAuth.tsx', 'utf8');

const alias = (path) => {
  const m = app.match(new RegExp(`<Route path="${path}" element={<Navigate to="([^"]+)"`));
  return m ? m[1] : null;
};

describe('money first', () => {
  it('sends the old home addresses to money', () => {
    expect(alias('/home')).toBe('/money');
    expect(alias('/dashboard')).toBe('/money');
  });
  it('sends a signed-in person at the root to money', () => {
    expect(index).toMatch(/isSignedIn\) return <Navigate to="\/money"/);
  });
  it('lands on money after sign-in unless a safe redirect was asked for', () => {
    expect(auth).toMatch(/: '\/money';/);
  });
  it('sends a new person to money, not to the soul-signature flow', () => {
    const gate = guard.slice(guard.indexOf('needsOnboarding && !inMoney'));
    expect(gate.slice(0, 400)).toMatch(/<Navigate to="\/money" replace \/>/);
    expect(gate.slice(0, 400)).not.toMatch(/<Navigate to="\/soul-reveal"/);
  });
  it('has no door into the parked twin, and the parked twin has one back', () => {
    /* OW1 kept the twin one link away. Since 2026-09-22 (M1-A) that link would have led to a
       parked page, so the money pages carry no link into the twin, and the parked page
       carries the one back. */
    const money = readFileSync('src/pages/money/MoneyV2Page.tsx', 'utf8');
    expect(money).not.toMatch(/<Link to="\/(today|talk-to-twin|identity|soul-signature)"/);
    const parked = readFileSync('src/pages/Parked.tsx', 'utf8');
    expect(parked).toMatch(/<Link to="\/money"/);
  });
});

/* Nothing outside the money pages is warmed at start (M3-2, 2026-09-19): the legacy twin's
   heaviest routes and their charts were fetched at 0 ms on every screen. */
describe('the app warms only the money pages', () => {
  it('prefetches no route outside src/pages/money', () => {
    const app = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
    const warm = app.match(/const warm = \(\) => \{([^}]*)\}/);
    expect(warm, 'the warm-up block').not.toBeNull();
    const loaders = [...warm[1].matchAll(/void (load\w+)\(\)/g)].map((m) => m[1]);
    expect(loaders.length).toBeGreaterThan(0);
    for (const l of loaders) expect(app, `${l} points at a money page`).toMatch(new RegExp(`const ${l} = \\(\\) => import\\("./pages/money/`));
    expect(app).not.toMatch(/prefetchHeavyRoutes|void loadTodayPage\(\)|void loadTalkToTwin\(\)|void loadMoneyPage\(\)/);
  });
});
