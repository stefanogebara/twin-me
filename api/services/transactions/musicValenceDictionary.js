/**
 * Music Valence Dictionary
 * =========================
 * Heuristic valence [0-1] map for BR + global artists. Used by the emotion
 * tagger when Spotify doesn't expose audio-features (Spotify restricted that
 * endpoint in Nov 2024 — we now only have track/artist metadata).
 *
 * Valence semantics (Spotify convention): 0 = sad/tense, 1 = happy/euphoric.
 * Values are deliberately rounded and genre-anchored — we're not trying to
 * beat the old audio-features API, just give the tagger *some* mood signal.
 *
 * Ordering: first match wins. Rules matched against lowercased artist name
 * OR album name. Falls back to a genre regex (funk/pagode/sertanejo etc.)
 * then to null (tagger treats null as "no signal").
 */

// Curated list. Keep under 150 entries — maintenance cost scales linearly.
// Grouped by mood band for readability.
const ARTIST_VALENCE = [
  // === HIGH-ENERGY HAPPY (0.75-0.90) — funk, dance, upbeat pop ===
  { match: /\bbeyonc[eé]\b/i, valence: 0.82 },
  { match: /\bharry styles\b/i, valence: 0.78 },
  { match: /\bdua lipa\b/i, valence: 0.80 },
  { match: /\btaylor swift\b/i, valence: 0.70 },
  { match: /\bbruno mars\b/i, valence: 0.85 },
  { match: /\babba\b/i, valence: 0.90 },
  { match: /\bivete sangalo\b/i, valence: 0.88 },
  { match: /\bclaudia leitte\b/i, valence: 0.85 },
  { match: /\bdaniela mercury\b/i, valence: 0.82 },
  { match: /\bmc kevinho\b/i, valence: 0.80 },
  { match: /\banitta\b/i, valence: 0.85 },
  { match: /\bludmilla\b/i, valence: 0.78 },
  { match: /\bmc tuto\b|\bgrelo\b/i, valence: 0.75 },
  { match: /\btech it deep\b|\bgordo\b/i, valence: 0.72 },

  // === UPBEAT POSITIVE (0.60-0.74) — mainstream pop, happy indie ===
  { match: /\bed sheeran\b/i, valence: 0.65 },
  { match: /\bjustin bieber\b/i, valence: 0.65 },
  { match: /\bcoldplay\b/i, valence: 0.55 },
  { match: /\bimagine dragons\b/i, valence: 0.62 },
  { match: /\bmaroon 5\b/i, valence: 0.66 },
  { match: /\bthe weeknd\b/i, valence: 0.52 },
  { match: /\bcaetano veloso\b/i, valence: 0.62 },
  { match: /\bgilberto gil\b/i, valence: 0.68 },
  { match: /\bjorge ben\b/i, valence: 0.70 },
  { match: /\btim maia\b/i, valence: 0.65 },
  { match: /\bmarisa monte\b/i, valence: 0.60 },
  { match: /\bmilton nascimento\b/i, valence: 0.58 },
  { match: /\bchico buarque\b/i, valence: 0.52 },
  { match: /\bseu jorge\b/i, valence: 0.60 },
  { match: /\bnatiruts\b/i, valence: 0.72 },
  { match: /\bskank\b/i, valence: 0.70 },
  { match: /\bjavier milei\b/i, valence: 0.65 }, // common user search, keep low-stakes
  { match: /\bmenos (é|e) mais\b|\bmenos\s+é\s+mais\b/i, valence: 0.62 }, // Grupo Menos é Mais

  // === NEUTRAL / BALANCED (0.40-0.59) — chill, lo-fi, soft indie ===
  { match: /\blofi\b|\blo-fi\b/i, valence: 0.48 },
  { match: /\bbossa nova\b/i, valence: 0.55 },
  { match: /\bjo[aã]o gilberto\b/i, valence: 0.52 },
  { match: /\bantonio carlos jobim\b/i, valence: 0.55 },
  { match: /\bdrake\b/i, valence: 0.48 },
  { match: /\bpartynextdoor\b/i, valence: 0.42 },
  { match: /\bfrank ocean\b/i, valence: 0.42 },
  { match: /\btravis scott\b/i, valence: 0.45 },
  { match: /\bkendrick lamar\b/i, valence: 0.50 },
  { match: /\blana del rey\b/i, valence: 0.32 },

  // === LOW / MELANCHOLIC (0.20-0.39) — sad indie, emo, blues ===
  { match: /\bbillie eilish\b/i, valence: 0.30 },
  { match: /\badele\b/i, valence: 0.32 },
  { match: /\bsam smith\b/i, valence: 0.32 },
  { match: /\bphoebe bridgers\b/i, valence: 0.22 },
  { match: /\bbon iver\b/i, valence: 0.25 },
  { match: /\bthe smiths\b/i, valence: 0.28 },
  { match: /\bjoy division\b/i, valence: 0.18 },
  { match: /\belliott smith\b/i, valence: 0.20 },
  { match: /\bradiohead\b/i, valence: 0.30 },
  { match: /\bthom yorke\b/i, valence: 0.28 },

  // === HIGH INTENSITY / TENSE (0.25-0.45) — metal, hardcore ===
  { match: /\btool\b/i, valence: 0.30 },
  { match: /\bsystem of a down\b/i, valence: 0.35 },
  { match: /\bslipknot\b/i, valence: 0.25 },
  { match: /\brammstein\b/i, valence: 0.35 },
  { match: /\bmetallica\b/i, valence: 0.42 },
];

