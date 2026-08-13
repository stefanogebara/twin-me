/**
 * Mood derivation from Spotify audio features. Pure — no network, no DB.
 *
 * IMPORTERS/CALLERS: api/services/userContextAggregator.js (getSpotifyContext,
 * ~line 597) and tests/api/services/spotify/moodFromAudioFeatures.test.js.
 * AFFECTED API: Spotify GET /v1/audio-features —
 * { audio_features: [{ id, energy, valence, tempo, danceability, ... }] }.
 * DATA SCHEMAS: none — no DB writes; in-memory shape only.
 * USER'S VERBATIM INSTRUCTION: "ok compacted now contnue".
 *
 * Extracted from userContextAggregator in the 2026-08-13 payload audit, where
 * the no-data branch was not a fallback but a fabrication:
 *
 *     if (validFeatures.length === 0) {
 *       return { energy: 0.5, valence: 0.5, tempo: 100, danceability: 0.5 };
 *     }
 *
 * Those midpoints then flowed into deriveMoodFromFeatures, which read them as
 * "Balanced / Moderate energy and mood" and returned them in `currentMood`
 * with no marker distinguishing them from a measurement. Spotify restricted
 * /v1/audio-features (this codebase already knows — see the Nov 2024 note in
 * transactions/transactionEmotionTagger.js and the genre-based replacement in
 * routes/spotify-oauth.js), so the fabricated branch is the only branch that
 * runs: every user reads as "Balanced", forever, whatever they listen to.
 *
 * The rule here is the one the calendar, the PR titles and the liked-videos
 * observation each had to learn separately: absent readings produce no
 * reading. A caller that gets null must say nothing rather than guess.
 */

/** Fields we average. energy+valence are required to derive a mood at all. */
const REQUIRED = ['energy', 'valence'];
const OPTIONAL = ['tempo', 'danceability'];

/** Mean of `key` across entries that actually reported a finite number. */
function meanPresent(entries, key) {
  const values = entries
    .map((f) => f[key])
    .filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * @param {Array<object>} features raw `audio_features` entries
 * @returns {{energy:number, valence:number, tempo?:number,
 *   danceability?:number, sampleSize:number}|null} null when nothing usable
 *   was reported — the caller must then omit the mood, not default it.
 */
export function averageAudioFeatures(features) {
  if (!Array.isArray(features)) return null;
  const entries = features.filter((f) => f && typeof f === 'object');
  if (entries.length === 0) return null;

  const avg = {};
  for (const key of REQUIRED) {
    const mean = meanPresent(entries, key);
    // Missing energy or valence means there is no mood to derive. Bail rather
    // than substitute a midpoint — a substituted midpoint is what produced
    // three weeks of unanimous "Balanced".
    if (mean === null) return null;
    avg[key] = round2(mean);
  }

  for (const key of OPTIONAL) {
    const mean = meanPresent(entries, key);
    // Absent stays absent. Downstream renders only what it was given.
    if (mean === null) continue;
    avg[key] = key === 'tempo' ? Math.round(mean) : round2(mean);
  }

  // How much evidence the average rests on, so callers can decide whether one
  // track is enough to call someone's mood.
  avg.sampleSize = entries.filter((f) =>
    REQUIRED.some((k) => typeof f[k] === 'number' && Number.isFinite(f[k])),
  ).length;

  return avg;
}

/**
 * @param {object|null} avg output of averageAudioFeatures
 * @returns {{label:string, description:string}|null} null when there is no
 *   average to read. "Balanced" is a finding, not a default.
 */
export function deriveMood(avg) {
  if (!avg || typeof avg !== 'object') return null;
  const { energy, valence } = avg;
  if (typeof energy !== 'number' || typeof valence !== 'number') return null;

  if (energy > 0.7 && valence > 0.6) {
    return { label: 'Energized', description: 'High energy, positive mood' };
  }
  if (energy > 0.7 && valence < 0.4) {
    return { label: 'Intense', description: 'High energy, focused intensity' };
  }
  if (energy < 0.4 && valence > 0.6) {
    return { label: 'Relaxed', description: 'Calm and content' };
  }
  if (energy < 0.4 && valence < 0.4) {
    return { label: 'Calm', description: 'Low energy, introspective' };
  }
  return { label: 'Balanced', description: 'Moderate energy and mood' };
}
