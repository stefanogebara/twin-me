/**
 * Security + behaviour tests for getAppUrl — the canonical OAuth redirect base.
 *
 * getAppUrl derives the base URL that every OAuth `redirect_uri` and every
 * post-login `res.redirect()` in the OAuth-callback route is built from
 * (see api/routes/oauth-callback.js and the ~28 connector call sites). The
 * Host and Origin request headers that feed it are attacker-controllable, so
 * the load-bearing property under test is:
 *
 *   A forged Host/Origin header can NEVER be reflected into the returned URL.
 *
 * If it could, `res.redirect(`${getAppUrl(req)}/...`)` on the callback route
 * becomes an open redirect, and provider `redirect_uri`s could be pointed at an
 * attacker origin. The safe design (mirrored from resolveAppUrl() in
 * routes/auth-simple.js) is that the Host header only STEERS which trusted
 * constant is returned — it is never interpolated into the output.
 *
 * The second arg injects an env snapshot (house idiom, cf. prodEnvAssertions
 * test) so the matrix is pure inputs with no process.env mutation.
 */
import { describe, it, expect } from 'vitest';
import { getAppUrl } from '../../../api/utils/oauthUtils.js';

const reqWith = (headers = {}) => ({ headers });

describe('getAppUrl', () => {
  describe('production host allowlist (canonical redirect base)', () => {
    it('returns the apex for the twinme.me custom domain', () => {
      expect(getAppUrl(reqWith({ host: 'twinme.me' }), {})).toBe('https://twinme.me');
    });

    it('collapses www.twinme.me to the apex (OAuth apps register the apex)', () => {
      expect(getAppUrl(reqWith({ host: 'www.twinme.me' }), {})).toBe('https://twinme.me');
    });

    it('returns the canonical Vercel alias for the production vercel host', () => {
      expect(getAppUrl(reqWith({ host: 'twin-ai-learn.vercel.app' }), {}))
        .toBe('https://twin-ai-learn.vercel.app');
    });

    it('collapses per-deploy preview vercel hosts to the canonical alias', () => {
      // Preview URLs (twin-ai-learn-git-<branch>-<team>.vercel.app) are never
      // registered as redirect_uris, so they must resolve to the canonical
      // alias, not the deploy-specific hostname.
      expect(getAppUrl(reqWith({ host: 'twin-ai-learn-git-x9f2a-team.vercel.app' }), {}))
        .toBe('https://twin-ai-learn.vercel.app');
    });
  });

  describe('SECURITY: never reflects an attacker-controlled host/origin', () => {
    it('does not reflect a forged Host header (open-redirect guard)', () => {
      const r = getAppUrl(reqWith({ host: 'evil.com' }), { VITE_APP_URL: 'https://twinme.me' });
      expect(r).not.toContain('evil.com');
      expect(r).toBe('https://twinme.me'); // falls back to configured app URL
    });

    it('does not reflect a forged Origin header', () => {
      // The pre-fix implementation preferred req.headers.origin and reflected
      // it verbatim — a same-request Origin override was a redirect-base hijack.
      const r = getAppUrl(reqWith({ origin: 'https://evil.com', host: 'twinme.me' }), {});
      expect(r).not.toContain('evil.com');
      expect(r).toBe('https://twinme.me');
    });

    it('does not reflect a forged host carrying a smuggled path/scheme', () => {
      const r = getAppUrl(
        reqWith({ host: 'evil.com/oauth/callback?x=' }),
        { VITE_APP_URL: 'https://twinme.me' },
      );
      expect(r).not.toContain('evil.com');
    });

    it('a host that merely CONTAINS a trusted domain still yields the trusted constant, never the attacker host', () => {
      // Steering-vs-reflection: `nottwinme.me.evil.com` contains the substring
      // "twinme.me", so it steers into the twinme.me branch — but the OUTPUT is
      // the hard-coded constant, so the attacker's own domain never appears.
      // The worst an attacker achieves is redirecting to OUR real site.
      const r = getAppUrl(reqWith({ host: 'nottwinme.me.evil.com' }), {});
      expect(r).toBe('https://twinme.me');
      expect(r).not.toContain('evil.com');
    });
  });

  describe('env overrides and fallbacks', () => {
    it('honours an explicit APP_URL override (www stripped to apex)', () => {
      expect(getAppUrl(reqWith({ host: 'anything' }), { APP_URL: 'https://www.twinme.me' }))
        .toBe('https://twinme.me');
    });

    it('APP_URL override wins even over a matching production host', () => {
      expect(getAppUrl(reqWith({ host: 'twinme.me' }), { APP_URL: 'https://staging.twinme.me' }))
        .toBe('https://staging.twinme.me');
    });

    it('falls back to VITE_APP_URL for localhost dev', () => {
      expect(getAppUrl(reqWith({ host: 'localhost:8086' }), { VITE_APP_URL: 'http://localhost:8086' }))
        .toBe('http://localhost:8086');
    });

    it('falls back to localhost when nothing is configured', () => {
      expect(getAppUrl(reqWith({ host: 'localhost:8086' }), {})).toBe('http://localhost:8086');
    });
  });

  describe('defensive: never throws on malformed input', () => {
    it('handles a missing req', () => {
      expect(() => getAppUrl(undefined, {})).not.toThrow();
      expect(getAppUrl(undefined, {})).toBe('http://localhost:8086');
    });
    it('handles a req with no headers', () => {
      expect(() => getAppUrl({}, {})).not.toThrow();
      expect(getAppUrl({}, {})).toBe('http://localhost:8086');
    });
    it('handles null', () => {
      expect(() => getAppUrl(null, {})).not.toThrow();
    });
  });
});
