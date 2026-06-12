/**
 * Extraction dispatch config (consolidation Phase 3, 2026-06-08)
 *
 * The extraction orchestrator's 430-line hand-written `switch` became data: one
 * declarative descriptor per platform, executed by a single generic runner in
 * `extractionOrchestrator.js`. This module is intentionally PURE (no DB, no LLM,
 * no heavy imports) so the dispatch table — where the real regression risk lives
 * (a dropped platform, a wrong store-as alias, a mis-wired feature extractor) —
 * is exhaustively unit-testable in isolation.
 *
 * Descriptor kinds:
 *   'observation'   - fetch NL observations -> memory stream, optional behavioral
 *                     feature extractor. The canonical path for OAuth/API platforms.
 *   'spotify'       - special: raw `comprehensive_music_profile` (extractSpotifyData)
 *                     PLUS memory observations. Two producers, see Phase 1 (#93).
 *   'raw_extractor' - niche `extractors/*` modules that write raw `user_platform_data`
 *                     via `extractAll(userId, connectorId)`. No platforms use this
 *                     kind since the replan-2026-06-10 portfolio cut (notion/
 *                     pinterest/soundcloud/steam deleted); the runner support and
 *                     normalizeRawExtractorResult stay for future niche platforms.
 *
 * Module paths are stored as strings and dynamically imported at run time to
 * preserve the original lazy-loading (avoids loading every fetcher/extractor at
 * startup and sidesteps circular-import hazards).
 */

const OBS = './observationFetchers';
const FEAT = './featureExtractors';

/**
 * Platform -> extraction descriptor. Frozen to prevent accidental mutation.
 * Keys are lowercase DB platform names. `storeAs` overrides the memory-stream
 * platform tag when it differs from the key (gmail -> google_gmail).
 */
export const PLATFORM_EXTRACTION = Object.freeze({
  // --- Special: raw music profile + observations ---
  spotify: { kind: 'spotify' },

  // --- Observation platforms WITH a behavioral feature extractor ---
  discord: { kind: 'observation', module: `${OBS}/discord.js`, fn: 'fetchDiscordObservations', feature: `${FEAT}/discordExtractor.js` },
  github: { kind: 'observation', module: `${OBS}/github.js`, fn: 'fetchGitHubObservations', feature: `${FEAT}/githubExtractor.js` },
  youtube: { kind: 'observation', module: `${OBS}/youtube.js`, fn: 'fetchYouTubeObservations', feature: `${FEAT}/youtubeFeatureExtractor.js` },
  gmail: { kind: 'observation', module: `${OBS}/gmail.js`, fn: 'fetchGmailObservations', feature: `${FEAT}/gmailExtractor.js`, storeAs: 'google_gmail' },
  whoop: { kind: 'observation', module: `${OBS}/whoop.js`, fn: 'fetchWhoopObservations', feature: `${FEAT}/whoopExtractor.js` },

  // --- Observation platforms WITHOUT a feature extractor ---
  google_calendar: { kind: 'observation', module: `${OBS}/calendar.js`, fn: 'fetchCalendarObservations' },
  outlook: { kind: 'observation', module: `${OBS}/outlook.js`, fn: 'fetchOutlookObservations' },

  // --- Alias: legacy 'google_gmail' platform name maps to the gmail descriptor ---
  google_gmail: { kind: 'observation', module: `${OBS}/gmail.js`, fn: 'fetchGmailObservations', feature: `${FEAT}/gmailExtractor.js`, storeAs: 'google_gmail' },
});

/**
 * Resolve a platform name (case-insensitive) to its extraction descriptor.
 * Pure. Returns null for unknown platforms.
 * @param {string} platform
 * @returns {object|null}
 */
export function getDescriptor(platform) {
  if (!platform || typeof platform !== 'string') return null;
  return PLATFORM_EXTRACTION[platform.toLowerCase()] || null;
}

/**
 * Normalize a niche raw-extractor's `extractAll` return into the orchestrator's
 * uniform result shape. Pure — mirrors the prior switch semantics exactly:
 *   - successAlways descriptors -> always success: true
 *   - others -> success unless the extractor returned success:false,
 *     passing through its error message.
 * @param {object} descriptor
 * @param {{ itemsExtracted?: number, success?: boolean, error?: string }} [r]
 * @returns {{ success: boolean, itemsExtracted: number, error?: string }}
 */
export function normalizeRawExtractorResult(descriptor, r) {
  // A raw extractor that returns nothing is a failure. This matches the prior
  // switch, which did `result.itemsExtracted` on the return value and would
  // throw on undefined/null -> caught -> job marked failed. An empty object
  // ({}) is still a valid "extracted 0 items" success, exactly as before.
  if (!r) {
    return { success: false, itemsExtracted: 0, error: 'Extractor returned no result' };
  }
  const itemsExtracted = r.itemsExtracted || 0;
  if (descriptor && descriptor.successAlways) {
    return { success: true, itemsExtracted };
  }
  return { success: r.success !== false, itemsExtracted, error: r.error };
}
