/**
 * Session-expired bounce policy (extracted from AuthContext initAuth,
 * fix 2026-07-19 — see tests/session-bounce.test.ts for the repro).
 *
 * The hard redirect to /auth?error=session_expired exists for one case
 * (2026-04-22 bug): a user with a STALE CACHED SESSION whose refresh cookie
 * died, sitting on a protected page that would otherwise render and spray
 * 401 error banners. It must never fire for a visitor who has no prior
 * session — there is nothing to expire, and it was breaking every public
 * page not on the allowlist (/waitlist, /beta, /download, /s/:id, 404s).
 * Signed-out visitors on protected pages are handled by ProtectedRoute,
 * which also preserves the destination via ?redirect=.
 */

// Public routes: either an exact match or a documented prefix.
// NOTE: do NOT add '/oauth' as a prefix — that would silently exempt
// any future '/oauth/*' subroute from auth. Only the two callback routes
// legitimately need to load without a JWT (the callback components set
// the token themselves).
export const PUBLIC_EXACT = [
  '/auth', '/custom-auth', '/login', '/signin', '/discover', '/',
  '/oauth/callback', '/auth/callback', '/oauth/gmail/callback',
  // Pre-auth funnel pages — reachable from invite emails and the auth page.
  '/waitlist', '/beta',
  // Phase 1 (2026-08-10): '/download' and '/desktop-handoff' removed —
  // desktop is no longer the bet; both routes now redirect away.
  // '/preview' (no trailing slash) is the design-prototype gallery index;
  // the '/preview/' PREFIX below covers the individual screens.
  '/preview',
  // Legal pages must be reachable without auth — they show up in
  // signup flows, beta-invite emails, and external links.
  '/terms', '/terms-of-service', '/privacy', '/privacy-policy',
];

// '/preview/' hosts the public cinematic design prototypes (static bundle
// in /public/cinematic); '/p/' and '/s/' are the public shared soul
// signatures — all must load signed-out so they are shareable.
export const PUBLIC_PREFIX = ['/auth/', '/login/', '/discover/', '/p/', '/s/', '/preview/'];

export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_EXACT.includes(pathname) || PUBLIC_PREFIX.some((p) => pathname.startsWith(p));
}

/**
 * Whether initAuth should hard-redirect to /auth?error=session_expired
 * after a failed cookie refresh.
 *
 * @param hadPriorSession a cached user existed at init (localStorage
 *   'auth_user' before resetAuthState) — evidence a session once existed.
 * @param pathname the current location.pathname.
 */
export function shouldBounceToExpiredAuth(hadPriorSession: boolean, pathname: string): boolean {
  if (!hadPriorSession) return false;
  return !isPublicRoute(pathname);
}
