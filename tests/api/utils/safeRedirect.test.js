/**
 * Security tests for isSafeRedirectPath — the one rule that decides whether a
 * caller-supplied `redirect` value may ride in a res.redirect() or be stored
 * alongside a one-time auth code (api/_app/routes/auth-simple.js,
 * POST /magic-link/request ~860 and GET /magic-link/verify ~906).
 *
 * The bug (open redirect): the previous rule was "starts with / and not //".
 * new URL('/\\evil.example', 'https://twinme.me').href is
 * 'https://evil.example/' — browsers normalize a backslash to a forward
 * slash when resolving an http(s) URL, so "/\evil.example" passed the old
 * rule and left the site. A genuine sign-in email could then carry a
 * redirect that lands the person on an attacker's page. react-router below
 * 7.18 has the same weakness in navigate (GHSA-wrjc-x8rr-h8h6).
 *
 * Same behaviour is asserted for the front-end copy in
 * tests/unit/safeRedirect.test.ts (src/lib/safeRedirect.ts) — the two must
 * agree, since one guards the server's res.redirect() and the other guards
 * the page's navigate() / window.location.href.
 */
import { describe, it, expect } from 'vitest';
import { isSafeRedirectPath } from '../../../api/_app/utils/safeRedirect.js';

describe('isSafeRedirectPath', () => {
  describe('kept: same-origin paths', () => {
    it('keeps a plain path', () => {
      expect(isSafeRedirectPath('/money')).toBe(true);
    });
    it('keeps a path with a query string', () => {
      expect(isSafeRedirectPath('/money?calendar=connected')).toBe(true);
    });
    it('keeps a deep path', () => {
      expect(isSafeRedirectPath('/money/you')).toBe(true);
    });
    it('keeps the bare root', () => {
      expect(isSafeRedirectPath('/')).toBe(true);
    });
  });

  describe('refused: the backslash bypass (GHSA-wrjc-x8rr-h8h6-shaped)', () => {
    it('refuses a backslash right after the leading slash', () => {
      // new URL('/\\evil.example', 'https://twinme.me').href === 'https://evil.example/'
      expect(isSafeRedirectPath('/\\evil.example')).toBe(false);
    });
    it('refuses a backslash anywhere in the value, not only at position 1', () => {
      expect(isSafeRedirectPath('/money\\evil.example')).toBe(false);
    });
    it('refuses a slash-backslash-slash variant', () => {
      expect(isSafeRedirectPath('/\\/evil.example')).toBe(false);
    });
  });

  describe('refused: protocol-relative and absolute URLs', () => {
    it('refuses a double leading slash', () => {
      expect(isSafeRedirectPath('//evil.example')).toBe(false);
    });
    it('refuses an absolute https URL', () => {
      expect(isSafeRedirectPath('https://evil.example')).toBe(false);
    });
    it('refuses a value with no leading slash at all', () => {
      expect(isSafeRedirectPath('evil.example')).toBe(false);
    });
  });

  describe('refused: control characters, including the tab-smuggling trick', () => {
    it('refuses a value that does not even start with a literal slash (a raw tab first)', () => {
      expect(isSafeRedirectPath('\t/evil')).toBe(false);
    });
    it('refuses a raw tab smuggled right after the leading slash', () => {
      // The WHATWG URL parser strips every ASCII tab/CR/LF from the whole
      // input before resolving, so "/<TAB>/evil.example" becomes
      // "//evil.example" once stripped, even though neither raw character at
      // position 0 or 1 is "/" or "\". Verified:
      // new URL('/\t/evil.example', 'https://twinme.me').host === 'evil.example'.
      expect(isSafeRedirectPath('/\t/evil.example')).toBe(false);
    });
    it('refuses an embedded newline', () => {
      expect(isSafeRedirectPath('/money\nevil')).toBe(false);
    });
    it('refuses an embedded carriage return', () => {
      expect(isSafeRedirectPath('/money\revil')).toBe(false);
    });
    it('refuses the DEL control character', () => {
      expect(isSafeRedirectPath('/money\x7Fevil')).toBe(false);
    });
  });

  describe('kept: percent-encoded characters are not raw control bytes', () => {
    it('keeps a percent-encoded tab — it stays same-origin, unlike a raw tab', () => {
      // "%09" is the three printable characters %, 0, 9. The URL parser's
      // tab-stripping step only removes RAW tab bytes, so this never becomes
      // "//evil". Verified: new URL('/%09/evil', 'https://twinme.me').host
      // is 'twinme.me', not 'evil' — documented decision to keep it (the
      // redirect-check task's open question).
      expect(isSafeRedirectPath('/%09/evil')).toBe(true);
    });
  });

  describe('refused: too long', () => {
    it('keeps a path at the 512-character cap', () => {
      const path = '/' + 'a'.repeat(511);
      expect(path.length).toBe(512);
      expect(isSafeRedirectPath(path)).toBe(true);
    });
    it('refuses one character past the cap', () => {
      const path = '/' + 'a'.repeat(512);
      expect(path.length).toBe(513);
      expect(isSafeRedirectPath(path)).toBe(false);
    });
  });

  describe('defensive: non-string / malformed input', () => {
    it('refuses undefined, null and the empty string', () => {
      expect(isSafeRedirectPath(undefined)).toBe(false);
      expect(isSafeRedirectPath(null)).toBe(false);
      expect(isSafeRedirectPath('')).toBe(false);
    });
    it('refuses non-string types', () => {
      expect(isSafeRedirectPath(123)).toBe(false);
      expect(isSafeRedirectPath({})).toBe(false);
      expect(isSafeRedirectPath([])).toBe(false);
    });
  });
});
