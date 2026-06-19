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

import { createConnectSession, getAllConnections, deleteConnection, PLATFORM_CONFIGS } from './nangoService.js';
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

// One canonical user-word per Nango integration, for the interactive menu's row
// ids (id = `connect:<alias>`). Each alias MUST be a key in PLATFORM_ALIASES so
// a tapped row resolves back to its integration. Order = menu order.
const CANONICAL_ALIAS = Object.freeze({
  'spotify': 'spotify',
  'google-mail': 'gmail',
  'google-calendar': 'calendar',
  'youtube': 'youtube',
  'github-getting-started': 'github',
  'discord': 'discord',
  'whoop': 'whoop',
  'outlook': 'outlook',
});

const CONNECT_REPLY_PREFIX = 'connect:';

/** Resolve a user-facing platform word to a Nango integration id, or null. */
export function resolveIntegrationId(platform) {
  if (!platform) return null;
  return PLATFORM_ALIASES[String(platform).trim().toLowerCase()] || null;
}

/**
 * Rows for the interactive "which platform?" list — one per connectable Nango
 * integration. Each row id is `connect:<alias>`; tapping it round-trips through
 * connectAliasFromReplyId back to a connect intent. Titles are Meta-safe (<=24).
 * @returns {Array<{ id: string, title: string }>}
 */
export function buildConnectMenuRows() {
  return Object.entries(CANONICAL_ALIAS).map(([integrationId, alias]) => ({
    id: `${CONNECT_REPLY_PREFIX}${alias}`,
    title: displayName(integrationId).slice(0, 24),
  }));
}

/**
 * Map an interactive reply id (from a tapped menu row) back to a known platform
 * alias, or null. e.g. 'connect:spotify' -> 'spotify'; 'connect:bogus' -> null.
 */
export function connectAliasFromReplyId(replyId) {
  const id = String(replyId || '').trim().toLowerCase();
  if (!id.startsWith(CONNECT_REPLY_PREFIX)) return null;
  const alias = id.slice(CONNECT_REPLY_PREFIX.length);
  return resolveIntegrationId(alias) ? alias : null;
}

// Connect verbs — deliberately EXCLUDES "liga/ligar" (that's place_call:
// "liga pro restaurante"). Connect intent needs both a connect verb AND a
// known platform (or an explicit "accounts/contas" menu request).
// Optional "re-" prefix so "reconnect / reconecta / relink" also count — a
// reconnect is just a connect with the old session expired.
const CONNECT_VERB = /\b(?:re-?)?(connect|conecta|conectar|conecte|vincula|vincular|vincule|integra|integrar|link)\b/i;
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

// The connect path uses Nango providerConfigKey (e.g. 'github-getting-started');
// getAllConnections/deleteConnection key on the PLATFORM_CONFIGS key (e.g.
// 'github'). Bridge between them.
function configKeyFromIntegrationId(integrationId) {
  const entry = Object.entries(PLATFORM_CONFIGS).find(([, c]) => c.providerConfigKey === integrationId);
  return entry ? entry[0] : integrationId;
}

// Disconnect verbs — stems cover desconecta/desconectar/desconecte/desvincular.
// "remove/tira" are deliberately excluded (too generic — "remove o lembrete").
const DISCONNECT_VERB = /\b(disconnect|desconect\w*|desvincul\w*|unlink)\b/i;

/** True for "what's connected? / quais plataformas estão conectadas? / minhas conexões". */
export function classifyConnectionStatusIntent(text) {
  const t = String(text || '').trim();
  if (!t || t.length > 90) return false;
  const hasConnWord = /\b(conectad[ao]s?|conex[õo]es|conex[ãa]o|connected|connections?)\b/i.test(t);
  const hasQuery = /\b(quais|que|o que|what|whats|minhas|meus|status|t[áa]|est[ãa]o|are|list|lista|mostra|show)\b/i.test(t);
  return hasConnWord && hasQuery;
}

/** "desconecta meu spotify" → { platform }; disconnect verb without a known platform → null. */
export function classifyDisconnectIntent(text) {
  const t = String(text || '').trim();
  if (!t || t.length > 100) return null;
  if (!DISCONNECT_VERB.test(t)) return null;
  const tokens = new Set(t.toLowerCase().split(/[^\p{L}0-9-]+/u).filter(Boolean));
  for (const alias of Object.keys(PLATFORM_ALIASES)) {
    if (tokens.has(alias)) return { platform: alias };
  }
  return null; // never "disconnect everything" off one ambiguous verb
}

/** List the user's currently-connected platforms (display names). Never throws. */
export async function listConnectedPlatforms(userId) {
  try {
    const all = await getAllConnections(userId);
    const connected = Object.entries(all || {})
      .filter(([, r]) => r?.connected)
      .map(([key]) => PLATFORM_CONFIGS[key]?.name || key);
    return { success: true, connected };
  } catch (err) {
    log.warn('listConnectedPlatforms failed', { userId, error: err.message });
    return { success: false, error: err.message, connected: [] };
  }
}

/** Disconnect one platform (reversible — reconnect re-runs OAuth). Never throws. */
export async function disconnectPlatform(userId, platform) {
  const integrationId = resolveIntegrationId(platform);
  if (!integrationId) {
    return { success: false, error: 'unknown_platform', message: `I don't know the platform "${platform}".` };
  }
  const configKey = configKeyFromIntegrationId(integrationId);
  const res = await deleteConnection(userId, configKey);
  if (!res?.success) {
    log.warn('disconnectPlatform failed', { userId, configKey, error: res?.error });
    return { success: false, error: res?.error || 'disconnect_failed', message: `Couldn't disconnect ${displayName(integrationId)} right now.` };
  }
  log.info('platform disconnected', { userId, configKey });
  return { success: true, platform: displayName(integrationId) };
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
