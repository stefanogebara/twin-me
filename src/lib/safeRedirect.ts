// replan-2026-06-10 Track C: hosts for retired OAuth stacks (reddit, twitch,
// linkedin, notion, pinterest, strava, fitbit, soundcloud) removed — nothing
// redirects there anymore.
const TRUSTED_HOSTS = new Set([
  'accounts.google.com',
  'accounts.spotify.com',
  'discord.com',
  'github.com',
  'api.prod.whoop.com',
  'login.microsoftonline.com',
  'checkout.stripe.com',
  'billing.stripe.com',
]);

const MAX_REDIRECT_PATH_LENGTH = 512;
// eslint-disable-next-line no-control-regex -- deliberately matching ASCII C0 controls + DEL
const CONTROL_CHAR_RE = /[\x00-\x1f\x7f]/;

/**
 * The one rule for "is this a same-origin path, safe to hand to navigate() or
 * window.location.href" — shared with the server's copy,
 * isSafeRedirectPath in api/_app/utils/safeRedirect.js (same behaviour; no
 * shared package between the two runtimes).
 *
 * Security (open-redirect bypass, react-router GHSA-wrjc-x8rr-h8h6-shaped): a
 * literal-slash guard ("starts with / but not //") is not enough.
 *
 *  - Browsers normalize a backslash to a forward slash when resolving an
 *    http(s) URL, so "/\evil.com" navigates as the protocol-relative
 *    "//evil.com" and leaves the site. Verified:
 *    new URL('/\\evil.com', 'https://twinme.me').href === 'https://evil.com/'.
 *    Backslash is rejected anywhere in the value, not only right after the
 *    leading slash — "/a\evil" resolves off-origin too.
 *  - The WHATWG URL parser strips every ASCII tab/CR/LF from the *whole*
 *    input before resolving it, so "/<TAB>/evil.com" (a raw tab, not the
 *    three characters "%09") becomes "//evil.com" once stripped and leaves
 *    the site, even though neither character at position 0 or 1 is "/" or
 *    "\". Verified: new URL('/\t/evil.com', origin).host === 'evil.com'.
 *    Every ASCII control character is rejected anywhere in the value — none
 *    has a legitimate reason to appear in a redirect path.
 *  - A percent-encoded tab ("/%09/evil") is untouched by that stripping
 *    step (it is just the three printable characters %, 0, 9) and stays
 *    same-origin, so it is kept. Verified:
 *    new URL('/%09/evil', origin).host === origin's own host.
 */
export function isSafeRedirectPath(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (value.length === 0 || value.length > MAX_REDIRECT_PATH_LENGTH) return false;
  if (value[0] !== '/') return false;
  if (value.includes('\\')) return false;
  if (value[1] === '/') return false;
  if (CONTROL_CHAR_RE.test(value)) return false;
  return true;
}

export function safeRedirect(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  // Security (open-redirect bypass): browsers normalize backslashes to forward
  // slashes when resolving http(s) URLs, so "/\evil.com" is navigated as the
  // protocol-relative "//evil.com" and goes OFF-ORIGIN. The "//" guard below is
  // literal-forward-slash only, so a lone backslash would slip past it. Reject
  // any backslash outright — no legitimate redirect target contains one.
  // Verified via WHATWG URL: new URL('/\\evil.com', origin).href === 'https://evil.com/'.
  if (url.includes('\\')) return false;
  // Relative paths (but not protocol-relative, or control-character tricked
  // into becoming one — see isSafeRedirectPath above).
  if (isSafeRedirectPath(url)) {
    window.location.href = url;
    return true;
  }
  // HTTPS with trusted host only
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    if (!TRUSTED_HOSTS.has(parsed.hostname)) {
      console.error('safeRedirect blocked untrusted host:', parsed.hostname);
      return false;
    }
    window.location.href = url;
    return true;
  } catch {
    return false;
  }
}
