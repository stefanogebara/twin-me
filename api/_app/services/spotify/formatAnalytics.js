/**
 * One-line formatters for Spotify analytics — same pattern as the
 * Whoop side: each function returns a compact directive-friendly
 * string the system prompt builder can drop in verbatim.
 */

function fmtMin(ms) {
  if (!ms) return '0';
  return String(Math.round(ms / 60000));
}

/**
 * @param {object} recent  Output of analytics/getRecentListening.js
 * @returns {string|null}
 */
export function formatRecentListening(recent) {
  if (!recent || !recent.totals) return null;
  const { totals, top_artists, top_tracks, top_genres, sessions, list } = recent;
  if (totals.plays === 0) {
    return 'Spotify recent listening: 0 plays in the recent window.';
  }
  const artistsLine = (top_artists ?? [])
    .map((a) => `${a.artist} ×${a.plays}`)
    .join(', ');
  const tracksLine = (top_tracks ?? [])
    .slice(0, 3)
    .map((t) => `"${t.track}" by ${t.artist}`)
    .join(', ');
  const genresLine = (top_genres ?? [])
    .slice(0, 4)
    .map((g) => g.genre)
    .join(', ');
  const sess = sessions ?? {};
  const sessionsLine = `morning ${sess.morning ?? 0} / afternoon ${sess.afternoon ?? 0} / evening ${sess.evening ?? 0} / late-night ${sess.late_night ?? 0}`;
  const recentList = (list ?? [])
    .slice(0, 5)
    .map((p) => {
      const when = p.played_at?.slice(0, 16).replace('T', ' ') ?? '?';
      return `${when} "${p.track}" by ${p.artist}`;
    })
    .join(' | ');

  const parts = [
    `Spotify recent listening: ${totals.plays} plays, ${totals.unique_artists} unique artists, ${totals.unique_tracks} unique tracks, ${fmtMin(totals.total_duration_ms)} min total.`,
    artistsLine && `Top artists: ${artistsLine}.`,
    tracksLine && `Top tracks: ${tracksLine}.`,
    genresLine && `Top genres: ${genresLine}.`,
    `Time-of-day plays (UTC): ${sessionsLine}.`,
    recentList && `Most recent: ${recentList}.`,
  ].filter(Boolean);

  return parts.join(' ');
}
