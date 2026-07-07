/**
 * GDPR parser: Spotify.
 * Extracted verbatim from gdprImportService.js (audit A2-M2a god-file split).
 * Pure code motion — only import/export plumbing added.
 */

import { getHourInTimeZone } from '../shared.js';

// ---------------------------------------------------------------------------
// Spotify parser — supports both Extended Streaming History and legacy format
// ---------------------------------------------------------------------------

function parseSpotify(buffer, timezone) {
  let raw;
  try {
    raw = JSON.parse(buffer.toString('utf8'));
  } catch {
    throw new Error('Invalid Spotify JSON — expected StreamingHistory*.json or Streaming_History_Audio_*.json');
  }

  if (!Array.isArray(raw)) {
    throw new Error('Spotify file must be a JSON array');
  }

  // Auto-detect format: Extended has "ts" + "ms_played"; legacy has "endTime" + "msPlayed"
  const isExtended = raw.length > 0 && raw[0]?.ts !== undefined;

  if (isExtended) {
    return parseSpotifyExtended(raw, timezone);
  }
  return parseSpotifyLegacy(raw, timezone);
}

// ---------------------------------------------------------------------------
// Extended Streaming History parser (2018-present export format)
// ---------------------------------------------------------------------------

function parseSpotifyExtended(raw, timezone) {
  const MIN_MS = 30_000;        // real listen threshold (30 s)
  const MIN_MS_INDIVIDUAL = 120_000; // individual obs threshold (2 min)
  const MAX_INDIVIDUAL_OBS = 250;

  const fmt = (h) => h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`;
  const fmtMonth = (d) => `${d.toLocaleString('default', { month: 'short' })} ${d.getFullYear()}`;

  // ── Pass 1: aggregate across all entries ─────────────────────────────────
  const artistStats = {};  // artist -> { msTotal, count }
  const albumStats  = {};  // album  -> { msTotal }
  const trackCounts = {};  // "Track|Artist" -> count
  const yearArtists = {};  // year -> artist -> msTotal
  const hourBuckets = new Array(24).fill(0);
  const countries   = new Set();

  // Podcast stats — Spotify's Extended Streaming History mixes music and
  // podcast plays. Music entries use master_metadata_* fields; podcast entries
  // use episode_name + episode_show_name instead. Prior to this change podcast
  // plays were silently dropped (audit 2026-04-20).
  const podcastShowStats = {}; // show -> { msTotal, count }
  const podcastEpisodeCounts = {}; // "episode|show" -> count
  let totalPodcastPlays = 0;
  let totalPodcastMs    = 0;

  let totalRealPlays   = 0;
  let totalRealMs      = 0;
  let skippedCount     = 0;
  let shuffleCount     = 0;
  let shuffleBase      = 0;
  let earliestDate     = null;
  let latestDate       = null;

  // Individual obs pool — only substantial, non-skipped plays
  const individualPool = [];

  for (const entry of raw) {
    const msPlayed = entry.ms_played || 0;
    const isSkipped = entry.skipped === true;
    const isShuffle = entry.shuffle === true;
    const when = entry.ts ? new Date(entry.ts) : null;

    const artist = String(entry.master_metadata_album_artist_name || '').trim().slice(0, 80) || null;
    const track  = String(entry.master_metadata_track_name || '').trim().slice(0, 80)  || null;
    const album  = String(entry.master_metadata_album_album_name || '').trim().slice(0, 80) || null;
    const country = entry.conn_country || null;

    // Podcast branch — entries without music metadata but with episode_name
    // and episode_show_name are podcast plays.
    const podcastShow = String(entry.episode_show_name || '').trim().slice(0, 80) || null;
    const podcastEpisode = String(entry.episode_name || '').trim().slice(0, 100) || null;
    if (!artist && podcastShow && msPlayed >= MIN_MS) {
      totalPodcastPlays++;
      totalPodcastMs += msPlayed;
      if (!podcastShowStats[podcastShow]) podcastShowStats[podcastShow] = { msTotal: 0, count: 0 };
      podcastShowStats[podcastShow].msTotal += msPlayed;
      podcastShowStats[podcastShow].count++;
      if (podcastEpisode) {
        const key = `${podcastEpisode}|${podcastShow}`;
        podcastEpisodeCounts[key] = (podcastEpisodeCounts[key] || 0) + 1;
      }
    }

    if (country) countries.add(country);
    if (isSkipped) skippedCount++;

    // Track shuffle ratio on all entries where shuffle flag is defined
    if (entry.shuffle !== undefined && entry.shuffle !== null) {
      shuffleBase++;
      if (isShuffle) shuffleCount++;
    }

    // Track date range from all entries
    if (when) {
      if (!earliestDate || when < earliestDate) earliestDate = when;
      if (!latestDate || when > latestDate) latestDate = when;
    }

    // Only count as real listen for aggregation
    if (msPlayed < MIN_MS) continue;

    totalRealPlays++;
    totalRealMs += msPlayed;
    if (when) hourBuckets[getHourInTimeZone(when, timezone)]++;

    if (!artist) continue;

    // Artist stats
    if (!artistStats[artist]) artistStats[artist] = { msTotal: 0, count: 0 };
    artistStats[artist].msTotal += msPlayed;
    artistStats[artist].count++;

    // Album stats
    if (album) {
      if (!albumStats[album]) albumStats[album] = { msTotal: 0 };
      albumStats[album].msTotal += msPlayed;
    }

    // Track repeat counts
    if (track) {
      const key = `${track}|${artist}`;
      trackCounts[key] = (trackCounts[key] || 0) + 1;
    }

    // Year → artist listening breakdown
    if (when) {
      const year = when.getFullYear();
      if (!yearArtists[year]) yearArtists[year] = {};
      if (!yearArtists[year][artist]) yearArtists[year][artist] = 0;
      yearArtists[year][artist] += msPlayed;
    }

    // Individual pool: substantial non-skipped plays with track metadata
    if (!isSkipped && msPlayed >= MIN_MS_INDIVIDUAL && track && artist) {
      individualPool.push({ track, artist, when });
    }
  }

  // ── Build observations ────────────────────────────────────────────────────
  const summaryObs = [];

  // 1. Span summary
  const totalEntries = raw.length;
  const totalHours = Math.round(totalRealMs / 3_600_000);
  if (earliestDate && latestDate) {
    const yearSpan = latestDate.getFullYear() - earliestDate.getFullYear();
    const spanLabel = yearSpan >= 1
      ? `${yearSpan + 1} years`
      : `${Math.max(1, Math.round((latestDate - earliestDate) / (30 * 24 * 3600_000)))} months`;
    const startLabel = fmtMonth(earliestDate);
    const endLabel   = fmtMonth(latestDate);
    summaryObs.push(
      `Spotify history spans ${spanLabel} (${startLabel} to ${endLabel}), ` +
      `${totalRealPlays.toLocaleString()} real listens, ~${totalHours.toLocaleString()}h total`
    );
  }

  // 2. Top 3 artists by listening time
  const topArtistsSorted = Object.entries(artistStats)
    .sort((a, b) => b[1].msTotal - a[1].msTotal);

  if (topArtistsSorted.length >= 1) {
    const top3 = topArtistsSorted.slice(0, 3).map(([name, stats]) => {
      const h = Math.round(stats.msTotal / 3_600_000);
      return `${name} (${h}h)`;
    });
    summaryObs.push(`Top 3 Spotify artists by listening time: ${top3.join(', ')}`);
  }

  // 3. Also deeply into (artists 4-8)
  if (topArtistsSorted.length > 3) {
    const also = topArtistsSorted.slice(3, 8).map(([name]) => name).join(', ');
    summaryObs.push(`Also deeply into on Spotify: ${also}`);
  }

  // 4. Year-by-year taste
  const years = Object.keys(yearArtists).sort();
  if (years.length >= 2) {
    const parts = years.map(year => {
      const top2 = Object.entries(yearArtists[year])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([name]) => name);
      return `${year}: ${top2.join(' & ')}`;
    });
    summaryObs.push(`Music taste by year — ${parts.join(' | ')}`);
  }

  // 5. Repeat obsessions (tracks played 10+ times)
  const repeatTracks = Object.entries(trackCounts)
    .filter(([, count]) => count >= 10)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (repeatTracks.length > 0) {
    const parts = repeatTracks.map(([key, count]) => {
      const [track, artist] = key.split('|');
      return `"${track}" by ${artist} (${count}x)`;
    });
    summaryObs.push(`Spotify repeat obsessions: ${parts.join(', ')}`);
  }

  // 6. Skip rate + most-skipped artists
  if (totalEntries > 0) {
    const overallSkipPct = Math.round((skippedCount / totalEntries) * 100);
    // Per-artist skip analysis
    const artistSkips = {};
    for (const entry of raw) {
      const artist = String(entry.master_metadata_album_artist_name || '').trim().slice(0, 80);
      if (!artist) continue;
      if (!artistSkips[artist]) artistSkips[artist] = { total: 0, skipped: 0 };
      artistSkips[artist].total++;
      if (entry.skipped === true) artistSkips[artist].skipped++;
    }
    const highSkipArtists = Object.entries(artistSkips)
      .filter(([, s]) => s.total >= 5 && (s.skipped / s.total) > 0.30)
      .sort((a, b) => (b[1].skipped / b[1].total) - (a[1].skipped / a[1].total))
      .slice(0, 5)
      .map(([name, s]) => `${name} (${Math.round((s.skipped / s.total) * 100)}% skipped)`);

    if (highSkipArtists.length > 0) {
      summaryObs.push(
        `Spotify skip rate: ${overallSkipPct}% overall. Most-skipped artists: ${highSkipArtists.join(', ')}`
      );
    } else {
      summaryObs.push(`Spotify skip rate: ${overallSkipPct}% of total streams`);
    }
  }

  // 7. Time-of-day patterns
  const totalHourPlays = hourBuckets.reduce((a, b) => a + b, 0);
  if (totalHourPlays > 0) {
    const morning   = hourBuckets.slice(6, 12).reduce((a, b) => a + b, 0);
    const afternoon = hourBuckets.slice(12, 18).reduce((a, b) => a + b, 0);
    const evening   = hourBuckets.slice(18, 22).reduce((a, b) => a + b, 0);
    const lateNight = hourBuckets.slice(22, 24).reduce((a, b) => a + b, 0)
      + hourBuckets.slice(0, 6).reduce((a, b) => a + b, 0);
    const pct = (n) => Math.round((n / totalHourPlays) * 100);

    // Peak hour
    let peakHour = 0;
    for (let h = 1; h < 24; h++) {
      if (hourBuckets[h] > hourBuckets[peakHour]) peakHour = h;
    }

    summaryObs.push(
      `Spotify listening patterns: ${pct(morning)}% morning, ${pct(afternoon)}% afternoon, ` +
      `${pct(evening)}% evening, ${pct(lateNight)}% late-night. Peak hour: ${fmt(peakHour)}`
    );
  }

  // 8. Shuffle vs curated
  if (shuffleBase > 10) {
    const shufflePct = Math.round((shuffleCount / shuffleBase) * 100);
    const label = shufflePct > 60
      ? 'primarily a shuffle listener'
      : shufflePct < 30
        ? 'primarily a curated/album listener'
        : 'a mix of shuffle and curated listening';
    summaryObs.push(`Spotify shuffle: ${shufflePct}% of streams on shuffle (${label})`);
  }

  // 9. Travel signal from countries
  if (countries.size >= 2) {
    const countriesList = Array.from(countries).join(', ');
    summaryObs.push(
      `Spotify detected from ${countries.size} countries: ${countriesList} — suggests international travel or living abroad`
    );
  }

  // 10. Top albums by listening time
  const topAlbums = Object.entries(albumStats)
    .sort((a, b) => b[1].msTotal - a[1].msTotal)
    .slice(0, 5);
  if (topAlbums.length > 0) {
    const parts = topAlbums.map(([name, s]) => `"${name}" (${Math.round(s.msTotal / 3_600_000)}h)`);
    summaryObs.push(`Top Spotify albums by listening time: ${parts.join(', ')}`);
  }

  // 10b. Podcasts — intellectual/topical identity signal distinct from music
  if (totalPodcastPlays > 0) {
    const totalPodcastHours = Math.round(totalPodcastMs / 3_600_000);
    summaryObs.push(
      `Spotify podcast listening: ${totalPodcastPlays.toLocaleString()} episodes played, ~${totalPodcastHours.toLocaleString()}h total`
    );

    const topShows = Object.entries(podcastShowStats)
      .sort((a, b) => b[1].msTotal - a[1].msTotal)
      .slice(0, 5)
      .map(([name, s]) => `${name} (${Math.round(s.msTotal / 3_600_000)}h)`);
    if (topShows.length > 0) {
      summaryObs.push(`Top Spotify podcasts by listening time: ${topShows.join(', ')}`);
    }

    const repeatedEpisodes = Object.entries(podcastEpisodeCounts)
      .filter(([, c]) => c >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    if (repeatedEpisodes.length > 0) {
      const parts = repeatedEpisodes.map(([key, count]) => {
        const [ep, show] = key.split('|');
        return `"${ep}" (${show}, ${count}x)`;
      });
      summaryObs.push(`Podcast episodes you replayed on Spotify: ${parts.join('; ')}`);
    }
  }

  // 11. Individual significant listens (up to MAX_INDIVIDUAL_OBS)
  const individualObs = individualPool
    .sort((a, b) => (b.when?.getTime() ?? 0) - (a.when?.getTime() ?? 0))
    .slice(0, MAX_INDIVIDUAL_OBS)
    .map(({ track, artist, when }) => {
      const monthYear = when ? fmtMonth(when) : '';
      return monthYear
        ? `Listened to "${track}" by ${artist} (${monthYear})`
        : `Listened to "${track}" by ${artist}`;
    });

  return [...summaryObs, ...individualObs];
}

// ---------------------------------------------------------------------------
// Legacy Streaming History parser (StreamingHistory*.json — pre-2023 format)
// ---------------------------------------------------------------------------

function parseSpotifyLegacy(raw, timezone) {
  const MIN_MS = 30_000;
  const playsByArtist = {};
  const hourBuckets = new Array(24).fill(0);
  const individualObs = [];
  // Aggregate over the FULL qualifying history so "top artist over Spotify
  // history" + the listening-pattern percentages are accurate; only the per-track
  // individual observations are capped (to the most recent 500) to bound memory-
  // stream noise. (audit: aggregates were previously computed over the 500-cap,
  // making the reported all-time top artist reflect only the last 500 plays.)
  const qualifying = raw.filter(e => (e.msPlayed || 0) >= MIN_MS);

  for (const entry of qualifying) {
    const artist = String(entry.artistName || 'Unknown Artist').slice(0, 80);
    if (!playsByArtist[artist]) playsByArtist[artist] = { count: 0, msTotal: 0 };
    playsByArtist[artist].count++;
    playsByArtist[artist].msTotal += (entry.msPlayed || 0);

    const when = entry.endTime ? new Date(entry.endTime) : null;
    if (when && !isNaN(when.getTime())) hourBuckets[getHourInTimeZone(when, timezone)]++;
  }

  for (const entry of qualifying.slice(-500)) {
    const artist = String(entry.artistName || 'Unknown Artist').slice(0, 80);
    const track = String(entry.trackName || 'Unknown Track').slice(0, 80);
    const when = entry.endTime ? new Date(entry.endTime) : null;
    const monthYear = (when && !isNaN(when.getTime())) ? `${when.toLocaleString('default', { month: 'short' })} ${when.getFullYear()}` : '';
    individualObs.push(
      monthYear
        ? `Listened to "${track}" by ${artist} (${monthYear})`
        : `Listened to "${track}" by ${artist}`
    );
  }

  const totalPlays = qualifying.length;
  const topArtists = Object.entries(playsByArtist)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10);

  const summaryObs = [];

  if (topArtists.length > 0) {
    const [topName, topStats] = topArtists[0];
    const hours = Math.round(topStats.msTotal / 3_600_000);
    summaryObs.push(
      `Top artist over Spotify history: ${topName} (${topStats.count} plays, ~${hours}h total)`
    );
  }

  if (topArtists.length > 1) {
    const names = topArtists.slice(1, 5).map(([n]) => n).join(', ');
    summaryObs.push(`Also frequently listened to: ${names}`);
  }

  if (totalPlays > 0) {
    summaryObs.push(
      `Spotify listening history spans ${totalPlays.toLocaleString()} tracks (excluding quick skips)`
    );
  }

  const totalHourPlays = hourBuckets.reduce((a, b) => a + b, 0);
  if (totalHourPlays > 0) {
    const lateNight = hourBuckets.slice(22, 24).reduce((a, b) => a + b, 0)
      + hourBuckets.slice(0, 4).reduce((a, b) => a + b, 0);
    const morning = hourBuckets.slice(6, 12).reduce((a, b) => a + b, 0);
    const pct = (n) => Math.round((n / totalHourPlays) * 100);
    if (pct(lateNight) > 25) {
      summaryObs.push(`Late-night Spotify listener — ${pct(lateNight)}% of plays after 10pm or before 4am`);
    } else if (pct(morning) > 35) {
      summaryObs.push(`Morning music listener — ${pct(morning)}% of plays between 6am and noon`);
    }
  }

  return [...individualObs, ...summaryObs];
}

export { parseSpotify };
