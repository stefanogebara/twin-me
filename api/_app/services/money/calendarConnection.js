/**
 * The Google Calendar connection: the consent's sealed state, and the tokens it is exchanged for.
 * ===========================================================================================
 * GET /money/calendar/connect seals a state and sends the person to Google; Google sends them
 * back to /oauth/callback on the site, and that page posts the code and the state to
 * POST /money/calendar/callback under the person's own session. Until 2026-09-26 the page posted
 * to /connectors/callback, which left with the twin and answers 410: nobody could connect a
 * calendar at all.
 *
 * The connection is written in the shape the calendar read already takes (getValidAccessToken
 * in tokenRefreshService.js, called by calendar.js): one platform_connections row per person
 * for 'google_calendar', both tokens sealed with encryptToken, the expiry in token_expires_at,
 * connected_at set, status 'connected'. Only what the calendar needs was ported from the old
 * connectors callback, which exchanged the same code the same way.
 */
import { supabaseAdmin } from '../database.js';
import { decryptState, encryptToken } from '../encryption.js';
import { createLogger } from '../logger.js';

const log = createLogger('MoneyCalendarConnection');

export const PLATFORM = 'google_calendar';
/** What the money calendar reads: the primary calendar's events, and nothing else. */
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
/** A grant that holds any of these can list events; one that holds none cannot read a diary. */
const CALENDAR_SCOPES = new Set([
  CALENDAR_SCOPE,
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.events.readonly',
]);
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
/** A consent is finished within this, or begun again. */
export const CONNECT_STATE_MAX_AGE_MS = 15 * 60 * 1000;
/** Two instances' clocks may disagree by a little; a state from the future by more is not ours. */
const CLOCK_SKEW_MS = 60 * 1000;
export const EXCHANGE_TIMEOUT_MS = 10000;

/**
 * A way back that stays on this site: one leading slash, then neither a slash nor a backslash,
 * no backslash anywhere, and no control character (a browser drops a tab or a newline from a
 * URL, so "/<tab>/host" would be read as "//host"). Anything else is the money page.
 */
export function sitePath(value, fallback = '/money') {
  if (typeof value !== 'string' || !/^\/(?![/\\])/.test(value) || value.includes('\\')) return fallback;
  for (let i = 0; i < value.length; i += 1) {
    const c = value.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return fallback;
  }
  return value;
}

const refused = (status, why, error) => ({ ok: false, status, why, error });

/**
 * What the sealed state says, checked for this person now: a calendar consent, under fifteen
 * minutes old, begun by the same person who is finishing it. The state is AES-GCM sealed by
 * this server (encryptState, 'connector.' prefix), so only its fields need checking.
 * { ok: true, returnUrl } or { ok: false, status, why, error }. Pure but for the key.
 */
export function readConnectState(sealed, userId, { now = Date.now() } = {}) {
  let state;
  try {
    state = decryptState(String(sealed || ''));
  } catch {
    return refused(400, 'state not sealed here', 'That calendar connection could not be read. Connect it again.');
  }
  if (!state || typeof state !== 'object' || state.provider !== PLATFORM) {
    return refused(400, 'not a calendar state', 'That was not a calendar connection. Connect it again.');
  }
  const age = now - Number(state.timestamp);
  if (!Number.isFinite(age) || age < -CLOCK_SKEW_MS || age >= CONNECT_STATE_MAX_AGE_MS) {
    return refused(400, 'state too old', 'That calendar connection took too long. Connect it again.');
  }
  if (!state.userId || String(state.userId) !== String(userId)) {
    return refused(403, 'begun by another person', 'That calendar connection was started from another account.');
  }
  return { ok: true, returnUrl: sitePath(state.returnUrl) };
}

const exchangeFailed = (reason) => Object.assign(new Error(`Google calendar exchange failed: ${reason}`), { code: 'calendar_exchange_failed' });

/** The code, exchanged at Google for tokens. Throws `calendar_exchange_failed` with the reason. */
async function exchange(code, redirectUri, fetchImpl) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw exchangeFailed('GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is not set');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXCHANGE_TIMEOUT_MS);
  let response;
  let body;
  try {
    response = await fetchImpl(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }).toString(),
      signal: controller.signal,
    });
    body = await response.json().catch((e) => ({ error: `unreadable answer: ${e.message}` }));
  } catch (e) {
    throw exchangeFailed(e.name === 'AbortError' ? 'timed out' : e.message);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw exchangeFailed(`${response.status} ${body?.error || ''} ${body?.error_description || ''}`.trim());
  if (!body?.access_token) throw exchangeFailed('no access token in the answer');
  return body;
}

/** The refresh token already held for this person, sealed, or null. Throws on a failed read. */
async function heldRefreshToken(userId) {
  const { data, error } = await supabaseAdmin.from('platform_connections')
    .select('refresh_token').eq('user_id', userId).eq('platform', PLATFORM).maybeSingle();
  if (error) throw new Error(`calendar connection lookup failed: ${error.message}`);
  return data?.refresh_token || null;
}

/**
 * Exchange the consent's code and keep the connection for this person. The redirect must be
 * the one the consent was given. A refresh token already held is kept when Google sends none;
 * with neither, the connection would die with its first access token, so it is not kept.
 * Throws `calendar_exchange_failed` when Google does not give a usable calendar grant, and a
 * plain error when the database cannot read or keep the row.
 */
export async function connectGoogleCalendar(userId, { code, redirectUri }, { fetchImpl = fetch, now = new Date() } = {}) {
  const tokens = await exchange(code, redirectUri, fetchImpl);
  const scopes = String(tokens.scope || '').split(/\s+/).filter(Boolean);
  /* Google's consent can let a person untick a permission. Without calendar access the row
     would read as connected and every read would fail; an answer that names no scope is
     not second-guessed. */
  if (scopes.length && !scopes.some((s) => CALENDAR_SCOPES.has(s))) throw exchangeFailed('calendar access was not granted');
  const refreshToken = tokens.refresh_token ? encryptToken(tokens.refresh_token) : await heldRefreshToken(userId);
  if (!refreshToken) throw exchangeFailed('no refresh token, and none held');
  const nowIso = now.toISOString();
  const expiresIn = Number(tokens.expires_in) > 0 ? Number(tokens.expires_in) : 3600;
  const { error } = await supabaseAdmin.from('platform_connections').upsert({
    user_id: userId,
    platform: PLATFORM,
    access_token: encryptToken(tokens.access_token),
    refresh_token: refreshToken,
    token_expires_at: new Date(now.getTime() + expiresIn * 1000).toISOString(),
    scopes,
    status: 'connected',
    connected_at: nowIso,
    /* A refused refresh left 'failed' and Google's words here; a new consent clears them. */
    last_sync_status: 'pending',
    last_sync_error: null,
    updated_at: nowIso,
  }, { onConflict: 'user_id,platform' });
  if (error) throw new Error(`calendar connection not saved: ${error.message}`);
  log.info('google calendar connected', { userId, scopes: scopes.length, keptRefreshToken: !tokens.refresh_token });
}
