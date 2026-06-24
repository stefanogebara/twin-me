/**
 * Provider-side OAuth revocation (audit 2026-06, Milestone 1.3).
 *
 * Before TwinMe deletes a user's stored tokens on disconnect, it should tell the
 * provider to revoke the grant — otherwise "Disconnect" only makes us forget the
 * token while the access we were granted stays live at Google/Discord/GitHub/etc.
 * until it naturally expires (which, for refresh tokens, is effectively never).
 *
 * This is the single shared revocation path used by every disconnect surface so
 * the behavior cannot drift across the (historically duplicated) connector flows.
 *
 * Contract: best-effort. A failed, unsupported, or credential-less revoke NEVER
 * throws to the caller — it returns a structured result the caller logs, then
 * deletes the local row regardless. `revokeProviderGrant` is pure w.r.t. its
 * inputs (network via injectable `fetchImpl`); unit-tested in
 * tests/unit/oauthRevocation.test.js.
 */

import { createLogger } from './logger.js';

const log = createLogger('OAuthRevocation');

const REVOCATION_TIMEOUT_MS = 8000;
// Bound each provider revocation call so a stalled provider can't hold the disconnect
// request path open (audit: CodeRabbit). On timeout the AbortController aborts; the
// caller's try/catch then proceeds with the local disconnect.
async function fetchWithTimeout(fetchImpl, url, init, timeoutMs = REVOCATION_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Provider keys that are backed by Google OAuth (one grant; revoking any token
// revokes the grant). Covers the differing keys used across surfaces:
// connectors.js uses 'youtube'; oauth-callback.js uses 'google_gmail' /
// 'google_calendar'; other code uses 'google' / 'google_workspace'.
export const GOOGLE_PROVIDERS = new Set([
  'google', 'google_workspace', 'google_gmail', 'google_calendar',
  'youtube', 'gmail', 'calendar',
]);

// Providers we can revoke server-side today. Spotify has NO revocation endpoint
// (users revoke via their account's "Apps" page); GitHub PATs (github-connect.js)
// are not app-revocable either — only the GitHub OAuth-app grant is.
export const REVOCABLE_PROVIDERS = new Set([...GOOGLE_PROVIDERS, 'github', 'discord', 'whoop']);

/**
 * Look up the OAuth client credentials for a provider from the environment.
 * Convenience for callers that don't already have the provider config in hand.
 * @param {string} provider
 * @returns {{ clientId?: string, clientSecret?: string }}
 */
export function getProviderClientCreds(provider) {
  const key = (provider || '').toLowerCase();
  if (GOOGLE_PROVIDERS.has(key)) {
    return { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET };
  }
  if (key === 'github') {
    return { clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET };
  }
  if (key === 'discord') {
    return { clientId: process.env.DISCORD_CLIENT_ID, clientSecret: process.env.DISCORD_CLIENT_SECRET };
  }
  if (key === 'whoop') {
    return { clientId: process.env.WHOOP_CLIENT_ID, clientSecret: process.env.WHOOP_CLIENT_SECRET };
  }
  if (key === 'spotify') {
    return { clientId: process.env.SPOTIFY_CLIENT_ID, clientSecret: process.env.SPOTIFY_CLIENT_SECRET };
  }
  return {};
}

/**
 * Revoke a provider's OAuth grant. Best-effort; never throws.
 * @param {object} args
 * @param {string} args.provider              platform key (e.g. 'spotify', 'youtube')
 * @param {string} [args.accessToken]         decrypted access token
 * @param {string} [args.refreshToken]        decrypted refresh token (preferred where the
 *                                            provider revokes the whole grant from it)
 * @param {string} [args.clientId]
 * @param {string} [args.clientSecret]
 * @param {Function} [args.fetchImpl]         injectable fetch (defaults to global fetch)
 * @returns {Promise<{revoked:boolean, skipped?:boolean, reason?:string, status?:number, error?:string}>}
 */
export async function revokeProviderGrant({
  provider,
  accessToken,
  refreshToken,
  clientId,
  clientSecret,
  fetchImpl = fetch,
} = {}) {
  const key = (provider || '').toLowerCase();
  if (!key) return { revoked: false, skipped: true, reason: 'no provider' };

  // Refresh token revokes the entire grant where supported; fall back to access.
  const grantToken = refreshToken || accessToken;
  const doFetch = (url, init) => fetchWithTimeout(fetchImpl, url, init);

  try {
    if (GOOGLE_PROVIDERS.has(key)) {
      if (!grantToken) return { revoked: false, skipped: true, reason: 'no token' };
      const res = await doFetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: grantToken }),
      });
      return res.ok
        ? { revoked: true, status: res.status }
        : { revoked: false, status: res.status, reason: 'provider returned non-ok' };
    }

    if (key === 'github') {
      // OAuth-app grant revocation (NOT for PATs). Revokes all tokens for this
      // app+user. Requires Basic auth with the app's client_id:client_secret.
      if (!accessToken) return { revoked: false, skipped: true, reason: 'no access token' };
      if (!clientId || !clientSecret) return { revoked: false, skipped: true, reason: 'missing client credentials' };
      const res = await doFetch(`https://api.github.com/applications/${clientId}/grant`, {
        method: 'DELETE',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
          'Content-Type': 'application/json',
          'User-Agent': 'TwinMe/1.0',
        },
        body: JSON.stringify({ access_token: accessToken }),
      });
      return res.ok
        ? { revoked: true, status: res.status }
        : { revoked: false, status: res.status, reason: 'provider returned non-ok' };
    }

    if (key === 'discord') {
      if (!grantToken) return { revoked: false, skipped: true, reason: 'no token' };
      if (!clientId || !clientSecret) return { revoked: false, skipped: true, reason: 'missing client credentials' };
      const res = await doFetch('https://discord.com/api/oauth2/token/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          token: grantToken,
          token_type_hint: refreshToken ? 'refresh_token' : 'access_token',
        }),
      });
      return res.ok
        ? { revoked: true, status: res.status }
        : { revoked: false, status: res.status, reason: 'provider returned non-ok' };
    }

    if (key === 'whoop') {
      if (!grantToken) return { revoked: false, skipped: true, reason: 'no token' };
      const res = await doFetch('https://api.prod.whoop.com/oauth/oauth2/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          token: grantToken,
          client_id: clientId || '',
          client_secret: clientSecret || '',
        }),
      });
      return res.ok
        ? { revoked: true, status: res.status }
        : { revoked: false, status: res.status, reason: 'provider returned non-ok' };
    }

    if (key === 'spotify') {
      return { revoked: false, skipped: true, reason: 'Spotify has no token-revocation endpoint' };
    }

    return { revoked: false, skipped: true, reason: `no revocation mapping for ${key}` };
  } catch (err) {
    // Network/DNS/timeout — log and let the caller proceed with local disconnect.
    log.warn('Revocation request failed', { provider: key, error: err?.message });
    return { revoked: false, error: err?.message || String(err) };
  }
}