const GENRE_FALLBACKS = [
  { match: /\bfunk carioca\b|\bfunk paulista\b|\bbrazilian funk\b/i, valence: 0.72 },
  { match: /\bpagode\b/i, valence: 0.68 },
  { match: /\bsamba\b/i, valence: 0.70 },
  { match: /\baxé\b|\baxe\b/i, valence: 0.88 },
  { match: /\bforró\b|\bforro\b/i, valence: 0.78 },
  { match: /\bsertanejo\b/i, valence: 0.55 },
  { match: /\bmpb\b/i, valence: 0.55 },
  { match: /\bmusica popular brasileira\b/i, valence: 0.55 },
  { match: /\btrap\b/i, valence: 0.45 },
  { match: /\bambient\b|\bchillhop\b|\bchill\s?hop\b/i, valence: 0.45 },
  { match: /\bcl[aá]ssica\b|\bclassical\b/i, valence: 0.52 },
  { match: /\bjazz\b/i, valence: 0.48 },
  { match: /\bblues\b/i, valence: 0.35 },
  { match: /\brock\b/i, valence: 0.55 },
  { match: /\bmetal\b/i, valence: 0.32 },
  { match: /\bemo\b/i, valence: 0.28 },
];

/**
 * Estimate valence [0-1] for a Spotify track row.
 * Returns null when no rule matches (tagger skips music signal).
 *
 * @param {object} raw - the raw_data object from a user_platform_data row
 * @returns {number|null}
 */
export function estimateValence(raw) {
  if (!raw || typeof raw !== 'object') return null;

  // If Spotify ever exposes valence again (or we enrich via another source),
  // prefer the real value.
  if (typeof raw.valence === 'number') return raw.valence;
  if (typeof raw.audio_valence === 'number') return raw.audio_valence;

  const haystack = [
    raw.artist_name,
    raw.artistName,
    raw.artist,
    raw.album_name,
    raw.albumName,
    raw.track_name,
    raw.trackName,
    raw.name,
    raw.genre,
    raw.genres,
  ]
    .filter(Boolean)
    .map((v) => (Array.isArray(v) ? v.join(' ') : String(v)))
    .join(' ');

  if (!haystack) return null;

  for (const rule of ARTIST_VALENCE) {
    if (rule.match.test(haystack)) return rule.valence;
  }
  for (const rule of GENRE_FALLBACKS) {
    if (rule.match.test(haystack)) return rule.valence;
  }
  return null;
}
