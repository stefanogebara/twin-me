/**
 * Connect Link Service — generate a per-user OAuth connect link for WhatsApp
 * ==========================================================================
 * Lets the twin hand the user a "Connect <platform>" link/button over WhatsApp.
 * Reuses the existing Nango connect-session flow (the same one the web app
 * uses), scoped to ONE integration and to the WhatsApp-resolved userId — no web
 * login needed. When the user finishes OAuth in Nango's hosted UI, Nango's
 * webhook (/api/nango-webhooks) registers the connection server-side, so there
 * is no frontend "verify" step to miss.
 *
 * Security: the link is created for the userId resolved from the inbound
 * WhatsApp number (a channel the user themselves linked), and Nango session
 * tokens are short-lived — so the link only ever grants access to the user's
 * own account.
 */

import { createConnectSession, PLATFORM_CONFIGS } from './nangoService.js';
import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';

const log = createLogger('ConnectLink');

// User-facing aliases (pt-BR + en) → Nango providerConfigKey. The Nango id is
// NOT always the obvious word (GitHub → 'github-getting-started', Gmail →
// 'google-mail'), so map explicitly rather than guessing.
const PLATFORM_ALIASES = Object.freeze({
  spotify: 'spotify', musica: 'spotify', 'música': 'spotify', music: 'spotify',
  gmail: 'google-mail', email: 'google-mail', 'e-mail': 'google-mail', mail: 'google-mail',
  calendar: 'google-calendar', calendario: 'google-calendar', 'calendário': 'google-calendar', agenda: 'google-calendar',
  youtube: 'youtube', yt: 'youtube',
  github: 'github-getting-started', git: 'github-getting-started',
  discord: 'discord',
  whoop: 'whoop',
  outlook: 'outlook',
});

export const SUPPORTED_CONNECT_PLATFORMS = Object.freeze([...new Set(Object.values(PLATFORM_ALIASES))]);

/** Resolve a user-facing platform word to a Nango integration id, or null. */
export function resolveIntegrationId(platform) {
  if (!platform) return null;
  return PLATFORM_ALIASES[String(platform).trim().toLowerCase()] || null;
}

// Connect verbs — deliberately EXCLUDES "liga/ligar" (that's place_call:
// "liga pro restaurante"). Connect intent needs both a connect verb AND a
// known platform (or an explicit "accounts/contas" menu request).
const CONNECT_VERB = /\b(connect|conecta|conectar|conecte|vincula|vincular|vincule|integra|integrar|link)\b/i;
const MENU_WORD = /\b(accounts?|contas?|tudo|everything|plataformas?|platforms?|apps?)\b/i;

/**
 * Classify a message as a connect intent. Returns { platform } where platform is
 * a known alias, { platform: null } for a generic "connect my accounts" (offer
 * the menu), or null when it isn't a connect request. Deterministic, no LLM.
 */
export function classifyConnectIntent(text) {
  const t = String(text || '').trim();
  if (!t || t.length > 140) return null;
  if (!CONNECT_VERB.test(t)) return null;

  // Unicode-aware tokenization so accented aliases (música, calendário) match.
  const tokens = new Set(t.toLowerCase().split(/[^\p{L}0-9-]+/u).filter(Boolean));
  for (const alias of Object.keys(PLATFORM_ALIASES)) {
    if (tokens.has(alias)) return { platform: alias };
  }
  if (MENU_WORD.test(t)) return { platform: null };
  return null; // connect verb alone is too ambiguous — let normal chat handle it
}

function displayName(integrationId) {
  const cfg = Object.values(PLATFORM_CONFIGS).find((c) => c.providerConfigKey === integrationId);
  return cfg?.name || integrationId;
}

/**
 * Build a one-platform Nango connect link for a user. Never throws — returns
 * { success, platform, integrationId, url } or { success:false, error, message }.
 */
export async function buildConnectLink(userId, platform) {
  if (!userId) return { success: false, error: 'missing_user', message: 'No user to connect.' };
  const integrationId = resolveIntegrationId(platform);
  if (!integrationId) {
    return { success: false, error: 'unknown_platform', message: `I don't know how to connect "${platform}". I can connect: Spotify, Gmail, Google Calendar, YouTube, GitHub, Discord, Whoop, Outlook.` };
  }

  let email = null;
  try {
    const { data } = await supabaseAdmin.from('users').select('email').eq('id', userId).single();
    email = data?.email || null;
  } catch { /* non-fatal — display name falls back to the userId prefix */ }

  const res = await createConnectSession(userId, email, { integrationId });
  if (!res?.success || !res.connectLink) {
    log.warn('connect session failed', { userId, integrationId, error: res?.error });
    return { success: false, error: res?.code || 'connect_session_failed', message: res?.error || 'Could not create a connect link right now.' };
  }

  log.info('connect link built', { userId, integrationId });
  return { success: true, platform: displayName(integrationId), integrationId, url: res.connectLink };
}
