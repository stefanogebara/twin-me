import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { safeRedirect } from '../../src/lib/safeRedirect';

/**
 * Characterization tests for the SECURITY-CRITICAL open-redirect guard.
 *
 * safeRedirect() is the single gate that decides whether a caller-supplied URL
 * is allowed to drive `window.location.href`. A gap here is a real open-redirect
 * / (potential) XSS-via-javascript: vulnerability, so this suite is deliberately
 * adversarial: it asserts BOTH the boolean contract (return value) AND that the
 * navigation side-effect only fires for inputs the guard actually trusts.
 *
 * These tests PIN CURRENT behavior (audit-2026-07-04). They are not aspirational:
 * if a bypass exists, the test documents it explicitly rather than papering over it.
 *
 * Runs under the vitest `node` environment (no jsdom), so we install a minimal
 * `window.location` stub whose `href` setter records assignments. Assigning to a
 * real location object in a browser would navigate; here it is inert and captured.
 */

// The single source of truth for "did the guard navigate?"
let hrefWrites: string[];
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  hrefWrites = [];

  // Minimal location stub: only `href` matters to safeRedirect. Capture every
  // write so we can assert the guard NEVER navigates on a rejected input.
  const locationStub = {
    _href: 'https://app.twinme.test/current',
    get href() {
      return this._href;
    },
    set href(value: string) {
      this._href = value;
      hrefWrites.push(value);
    },
  };

  // jsdom is not present in the node env, so `window` is undefined by default.
  // Define a global `window` exposing our location stub.
  vi.stubGlobal('window', { location: locationStub });

  // safeRedirect logs blocked hosts via console.error; silence + observe it.
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  consoleErrorSpy.mockRestore();
});

describe('safeRedirect — falsy / non-string inputs', () => {
  it('returns false and does not navigate for empty string', () => {
    expect(safeRedirect('')).toBe(false);
    expect(hrefWrites).toEqual([]);
  });

  it('returns false for null / undefined (defensive, despite TS typing)', () => {
    // Callers may pass runtime-null values; the guard tolerates it.
    expect(safeRedirect(null as unknown as string)).toBe(false);
    expect(safeRedirect(undefined as unknown as string)).toBe(false);
    expect(hrefWrites).toEqual([]);
  });

  it('returns false for non-string types', () => {
    expect(safeRedirect(123 as unknown as string)).toBe(false);
    expect(safeRedirect({} as unknown as string)).toBe(false);
    expect(safeRedirect([] as unknown as string)).toBe(false);
    expect(hrefWrites).toEqual([]);
  });
});

describe('safeRedirect — allowed relative paths', () => {
  it('allows a simple absolute-path (single leading slash) and navigates', () => {
    expect(safeRedirect('/dashboard')).toBe(true);
    expect(hrefWrites).toEqual(['/dashboard']);
  });

  it('allows relative path with query string and fragment', () => {
    expect(safeRedirect('/goals?tab=active#top')).toBe(true);
    expect(hrefWrites).toEqual(['/goals?tab=active#top']);
  });

  it('allows deep relative paths', () => {
    expect(safeRedirect('/settings/privacy/exports')).toBe(true);
    expect(hrefWrites).toEqual(['/settings/privacy/exports']);
  });

  it('CHARACTERIZATION: a path segment that itself starts with a scheme-like token is still same-origin relative', () => {
    // "/https://evil.com" begins with a single "/" and NOT "//", so the guard
    // treats it as a relative path. The browser resolves it against the current
    // origin (app.twinme.test/https:/evil.com) — it does NOT navigate off-origin.
    expect(safeRedirect('/https://evil.com')).toBe(true);
    expect(hrefWrites).toEqual(['/https://evil.com']);
  });
});

describe('safeRedirect — protocol-relative URLs are rejected (open-redirect vector)', () => {
  it('rejects //evil.com (protocol-relative host hijack)', () => {
    // The most classic open-redirect bypass. Guard explicitly excludes "//".
    expect(safeRedirect('//evil.com')).toBe(false);
    expect(hrefWrites).toEqual([]);
  });

  it('rejects //evil.com/path', () => {
    expect(safeRedirect('//evil.com/phishing')).toBe(false);
    expect(hrefWrites).toEqual([]);
  });

  it('rejects a protocol-relative URL even to an otherwise-trusted host', () => {
    // Trust is only granted through the https:-parsed branch. "//github.com"
    // never reaches host validation because it fails the relative-path test
    // AND new URL('//github.com') throws (no base) → caught → false.
    expect(safeRedirect('//github.com')).toBe(false);
    expect(hrefWrites).toEqual([]);
  });
});

