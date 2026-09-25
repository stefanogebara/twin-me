/**
 * The one rule for "is this a same-origin path, safe to hand back in a
 * res.redirect() or store as redirect_after_auth" — kept in sync by hand with
 * the front-end copy, isSafeRedirectPath in src/lib/safeRedirect.ts (same
 * behaviour; no shared package between the two runtimes).
 *
 * SECURITY (open-redirect bypass, react-router GHSA-wrjc-x8rr-h8h6-shaped): a
 * literal-slash guard ("starts with / and not //") is not enough.
 *
 *  - Browsers normalize a backslash to a forward slash when resolving an
 *    http(s) URL, so "/\evil.example" is navigated as the protocol-relative
 *    "//evil.example" and leaves the site. Verified:
 *    new URL('/\\evil.example', 'https://twinme.me').href === 'https://evil.example/'.
 *    Backslash is rejected anywhere in the value, not only right after the
 *    leading slash — "/a\evil" resolves off-origin too.
 *  - The WHATWG URL parser strips every ASCII tab/CR/LF from the *whole*
 *    input before resolving it, so "/<TAB>/evil.example" (a raw tab, not the
 *    three characters "%09") becomes "//evil.example" once stripped and
 *    leaves the site, even though neither raw character at position 0 or 1
 *    is "/" or "\". Verified:
 *    new URL('/\t/evil.example', 'https://twinme.me').host === 'evil.example'.
 *    Every ASCII control character is rejected anywhere in the value — none
 *    has a legitimate reason to appear in a redirect path.
 *  - A percent-encoded tab ("/%09/evil") is untouched by that stripping step
 *    (it is just the three printable characters %, 0, 9) and stays
 *    same-origin, so it is kept. Verified:
 *    new URL('/%09/evil', 'https://twinme.me').host === 'twinme.me'.
 */

const MAX_REDIRECT_PATH_LENGTH = 512;
// eslint-disable-next-line no-control-regex -- deliberately matching ASCII C0 controls + DEL
const CONTROL_CHAR_RE = /[\x00-\x1f\x7f]/;

export function isSafeRedirectPath(value) {
  if (typeof value !== 'string') return false;
  if (value.length === 0 || value.length > MAX_REDIRECT_PATH_LENGTH) return false;
  if (value[0] !== '/') return false;
  if (value.includes('\\')) return false;
  if (value[1] === '/') return false;
  if (CONTROL_CHAR_RE.test(value)) return false;
  return true;
}
