/**
 * OAuth scope definitions — single source of truth (audit 2026-06, M2 #10).
 *
 * The same platforms were connectable through several surfaces, each with its
 * own inline scope literal, so reconnecting via a different surface silently
 * requested a different scope set. This module centralizes those scattered
 * literals so the definitions live in ONE place and drift is impossible.
 *
 * IMPORTANT: these values preserve each surface's CURRENT behavior exactly —
 * centralization only; no scope was added or removed here. The divergences
 * below are intentional today and are kept as distinct named sets rather than
 * collapsed, so a future consolidation has one obvious place to decide.
 *
 * Google scopes already have a single source (config/googleWorkspaceScopes.js);
 * entertainment Spotify/YouTube already live in config/platformConfigs.js.
 */

// --- Spotify --------------------------------------------------------------
// Soul-signature connect (read-only): connectors.js + entertainment PLATFORM_CONFIGS.
export const SPOTIFY_SOUL_SCOPES = [
  'user-read-private',
  'user-read-email',
  'user-top-read',
  'user-read-recently-played',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
  'user-follow-read',
];

// Entertainment canonical connect (config/platformConfigs.js PLATFORM_CONFIGS.spotify,
// used by /api/entertainment/connect/spotify). A THIRD Spotify scope set: distinct
// from SOUL (read-only, has user-follow-read) and RITUAL (playback CONTROL +
// streaming). Includes playback-STATE read but not control. Reconciling these
// three sets to one canonical set per use-case is the M2 #10 consolidation
// decision (see .claude/plans/2026-06-20-oauth-consolidation).
export const SPOTIFY_ENTERTAINMENT_SCOPES = [
  'user-read-email',
  'user-read-private',
  'user-read-recently-played',
  'user-top-read',
  'user-library-read',
  'user-read-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
];

// Presentation-ritual playback feature (spotify-oauth.js). Adds playback control
// + streaming — required by the ritual player, deliberately NOT requested by the
// read-only soul-signature connect.
export const SPOTIFY_RITUAL_SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-top-read',
  'streaming',
];

/**
 * Select the Spotify scope set for a connect request. Default = the canonical
 * soul-signature connect (ENTERTAINMENT set — what /entertainment/connect/spotify
 * has always granted, so existing users never re-consent). 'ritual' = the
 * playback-control set for the presentation-ritual feature. (Audit M2 #10:
 * unifies the three divergent Spotify scope sets behind one connect surface.)
 */
export function spotifyScopesFor(scopeSet) {
  return scopeSet === 'ritual' ? SPOTIFY_RITUAL_SCOPES : SPOTIFY_ENTERTAINMENT_SCOPES;
}

// --- YouTube (Google OAuth) ----------------------------------------------
export const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.force-ssl',
];

// --- GitHub ---------------------------------------------------------------
// Soul-signature connect (connectors.js): public read only.
export const GITHUB_SOUL_SCOPES = ['user', 'public_repo', 'read:org'];

// Entertainment connect (additional-entertainment-connectors.js).
// NOTE: `repo` grants read+WRITE to private repos. It is BROADER than the SOUL
// set (`public_repo` = public only), but it is also GitHub classic-OAuth's only
// way to READ private-repo activity, which this flow's fetcher intends
// (observationFetchers/github.js reads /user/repos + languages + contributions).
// So this is a product trade-off (private-repo signal vs least privilege), not a
// safe mechanical downgrade — a true least-privilege fix means GitHub Apps /
// fine-grained tokens (read-only private), tracked as a follow-up (audit M2 #10c).
export const GITHUB_ENTERTAINMENT_SCOPES = ['read:user', 'repo', 'read:org'];

// --- Discord --------------------------------------------------------------
// Soul-signature connect (connectors.js): identity + social graph.
export const DISCORD_SOUL_SCOPES = ['identify', 'email', 'guilds', 'connections'];

// Entertainment connect (additional-entertainment-connectors.js): activity feed.
export const DISCORD_ENTERTAINMENT_SCOPES = ['identify', 'guilds', 'activities.read'];

// --- Whoop ----------------------------------------------------------------
export const WHOOP_SCOPES = [
  'read:recovery',
  'read:sleep',
  'read:workout',
  'read:profile',
  'read:body_measurement',
];
