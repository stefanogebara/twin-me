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

const authContextSrc = readFileSync(AUTH_CONTEXT_FILE, 'utf8');
const authSimpleSrc = readFileSync(AUTH_SIMPLE_FILE, 'utf8');
const singleFlightSrc = readFileSync(SINGLE_FLIGHT_FILE, 'utf8');
const oauthCallbackSrc = readFileSync(OAUTH_CALLBACK_FILE, 'utf8');

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
    const claimWithCreds =
      /fetch\(\s*`[^`]*\/auth\/oauth\/claim[^`]*`\s*,\s*\{[^}]*credentials:\s*['"]include['"]/;
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
