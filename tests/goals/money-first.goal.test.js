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
  it('keeps the twin one link away, never the door', () => {
    const money = readFileSync('src/pages/money/MoneyV2Page.tsx', 'utf8');
    expect(money).toMatch(/<Link to="\/today">/);
  });
});