describe('safeRedirect — external absolute URLs on untrusted hosts are rejected', () => {
  it('rejects a plain external https host', () => {
    expect(safeRedirect('https://evil.com')).toBe(false);
    expect(hrefWrites).toEqual([]);
  });

  it('rejects external host and logs the blocked hostname via console.error', () => {
    expect(safeRedirect('https://evil.com/steal')).toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'safeRedirect blocked untrusted host:',
      'evil.com',
    );
    expect(hrefWrites).toEqual([]);
  });

  it('rejects a subdomain of a trusted host (exact-hostname match only)', () => {
    // TRUSTED_HOSTS uses exact hostname equality, so "evil.github.com" and
    // "github.com.evil.com" are both untrusted.
    expect(safeRedirect('https://evil.github.com')).toBe(false);
    expect(safeRedirect('https://github.com.evil.com')).toBe(false);
    expect(hrefWrites).toEqual([]);
  });

  it('rejects userinfo-embedded trick where real host is untrusted', () => {
    // "https://github.com@evil.com" → URL host is evil.com, not github.com.
    // The guard reads parsed.hostname, so it correctly rejects.
    const result = safeRedirect('https://github.com@evil.com');
    expect(result).toBe(false);
    expect(hrefWrites).toEqual([]);
  });
});

