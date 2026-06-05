/**
 * Static source audits guarding the audit-2026-05-12 auth fixes.
 *
 * Bug C1 (CRITICAL): magic-link signin landed on /auth?error=session_expired
 *   - Root cause: React 18 StrictMode fired two concurrent /auth/refresh
 *     calls. Server-side refresh-token rotation made call #2 invalid.
 *   - Fix: wrap refreshAccessToken in singleFlight() so concurrent callers
 *     share one in-flight promise.
 *
 * Bug H11 (HIGH): /settings showed "Authentication: Managed via Google OAuth"
 *   after a magic_link signin
 *   - Root cause: magic-link verify only set oauth_provider='magic_link' for
 *     NEW users. Existing users kept the stale 'google' value.
 *   - Fix: UPDATE users SET oauth_provider='magic_link', updated_at=NOW()
 *     on every successful magic-link verify of an existing user.
 *
 * Bug D1 (CRITICAL): desktop (Tauri) Google sign-in landed on
 *   /auth?error=session_expired after a SUCCESSFUL deep-link return.
 *   - Symptom: GET /api/auth/oauth/claim returned 200 with the access token,
 *     the app reopened, but then bounced to session_expired.
 *   - Root cause: the GET /oauth/claim fetch in OAuthCallback omitted
 *     credentials:'include', so the browser/WebView2 silently DROPPED the
 *     Set-Cookie (refresh_token) response header. The access token is held
 *     in-memory only, so the hard nav to /soul-reveal lost it, and the next
 *     /auth/refresh came through with no cookie -> 401 -> session_expired.
 *   - Fix: add credentials:'include' to the claim fetch — identical to the
 *     POST /oauth/callback fix already documented inline in OAuthCallback.tsx.
 *
 * These tests are pure source-text audits (no DB, no React, no network).
 * They guard against accidental regressions where a future refactor strips
 * the singleFlight wrapper or the oauth_provider update.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUTH_CONTEXT_FILE = resolve(__dirname, '../../src/contexts/AuthContext.tsx');
const AUTH_SIMPLE_FILE = resolve(__dirname, '../../api/routes/auth-simple.js');
const SINGLE_FLIGHT_FILE = resolve(__dirname, '../../src/utils/singleFlight.ts');
const OAUTH_CALLBACK_FILE = resolve(__dirname, '../../src/pages/OAuthCallback.tsx');
const API_BASE_FILE = resolve(__dirname, '../../src/services/api/apiBase.ts');

const authContextSrc = readFileSync(AUTH_CONTEXT_FILE, 'utf8');
const authSimpleSrc = readFileSync(AUTH_SIMPLE_FILE, 'utf8');
const singleFlightSrc = readFileSync(SINGLE_FLIGHT_FILE, 'utf8');
const oauthCallbackSrc = readFileSync(OAUTH_CALLBACK_FILE, 'utf8');
const apiBaseSrc = readFileSync(API_BASE_FILE, 'utf8');

describe('Bug C1 — refresh token race fix', () => {
  it('AuthContext imports singleFlight from utils', () => {
    expect(authContextSrc).toMatch(/from\s+['"]@\/utils\/singleFlight['"]/);
  });

  it('AuthContext wraps refresh logic in a stable singleFlight ref', () => {
    // The wrapper must be a useRef so React renders don't recreate the
    // in-flight slot each time (which would defeat the dedup).
    expect(authContextSrc).toMatch(/singleFlight\s*\(/);
    expect(authContextSrc).toMatch(/refreshSingleFlightRef/);
  });

  it('singleFlight helper exists and exposes the contract', () => {
    expect(singleFlightSrc).toMatch(/export\s+function\s+singleFlight/);
    expect(singleFlightSrc).toMatch(/isInFlight/);
  });

  it('refreshAccessToken delegates to the singleFlight wrapper', () => {
    // The public refreshAccessToken function must call through the ref —
    // not re-implement the fetch directly, otherwise the dedup is bypassed.
    expect(authContextSrc).toMatch(/refreshAccessToken\s*=\s*\(\)\s*:\s*Promise<boolean>\s*=>\s*refreshSingleFlightRef/);
  });
});

describe('Bug H11 — magic-link oauth_provider stale value fix', () => {
  it('magic-link verify updates oauth_provider for EXISTING users', () => {
    // Look for the else branch that handles existing users with an update
    // setting oauth_provider = 'magic_link'.
    const updatesExisting = /\.update\(\s*\{\s*oauth_provider:\s*['"]magic_link['"]/.test(authSimpleSrc);
    expect(updatesExisting).toBe(true);
  });

  it('magic-link verify still sets oauth_provider on user CREATE (regression guard)', () => {
    // The new-user insert path must still set 'magic_link' — don't lose
    // this on refactors.
    expect(authSimpleSrc).toMatch(/insert\(\s*\{[\s\S]{0,400}oauth_provider:\s*['"]magic_link['"][\s\S]{0,400}\}\s*\)/);
  });

  it('the existing-user update touches updated_at', () => {
    // updated_at must move forward so "last signin method" is reflected
    // in any downstream caching/UI logic.
    const pattern = /oauth_provider:\s*['"]magic_link['"][\s\S]{0,200}updated_at:/;
    expect(pattern.test(authSimpleSrc)).toBe(true);
  });

  it('the existing-user update targets users by id (not email)', () => {
    // Defensive: matching on email instead of id is a footgun if email
    // case-normalization ever drifts. id is the canonical FK target
    // (memories, twin_goals, etc.).
    const updateBlock = authSimpleSrc.match(
      /\.update\(\s*\{\s*oauth_provider:\s*['"]magic_link['"][\s\S]{0,200}\.eq\(['"]id['"]/
    );
    expect(updateBlock).not.toBeNull();
  });
});

describe('Bug D1 — desktop deep-link claim must persist the refresh cookie', () => {
  it('the GET /auth/oauth/claim fetch sends credentials:include', () => {
    // The claim fetch (the desktop/mobile deep-link path) MUST pass
    // credentials:'include' or the Set-Cookie (refresh_token) is dropped and
    // the session can't survive the post-claim hard nav to /soul-reveal.
    // (Loose span: Phase 6 appends a `+ (client=mobile)` to the URL between the
    // template literal and the options object, so don't anchor on the backtick.)
    const claimWithCreds =
      /\/auth\/oauth\/claim[\s\S]{0,200}credentials:\s*['"]include['"]/;
    expect(claimWithCreds.test(oauthCallbackSrc)).toBe(true);
  });

  it('the POST /auth/oauth/callback fetch still sends credentials (regression guard)', () => {
    // The sibling auth-callback path already carries credentials:'include';
    // a refactor must not strip it (it was the original session_expired fix).
    const callbackWithCreds =
      /\/auth\/oauth\/callback`,\s*\{[\s\S]{0,400}credentials:\s*['"]include['"]/;
    expect(callbackWithCreds.test(oauthCallbackSrc)).toBe(true);
  });
});

describe('Bug D2 — desktop claim session survives WebView2 dropping the refresh cookie', () => {
  // Even WITH credentials:'include' (Bug D1), the Tauri WebView2 still drops the
  // refresh_token cookie that /oauth/claim sets when the page was reached via a
  // twinme:// deep link (sameSite=Strict + custom-scheme navigation). The claim
  // returns 200 but the post-reload /auth/refresh 401s -> session_expired.
  // Proven in prod: claim 200 followed by three /auth/refresh 401s.
  // Fix: OAuthCallback stashes the freshly-claimed access token in sessionStorage
  // (which WebView2 DOES persist across same-origin navigations); AuthContext
  // rehydrates the session from it via the Authorization header (cookie-
  // independent) before falling back to the cookie-based refresh.
  it('OAuthCallback stashes the claimed access token for cookie-less recovery', () => {
    const stash = /sessionStorage\.setItem\(\s*['"]oauth_bootstrap_token['"]\s*,\s*claimData\.token/;
    expect(stash.test(oauthCallbackSrc)).toBe(true);
  });

  it('AuthContext reads and clears the bootstrap token (one-time use)', () => {
    expect(authContextSrc).toMatch(/sessionStorage\.getItem\(\s*['"]oauth_bootstrap_token['"]\s*\)/);
    expect(authContextSrc).toMatch(/sessionStorage\.removeItem\(\s*['"]oauth_bootstrap_token['"]\s*\)/);
  });

  it('AuthContext consults the bootstrap token BEFORE the cookie refresh fallback', () => {
    // Ordering matters: if the cookie refresh runs first and trips
    // refreshDisabledForSession, the bootstrap recovery is moot.
    const bootstrapIdx = authContextSrc.indexOf('oauth_bootstrap_token');
    const refreshFallbackIdx = authContextSrc.indexOf('await refreshAccessToken()');
    expect(bootstrapIdx).toBeGreaterThan(-1);
    expect(refreshFallbackIdx).toBeGreaterThan(-1);
    expect(bootstrapIdx).toBeLessThan(refreshFallbackIdx);
  });
});

describe('Phase 6 — desktop sync token refresh (keyring + body-based /auth/refresh)', () => {
  // The headless clip/meeting sync ran on a 30-min access token with no refresh
  // path, so uploads 401ed once it expired (zero successful syncs in 24h). Fix:
  // the desktop claims as a 'mobile'-class client to receive the rotating refresh
  // token, hands it to the OS keyring (Rust), and the sync + webview mint fresh
  // access tokens via the backend's body-based /auth/refresh (no cookie needed).
  it('OAuthCallback claims as a mobile client on desktop to receive the refresh token', () => {
    // Gated on __TAURI__ so only the desktop opts in — web claims stay cookie-only.
    expect(oauthCallbackSrc).toMatch(/__TAURI__[\s\S]{0,300}client=mobile/);
  });

  it('OAuthCallback hands the claimed refresh token to the desktop keyring', () => {
    expect(oauthCallbackSrc).toMatch(/pushRefreshTokenToDesktop\(\s*claimData\.refreshToken/);
  });

  it('apiBase bridges store_refresh_token + get_fresh_access_token to Tauri', () => {
    expect(apiBaseSrc).toMatch(/export function pushRefreshTokenToDesktop/);
    expect(apiBaseSrc).toMatch(/invoke\(\s*['"]store_refresh_token['"]/);
    expect(apiBaseSrc).toMatch(/export async function getDesktopFreshAccessToken/);
    expect(apiBaseSrc).toMatch(/invoke\(\s*['"]get_fresh_access_token['"]/);
  });

  it('AuthContext tries the desktop keyring token before the cookie refresh', () => {
    const desktopIdx = authContextSrc.indexOf('getDesktopFreshAccessToken()');
    const cookieRefreshIdx = authContextSrc.indexOf('await refreshAccessToken()');
    expect(desktopIdx).toBeGreaterThan(-1);
    expect(cookieRefreshIdx).toBeGreaterThan(-1);
    expect(desktopIdx).toBeLessThan(cookieRefreshIdx);
  });
});
