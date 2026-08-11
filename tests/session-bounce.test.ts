import { describe, it, expect } from 'vitest';
import { isPublicRoute, shouldBounceToExpiredAuth } from '../src/lib/sessionBounce';

// Repro for the anonymous-bounce bug (found 2026-07-19, present on prod):
// a first-time visitor with no refresh cookie hit /waitlist and was hard-
// redirected to /auth?error=session_expired — a "session expired" message
// for someone who never had a session, and a broken waitlist funnel.
//
// Contract: the hard bounce exists for ONE case (2026-04-22 bug): a user
// with a stale cached session whose refresh cookie died, sitting on a
// protected page that would otherwise render and spray 401 banners.
// Everyone else stays put — ProtectedRoute already gates protected pages
// for signed-out visitors (and preserves the destination via ?redirect=).

describe('shouldBounceToExpiredAuth', () => {
  it('never bounces a visitor with no prior session — no session existed to expire', () => {
    expect(shouldBounceToExpiredAuth(false, '/waitlist')).toBe(false);
    expect(shouldBounceToExpiredAuth(false, '/beta')).toBe(false);
    expect(shouldBounceToExpiredAuth(false, '/s/some-user')).toBe(false);
    expect(shouldBounceToExpiredAuth(false, '/dashboard')).toBe(false); // ProtectedRoute handles it
    expect(shouldBounceToExpiredAuth(false, '/no-such-route')).toBe(false); // 404 renders
  });

  it('bounces a prior-session user whose cookie died on protected pages (2026-04-22 fix)', () => {
    expect(shouldBounceToExpiredAuth(true, '/dashboard')).toBe(true);
    expect(shouldBounceToExpiredAuth(true, '/money')).toBe(true);
    expect(shouldBounceToExpiredAuth(true, '/talk-to-twin')).toBe(true);
  });

  it('does not bounce a prior-session user off public pages', () => {
    expect(shouldBounceToExpiredAuth(true, '/auth')).toBe(false);
    expect(shouldBounceToExpiredAuth(true, '/waitlist')).toBe(false);
    expect(shouldBounceToExpiredAuth(true, '/terms')).toBe(false);
    expect(shouldBounceToExpiredAuth(true, '/preview')).toBe(false);
    expect(shouldBounceToExpiredAuth(true, '/preview/dashboard')).toBe(false);
    expect(shouldBounceToExpiredAuth(true, '/s/some-user')).toBe(false);
  });
});

describe('isPublicRoute', () => {
  it('covers every signed-out-reachable route in App.tsx', () => {
    // Phase 1 (2026-08-10): /download and /desktop-handoff left the allowlist
    // with the desktop bet — their routes are now plain redirects, so a bounce
    // to /auth on a stale session is acceptable for those dead links.
    for (const p of [
      '/', '/auth', '/custom-auth', '/login', '/signin', '/discover',
      '/waitlist', '/beta',
      '/oauth/callback', '/auth/callback', '/oauth/gmail/callback',
      '/terms', '/terms-of-service', '/privacy', '/privacy-policy',
      '/preview', '/preview/talk', '/p/user-1', '/s/user-1',
    ]) {
      expect(isPublicRoute(p), `${p} should be public`).toBe(true);
    }
  });

  it('keeps protected routes protected', () => {
    for (const p of ['/dashboard', '/money', '/settings', '/brain', '/identity', '/oauth/anything-else']) {
      expect(isPublicRoute(p), `${p} should be protected`).toBe(false);
    }
  });
});
