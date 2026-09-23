/**
 * Availability gate for Spotify's /v1/audio-features endpoint.
 *
 * IMPORTERS/CALLERS: api/services/realTimeExtractor.js,
 * api/services/spotifyEnhancedExtractor.js, api/routes/spotify-oauth.js,
 * api/services/observationFetchers/spotify.js.
 * AFFECTED API: Spotify GET /v1/audio-features.
 * DATA SCHEMAS: none. Reads env SPOTIFY_AUDIO_FEATURES_ENABLED.
 * USER'S VERBATIM INSTRUCTION: "fix the remaining four call sites too".
 *
 * Spotify restricted this endpoint in Nov 2024; it returns HTTP 403 for this
 * app. Parts of the codebase already adapted — see the heuristic in
 * transactions/musicValenceDictionary.js and the genre-based energy mapping in
 * routes/spotify-oauth.js — but six call sites kept requesting it, and the
 * 2026-08-13 audit found the failures were not contained:
 *
 *   - realTimeExtractor retried the permanent 403 three times and then threw
 *     past four successfully-fetched datasets;
 *   - spotifyEnhancedExtractor threw past ten of them;
 *   - correlationEngine discarded fifty already-fetched tracks;
 *   - userContextAggregator invented { energy: .5, valence: .5 } and reported
 *     every user as "Balanced".
 *
 * A gate rather than six deletions: the endpoint is restricted, not deleted.
 * If Spotify ever restores access, this should come back by configuration
 * rather than by someone rediscovering which calls were removed and why. The
 * call sites keep their code; they just stop paying for a known 403.
 *
 * Turning the flag on does NOT make the call sites unsafe: each one also
 * carries a local catch, because a re-enabled endpoint can still fail and
 * optional enrichment must never take primary data down with it.
 */

export const AUDIO_FEATURES_RESTRICTED_REASON =
  'Spotify restricted /v1/audio-features (Nov 2024); it returns HTTP 403 for this app. '
  + 'Set SPOTIFY_AUDIO_FEATURES_ENABLED=true if access is restored.';

/**
 * @returns {boolean} whether to spend a request on /v1/audio-features.
 *   Read at call time so tests and runtime config changes both take effect
 *   without module reloading. Strict equality on 'true' — an unset, empty or
 *   misspelled value must not accidentally re-enable a known-failing call.
 */
export function audioFeaturesAvailable() {
  return process.env.SPOTIFY_AUDIO_FEATURES_ENABLED === 'true';
}