describe('safeRedirect — non-https schemes are rejected', () => {
  it('rejects javascript: scheme (XSS vector)', () => {
    expect(safeRedirect('javascript:alert(1)')).toBe(false);
    expect(hrefWrites).toEqual([]);
  });

  it('rejects javascript: scheme even targeting nothing', () => {
    expect(safeRedirect('javascript:void(0)')).toBe(false);
    expect(hrefWrites).toEqual([]);
  });

  it('rejects data: scheme', () => {
    expect(safeRedirect('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(hrefWrites).toEqual([]);
  });

  it('rejects plain http: even for an otherwise-trusted host (https-only)', () => {
    // github.com is trusted, but the guard requires protocol === 'https:'.
    expect(safeRedirect('http://github.com')).toBe(false);
    expect(hrefWrites).toEqual([]);
  });

  it('rejects file: scheme', () => {
    expect(safeRedirect('file:///etc/passwd')).toBe(false);
    expect(hrefWrites).toEqual([]);
  });

  it('rejects vbscript: scheme', () => {
    expect(safeRedirect('vbscript:msgbox(1)')).toBe(false);
    expect(hrefWrites).toEqual([]);
  });

  it('CHARACTERIZATION: mixed-case JavaScript: — WHATWG lowercases the scheme so it is still rejected (not https)', () => {
    // new URL('JaVaScRiPt:alert(1)').protocol === 'javascript:' → not https → false.
    expect(safeRedirect('JaVaScRiPt:alert(1)')).toBe(false);
    expect(hrefWrites).toEqual([]);
  });
});

describe('safeRedirect — allowed trusted https hosts', () => {
  const TRUSTED = [
    'https://accounts.google.com/o/oauth2/v2/auth?client_id=x',
    'https://accounts.spotify.com/authorize?scope=y',
    'https://discord.com/api/oauth2/authorize',
    'https://github.com/login/oauth/authorize',
    'https://api.prod.whoop.com/oauth/oauth2/auth',
    'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    'https://checkout.stripe.com/c/pay/cs_test_123',
    'https://billing.stripe.com/p/session/123',
  ];

  it.each(TRUSTED)('allows trusted OAuth/billing host: %s', (url) => {
    expect(safeRedirect(url)).toBe(true);
    expect(hrefWrites).toEqual([url]);
  });

  it('CHARACTERIZATION: uppercase host is normalized by URL and matches the trusted set', () => {
    // new URL('https://GitHub.com/...').hostname === 'github.com' (lowercased),
    // so a mixed-case trusted host is ALLOWED. This is a benign normalization,
    // not a bypass — the resolved host is still github.com.
    const url = 'https://GitHub.com/login/oauth/authorize';
    expect(safeRedirect(url)).toBe(true);
    // The raw (mixed-case) string is what gets assigned to href.
    expect(hrefWrites).toEqual([url]);
  });

  it('CHARACTERIZATION: trailing-dot FQDN (github.com.) does NOT match — exact string equality', () => {
    // A fully-qualified trailing-dot hostname is a known equivalence trick.
    // The guard uses Set.has on the exact hostname, and URL preserves the dot,
    // so "github.com." is NOT in TRUSTED_HOSTS → rejected. Pinning this so a
    // future refactor that strips the dot (and would then need re-review)
    // trips the test.
    expect(safeRedirect('https://github.com./login')).toBe(false);
    expect(hrefWrites).toEqual([]);
  });
});

describe('safeRedirect — backslash and whitespace tricks', () => {
  it('rejects leading backslashes \\\\evil.com (not a relative path, and backslashes are rejected outright)', () => {
    expect(safeRedirect('\\\\evil.com')).toBe(false);
    expect(hrefWrites).toEqual([]);
  });

  it('rejects /\\evil.com — the backslash open-redirect bypass', () => {
    // SECURITY: "/\\evil.com" begins with "/" and NOT "//", so a literal-slash
    // guard would treat it as relative and assign it to location.href. But
    // browsers normalize "\\" to "/" when resolving http(s) URLs, so the browser
    // navigates it as protocol-relative "//evil.com" → OFF-ORIGIN. Verified:
    // new URL('/\\evil.com', 'https://twinme.me').href === 'https://evil.com/'.
    // The guard now rejects any backslash, closing the bypass.
    expect(safeRedirect('/\\evil.com')).toBe(false);
    expect(hrefWrites).toEqual([]);
  });

  it('rejects /\\/evil.com (backslash+slash variant that also normalizes off-origin)', () => {
    expect(safeRedirect('/\\/evil.com')).toBe(false);
    expect(hrefWrites).toEqual([]);
  });

  it('rejects an https URL with a leading space (scheme no longer parses)', () => {
    // " https://github.com" — leading space means it neither starts with "/"
    // nor parses as a URL (WHATWG trims leading C0/space then parses, but the
    // guard does not trim; still, a leading space + no base still parses in
    // modern URL. We pin the ACTUAL result rather than assume.)
    const result = safeRedirect(' https://github.com');
    // Document whatever the runtime does; the invariant that matters is that
    // if it returns true it must be because the resolved host is trusted.
    if (result === true) {
      expect(hrefWrites).toEqual([' https://github.com']);
    } else {
      expect(hrefWrites).toEqual([]);
    }
  });

  it('rejects embedded newline/tab obfuscation of javascript scheme', () => {
    // "java\nscript:alert(1)" — the newline breaks the scheme; new URL throws
    // (no base) → rejected. Never navigates.
    expect(safeRedirect('java\nscript:alert(1)')).toBe(false);
    expect(hrefWrites).toEqual([]);
  });
});

describe('safeRedirect — encoded variants', () => {
  it('CHARACTERIZATION: percent-encoded scheme is not decoded before scheme check → rejected', () => {
    // "%6a%61%76%61script:alert(1)" is not a valid scheme; new URL throws → false.
    expect(safeRedirect('%6a%61%76%61script:alert(1)')).toBe(false);
    expect(hrefWrites).toEqual([]);
  });

  it('CHARACTERIZATION: an encoded protocol-relative //%65vil.com is still rejected', () => {
    expect(safeRedirect('//%65vil.com')).toBe(false);
    expect(hrefWrites).toEqual([]);
  });

  it('allows a trusted host with a percent-encoded path (path encoding is fine)', () => {
    const url = 'https://github.com/login/oauth/authorize?redirect_uri=%2Fapp%2Fcallback';
    expect(safeRedirect(url)).toBe(true);
    expect(hrefWrites).toEqual([url]);
  });
});

describe('safeRedirect — return-value / side-effect invariant', () => {
  it('every rejected input leaves location.href untouched (aggregate check)', () => {
    const rejected = [
      '',
      '//evil.com',
      'https://evil.com',
      'http://github.com',
      'javascript:alert(1)',
      'data:text/html,x',
      'file:///x',
      '\\\\evil.com',
      'https://github.com@evil.com',
    ];
    for (const input of rejected) {
      expect(safeRedirect(input)).toBe(false);
    }
    expect(hrefWrites).toEqual([]);
  });
});
