/**
 * Spotify audio features -> mood observation. Pure, no network, no DB.
 *
 * Extracted from spotify.js in the 2026-08-13 payload audit. The average was
 *
 *     features.reduce((sum, f) => sum + (f[key] || 0), 0) / features.length
 *
 * which treats an ABSENT reading as a reading of zero. With the fields missing
 * altogether that produces valence 0 and energy 0, and the thresholds below
 * turn those into a fully-formed sentence:
 *
 *     "Music mood right now: mellow or introspective, low-energy, chill
 *      (valence 0%, energy 0%, danceability 0%)"
 *
 * Missing data rendered as a confident, specific claim — the same failure mode
 * as the calendar fetcher's "completely open day", and worse here because
 * "Music mood right now:" is a registered snapshot metric that gets refreshed
 * in place, so the false row would be kept permanently current.
 *
 * It has not fired in production only because /v1/audio-features returns HTTP
 * 403 for this app since ~2026-07-24 and the request throws first. That is an
 * accident of how the endpoint fails, not a safeguard.
 *
 * So: absent values are excluded from the mean instead of counted as zero, and
 * when a field lacks enough real readings the whole observation is withheld.
 */

/**
 * Minimum real readings required per field. Matches the >= 3 the caller
 * already demanded of the track list — three songs is the floor for calling
 * something a mood at all.
 */
export const MIN_READINGS = 3;

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Mean of the values actually present for `key`, or null when too few are.
 * @returns {number|null}
 */
function averagePresent(features, key) {
  const values = features
    .filter((f) => f && typeof f === 'object')
    .map((f) => f[key])
    .filter(isNumber);
  if (values.length < MIN_READINGS) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * @param {Array<{valence?: number, energy?: number, danceability?: number}>} features
 * @returns {string|null} the observation, or null when the readings cannot
 *   support one — the caller writes nothing in that case.
 */
export function buildMoodObservation(features) {
  if (!Array.isArray(features) || features.length === 0) return null;

  const valence = averagePresent(features, 'valence');
  const energy = averagePresent(features, 'energy');
  const danceability = averagePresent(features, 'danceability');
  // All three appear in the sentence, so all three must be real.
  if (valence === null || energy === null || danceability === null) return null;

  const moodLabel = valence > 0.7 ? 'upbeat and positive'
    : valence > 0.4 ? 'balanced'
      : 'mellow or introspective';
  const energyLabel = energy > 0.7 ? 'high-energy'
    : energy > 0.4 ? 'moderate-energy'
      : 'low-energy, chill';
  const pct = (n) => `${(n * 100).toFixed(0)}%`;

  return `Music mood right now: ${moodLabel}, ${energyLabel} `
    + `(valence ${pct(valence)}, energy ${pct(energy)}, danceability ${pct(danceability)})`;
}
