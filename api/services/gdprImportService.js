/**
 * GDPR Import Service
 * ===================
 * Parses platform GDPR/data-export archives and ingests them into the memory stream.
 *
 * Supported platforms:
 *   - Spotify         : StreamingHistory*.json
 *   - YouTube         : watch-history.json  (Google Takeout)
 *   - Discord         : messages/ * /messages.json  (inside a ZIP)
 *   - Reddit          : reddit-data-*.json  (nested JSON export)
 *   - WhatsApp        : _chat.txt or ZIP export
 *   - Apple Health    : export.zip / export.xml
 *   - Android Usage   : JSON from UsageStatsModule background sync
 *   - Google Search   : MyActivity.json (Google Takeout)
 *   - Health Connect  : JSON from Android HealthConnectModule (REQUIRES MOBILE REBUILD)
 *   - SMS Patterns    : JSON from Android SmsStatsModule (REQUIRES MOBILE REBUILD)
 *
 * Pipeline:
 *   fileBuffer -> platformParser -> observations[] -> dedup -> addPlatformObservation
 *   -> update user_data_imports row -> optionally trigger reflection
 */

import crypto from 'crypto';
import AdmZip from 'adm-zip';
import { addPlatformObservation } from './memoryStreamService.js';
import { shouldTriggerReflection, generateReflections } from './reflectionEngine.js';
import { createLogger } from './logger.js';

const log = createLogger('GDPRImport');

// Lazy-load supabaseAdmin to avoid circular deps
let _supabase = null;
async function getSupabase() {
  if (!_supabase) {
    const mod = await import('./database.js');
    _supabase = mod.supabaseAdmin;
  }
  return _supabase;
}

// ---------------------------------------------------------------------------
// De-duplication (same logic as observationIngestion.js)
// ---------------------------------------------------------------------------

function contentHash(platform, content) {
  return crypto
    .createHash('sha256')
    .update(`${platform}:${content.substring(0, 100)}`)
    .digest('hex')
    .substring(0, 16);
}

async function loadExistingHashes(userId, platform) {
  const supabase = await getSupabase();
  const { data } = await supabase
    .from('user_memories')
    .select('content, metadata')
    .eq('user_id', userId)
    .eq('memory_type', 'platform_data')
    .filter('metadata->>source', 'eq', platform)
    .limit(5000);

  const hashes = new Set();
  for (const mem of data || []) {
    hashes.add(contentHash(platform, mem.content || ''));
    if (mem.metadata?.import_hash) hashes.add(mem.metadata.import_hash);
  }
  return hashes;
}

// ---------------------------------------------------------------------------
// Shared write helper
// ---------------------------------------------------------------------------

async function writeObservations(userId, platform, observations, importId, existingHashes) {
  let created = 0;
  let skipped = 0;

  for (const content of observations) {
    if (!content || typeof content !== 'string') continue;
    const hash = contentHash(platform, content);
    if (existingHashes.has(hash)) {
      skipped++;
      continue;
    }
    try {
      await addPlatformObservation(userId, content, platform, {
        ingestion_source: 'gdpr_import',
        import_id: importId,
        import_hash: hash,
      });
      existingHashes.add(hash);
      created++;
    } catch (err) {
      // Unique constraint violation = concurrent upload already wrote this hash — treat as skip
      if (err.message?.includes('duplicate key') || err.code === '23505') {
        skipped++;
      } else {
        log.error(`Failed to write observation: ${err.message}`);
      }
    }
  }
  return { created, skipped };
}

// ---------------------------------------------------------------------------
// Spotify parser — supports both Extended Streaming History and legacy format
// ---------------------------------------------------------------------------

function parseSpotify(buffer) {
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
    return parseSpotifyExtended(raw);
  }
  return parseSpotifyLegacy(raw);
}

// ---------------------------------------------------------------------------
// Extended Streaming History parser (2018-present export format)
// ---------------------------------------------------------------------------

function parseSpotifyExtended(raw) {
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
    if (when) hourBuckets[when.getHours()]++;

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

    const label = shuffleBase > 0
      ? ` Peak hour: ${fmt(peakHour)}.`
      : '';
    summaryObs.push(
      `Spotify listening patterns: ${pct(morning)}% morning, ${pct(afternoon)}% afternoon, ` +
      `${pct(evening)}% evening, ${pct(lateNight)}% late-night.${label} Peak hour: ${fmt(peakHour)}`
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

function parseSpotifyLegacy(raw) {
  const MIN_MS = 30_000;
  const playsByArtist = {};
  const hourBuckets = new Array(24).fill(0);
  const individualObs = [];
  const sorted = raw.filter(e => (e.msPlayed || 0) >= MIN_MS).slice(-500);

  for (const entry of sorted) {
    const artist = String(entry.artistName || 'Unknown Artist').slice(0, 80);
    const track = String(entry.trackName || 'Unknown Track').slice(0, 80);
    const when = entry.endTime ? new Date(entry.endTime) : null;
    const monthYear = when ? `${when.toLocaleString('default', { month: 'short' })} ${when.getFullYear()}` : '';

    individualObs.push(
      monthYear
        ? `Listened to "${track}" by ${artist} (${monthYear})`
        : `Listened to "${track}" by ${artist}`
    );

    if (!playsByArtist[artist]) playsByArtist[artist] = { count: 0, msTotal: 0 };
    playsByArtist[artist].count++;
    playsByArtist[artist].msTotal += (entry.msPlayed || 0);

    if (when) hourBuckets[when.getHours()]++;
  }

  const totalPlays = raw.filter(e => (e.msPlayed || 0) >= MIN_MS).length;
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

// ---------------------------------------------------------------------------
// YouTube (Google Takeout) parser
// ---------------------------------------------------------------------------

function parseYouTube(buffer) {
  let raw;
  try {
    raw = JSON.parse(buffer.toString('utf8'));
  } catch {
    throw new Error('Invalid YouTube JSON — expected watch-history.json');
  }

  if (!Array.isArray(raw)) {
    throw new Error('YouTube file must be a JSON array');
  }

  const channelCounts = {};
  const hourBuckets = new Array(24).fill(0);
  const individualObs = [];

  // Sample up to 500 most recent watches
  const recent = raw.slice(-500);
  for (const entry of recent) {
    const title = String(entry.title || '').replace(/^Watched /, '').slice(0, 80);
    if (!title) continue;

    const channel = entry.subtitles?.[0]?.name || 'Unknown Channel';
    const safeChannel = String(channel).slice(0, 60);
    const when = entry.time ? new Date(entry.time) : null;
    const monthYear = when ? `${when.toLocaleString('default', { month: 'short' })} ${when.getFullYear()}` : '';

    individualObs.push(
      monthYear
        ? `Watched "${title}" by ${safeChannel} (${monthYear})`
        : `Watched "${title}" by ${safeChannel}`
    );

    if (!channelCounts[safeChannel]) channelCounts[safeChannel] = 0;
    channelCounts[safeChannel]++;

    if (when) hourBuckets[when.getHours()]++;
  }

  const summaryObs = [];
  const totalWatched = raw.length;

  const topChannels = Object.entries(channelCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (topChannels.length > 0) {
    const [topName, topCount] = topChannels[0];
    summaryObs.push(`Top YouTube channel: ${topName} (${topCount} videos watched)`);
  }

  if (topChannels.length > 1) {
    const names = topChannels.slice(1, 5).map(([n]) => n).join(', ');
    summaryObs.push(`Also frequently watched: ${names}`);
  }

  if (totalWatched > 0) {
    summaryObs.push(`YouTube watch history spans ${totalWatched.toLocaleString()} videos`);
  }

  // Time-of-day pattern
  const total = hourBuckets.reduce((a, b) => a + b, 0);
  if (total > 0) {
    const evening = hourBuckets.slice(18, 24).reduce((a, b) => a + b, 0);
    const pct = Math.round((evening / total) * 100);
    if (pct > 40) {
      summaryObs.push(`Evening YouTube watcher — ${pct}% of videos watched after 6pm`);
    }
  }

  return [...individualObs, ...summaryObs];
}

// ---------------------------------------------------------------------------
// Discord parser  (ZIP containing messages/ * /messages.json)
// PRIVACY: we do NOT store message content — only frequency/timing patterns
// ---------------------------------------------------------------------------

function parseDiscord(buffer) {
  let zip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    throw new Error('Invalid Discord export — expected a ZIP file');
  }

  const entries = zip.getEntries();
  const messageFiles = entries.filter(e =>
    e.entryName.match(/messages\/[^/]+\/messages\.json$/i) && !e.isDirectory
  );

  if (messageFiles.length === 0) {
    throw new Error('No messages found in Discord export (expected messages/*/messages.json)');
  }

  let totalMessages = 0;
  let serverCount = 0;
  const hourBuckets = new Array(24).fill(0);
  const channelIds = new Set();

  for (const entry of messageFiles) {
    let msgs;
    try {
      msgs = JSON.parse(entry.getData().toString('utf8'));
    } catch {
      continue;
    }
    if (!Array.isArray(msgs)) continue;

    channelIds.add(entry.entryName.split('/')[1]);
    totalMessages += msgs.length;

    for (const msg of msgs) {
      const ts = msg.Timestamp || msg.timestamp;
      if (ts) {
        try {
          const h = new Date(ts).getHours();
          if (h >= 0 && h <= 23) hourBuckets[h]++;
        } catch { /* skip */ }
      }
    }
  }

  serverCount = channelIds.size;

  const summaryObs = [];

  if (totalMessages > 0) {
    summaryObs.push(
      `Sent ${totalMessages.toLocaleString()} Discord messages across ${serverCount} channel${serverCount !== 1 ? 's' : ''}`
    );
  }

  // Time-of-day pattern
  const total = hourBuckets.reduce((a, b) => a + b, 0);
  if (total > 0) {
    const evening = hourBuckets.slice(19, 23).reduce((a, b) => a + b, 0);
    const pct = Math.round((evening / total) * 100);
    if (pct > 35) {
      summaryObs.push(`Peak Discord activity: evenings (${pct}% of messages sent 7–11pm)`);
    }
    // Find peak hour range
    let maxHour = 0;
    let maxCount = 0;
    for (let h = 0; h < 24; h++) {
      if (hourBuckets[h] > maxCount) { maxCount = hourBuckets[h]; maxHour = h; }
    }
    const fmt = (h) => h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`;
    summaryObs.push(`Most active Discord hour: around ${fmt(maxHour)}`);
  }

  return summaryObs;
}

// ---------------------------------------------------------------------------
// Reddit parser
// ---------------------------------------------------------------------------

function parseReddit(buffer) {
  let raw;
  try {
    raw = JSON.parse(buffer.toString('utf8'));
  } catch {
    throw new Error('Invalid Reddit JSON export');
  }

  // Reddit exports can be flat or nested under a top-level key
  const data = raw.data || raw;

  const comments = Array.isArray(data.comments) ? data.comments : [];
  const posts = Array.isArray(data.posts) ? data.posts : [];
  const saved = Array.isArray(data.saved_posts) ? data.saved_posts
    : Array.isArray(data.saved) ? data.saved : [];

  const subredditCounts = {};

  const countSub = (item) => {
    const sub = item.subreddit || item.data?.subreddit;
    if (sub) {
      const s = String(sub).replace(/^r\//, '').slice(0, 40);
      subredditCounts[s] = (subredditCounts[s] || 0) + 1;
    }
  };

  for (const c of comments) countSub(c);
  for (const p of posts) countSub(p);

  const summaryObs = [];

  const topSubs = Object.entries(subredditCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  if (topSubs.length > 0) {
    const topList = topSubs.slice(0, 4).map(([s, c]) => `r/${s} (${c})`).join(', ');
    summaryObs.push(`Most active Reddit communities: ${topList}`);
  }

  if (comments.length > 0) {
    summaryObs.push(`Made ${comments.length.toLocaleString()} Reddit comments across history`);
  }

  if (posts.length > 0) {
    summaryObs.push(`Submitted ${posts.length.toLocaleString()} Reddit posts`);
  }

  if (saved.length > 0) {
    summaryObs.push(`Saved ${saved.length.toLocaleString()} Reddit posts`);
  }

  // Topic inference from top subs
  const techSubs = ['programming', 'webdev', 'javascript', 'python', 'learnprogramming',
    'MachineLearning', 'technology', 'cscareerquestions', 'compsci', 'devops'];
  const techCount = topSubs.filter(([s]) => techSubs.some(t => t.toLowerCase() === s.toLowerCase())).length;
  if (techCount >= 2) {
    summaryObs.push('Strong Reddit presence in technology and programming communities');
  }

  return summaryObs;
}

// ---------------------------------------------------------------------------
// WhatsApp chat export parser
// PRIVACY: message content is NEVER stored — only behavioral/pattern metadata
// ---------------------------------------------------------------------------

/**
 * Accepts either:
 *   - A ZIP buffer containing a file whose name ends with _chat.txt
 *   - A raw TXT buffer (the _chat.txt content directly)
 *
 * Supported line formats:
 *   [15/01/2024, 08:32:45] Stefano: Hey, can we meet today?
 *   15/01/2024, 08:32 - Stefano: Hey, can we meet today?
 *
 * "<Media omitted>" lines are counted as media messages (no content stored).
 * System messages (no "Sender: " pattern) are skipped.
 */
function parseWhatsApp(buffer) {
  // ── Step 1: extract text ────────────────────────────────────────────────
  let text;
  try {
    const zip = new AdmZip(buffer);
    const chatEntry = zip.getEntries().find(e =>
      !e.isDirectory && e.entryName.toLowerCase().endsWith('_chat.txt')
    );
    if (!chatEntry) {
      throw new Error('No _chat.txt found inside ZIP');
    }
    text = chatEntry.getData().toString('utf8');
  } catch (zipErr) {
    // Not a ZIP (or no _chat.txt) — treat buffer as raw TXT
    text = buffer.toString('utf8');
  }

  if (!text || text.trim().length === 0) {
    throw new Error('WhatsApp export is empty');
  }

  // ── Step 2: parse lines ─────────────────────────────────────────────────
  // Format A: [DD/MM/YYYY, HH:MM:SS] Sender: body
  const FMT_A = /^\[(\d{1,2})\/(\d{1,2})\/(\d{4}),\s*(\d{1,2}):(\d{2})(?::\d{2})?\]\s+([^:]+):\s*(.*)$/;
  // Format B: DD/MM/YYYY, HH:MM - Sender: body
  const FMT_B = /^(\d{1,2})\/(\d{1,2})\/(\d{4}),\s*(\d{1,2}):(\d{2})\s+-\s+([^:]+):\s*(.*)$/;
  // Media sentinel
  const MEDIA_RE = /^<Media omitted>$/i;

  const lines = text.split('\n');

  // We need to identify the "owner" of the export — the person who exported.
  // WhatsApp exports typically have the exporter's name appear most frequently
  // as the sender (since it's their own chat history). We'll infer it.
  const senderCounts = {};
  let earliestDate = null;
  let latestDate = null;

  const messages = []; // { ts: Date, sender: string, isMedia: boolean, wordCount: number }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    let match = line.match(FMT_A) || line.match(FMT_B);
    if (!match) continue;

    // Both regexes produce the same capture groups: day, month, year, hour, min, sender, body
    const [, day, month, year, hour, min, rawSender, body] = match;
    const ts = new Date(
      Number(year), Number(month) - 1, Number(day),
      Number(hour), Number(min)
    );
    if (isNaN(ts.getTime())) continue;

    const sender = rawSender.trim().slice(0, 60);
    const isMedia = MEDIA_RE.test(body.trim());
    const wordCount = isMedia ? 0 : body.trim().split(/\s+/).filter(Boolean).length;

    senderCounts[sender] = (senderCounts[sender] || 0) + 1;

    if (!earliestDate || ts < earliestDate) earliestDate = ts;
    if (!latestDate || ts > latestDate) latestDate = ts;

    messages.push({ ts, sender, isMedia, wordCount });
  }

  if (messages.length === 0) {
    throw new Error('Could not parse any messages from WhatsApp export — check file format');
  }

  // ── Step 3: infer "owner" (most frequent sender) ────────────────────────
  const ownerName = Object.entries(senderCounts)
    .sort((a, b) => b[1] - a[1])[0][0];

  // ── Step 4: compute metrics — only on owner's messages ──────────────────
  const ownerMessages = messages.filter(m => m.sender === ownerName);
  const totalMessages = messages.length;
  const ownerMsgCount = ownerMessages.length;

  // Date range + avg messages/day
  const daySpan = earliestDate && latestDate
    ? Math.max(1, Math.round((latestDate - earliestDate) / (24 * 3600_000)))
    : 1;
  const avgMsgsPerDay = (totalMessages / daySpan).toFixed(1);

  // Active hours — only owner's messages
  const hourBuckets = new Array(24).fill(0);
  for (const m of ownerMessages) {
    hourBuckets[m.ts.getHours()]++;
  }
  const totalHourMsgs = hourBuckets.reduce((a, b) => a + b, 0);

  const pctHours = totalHourMsgs > 0 ? {
    morning:   Math.round(hourBuckets.slice(6, 12).reduce((a, b) => a + b, 0) / totalHourMsgs * 100),
    afternoon: Math.round(hourBuckets.slice(12, 18).reduce((a, b) => a + b, 0) / totalHourMsgs * 100),
    evening:   Math.round(hourBuckets.slice(18, 22).reduce((a, b) => a + b, 0) / totalHourMsgs * 100),
    night:     Math.round((
      hourBuckets.slice(22, 24).reduce((a, b) => a + b, 0) +
      hourBuckets.slice(0, 6).reduce((a, b) => a + b, 0)
    ) / totalHourMsgs * 100),
  } : null;

  // Peak hour
  let peakHour = 0;
  for (let h = 1; h < 24; h++) {
    if (hourBuckets[h] > hourBuckets[peakHour]) peakHour = h;
  }
  const fmtHour = (h) => h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`;

  // Day-of-week patterns — owner messages
  const dayBuckets = new Array(7).fill(0); // 0=Sun, 1=Mon, ...
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  for (const m of ownerMessages) {
    dayBuckets[m.ts.getDay()]++;
  }
  let peakDay = 0;
  for (let d = 1; d < 7; d++) {
    if (dayBuckets[d] > dayBuckets[peakDay]) peakDay = d;
  }

  // Media ratio — owner messages
  const ownerMedia = ownerMessages.filter(m => m.isMedia).length;
  const ownerText  = ownerMsgCount - ownerMedia;
  const mediaPct   = ownerMsgCount > 0 ? Math.round((ownerMedia / ownerMsgCount) * 100) : 0;

  // Average words per message (text-only, owner)
  const totalWords = ownerMessages.reduce((s, m) => s + m.wordCount, 0);
  const avgWords   = ownerText > 0 ? (totalWords / ownerText).toFixed(1) : 0;

  // Contact frequency: top contacts by message count (no content, only counts)
  // Use anonymized labels to protect privacy (Contact A, B, C, ...)
  const contactsSorted = Object.entries(senderCounts)
    .filter(([name]) => name !== ownerName)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // Response time analysis: per-conversation session (gap > 4h = new session)
  const SESSION_GAP_MS = 4 * 3600_000;
  const responseTimes = [];
  const conversationStarts = { owner: 0, other: 0 };

  let prevMsg = null;
  for (const msg of messages) {
    if (!prevMsg) {
      // First message — whoever sent it started
      if (msg.sender === ownerName) conversationStarts.owner++;
      else conversationStarts.other++;
      prevMsg = msg;
      continue;
    }

    const gap = msg.ts - prevMsg.ts;

    // New session — track who opens it
    if (gap > SESSION_GAP_MS) {
      if (msg.sender === ownerName) conversationStarts.owner++;
      else conversationStarts.other++;
    }

    // Response time: only when the sender changes and gap is < 4h
    if (msg.sender !== prevMsg.sender && gap > 0 && gap < SESSION_GAP_MS) {
      responseTimes.push(gap);
    }

    prevMsg = msg;
  }

  const totalSessions = conversationStarts.owner + conversationStarts.other;
  const initiatorPct = totalSessions > 0
    ? Math.round((conversationStarts.owner / totalSessions) * 100)
    : 0;

  const avgResponseMs = responseTimes.length > 0
    ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
    : null;

  const fmtDuration = (ms) => {
    const mins = Math.round(ms / 60_000);
    if (mins < 60) return `${mins} min`;
    const hours = (ms / 3_600_000).toFixed(1);
    return `${hours}h`;
  };

  // ── Step 5: build observations ───────────────────────────────────────────
  const obs = [];

  // 1. Volume + date range summary
  if (earliestDate && latestDate) {
    const monthFmt = (d) => `${d.toLocaleString('default', { month: 'short' })} ${d.getFullYear()}`;
    const spanLabel = daySpan >= 365
      ? `~${Math.round(daySpan / 365)} year${Math.round(daySpan / 365) !== 1 ? 's' : ''}`
      : daySpan >= 30
        ? `~${Math.round(daySpan / 30)} months`
        : `${daySpan} days`;
    obs.push(
      `WhatsApp chat history spans ${spanLabel} (${monthFmt(earliestDate)} to ${monthFmt(latestDate)}), ` +
      `${totalMessages.toLocaleString()} total messages across ${contactsSorted.length + 1} participants, ` +
      `averaging ${avgMsgsPerDay} messages/day`
    );
  }

  // 2. Active hours pattern
  if (pctHours) {
    const dominant = Object.entries(pctHours).sort((a, b) => b[1] - a[1])[0];
    obs.push(
      `WhatsApp messaging patterns: ${pctHours.morning}% morning, ${pctHours.afternoon}% afternoon, ` +
      `${pctHours.evening}% evening, ${pctHours.night}% late-night. ` +
      `Peak hour: around ${fmtHour(peakHour)} (primarily a ${dominant[0]} messenger)`
    );
  }

  // 3. Day-of-week pattern
  obs.push(
    `Most active WhatsApp day: ${DAY_NAMES[peakDay]} ` +
    `(${dayBuckets[peakDay]} messages sent on ${DAY_NAMES[peakDay]}s)`
  );

  // 4. Contact frequency — top 5, anonymized by first name only (common privacy norm)
  if (contactsSorted.length > 0) {
    const topContacts = contactsSorted.slice(0, 5).map(([name, count], i) => {
      // Use first name only (split on space, take first word) for minimal privacy exposure
      const firstName = name.split(/\s+/)[0];
      return `${firstName} (${count} msgs)`;
    });
    obs.push(`Most frequent WhatsApp contacts: ${topContacts.join(', ')}`);
  }

  // 5. Media ratio
  if (ownerMsgCount > 0) {
    const mediaDesc = mediaPct > 30
      ? 'heavy media sender (GIFs, photos, voice notes)'
      : mediaPct > 15
        ? 'moderate media sender'
        : 'primarily text-based communicator';
    obs.push(
      `WhatsApp communication style: ${ownerText.toLocaleString()} text messages, ` +
      `${ownerMedia.toLocaleString()} media files (${mediaPct}% media — ${mediaDesc})`
    );
  }

  // 6. Message length — brief vs verbose
  if (Number(avgWords) > 0) {
    const lengthDesc = Number(avgWords) > 20
      ? 'writes long, detailed messages'
      : Number(avgWords) > 8
        ? 'writes medium-length messages'
        : 'sends short, punchy messages';
    obs.push(
      `WhatsApp message length: avg ${avgWords} words per text message (${lengthDesc})`
    );
  }

  // 7. Conversation starter tendency
  if (totalSessions >= 5) {
    const starterDesc = initiatorPct > 60
      ? 'tends to initiate conversations'
      : initiatorPct < 40
        ? 'tends to respond rather than initiate'
        : 'balanced conversation initiator';
    obs.push(
      `WhatsApp conversation dynamics: initiates ${initiatorPct}% of chat sessions (${starterDesc})`
    );
  }

  // 8. Response time
  if (avgResponseMs !== null && responseTimes.length >= 10) {
    obs.push(
      `Average WhatsApp response time: ${fmtDuration(avgResponseMs)} ` +
      `(based on ${responseTimes.length.toLocaleString()} message exchanges)`
    );
  }

  // 9. Own message share vs others
  const ownerSharePct = totalMessages > 0 ? Math.round((ownerMsgCount / totalMessages) * 100) : 0;
  if (ownerMsgCount > 0) {
    const shareDesc = ownerSharePct > 55
      ? 'tends to carry conversations'
      : ownerSharePct < 35
        ? 'tends to be the listener in conversations'
        : 'balanced talker-listener';
    obs.push(
      `WhatsApp participation: sent ${ownerMsgCount.toLocaleString()} of ${totalMessages.toLocaleString()} total messages ` +
      `(${ownerSharePct}% share — ${shareDesc})`
    );
  }

  // 10. Weekend vs weekday messaging
  const weekendMsgs = dayBuckets[0] + dayBuckets[6]; // Sun + Sat
  const weekdayMsgs = dayBuckets.slice(1, 6).reduce((a, b) => a + b, 0);
  const totalDayMsgs = weekendMsgs + weekdayMsgs;
  if (totalDayMsgs > 0) {
    const weekendPct = Math.round((weekendMsgs / totalDayMsgs) * 100);
    const pattern = weekendPct > 32
      ? 'more socially active on weekends'
      : weekendPct < 20
        ? 'messaging peaks on weekdays (work/school week pattern)'
        : 'consistent messaging across weekdays and weekends';
    obs.push(`WhatsApp weekly pattern: ${weekendPct}% of messages on weekends (${pattern})`);
  }

  return obs;
}


// ---------------------------------------------------------------------------
// Apple Health parser
// Accepts:
//   export.zip  — standard Apple Health export (ZIP containing apple_health_export/export.xml)
//   export.xml  — raw XML file if the user manually extracted it
// ---------------------------------------------------------------------------

/** Extract a named XML attribute value from a tag string (double-quoted only). */
function extractAppleAttr(tag, name) {
  const re = new RegExp(`\\b${name}="([^"]*)"`, 'i');
  const m = tag.match(re);
  return m ? m[1] : null;
}

/**
 * Parse an Apple Health date string ("2024-01-15 08:00:00 +0000") into a Date.
 * Returns null if parsing fails.
 */
function parseAppleDate(str) {
  if (!str) return null;
  try {
    // Convert "YYYY-MM-DD HH:MM:SS +HHMM" to ISO 8601 for the Date constructor
    const iso = str.replace(
      /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{4})$/,
      '$1T$2$3'
    );
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/** Format a month/year string for observation text, e.g. "Jan 2024". */
function fmtAppleMonth(d) {
  return `${d.toLocaleString('default', { month: 'short' })} ${d.getFullYear()}`;
}

function parseAppleHealth(buffer) {
  // ── Step 1: extract XML string from ZIP or raw XML buffer ─────────────────
  let xmlStr;

  try {
    const zip = new AdmZip(buffer);
    const entry = zip.getEntries().find(e =>
      !e.isDirectory && /export\.xml$/i.test(e.entryName)
    );
    if (!entry) throw new Error('export.xml not found inside ZIP');
    xmlStr = entry.getData().toString('utf8');
  } catch (zipErr) {
    // Not a valid ZIP — try raw XML
    const raw = buffer.toString('utf8').trimStart();
    if (raw.startsWith('<?xml') || raw.startsWith('<HealthData') || raw.startsWith('<Health')) {
      xmlStr = raw;
    } else {
      throw new Error(
        `Apple Health import: not a valid ZIP and not recognized XML. ` +
        `Expected export.zip (from iPhone Health app → share) or export.xml. (${zipErr.message})`
      );
    }
  }

  // ── Step 2: scan XML for <Record .../>  and <Workout .../> tags ───────────
  // We use String.prototype.matchAll with global regex — safe for large files
  // and avoids needing a full XML parser.

  const MAX_INDIVIDUAL_OBS = 100;

  const dailySteps      = {};  // 'YYYY-MM-DD' -> cumulative step count
  const hrSamples       = [];  // { value: number, date: Date }
  const restingHrSamples = []; // { value: number, date: Date }
  const hrvSamples      = [];  // { value: number (ms), date: Date }
  const dailyActiveEnergy = {}; // 'YYYY-MM-DD' -> cumulative kcal
  const sleepSessions   = [];  // { minutes: number, date: Date }
  const workouts        = [];  // { type: string, durationMin: number, date: Date }
  const weightSamples   = [];  // { kg: number, date: Date }

  // Match all self-closing <Record .../> tags
  const recordMatches = xmlStr.matchAll(/<Record\b([^>]*?)\/>/gs);
  for (const m of recordMatches) {
    const attrs    = m[1];
    const type     = extractAppleAttr(attrs, 'type') || '';
    const valueStr = extractAppleAttr(attrs, 'value') || '';
    const startStr = extractAppleAttr(attrs, 'startDate');
    const endStr   = extractAppleAttr(attrs, 'endDate');
    const date     = parseAppleDate(startStr);

    if (type === 'HKQuantityTypeIdentifierStepCount') {
      const steps = parseFloat(valueStr);
      if (!isNaN(steps) && date) {
        const dayKey = date.toISOString().substring(0, 10);
        dailySteps[dayKey] = (dailySteps[dayKey] || 0) + steps;
      }

    } else if (type === 'HKQuantityTypeIdentifierHeartRate') {
      const hr = parseFloat(valueStr);
      if (!isNaN(hr) && hr > 20 && hr < 300 && date) {
        hrSamples.push({ value: hr, date });
      }

    } else if (type === 'HKQuantityTypeIdentifierRestingHeartRate') {
      const rhr = parseFloat(valueStr);
      if (!isNaN(rhr) && rhr > 20 && rhr < 200 && date) {
        restingHrSamples.push({ value: rhr, date });
      }

    } else if (type === 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN') {
      const hrv = parseFloat(valueStr);
      if (!isNaN(hrv) && hrv > 0 && hrv < 300 && date) {
        hrvSamples.push({ value: hrv, date });
      }

    } else if (type === 'HKQuantityTypeIdentifierActiveEnergyBurned') {
      const kcal = parseFloat(valueStr);
      if (!isNaN(kcal) && kcal > 0 && date) {
        const dayKey = date.toISOString().substring(0, 10);
        dailyActiveEnergy[dayKey] = (dailyActiveEnergy[dayKey] || 0) + kcal;
      }

    } else if (type === 'HKCategoryTypeIdentifierSleepAnalysis') {
      // Only count actual sleep phases, not "InBed" (which over-inflates duration)
      if (valueStr.includes('Asleep') || valueStr === 'HKCategoryValueSleepAnalysisAsleep') {
        const start = parseAppleDate(startStr);
        const end   = parseAppleDate(endStr);
        if (start && end) {
          const minutes = (end.getTime() - start.getTime()) / 60_000;
          if (minutes > 20 && minutes < 900) {
            sleepSessions.push({ minutes, date: start });
          }
        }
      }

    } else if (type === 'HKQuantityTypeIdentifierBodyMass') {
      const unit = extractAppleAttr(attrs, 'unit') || 'kg';
      let kg = parseFloat(valueStr);
      if (!isNaN(kg) && date) {
        if (unit.toLowerCase() === 'lb') kg *= 0.453592;
        if (kg > 20 && kg < 500) weightSamples.push({ kg, date });
      }
    }
  }

  // Match all self-closing <Workout .../> tags
  const workoutMatches = xmlStr.matchAll(/<Workout\b([^>]*?)\/>/gs);
  for (const m of workoutMatches) {
    const attrs         = m[1];
    const activityType  = extractAppleAttr(attrs, 'workoutActivityType') || '';
    const durationStr   = extractAppleAttr(attrs, 'duration') || '';
    const durationUnit  = (extractAppleAttr(attrs, 'durationUnit') || 'min').toLowerCase();
    const startStr      = extractAppleAttr(attrs, 'startDate');
    const date          = parseAppleDate(startStr);

    let durationMin = parseFloat(durationStr);
    if (!isNaN(durationMin) && date) {
      if (durationUnit.includes('hour')) durationMin *= 60;
      else if (durationUnit.includes('sec')) durationMin /= 60;

      if (durationMin > 1 && durationMin < 600) {
        // Humanize: "HKWorkoutActivityTypeRunning" -> "Running"
        const typeName = activityType
          .replace(/^HKWorkoutActivityType/, '')
          .replace(/([A-Z])/g, ' $1')
          .trim() || 'Workout';
        workouts.push({ type: typeName, durationMin: Math.round(durationMin), date });
      }
    }
  }

  // ── Step 3: build summary observations ────────────────────────────────────
  const summaryObs = [];

  // Steps
  const stepDays = Object.keys(dailySteps);
  if (stepDays.length > 0) {
    const stepValues = stepDays.map(d => dailySteps[d]);
    const totalSteps = stepValues.reduce((a, b) => a + b, 0);
    const avgSteps   = Math.round(totalSteps / stepDays.length);
    const bestDay    = stepDays.reduce((best, d) => dailySteps[d] > dailySteps[best] ? d : best, stepDays[0]);
    const bestSteps  = Math.round(dailySteps[bestDay]);

    // Longest streak of days with >= 7,500 steps
    const sortedDays = [...stepDays].sort();
    let maxStreak = 0;
    let curStreak = 0;
    for (const d of sortedDays) {
      if (dailySteps[d] >= 7500) {
        curStreak++;
        if (curStreak > maxStreak) maxStreak = curStreak;
      } else {
        curStreak = 0;
      }
    }

    summaryObs.push(
      `Apple Health steps: ${stepDays.length} days tracked, avg ${avgSteps.toLocaleString()} steps/day, ` +
      `${totalSteps.toLocaleString()} total. Best day: ${bestSteps.toLocaleString()} steps (${bestDay})`
    );

    const activityLabel = avgSteps >= 10_000
      ? 'highly active (10k+ steps/day average)'
      : avgSteps >= 7_500
        ? 'moderately active (7,500–10,000 steps/day)'
        : avgSteps >= 5_000
          ? 'somewhat active (5,000–7,500 steps/day)'
          : 'mostly sedentary (under 5,000 steps/day)';
    summaryObs.push(`Physical activity level from Apple Health: ${activityLabel}`);

    if (maxStreak >= 3) {
      summaryObs.push(`Longest walking streak in Apple Health: ${maxStreak} consecutive days hitting 7,500+ steps`);
    }
  }

  // Heart rate
  if (hrSamples.length >= 10) {
    const hrValues = hrSamples.map(s => s.value);
    const avgHr    = Math.round(hrValues.reduce((a, b) => a + b, 0) / hrValues.length);
    const minHr    = Math.round(Math.min(...hrValues));
    const maxHr    = Math.round(Math.max(...hrValues));

    // Estimate resting HR from the lowest 10% of samples
    const sortedHr  = [...hrValues].sort((a, b) => a - b);
    const restSlice = sortedHr.slice(0, Math.max(1, Math.floor(sortedHr.length * 0.10)));
    const restingHr = Math.round(restSlice.reduce((a, b) => a + b, 0) / restSlice.length);

    summaryObs.push(
      `Apple Health heart rate: estimated resting ~${restingHr} bpm, avg ${avgHr} bpm, ` +
      `range ${minHr}–${maxHr} bpm (${hrSamples.length.toLocaleString()} samples)`
    );

    const fitnessLabel = restingHr < 50
      ? 'athlete-level resting heart rate'
      : restingHr < 60
        ? 'excellent resting heart rate (strong cardiovascular fitness)'
        : restingHr < 70
          ? 'good resting heart rate'
          : restingHr < 80
            ? 'average resting heart rate'
            : 'elevated resting heart rate';
    summaryObs.push(`Cardiovascular fitness signal from Apple Health: ${fitnessLabel} (~${restingHr} bpm resting)`);
  }

  // Resting Heart Rate (Apple Watch native metric — more accurate than estimation from HR samples)
  if (restingHrSamples.length >= 5) {
    const rhrValues = restingHrSamples.map(s => s.value);
    const avgRhr = Math.round(rhrValues.reduce((a, b) => a + b, 0) / rhrValues.length);
    const sorted = [...rhrValues].sort((a, b) => a - b);
    const recentRhr = restingHrSamples
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 7)
      .map(s => s.value);
    const recentAvg = recentRhr.length > 0
      ? Math.round(recentRhr.reduce((a, b) => a + b, 0) / recentRhr.length)
      : avgRhr;

    summaryObs.push(
      `Apple Health resting heart rate: ${avgRhr} bpm average across ${restingHrSamples.length} readings, ` +
      `recent 7-day avg ${recentAvg} bpm, range ${Math.round(sorted[0])}–${Math.round(sorted[sorted.length - 1])} bpm`
    );

    // Trend detection: compare first vs last third
    if (restingHrSamples.length >= 15) {
      const chronological = [...restingHrSamples].sort((a, b) => a.date.getTime() - b.date.getTime());
      const thirdLen = Math.floor(chronological.length / 3);
      const earlyAvg = Math.round(chronological.slice(0, thirdLen).reduce((a, s) => a + s.value, 0) / thirdLen);
      const lateAvg = Math.round(chronological.slice(-thirdLen).reduce((a, s) => a + s.value, 0) / thirdLen);
      const diff = lateAvg - earlyAvg;
      if (Math.abs(diff) >= 3) {
        const trend = diff < 0 ? 'trending down (improving)' : 'trending up';
        summaryObs.push(`Resting heart rate trend from Apple Health: ${trend} (${earlyAvg} → ${lateAvg} bpm)`);
      }
    }
  }

  // HRV (Heart Rate Variability SDNN)
  if (hrvSamples.length >= 5) {
    const hrvValues = hrvSamples.map(s => s.value);
    const avgHrv = Math.round(hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length);
    const sorted = [...hrvValues].sort((a, b) => a - b);
    const recentHrv = hrvSamples
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 7)
      .map(s => s.value);
    const recentAvg = recentHrv.length > 0
      ? Math.round(recentHrv.reduce((a, b) => a + b, 0) / recentHrv.length)
      : avgHrv;

    summaryObs.push(
      `Apple Health HRV (SDNN): ${avgHrv}ms average across ${hrvSamples.length} readings, ` +
      `recent 7-day avg ${recentAvg}ms, range ${Math.round(sorted[0])}–${Math.round(sorted[sorted.length - 1])}ms`
    );

    // HRV quality label
    const hrvLabel = avgHrv >= 100
      ? 'excellent HRV (strong autonomic resilience)'
      : avgHrv >= 60
        ? 'good HRV (healthy stress recovery)'
        : avgHrv >= 40
          ? 'moderate HRV (adequate recovery capacity)'
          : 'low HRV (may indicate elevated stress or low fitness)';
    summaryObs.push(`Autonomic nervous system signal from Apple Health: ${hrvLabel} (avg ${avgHrv}ms)`);
  }

  // Active Energy Burned
  const energyDays = Object.keys(dailyActiveEnergy);
  if (energyDays.length >= 3) {
    const energyValues = energyDays.map(d => dailyActiveEnergy[d]);
    const totalKcal = Math.round(energyValues.reduce((a, b) => a + b, 0));
    const avgKcal = Math.round(totalKcal / energyDays.length);
    const bestDay = energyDays.reduce((best, d) => dailyActiveEnergy[d] > dailyActiveEnergy[best] ? d : best, energyDays[0]);
    const bestKcal = Math.round(dailyActiveEnergy[bestDay]);

    summaryObs.push(
      `Apple Health active energy: avg ${avgKcal.toLocaleString()} kcal/day across ${energyDays.length} days, ` +
      `${totalKcal.toLocaleString()} kcal total. Most active day: ${bestKcal.toLocaleString()} kcal (${bestDay})`
    );

    const energyLabel = avgKcal >= 800
      ? 'very high daily energy expenditure (intense training or very active lifestyle)'
      : avgKcal >= 500
        ? 'high daily energy expenditure (regularly active)'
        : avgKcal >= 300
          ? 'moderate daily energy expenditure'
          : 'low daily active energy (mostly sedentary)';
    summaryObs.push(`Energy expenditure pattern from Apple Health: ${energyLabel}`);
  }

  // Sleep
  if (sleepSessions.length >= 3) {
    const sleepMins    = sleepSessions.map(s => s.minutes);
    const avgSleepMin  = Math.round(sleepMins.reduce((a, b) => a + b, 0) / sleepMins.length);
    const avgSleepHr   = (avgSleepMin / 60).toFixed(1);
    const shortNights  = sleepSessions.filter(s => s.minutes < 360).length;
    const longNights   = sleepSessions.filter(s => s.minutes >= 480).length;

    summaryObs.push(
      `Apple Health sleep: avg ${avgSleepHr}h/night over ${sleepSessions.length} tracked nights`
    );

    if (shortNights > sleepSessions.length * 0.3) {
      summaryObs.push(
        `Frequent sleep deprivation in Apple Health: ${shortNights} nights under 6 hours ` +
        `(${Math.round((shortNights / sleepSessions.length) * 100)}% of tracked nights)`
      );
    } else if (longNights > sleepSessions.length * 0.5) {
      summaryObs.push(`Consistent good sleep from Apple Health: ${longNights} nights with 8+ hours tracked`);
    }
  }

  // Workouts
  if (workouts.length > 0) {
    const typeCounts   = {};
    const typeDurations = {};
    for (const w of workouts) {
      typeCounts[w.type]    = (typeCounts[w.type] || 0) + 1;
      typeDurations[w.type] = (typeDurations[w.type] || 0) + w.durationMin;
    }

    const topTypes   = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const avgDurMin  = Math.round(workouts.reduce((a, w) => a + w.durationMin, 0) / workouts.length);
    const typeList   = topTypes.map(([t, c]) => `${t} (${c}x)`).join(', ');

    summaryObs.push(
      `Apple Health workouts: ${workouts.length} sessions recorded, avg ${avgDurMin} min each. ` +
      `Top activities: ${typeList}`
    );

    // Estimate weekly frequency from date range
    if (workouts.length >= 4) {
      const wDates = workouts.map(w => w.date).filter(Boolean).sort((a, b) => a.getTime() - b.getTime());
      if (wDates.length >= 2) {
        const spanWeeks = Math.max(1, (wDates[wDates.length - 1].getTime() - wDates[0].getTime()) / (7 * 24 * 3_600_000));
        const perWeek   = (workouts.length / spanWeeks).toFixed(1);
        summaryObs.push(`Workout frequency from Apple Health: ~${perWeek} sessions per week`);
      }
    }
  }

  // Body weight trend
  if (weightSamples.length >= 3) {
    const wSorted  = [...weightSamples].sort((a, b) => a.date.getTime() - b.date.getTime());
    const firstKg  = wSorted[0].kg;
    const lastKg   = wSorted[wSorted.length - 1].kg;
    const avgKg    = (wSorted.reduce((a, s) => a + s.kg, 0) / wSorted.length).toFixed(1);
    const deltaKg  = (lastKg - firstKg).toFixed(1);
    const deltaLbs = (Math.abs(lastKg - firstKg) * 2.205).toFixed(1);
    const trend    = lastKg > firstKg + 0.5
      ? `gained ${deltaKg}kg (${deltaLbs}lbs)`
      : lastKg < firstKg - 0.5
        ? `lost ${Math.abs(parseFloat(deltaKg))}kg (${deltaLbs}lbs)`
        : 'maintained stable weight';

    summaryObs.push(
      `Apple Health body weight: avg ${avgKg}kg across ${weightSamples.length} measurements — ${trend} over the tracked period`
    );
  }

  // ── Step 4: individual workout entries (most recent, up to MAX_INDIVIDUAL_OBS) ─
  const individualObs = workouts
    .filter(w => w.durationMin >= 20)
    .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))
    .slice(0, MAX_INDIVIDUAL_OBS)
    .map(w => {
      const monthYear = w.date ? fmtAppleMonth(w.date) : '';
      return monthYear
        ? `Workout: ${w.type}, ${w.durationMin} min (${monthYear})`
        : `Workout: ${w.type}, ${w.durationMin} min`;
    });

  if (summaryObs.length === 0 && individualObs.length === 0) {
    throw new Error(
      'No health records found in the Apple Health export. ' +
      'Make sure to export from iPhone Health app (profile icon → Export All Health Data) and upload the full export.zip.'
    );
  }

  return [...summaryObs, ...individualObs];
}


// ---------------------------------------------------------------------------
// Android Usage parser
// ---------------------------------------------------------------------------

/**
 * Input: JSON object from mobile app
 * { apps: [{ packageName, appName, totalTimeMs, date }], notifications: [{ packageName, appName, count, date }] }
 */
function parseAndroidUsage(buffer) {
  let data;
  try {
    data = JSON.parse(buffer.toString('utf8'));
  } catch {
    throw new Error('android_usage file is not valid JSON');
  }

  const apps = Array.isArray(data.appUsage) ? data.appUsage : (Array.isArray(data.apps) ? data.apps : []);
  const notifications = Array.isArray(data.notificationPatterns) ? data.notificationPatterns : (Array.isArray(data.notifications) ? data.notifications : []);
  const launches = Array.isArray(data.appLaunchCounts) ? data.appLaunchCounts : [];
  const hourly = Array.isArray(data.hourlyActivity) ? data.hourlyActivity : [];
  const observations = [];

  // ── Screen-on time ────────────────────────────────────────────────────────
  const screenOnMs = typeof data.screenOnTimeMs === 'number' ? data.screenOnTimeMs : 0;
  if (screenOnMs > 0) {
    const screenHours = (screenOnMs / 3_600_000).toFixed(1);
    observations.push(`Android screen-on time in last 24h: ${screenHours} hours`);
  }

  // ── Screen unlocks ────────────────────────────────────────────────────────
  const unlocks = typeof data.screenUnlockCount === 'number' ? data.screenUnlockCount : 0;
  if (unlocks > 0) {
    const avgMinsPerUnlock = screenOnMs > 0 ? Math.round(screenOnMs / unlocks / 60000) : null;
    const detail = avgMinsPerUnlock ? ` (~${avgMinsPerUnlock}min avg per session)` : '';
    observations.push(`Unlocked phone ${unlocks} times today${detail}`);
  }

  // ── Top apps by time ──────────────────────────────────────────────────────
  const appTotals = {};
  for (const entry of apps) {
    const key = entry.appName || entry.packageName || 'Unknown';
    appTotals[key] = (appTotals[key] || 0) + (entry.totalTimeMs || 0);
  }
  const topApps = Object.entries(appTotals).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 10);

  if (topApps.length > 0) {
    observations.push(`Most-used apps on Android: ${topApps.slice(0, 5).map(([n]) => n).join(', ')}`);
    for (const [appName, timeMs] of topApps.slice(0, 3)) {
      const mins = Math.round(Number(timeMs) / 60_000);
      if (mins >= 5) {
        const label = mins >= 60 ? `${(mins / 60).toFixed(1)}h` : `${mins}min`;
        observations.push(`Used ${appName} for ${label} on Android`);
      }
    }
  }

  // ── Launch counts — detect quick-check behaviour ──────────────────────────
  const checkers = launches
    .filter(e => e.launchCount >= 10 && e.avgSessionMs > 0 && e.avgSessionMs < 3 * 60_000)
    .sort((a, b) => b.launchCount - a.launchCount)
    .slice(0, 3);
  if (checkers.length > 0) {
    const names = checkers.map(e => `${e.appName} (${e.launchCount}x)`).join(', ');
    observations.push(`Quick-check habit on Android (many short opens): ${names}`);
  }

  const topLaunch = [...launches].sort((a, b) => b.launchCount - a.launchCount)[0];
  if (topLaunch && topLaunch.launchCount >= 5) {
    const avgSec = Math.round(topLaunch.avgSessionMs / 1000);
    const avgLabel = avgSec >= 60 ? `${Math.round(avgSec / 60)}min avg` : `${avgSec}s avg`;
    observations.push(`Most opened app on Android: ${topLaunch.appName} (${topLaunch.launchCount} times, ${avgLabel} per session)`);
  }

  // ── Hourly activity — peak window + night owl / morning signal ────────────
  if (hourly.length > 0) {
    const peak = [...hourly].sort((a, b) => Number(b.totalMs) - Number(a.totalMs))[0];
    if (peak && Number(peak.totalMs) > 5 * 60_000) {
      const fmt = (h) => h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`;
      observations.push(`Peak Android usage hour: ${fmt(peak.hour)} (${peak.activeApps} apps active)`);
    }
    const nightMs = hourly.filter(h => h.hour >= 22 || h.hour <= 4).reduce((s, h) => s + Number(h.totalMs), 0);
    const morningMs = hourly.filter(h => h.hour >= 6 && h.hour <= 9).reduce((s, h) => s + Number(h.totalMs), 0);
    const totalMs = hourly.reduce((s, h) => s + Number(h.totalMs), 0);
    if (totalMs > 0) {
      const nightPct = nightMs / totalMs;
      const morningPct = morningMs / totalMs;
      if (nightPct > 0.3) observations.push(`Night-owl phone usage pattern (${Math.round(nightPct * 100)}% of activity after 10pm)`);
      else if (morningPct > 0.25) observations.push(`Morning phone user (${Math.round(morningPct * 100)}% of activity before 9am)`);
    }
  }

  // ── App categories ────────────────────────────────────────────────────────
  const socialPkgs = ['instagram', 'twitter', 'snapchat', 'tiktok', 'facebook', 'reddit', 'discord', 'telegram', 'whatsapp'];
  const productivityPkgs = ['notion', 'slack', 'gmail', 'calendar', 'docs', 'sheets', 'zoom', 'teams', 'meet'];
  const entertainmentPkgs = ['youtube', 'netflix', 'spotify', 'twitch', 'prime', 'hulu', 'music'];
  const keys = Object.keys(appTotals).map(k => k.toLowerCase());
  const socialCount = keys.filter(k => socialPkgs.some(p => k.includes(p))).length;
  const prodCount = keys.filter(k => productivityPkgs.some(p => k.includes(p))).length;
  const entCount = keys.filter(k => entertainmentPkgs.some(p => k.includes(p))).length;
  if (socialCount >= 2) observations.push(`Active social media user on Android (${socialCount} social apps tracked)`);
  if (prodCount >= 2) observations.push(`Uses productivity apps on Android (${prodCount} tracked)`);
  if (entCount >= 2) observations.push(`Regular entertainment app usage on Android (${entCount} apps)`);

  // ── Notification patterns ─────────────────────────────────────────────────
  const notifTotals = {};
  for (const entry of notifications) {
    const key = entry.appName || entry.packageName || 'Unknown';
    notifTotals[key] = (notifTotals[key] || 0) + (entry.count || 0);
  }
  const topNotif = Object.entries(notifTotals).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 3);
  if (topNotif.length > 0) {
    observations.push(`Most notifications on Android from: ${topNotif.map(([n]) => n).join(', ')}`);
  }

  // ── Battery & charging ────────────────────────────────────────────────────
  const battery = data.batteryInfo;
  if (battery && typeof battery.level === 'number' && battery.level >= 0) {
    if (battery.isCharging) {
      observations.push(`Phone charging via ${battery.chargingType} at ${battery.level}% battery`);
    } else if (battery.level <= 20) {
      observations.push(`Phone battery very low (${battery.level}%) — not charging`);
    }
  }

  // ── Audio / ringer mode ───────────────────────────────────────────────────
  if (data.audioMode === 'silent') {
    observations.push(`Phone kept on silent — prioritises uninterrupted focus`);
  } else if (data.audioMode === 'vibrate') {
    observations.push(`Phone on vibrate — stays reachable without disrupting focus`);
  }

  return observations;
}


// ---------------------------------------------------------------------------
// Android Health Connect parser
// ---------------------------------------------------------------------------
//
// Input JSON format (written by the Android HealthConnectModule, see REQUIRES MOBILE REBUILD):
// {
//   "userId": "...",
//   "extractedAt": "...",
//   "healthConnect": {
//     "steps_7d":        [{ date: "YYYY-MM-DD", count: number }],
//     "sleep_7d":        [{ date: "YYYY-MM-DD", durationHours: number, startHour: number }],
//     "workouts":        [{ type: string, durationMin: number, date: "YYYY-MM-DD" }],
//     "avgRestingHR":    number | null,
//     "activeCalories7d": number
//   }
// }
//
// PRIVACY: No raw GPS or heart rate time-series — only daily aggregates / session-level data.

function parseHealthConnect(buffer) {
  let data;
  try {
    data = JSON.parse(buffer.toString('utf8'));
  } catch {
    throw new Error('health_connect file is not valid JSON');
  }

  const hc = data.healthConnect;
  if (!hc || typeof hc !== 'object') {
    throw new Error('health_connect JSON missing "healthConnect" key');
  }

  const steps7d   = Array.isArray(hc.steps_7d)  ? hc.steps_7d  : [];
  const sleep7d   = Array.isArray(hc.sleep_7d)  ? hc.sleep_7d  : [];
  const workouts  = Array.isArray(hc.workouts)  ? hc.workouts  : [];
  const restingHR = typeof hc.avgRestingHR === 'number' && hc.avgRestingHR > 0
    ? Math.round(hc.avgRestingHR)
    : null;
  const activeCalories = typeof hc.activeCalories7d === 'number' ? Math.round(hc.activeCalories7d) : null;

  const observations = [];

  // ── Steps ──────────────────────────────────────────────────────────────────
  if (steps7d.length > 0) {
    const validDays  = steps7d.filter(d => typeof d.count === 'number' && d.count >= 0);
    const total7d    = validDays.reduce((s, d) => s + d.count, 0);
    const avg7d      = validDays.length > 0 ? Math.round(total7d / validDays.length) : 0;
    const bestDay    = validDays.reduce((best, d) => d.count > (best?.count ?? 0) ? d : best, null);

    if (avg7d > 0) {
      const activityLabel = avg7d >= 10_000
        ? 'highly active (10k+ steps/day)'
        : avg7d >= 7_500
          ? 'moderately active (7,500–10,000 steps/day)'
          : avg7d >= 5_000
            ? 'somewhat active (5,000–7,500 steps/day)'
            : 'mostly sedentary (under 5,000 steps/day)';
      observations.push(
        `Averaged ${avg7d.toLocaleString()} steps per day over the past week ` +
        `(${total7d.toLocaleString()} total — ${activityLabel})`
      );
    }

    if (bestDay && bestDay.count > 0) {
      observations.push(
        `Best step day in the past week: ${bestDay.count.toLocaleString()} steps on ${bestDay.date}`
      );
    }
  }

  // ── Sleep ──────────────────────────────────────────────────────────────────
  if (sleep7d.length > 0) {
    const validNights   = sleep7d.filter(d => typeof d.durationHours === 'number' && d.durationHours > 0);
    const avgDurHours   = validNights.length > 0
      ? (validNights.reduce((s, d) => s + d.durationHours, 0) / validNights.length).toFixed(1)
      : null;

    const startHours    = sleep7d
      .filter(d => typeof d.startHour === 'number')
      .map(d => d.startHour);
    const avgStartHour  = startHours.length > 0
      ? Math.round(startHours.reduce((s, h) => s + h, 0) / startHours.length)
      : null;

    const fmtHour = (h) => {
      const norm = ((h % 24) + 24) % 24;
      return norm === 0 ? '12am' : norm < 12 ? `${norm}am` : norm === 12 ? '12pm' : `${norm - 12}pm`;
    };

    if (avgDurHours !== null && avgStartHour !== null) {
      const wakeHour = ((avgStartHour + Math.round(Number(avgDurHours))) % 24);
      observations.push(
        `Sleep schedule: typically falls asleep around ${fmtHour(avgStartHour)}, ` +
        `wakes around ${fmtHour(wakeHour)} ` +
        `(avg ${avgDurHours}h/night over ${validNights.length} tracked nights)`
      );
    } else if (avgDurHours !== null) {
      observations.push(
        `Averaged ${avgDurHours}h of sleep per night over the past week (Health Connect)`
      );
    }

    const shortNights = validNights.filter(d => d.durationHours < 6).length;
    if (shortNights > 0 && validNights.length >= 3) {
      observations.push(
        `${shortNights} of the last ${validNights.length} nights had under 6 hours of sleep`
      );
    }
  }

  // ── Heart rate ─────────────────────────────────────────────────────────────
  if (restingHR !== null) {
    const fitnessLabel = restingHR < 50
      ? 'athlete-level resting heart rate'
      : restingHR < 60
        ? 'excellent resting heart rate (strong cardiovascular fitness)'
        : restingHR < 70
          ? 'good resting heart rate'
          : restingHR < 80
            ? 'average resting heart rate'
            : 'elevated resting heart rate (worth monitoring)';
    observations.push(
      `Resting heart rate from Health Connect: ~${restingHR} bpm (${fitnessLabel})`
    );
  }

  // ── Active calories ────────────────────────────────────────────────────────
  if (activeCalories !== null && activeCalories > 0) {
    const dailyAvgCal = Math.round(activeCalories / 7);
    const burnLabel = dailyAvgCal >= 600
      ? 'high daily energy output'
      : dailyAvgCal >= 350
        ? 'moderate daily activity'
        : 'light daily activity';
    observations.push(
      `Burned ~${activeCalories.toLocaleString()} active calories in the past 7 days ` +
      `(~${dailyAvgCal} cal/day — ${burnLabel})`
    );
  }

  // ── Workouts ───────────────────────────────────────────────────────────────
  if (workouts.length > 0) {
    const typeCounts = {};
    for (const w of workouts) {
      const t = String(w.type || 'Workout').trim();
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    }

    const topTypes = Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const typeDesc = topTypes.map(([t, c]) => `${c} ${t.toLowerCase()}${c !== 1 ? 's' : ''}`).join(', ');
    const avgDurMin = Math.round(
      workouts
        .filter(w => typeof w.durationMin === 'number')
        .reduce((s, w) => s + w.durationMin, 0) / workouts.length
    );

    observations.push(
      `Completed ${workouts.length} workout${workouts.length !== 1 ? 's' : ''} this week: ${typeDesc}` +
      (avgDurMin > 0 ? ` (avg ${avgDurMin} min each)` : '')
    );
  }

  if (observations.length === 0) {
    throw new Error(
      'No Health Connect data found in the file. ' +
      'Ensure the Android app has Health Connect permissions and has synced at least once.'
    );
  }

  return observations;
}

// ---------------------------------------------------------------------------
// Android Health Connect — mobile app format
// Produced by mobile/src/services/healthConnect.ts (HealthConnectData shape).
// 30-day window, 7 data types: steps, heartRate, sleep, workouts, weight,
// spo2, restingHeartRate.
// ---------------------------------------------------------------------------

function parseAndroidHealthConnect(buffer) {
  let data;
  try {
    data = JSON.parse(buffer.toString('utf8'));
  } catch {
    throw new Error('android_health file is not valid JSON');
  }

  if (!data.available) {
    throw new Error('Health Connect is not available on this device or no data was returned');
  }

  const steps         = Array.isArray(data.steps)           ? data.steps           : [];
  const heartRate     = Array.isArray(data.heartRate)        ? data.heartRate       : [];
  const sleep         = Array.isArray(data.sleep)            ? data.sleep           : [];
  const workouts      = Array.isArray(data.workouts)         ? data.workouts        : [];
  const weight        = Array.isArray(data.weight)           ? data.weight          : [];
  const spo2          = Array.isArray(data.spo2)             ? data.spo2            : [];
  const restingHR     = Array.isArray(data.restingHeartRate) ? data.restingHeartRate : [];

  const observations = [];

  // ── Steps ──────────────────────────────────────────────────────────────────
  if (steps.length > 0) {
    const total = steps.reduce((s, d) => s + (d.count || 0), 0);
    const avg   = Math.round(total / steps.length);
    const best  = steps.reduce((b, d) => d.count > (b?.count ?? 0) ? d : b, null);

    const activityLabel = avg >= 10_000
      ? 'highly active (10k+ steps/day)'
      : avg >= 7_500
        ? 'moderately active'
        : avg >= 5_000
          ? 'somewhat active'
          : 'mostly sedentary (under 5k steps/day)';

    observations.push(
      `Averaged ${avg.toLocaleString()} steps/day over the past ${steps.length} days ` +
      `(${activityLabel})`
    );
    if (best && best.count > 0) {
      observations.push(`Best step day: ${best.count.toLocaleString()} steps on ${best.date}`);
    }
  }

  // ── Heart rate ─────────────────────────────────────────────────────────────
  if (heartRate.length > 0) {
    const overallAvg = Math.round(
      heartRate.reduce((s, d) => s + (d.avgBpm || 0), 0) / heartRate.length
    );
    const peakMax = Math.max(...heartRate.map(d => d.maxBpm || 0));

    const hrLabel = overallAvg < 60
      ? 'excellent cardiovascular fitness'
      : overallAvg < 70
        ? 'good heart rate'
        : overallAvg < 80
          ? 'average heart rate'
          : 'elevated average heart rate';

    observations.push(
      `Average heart rate: ${overallAvg} bpm over ${heartRate.length} days (${hrLabel})`
    );
    if (peakMax > 150) {
      observations.push(`Peak heart rate reached ${peakMax} bpm — consistent high-intensity effort`);
    }
  }

  // ── Sleep ──────────────────────────────────────────────────────────────────
  if (sleep.length > 0) {
    const avgDur = (sleep.reduce((s, n) => s + (n.durationHours || 0), 0) / sleep.length).toFixed(1);
    const shortNights = sleep.filter(n => n.durationHours < 6).length;

    observations.push(
      `Sleep average: ${avgDur}h/night across ${sleep.length} tracked sessions`
    );
    if (shortNights > 0) {
      observations.push(
        `${shortNights} of ${sleep.length} nights had under 6 hours of sleep`
      );
    }

    const allStages = sleep.flatMap(n => n.stages || []);
    if (allStages.length > 0) {
      const stageTotals = {};
      for (const s of allStages) {
        stageTotals[s.stage] = (stageTotals[s.stage] || 0) + s.durationMins;
      }
      const deepMins = stageTotals['deep'] || 0;
      const remMins  = stageTotals['rem']  || 0;
      if (deepMins > 0 || remMins > 0) {
        const avgDeep = Math.round(deepMins / sleep.length);
        const avgRem  = Math.round(remMins  / sleep.length);
        observations.push(
          `Sleep quality: avg ${avgDeep} min deep sleep and ${avgRem} min REM per night`
        );
      }
    }
  }

  // ── Workouts ───────────────────────────────────────────────────────────────
  if (workouts.length > 0) {
    const typeCounts = {};
    for (const w of workouts) {
      const t = String(w.exerciseType || 'workout').replace(/_/g, ' ');
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    }
    const topTypes = Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t, c]) => `${c}x ${t}`)
      .join(', ');

    const totalMins = workouts.reduce((s, w) => s + (w.durationMins || 0), 0);
    const totalCal  = workouts.reduce((s, w) => s + (w.calories || 0), 0);

    observations.push(
      `Completed ${workouts.length} workout${workouts.length !== 1 ? 's' : ''} in 30 days: ${topTypes}` +
      ` — ${totalMins} total minutes`
    );
    if (totalCal > 0) {
      observations.push(`Burned ${totalCal.toLocaleString()} calories across all tracked workouts`);
    }
  }

  // ── Weight ─────────────────────────────────────────────────────────────────
  if (weight.length >= 2) {
    const latest  = weight[weight.length - 1].weightKg;
    const oldest  = weight[0].weightKg;
    const delta   = +(latest - oldest).toFixed(1);
    const trend   = delta > 0.5 ? `up ${delta} kg` : delta < -0.5 ? `down ${Math.abs(delta)} kg` : 'stable';
    observations.push(`Body weight: ${latest} kg (${trend} over ${weight.length} measurements)`);
  } else if (weight.length === 1) {
    observations.push(`Body weight recorded: ${weight[0].weightKg} kg`);
  }

  // ── SpO2 ───────────────────────────────────────────────────────────────────
  if (spo2.length > 0) {
    const avg = (spo2.reduce((s, r) => s + r.percentage, 0) / spo2.length).toFixed(1);
    const low = spo2.filter(r => r.percentage < 95).length;
    observations.push(`Blood oxygen (SpO2): avg ${avg}% across ${spo2.length} readings`);
    if (low > 0) {
      observations.push(`${low} SpO2 readings below 95% — worth monitoring`);
    }
  }

  // ── Resting heart rate ─────────────────────────────────────────────────────
  if (restingHR.length > 0) {
    const avg = Math.round(restingHR.reduce((s, r) => s + r.bpm, 0) / restingHR.length);
    const fitnessLabel = avg < 50
      ? 'athlete-level'
      : avg < 60
        ? 'excellent'
        : avg < 70
          ? 'good'
          : avg < 80
            ? 'average'
            : 'elevated';
    observations.push(`Resting heart rate: ~${avg} bpm (${fitnessLabel}) across ${restingHR.length} measurements`);
  }

  if (observations.length === 0) {
    throw new Error(
      'No usable Health Connect data. Ensure permissions are granted and at least one ' +
      'wearable or health app has synced to Health Connect.'
    );
  }

  return observations;
}


// ---------------------------------------------------------------------------
// SMS & Call Patterns parser
// ---------------------------------------------------------------------------
//
// Input JSON format (written by the Android SmsStatsModule, see REQUIRES MOBILE REBUILD):
// {
//   "userId": "...",
//   "extractedAt": "...",
//   "smsPatterns": {
//     "sentLast30d":            number,
//     "receivedLast30d":        number,
//     "uniqueContacts":         number,
//     "peakHour":               number,        // 0-23
//     "sendHourHistogram":      number[24],    // count per hour of day
//     "avgResponseTimeMinutes": number | null
//   },
//   "callPatterns": {              // optional — requires READ_CALL_LOG
//     "totalOutgoing30d":    number,
//     "totalIncoming30d":    number,
//     "avgDurationSeconds":  number
//   }
// }
//
// PRIVACY: No message content is ever stored. Contact names are not stored.
// Only aggregate counts, timing histograms, and anonymized patterns.

function parseSmsPatterns(buffer) {
  let data;
  try {
    data = JSON.parse(buffer.toString('utf8'));
  } catch {
    throw new Error('sms_patterns file is not valid JSON');
  }

  const sms   = data.smsPatterns;
  const calls = data.callPatterns || null;

  if (!sms || typeof sms !== 'object') {
    throw new Error('sms_patterns JSON missing "smsPatterns" key');
  }

  const sentLast30d   = typeof sms.sentLast30d   === 'number' ? sms.sentLast30d   : 0;
  const recvLast30d   = typeof sms.receivedLast30d === 'number' ? sms.receivedLast30d : 0;
  const uniqueContacts = typeof sms.uniqueContacts === 'number' ? sms.uniqueContacts : null;
  const peakHour       = typeof sms.peakHour      === 'number' ? sms.peakHour      : null;
  const histogram      = Array.isArray(sms.sendHourHistogram) ? sms.sendHourHistogram : null;
  const avgResponseMin = typeof sms.avgResponseTimeMinutes === 'number'
    ? Math.round(sms.avgResponseTimeMinutes)
    : null;

  const observations = [];

  const fmtHour = (h) => {
    const n = ((h % 24) + 24) % 24;
    return n === 0 ? '12am' : n < 12 ? `${n}am` : n === 12 ? '12pm' : `${n - 12}pm`;
  };

  // ── Volume summary ─────────────────────────────────────────────────────────
  const totalSms = sentLast30d + recvLast30d;
  if (totalSms > 0) {
    const ratio = sentLast30d > 0 && recvLast30d > 0
      ? (sentLast30d / recvLast30d).toFixed(2)
      : null;
    const style = ratio !== null
      ? Number(ratio) > 1.3
        ? 'tends to initiate more than they receive'
        : Number(ratio) < 0.7
          ? 'tends to receive more than they send'
          : 'balanced sender/receiver'
      : '';

    observations.push(
      `Texted ${sentLast30d.toLocaleString()} times and received ${recvLast30d.toLocaleString()} ` +
      `texts in the past month` +
      (style ? ` — ${style}` : '')
    );
  }

  // ── Unique contacts ────────────────────────────────────────────────────────
  if (uniqueContacts !== null && uniqueContacts > 0) {
    const breadthLabel = uniqueContacts >= 50
      ? 'very broad social texter (50+ contacts)'
      : uniqueContacts >= 20
        ? 'active social texter'
        : uniqueContacts >= 10
          ? 'moderately social texter'
          : 'focused texter (tight inner circle)';
    observations.push(
      `Texted ${uniqueContacts} unique contacts in the past month — ${breadthLabel}`
    );
  }

  // ── Timing patterns ────────────────────────────────────────────────────────
  if (peakHour !== null) {
    observations.push(`Peak SMS hour: most texts sent around ${fmtHour(peakHour)}`);
  }

  if (histogram && histogram.length === 24) {
    const total = histogram.reduce((s, c) => s + (c || 0), 0);
    if (total > 0) {
      const morning   = histogram.slice(6, 12).reduce((s, c) => s + (c || 0), 0);
      const afternoon = histogram.slice(12, 18).reduce((s, c) => s + (c || 0), 0);
      const evening   = histogram.slice(18, 22).reduce((s, c) => s + (c || 0), 0);
      const night     = (histogram.slice(22, 24).reduce((s, c) => s + (c || 0), 0)
        + histogram.slice(0, 6).reduce((s, c) => s + (c || 0), 0));
      const pct = (n) => Math.round((n / total) * 100);

      const dominant = [
        ['morning', pct(morning)],
        ['afternoon', pct(afternoon)],
        ['evening', pct(evening)],
        ['late-night', pct(night)],
      ].sort((a, b) => Number(b[1]) - Number(a[1]))[0];

      observations.push(
        `SMS timing: ${pct(morning)}% morning, ${pct(afternoon)}% afternoon, ` +
        `${pct(evening)}% evening, ${pct(night)}% late-night ` +
        `(primarily a ${dominant[0]} texter)`
      );
    }
  }

  // ── Response time ──────────────────────────────────────────────────────────
  if (avgResponseMin !== null && avgResponseMin >= 0) {
    const responseLabel = avgResponseMin <= 5
      ? 'very fast responder'
      : avgResponseMin <= 20
        ? 'quick responder'
        : avgResponseMin <= 60
          ? 'moderate responder'
          : 'slow/async texter';
    observations.push(
      `Average SMS response time: ${avgResponseMin} min (${responseLabel})`
    );
  }

  // ── Call patterns (optional) ───────────────────────────────────────────────
  if (calls && typeof calls === 'object') {
    const outgoing   = typeof calls.totalOutgoing30d  === 'number' ? calls.totalOutgoing30d  : 0;
    const incoming   = typeof calls.totalIncoming30d  === 'number' ? calls.totalIncoming30d  : 0;
    const avgDurSec  = typeof calls.avgDurationSeconds === 'number' ? Math.round(calls.avgDurationSeconds) : null;
    const totalCalls = outgoing + incoming;

    if (totalCalls > 0) {
      const callStyle = outgoing > incoming * 1.3
        ? 'tends to initiate calls'
        : outgoing < incoming * 0.7
          ? 'tends to receive rather than initiate calls'
          : 'balanced caller';

      const avgDurLabel = avgDurSec !== null
        ? avgDurSec >= 300
          ? `avg ${Math.round(avgDurSec / 60)} min/call (long conversations)`
          : avgDurSec >= 60
            ? `avg ${Math.round(avgDurSec / 60)} min/call`
            : `avg ${avgDurSec}s/call (brief check-ins)`
        : '';

      observations.push(
        `Made/received ${totalCalls} phone calls in the past month ` +
        `(${outgoing} out, ${incoming} in — ${callStyle})` +
        (avgDurLabel ? `, ${avgDurLabel}` : '')
      );

      // SMS vs call preference
      if (totalSms > 0) {
        const smsRatio = (totalSms / Math.max(totalCalls, 1)).toFixed(0);
        const prefLabel = Number(smsRatio) >= 5
          ? 'strongly prefers texting over calling'
          : Number(smsRatio) >= 2
            ? 'leans toward texting'
            : 'mixes texting and calling';
        observations.push(
          `Communication style: ${smsRatio} texts per phone call — ${prefLabel}`
        );
      }
    }
  }

  if (observations.length === 0) {
    throw new Error(
      'No SMS pattern data found in the file. ' +
      'Ensure the Android app has READ_SMS permission and has synced at least once.'
    );
  }

  return observations;
}


// ---------------------------------------------------------------------------
// Whoop data export parser
// ---------------------------------------------------------------------------
// Whoop exports a ZIP containing CSV files:
//   physiological_cycles.csv — daily recovery/HRV/RHR
//   sleeps.csv               — nightly sleep data
//   workouts.csv             — workout strain/HR data
// ---------------------------------------------------------------------------

function parseCsvRows(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // Simple CSV split (no quoted commas in Whoop CSVs)
    const cells = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const row = {};
    headers.forEach((h, idx) => { row[h] = cells[idx] ?? ''; });
    rows.push(row);
  }
  return rows;
}

function parseWhoop(buffer) {
  let zip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    throw new Error('Whoop export must be a ZIP file downloaded from the Whoop app');
  }

  const observations = [];

  // ── Helper: find entry ignoring path prefix ─────────────────────────────
  const findEntry = (name) => zip.getEntries().find(e =>
    e.entryName.toLowerCase().endsWith(name.toLowerCase())
  );

  // ── Physiological cycles (recovery / HRV / RHR) ─────────────────────────
  const cyclesEntry = findEntry('physiological_cycles.csv');
  if (cyclesEntry) {
    const rows = parseCsvRows(cyclesEntry.getData().toString('utf8'));
    if (rows.length > 0) {
      const scores = rows.map(r => parseFloat(r['Recovery score %'])).filter(v => !isNaN(v));
      const hrvValues = rows.map(r => parseFloat(r['HRV (ms)'])).filter(v => !isNaN(v));
      const rhrValues = rows.map(r => parseFloat(r['Resting heart rate'])).filter(v => !isNaN(v));

      if (scores.length > 0) {
        const avg = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(0);
        const low = scores.filter(s => s < 34).length;
        const high = scores.filter(s => s >= 67).length;
        observations.push(`Whoop recovery average: ${avg}% over ${scores.length} days (${high} green days, ${low} red days)`);
        if (low > scores.length * 0.4) {
          observations.push(`Frequent low recovery on Whoop — ${low} of ${scores.length} days in the red zone (<34%)`);
        }
        if (high > scores.length * 0.5) {
          observations.push(`Consistently high Whoop recovery — ${high} of ${scores.length} days in the green zone (≥67%)`);
        }
      }

      if (hrvValues.length > 0) {
        const avgHrv = (hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length).toFixed(1);
        observations.push(`Average HRV: ${avgHrv}ms across ${hrvValues.length} nights on Whoop`);
      }

      if (rhrValues.length > 0) {
        const avgRhr = (rhrValues.reduce((a, b) => a + b, 0) / rhrValues.length).toFixed(1);
        observations.push(`Average resting heart rate: ${avgRhr} bpm (Whoop data, ${rhrValues.length} days)`);
      }

      // Strain trend (Day Strain column)
      const strainValues = rows.map(r => parseFloat(r['Day Strain'])).filter(v => !isNaN(v));
      if (strainValues.length > 0) {
        const avgStrain = (strainValues.reduce((a, b) => a + b, 0) / strainValues.length).toFixed(1);
        observations.push(`Average daily strain on Whoop: ${avgStrain}/21 across ${strainValues.length} days`);
      }
    }
  }

  // ── Sleep data ────────────────────────────────────────────────────────────
  const sleepsEntry = findEntry('sleeps.csv');
  if (sleepsEntry) {
    const rows = parseCsvRows(sleepsEntry.getData().toString('utf8'))
      .filter(r => r['Nap'] === '0' || r['Nap'] === 'FALSE' || r['Nap'] === 'false' || !r['Nap']); // main sleeps only

    if (rows.length > 0) {
      const durations = rows.map(r => parseFloat(r['Asleep duration (min)'])).filter(v => !isNaN(v) && v > 60);
      const efficiencies = rows.map(r => parseFloat(r['Sleep efficiency %'])).filter(v => !isNaN(v));

      if (durations.length > 0) {
        const avgHrs = (durations.reduce((a, b) => a + b, 0) / durations.length / 60).toFixed(1);
        const under7 = durations.filter(d => d < 420).length;
        observations.push(`Average sleep duration: ${avgHrs}h (Whoop, ${durations.length} nights tracked)`);
        if (under7 > durations.length * 0.4) {
          observations.push(`Frequently under-sleeping on Whoop — ${under7} of ${durations.length} nights below 7 hours`);
        }
      }

      if (efficiencies.length > 0) {
        const avgEff = (efficiencies.reduce((a, b) => a + b, 0) / efficiencies.length).toFixed(0);
        observations.push(`Average sleep efficiency: ${avgEff}% (Whoop, ${efficiencies.length} nights)`);
      }
    }
  }

  // ── Workout data ──────────────────────────────────────────────────────────
  const workoutsEntry = findEntry('workouts.csv');
  if (workoutsEntry) {
    const rows = parseCsvRows(workoutsEntry.getData().toString('utf8'));

    if (rows.length > 0) {
      // Sport frequency
      const sportCounts = {};
      for (const r of rows) {
        const sport = r['Sport'] || 'Unknown';
        sportCounts[sport] = (sportCounts[sport] || 0) + 1;
      }
      const topSports = Object.entries(sportCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
      if (topSports.length > 0) {
        const sportList = topSports.map(([s, n]) => `${s} (${n}x)`).join(', ');
        observations.push(`Top Whoop workouts: ${sportList} across ${rows.length} total sessions`);
      }

      // Average strain
      const strains = rows.map(r => parseFloat(r['Strain'])).filter(v => !isNaN(v) && v > 0);
      if (strains.length > 0) {
        const avgStr = (strains.reduce((a, b) => a + b, 0) / strains.length).toFixed(1);
        observations.push(`Average workout strain: ${avgStr}/21 on Whoop across ${strains.length} sessions`);
      }

      // Average HR
      const hrs = rows.map(r => parseFloat(r['Average heart rate (bpm)'])).filter(v => !isNaN(v) && v > 0);
      if (hrs.length > 0) {
        const avgHr = (hrs.reduce((a, b) => a + b, 0) / hrs.length).toFixed(0);
        observations.push(`Average workout heart rate: ${avgHr} bpm (Whoop, ${hrs.length} sessions)`);
      }
    }
  }

  if (observations.length === 0) {
    throw new Error(
      'No Whoop data found in ZIP. Expected physiological_cycles.csv, sleeps.csv, or workouts.csv. ' +
      'Export your data from the Whoop app: Profile → Settings → Account → Privacy → Request Data.'
    );
  }

  return observations;
}


// ---------------------------------------------------------------------------
// Google Search (Takeout My Activity) parser
// ---------------------------------------------------------------------------

function parseGoogleSearch(buffer) {
  let raw;
  try {
    raw = JSON.parse(buffer.toString('utf8'));
  } catch {
    throw new Error('Invalid Google Search JSON — expected MyActivity.json from Google Takeout');
  }

  if (!Array.isArray(raw)) {
    throw new Error('Google Search Takeout file must be a JSON array');
  }

  const MAX_INDIVIDUAL = 200;

  // Extract search query from title (Google formats as "Searched for <query>")
  const extractQuery = (title) => {
    if (!title) return null;
    const match = String(title).match(/^Searched for (.+)$/i);
    return match ? match[1].trim() : null;
  };

  const wordCounts = {};
  const hourBuckets = new Array(24).fill(0);
  const individualEntries = [];
  let totalSearches = 0;

  for (const entry of raw) {
    // Filter to Search product entries only (skip Maps, YouTube, etc.)
    const products = entry.products || [];
    const isSearch = products.includes('Search') || entry.header === 'Search';
    if (!isSearch) continue;

    const query = extractQuery(entry.title);
    if (!query) continue;

    totalSearches++;

    const when = entry.time ? new Date(entry.time) : null;
    if (when && !isNaN(when.getTime())) {
      hourBuckets[when.getHours()]++;
      individualEntries.push({ query, when });
    } else {
      individualEntries.push({ query, when: null });
    }

    // Tokenize query into words for topic extraction
    const words = query
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 4); // skip short stop-words

    for (const word of words) {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    }
  }

  const observations = [];

  // Summary: top search topics
  const STOP_WORDS = new Set([
    'what', 'where', 'when', 'how', 'that', 'this', 'with', 'from', 'have',
    'will', 'your', 'they', 'does', 'which', 'about', 'into', 'than', 'more',
    'some', 'like', 'would', 'could', 'should', 'best', 'good', 'many',
    'make', 'most', 'also', 'just', 'over', 'know', 'need', 'much',
    'between', 'after', 'before', 'their', 'there', 'being', 'been', 'were',
  ]);

  const topWords = Object.entries(wordCounts)
    .filter(([word]) => !STOP_WORDS.has(word))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30);

  if (topWords.length > 0 && totalSearches > 0) {
    const topTopics = topWords.slice(0, 8).map(([w]) => w).join(', ');
    observations.push(
      `Google Search history shows strong interest in: ${topTopics} ` +
      `(${totalSearches.toLocaleString()} total searches)`
    );
  }

  // Time-of-day pattern
  const totalHourPlays = hourBuckets.reduce((a, b) => a + b, 0);
  if (totalHourPlays > 0) {
    let peakHour = 0;
    for (let h = 1; h < 24; h++) {
      if (hourBuckets[h] > hourBuckets[peakHour]) peakHour = h;
    }
    const fmt = (h) => h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`;
    const morning   = hourBuckets.slice(6, 12).reduce((a, b) => a + b, 0);
    const evening   = hourBuckets.slice(18, 22).reduce((a, b) => a + b, 0);
    const lateNight = hourBuckets.slice(22, 24).reduce((a, b) => a + b, 0)
      + hourBuckets.slice(0, 6).reduce((a, b) => a + b, 0);
    const pct = (n) => Math.round((n / totalHourPlays) * 100);
    observations.push(
      `Google search timing: ${pct(morning)}% morning, ${pct(evening)}% evening, ${pct(lateNight)}% late-night. Peak hour: ${fmt(peakHour)}`
    );
  }

  // Individual search observations (most recent MAX_INDIVIDUAL)
  const individualObs = individualEntries
    .sort((a, b) => {
      if (!a.when && !b.when) return 0;
      if (!a.when) return 1;
      if (!b.when) return -1;
      return b.when.getTime() - a.when.getTime();
    })
    .slice(0, MAX_INDIVIDUAL)
    .map(({ query, when }) => {
      const monthYear = when
        ? `${when.toLocaleString('default', { month: 'short' })} ${when.getFullYear()}`
        : '';
      return monthYear
        ? `Searched for: ${query.slice(0, 100)} (${monthYear})`
        : `Searched for: ${query.slice(0, 100)}`;
    });

  return [...observations, ...individualObs];
}

// ---------------------------------------------------------------------------
// Import record helpers
// ---------------------------------------------------------------------------

async function createImportRecord(userId, platform, fileName, fileSizeBytes) {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('user_data_imports')
    .insert({
      user_id: userId,
      platform,
      status: 'processing',
      file_name: fileName,
      file_size_bytes: fileSizeBytes,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to create import record: ${error.message}`);
  return data.id;
}

async function finalizeImportRecord(importId, status, observationsCreated, factsCreated, errorMessage = null) {
  const supabase = await getSupabase();
  await supabase
    .from('user_data_imports')
    .update({
      status,
      observations_created: observationsCreated,
      facts_created: factsCreated,
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq('id', importId);
}

// ---------------------------------------------------------------------------
// Minimal CSV parser
// ---------------------------------------------------------------------------
// Hand-rolled to avoid adding a new dep for two small parsers. Handles:
//   - quoted fields with embedded commas
//   - escaped quotes ("")
//   - CRLF and LF line endings
//   - BOM
// Not a full RFC 4180 impl, but sufficient for Letterboxd and Goodreads exports.

function parseCsv(text) {
  if (!text) return [];
  // Strip UTF-8 BOM if present
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }  // escaped quote
        else { inQuotes = false; }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') { inQuotes = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') { continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function csvToObjects(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1)
    .filter(r => r.some(cell => cell && cell.trim().length > 0))
    .map(r => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = r[i] !== undefined ? r[i].trim() : ''; });
      return obj;
    });
}

// ---------------------------------------------------------------------------
// Letterboxd — film diary CSV export
// ---------------------------------------------------------------------------
// Source: Settings -> Data -> Export your data. The ZIP includes several CSVs
// (diary.csv, watched.csv, ratings.csv, reviews.csv). Users typically upload
// one directly; if a ZIP comes in we prefer diary.csv.

function extractLetterboxdCsv(buffer) {
  const asText = buffer.toString('utf8');
  // Cheap ZIP detection
  if (buffer[0] === 0x50 && buffer[1] === 0x4B) {
    try {
      const zip = new AdmZip(buffer);
      const entry = zip.getEntries().find(e => /diary\.csv$/i.test(e.entryName))
        || zip.getEntries().find(e => /ratings\.csv$/i.test(e.entryName))
        || zip.getEntries().find(e => /watched\.csv$/i.test(e.entryName));
      if (entry) return entry.getData().toString('utf8');
      throw new Error('Letterboxd ZIP missing diary.csv / ratings.csv / watched.csv');
    } catch (e) {
      throw new Error(`Letterboxd ZIP extract failed: ${e.message}`);
    }
  }
  return asText;
}

function formatStars(r) {
  const n = parseFloat(r);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Letterboxd stores 0.5-5 in half-star increments
  return `${n}★`;
}

function parseLetterboxd(buffer) {
  const csv = extractLetterboxdCsv(buffer);
  const rows = csvToObjects(csv);
  if (rows.length === 0) throw new Error('Letterboxd CSV has no rows');

  // Column layout varies between diary/ratings/watched — handle all three.
  // diary.csv:   Date, Name, Year, Letterboxd URI, Rating, Rewatch, Tags, Watched Date
  // ratings.csv: Date, Name, Year, Letterboxd URI, Rating
  // watched.csv: Date, Name, Year, Letterboxd URI

  const observations = [];
  const MAX = 500;

  // Aggregates for rollup observations
  const ratingCounts = { '0.5★': 0, '1★': 0, '1.5★': 0, '2★': 0, '2.5★': 0, '3★': 0, '3.5★': 0, '4★': 0, '4.5★': 0, '5★': 0 };
  let totalRated = 0;
  let totalWatched = 0;
  let fiveStarFilms = [];
  let rewatches = 0;

  for (const r of rows) {
    const name = r['Name'] || '';
    if (!name) continue;

    const year = r['Year'] || '';
    const watchedDate = r['Watched Date'] || r['Date'] || '';
    const stars = formatStars(r['Rating']);
    const isRewatch = (r['Rewatch'] || '').toLowerCase() === 'yes';
    const tags = r['Tags'] || '';

    totalWatched++;
    if (stars) {
      totalRated++;
      ratingCounts[stars] = (ratingCounts[stars] || 0) + 1;
      if (stars === '5★') fiveStarFilms.push(`${name}${year ? ` (${year})` : ''}`);
    }
    if (isRewatch) rewatches++;

    // Per-film observation (cap to most recent MAX entries after sort)
    const filmDisplay = year ? `"${name}" (${year})` : `"${name}"`;
    const parts = [`You watched ${filmDisplay}`];
    if (stars) parts.push(`and rated it ${stars}`);
    if (isRewatch) parts.push('(rewatch)');
    if (watchedDate) parts.push(`on ${watchedDate}`);
    if (tags) parts.push(`— tagged: ${tags}`);
    observations.push({
      ts: watchedDate,
      text: parts.join(' ') + '.',
    });
  }

  // Keep most-recent per-film observations
  observations.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
  const perFilm = observations.slice(0, MAX).map(o => o.text);

  // Rollup observations
  const rollups = [];
  rollups.push(`Your Letterboxd diary contains ${totalWatched} watched film${totalWatched === 1 ? '' : 's'}${totalRated > 0 ? `, ${totalRated} of which you rated` : ''}${rewatches > 0 ? `, including ${rewatches} rewatch${rewatches === 1 ? '' : 'es'}` : ''}.`);

  if (fiveStarFilms.length > 0) {
    const top = fiveStarFilms.slice(0, 10).join(', ');
    rollups.push(`Your five-star films on Letterboxd include: ${top}.`);
  }

  const topStar = Object.entries(ratingCounts).sort((a, b) => b[1] - a[1])[0];
  if (topStar && topStar[1] > 0) {
    rollups.push(`Your most common Letterboxd rating is ${topStar[0]} (${topStar[1]} films).`);
  }

  return [...rollups, ...perFilm];
}

// ---------------------------------------------------------------------------
// Goodreads — library CSV export
// ---------------------------------------------------------------------------
// Source: My Books -> Import and Export -> Export Library. Returns a single CSV
// with ~25 columns including shelves, dates, rating, review text.

function parseGoodreads(buffer) {
  const text = buffer.toString('utf8');
  const rows = csvToObjects(text);
  if (rows.length === 0) throw new Error('Goodreads CSV has no rows');

  const observations = [];
  const MAX = 500;

  const shelfCounts = {};
  let totalRead = 0;
  let totalRated = 0;
  let currentlyReading = [];
  let wantToRead = [];
  const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const fiveStarBooks = [];

  const perBook = [];

  for (const r of rows) {
    const title = (r['Title'] || '').trim();
    if (!title) continue;

    const author = (r['Author'] || '').trim();
    const rating = parseInt(r['My Rating'] || '0', 10);
    const dateRead = (r['Date Read'] || '').trim();
    const dateAdded = (r['Date Added'] || '').trim();
    const shelf = (r['Exclusive Shelf'] || '').trim().toLowerCase();
    const review = (r['My Review'] || '').trim();
    const pageCount = parseInt(r['Number of Pages'] || '0', 10);

    shelfCounts[shelf || 'unshelved'] = (shelfCounts[shelf || 'unshelved'] || 0) + 1;

    if (shelf === 'read') {
      totalRead++;
      if (rating > 0) {
        totalRated++;
        ratingDistribution[rating] = (ratingDistribution[rating] || 0) + 1;
        if (rating === 5) fiveStarBooks.push(`${title}${author ? ` by ${author}` : ''}`);
      }
    } else if (shelf === 'currently-reading') {
      currentlyReading.push(`${title}${author ? ` by ${author}` : ''}`);
    } else if (shelf === 'to-read') {
      wantToRead.push(`${title}${author ? ` by ${author}` : ''}`);
    }

    // Per-book observation (focus on read books)
    if (shelf === 'read') {
      const parts = [`You read "${title}"`];
      if (author) parts.push(`by ${author}`);
      if (rating > 0) parts.push(`and rated it ${rating}/5`);
      if (dateRead) parts.push(`(finished ${dateRead})`);
      else if (dateAdded) parts.push(`(added ${dateAdded})`);
      if (pageCount > 0) parts.push(`— ${pageCount} pages`);
      const base = parts.join(' ') + '.';
      const full = review && review.length > 0 && review.length < 400
        ? `${base} Your review: "${review}"`
        : base;
      perBook.push({ ts: dateRead || dateAdded, text: full });
    }
  }

  // Keep most-recent per-book observations
  perBook.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
  const perBookText = perBook.slice(0, MAX).map(o => o.text);

  // Rollups
  const rollups = [];
  rollups.push(`Your Goodreads library has ${totalRead} book${totalRead === 1 ? '' : 's'} on your "read" shelf${totalRated > 0 ? `, ${totalRated} rated` : ''}.`);

  if (currentlyReading.length > 0) {
    const top = currentlyReading.slice(0, 5).join('; ');
    rollups.push(`You are currently reading: ${top}.`);
  }
  if (wantToRead.length > 0) {
    rollups.push(`Your "want to read" shelf has ${wantToRead.length} book${wantToRead.length === 1 ? '' : 's'}.`);
  }
  if (fiveStarBooks.length > 0) {
    const top = fiveStarBooks.slice(0, 10).join('; ');
    rollups.push(`Your five-star books on Goodreads include: ${top}.`);
  }

  const topRating = Object.entries(ratingDistribution)
    .map(([k, v]) => [parseInt(k, 10), v])
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])[0];
  if (topRating) {
    rollups.push(`Your most common Goodreads rating is ${topRating[0]}/5 (${topRating[1]} books).`);
  }

  const customShelves = Object.entries(shelfCounts)
    .filter(([k]) => !['read', 'currently-reading', 'to-read', 'unshelved'].includes(k))
    .map(([k]) => k);
  if (customShelves.length > 0) {
    rollups.push(`Custom Goodreads shelves you use: ${customShelves.slice(0, 10).join(', ')}.`);
  }

  return [...rollups, ...perBookText];
}

// ---------------------------------------------------------------------------
// Netflix — viewing activity CSV (from account.netflix.com/YourData)
// ---------------------------------------------------------------------------
// Users receive a ZIP. The key file is `CONTENT_INTERACTION/ViewingActivity.csv`
// which has columns: Profile Name, Start Time, Duration, Attributes,
// Title, Supplemental Video Type, Device Type, Bookmark, Latest Bookmark, Country.
// Accept either the full ZIP or a bare ViewingActivity.csv.

function extractNetflixCsv(buffer) {
  if (buffer[0] === 0x50 && buffer[1] === 0x4B) {
    try {
      const zip = new AdmZip(buffer);
      const entry = zip.getEntries().find(e => /ViewingActivity\.csv$/i.test(e.entryName));
      if (entry) return entry.getData().toString('utf8');
      throw new Error('Netflix ZIP missing CONTENT_INTERACTION/ViewingActivity.csv');
    } catch (e) {
      throw new Error(`Netflix ZIP extract failed: ${e.message}`);
    }
  }
  return buffer.toString('utf8');
}

function parseDurationSeconds(d) {
  // Netflix durations look like "00:45:12" (HH:MM:SS). Return seconds.
  if (!d) return 0;
  const parts = d.split(':').map(n => parseInt(n, 10)).filter(n => Number.isFinite(n));
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function parseNetflix(buffer) {
  const csv = extractNetflixCsv(buffer);
  const rows = csvToObjects(csv);
  if (rows.length === 0) throw new Error('Netflix ViewingActivity.csv has no rows');

  const MAX_TITLES = 500;
  const titleStats = {};      // title -> { count, totalSec, latest }
  const deviceCounts = {};
  const countryCounts = {};
  const profileCounts = {};
  const hourBuckets = new Array(24).fill(0);
  const dayOfWeekBuckets = new Array(7).fill(0);

  let totalSessions = 0;
  let totalHours = 0;

  // Netflix wraps a series episode title as "Show: Season N: EpTitle" — strip to the show name.
  const showOf = t => (t || '').split(':')[0].trim();

  for (const r of rows) {
    const title = (r['Title'] || '').trim();
    if (!title) continue;

    const startStr = r['Start Time'] || r['Start time'] || '';
    const durationSec = parseDurationSeconds(r['Duration'] || '');
    if (durationSec < 60) continue; // skip trailers / accidental plays

    totalSessions++;
    totalHours += durationSec / 3600;

    const show = showOf(title);
    const stat = titleStats[show] || { count: 0, totalSec: 0, latest: '' };
    stat.count += 1;
    stat.totalSec += durationSec;
    if (startStr > stat.latest) stat.latest = startStr;
    titleStats[show] = stat;

    const device = (r['Device Type'] || '').trim();
    if (device) deviceCounts[device] = (deviceCounts[device] || 0) + 1;

    const country = (r['Country'] || '').trim();
    if (country) countryCounts[country] = (countryCounts[country] || 0) + 1;

    const profile = (r['Profile Name'] || '').trim();
    if (profile) profileCounts[profile] = (profileCounts[profile] || 0) + 1;

    if (startStr) {
      const d = new Date(startStr);
      if (!Number.isNaN(d.getTime())) {
        hourBuckets[d.getHours()] += 1;
        dayOfWeekBuckets[d.getDay()] += 1;
      }
    }
  }

  const rollups = [];
  const topShows = Object.entries(titleStats)
    .sort((a, b) => b[1].totalSec - a[1].totalSec)
    .slice(0, 15);

  rollups.push(`Your Netflix history has ${totalSessions} sessions across ${Object.keys(titleStats).length} distinct shows/films, totaling roughly ${Math.round(totalHours)} hours watched.`);

  if (topShows.length > 0) {
    const top5 = topShows.slice(0, 5).map(([show, s]) => `${show} (${Math.round(s.totalSec / 3600)}h)`).join(', ');
    rollups.push(`Your most-watched Netflix titles by time are: ${top5}.`);
  }

  // Peak hour
  const peakHour = hourBuckets.reduce((max, v, i) => v > max.v ? { v, i } : max, { v: 0, i: 0 });
  if (peakHour.v > 0) {
    const fmtHour = h => h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`;
    rollups.push(`Your Netflix peak viewing hour is ${fmtHour(peakHour.i)} (${peakHour.v} sessions).`);
  }

  // Peak day of week
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const peakDay = dayOfWeekBuckets.reduce((max, v, i) => v > max.v ? { v, i } : max, { v: 0, i: 0 });
  if (peakDay.v > 0) {
    rollups.push(`Your most-Netflix-heavy day of the week is ${dayNames[peakDay.i]}.`);
  }

  // Devices
  const topDevice = Object.entries(deviceCounts).sort((a, b) => b[1] - a[1])[0];
  if (topDevice) rollups.push(`You watch Netflix mostly on ${topDevice[0]}.`);

  // Per-show observations (richer context)
  const perShow = topShows.slice(0, MAX_TITLES).map(([show, s]) =>
    `You watched "${show}" on Netflix — ${s.count} session${s.count === 1 ? '' : 's'}, ~${Math.round(s.totalSec / 3600)}h total${s.latest ? `, most recently ${s.latest.split(' ')[0]}` : ''}.`
  );

  return [...rollups, ...perShow];
}

// ---------------------------------------------------------------------------
// TikTok — data export JSON (user_data.json)
// ---------------------------------------------------------------------------
// Users request "Download your data" at tiktok.com/setting -> Privacy ->
// Personalization and data. They can pick JSON (recommended) or TXT format.
// The ZIP contains a single `user_data.json` with nested "Activity" sections
// (VideoBrowsingHistory, VideoFavoriteList, FavoriteSounds, Like, Follower,
// Following, SearchHistory, ShareHistory, etc.).

function extractTikTokJson(buffer) {
  if (buffer[0] === 0x50 && buffer[1] === 0x4B) {
    try {
      const zip = new AdmZip(buffer);
      const entry = zip.getEntries().find(e => /user_data\.json$/i.test(e.entryName))
        || zip.getEntries().find(e => /\.json$/i.test(e.entryName) && !e.isDirectory);
      if (entry) return entry.getData().toString('utf8');
      throw new Error('TikTok ZIP missing user_data.json');
    } catch (e) {
      throw new Error(`TikTok ZIP extract failed: ${e.message}`);
    }
  }
  return buffer.toString('utf8');
}

function parseTikTok(buffer) {
  const raw = extractTikTokJson(buffer);
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('Invalid TikTok JSON — expected user_data.json from TikTok data export');
  }

  // The JSON shape is deeply nested under "Activity"; find it.
  const activity = data?.Activity
    || data?.['App Settings']?.Activity
    || data?.activity
    || {};
  const profile = data?.Profile?.['Profile Information']?.ProfileMap
    || data?.Profile
    || {};

  const MAX_PER_SECTION = 250;
  const rollups = [];
  const observations = [];

  // --- Watch history ---
  const watchHistory = activity?.['Video Browsing History']?.VideoList
    || activity?.video_browsing_history
    || [];
  if (Array.isArray(watchHistory) && watchHistory.length > 0) {
    rollups.push(`Your TikTok watch history contains ${watchHistory.length} videos.`);
    const recent = watchHistory.slice(0, MAX_PER_SECTION);
    for (const item of recent) {
      const date = item?.Date || item?.date;
      const link = item?.Link || item?.VideoLink || item?.link;
      if (link) {
        observations.push(`You watched a TikTok${date ? ` on ${date}` : ''}: ${link}`);
      }
    }
  }

  // --- Likes ---
  const likes = activity?.['Like List']?.ItemFavoriteList
    || activity?.like_list
    || [];
  if (Array.isArray(likes) && likes.length > 0) {
    rollups.push(`You've liked ${likes.length} TikTok videos.`);
    for (const item of likes.slice(0, MAX_PER_SECTION)) {
      const date = item?.Date || item?.date;
      const link = item?.Link || item?.link;
      if (link) observations.push(`You liked a TikTok${date ? ` on ${date}` : ''}: ${link}`);
    }
  }

  // --- Favorite videos ---
  const favorites = activity?.['Favorite Videos']?.FavoriteVideoList
    || activity?.favorite_video_list
    || [];
  if (Array.isArray(favorites) && favorites.length > 0) {
    rollups.push(`You have ${favorites.length} TikTok videos saved as favorites.`);
  }

  // --- Search history ---
  const searches = activity?.['Search History']?.SearchList
    || activity?.search_history
    || [];
  if (Array.isArray(searches) && searches.length > 0) {
    rollups.push(`Your TikTok search history contains ${searches.length} queries.`);
    const terms = searches.slice(0, 40).map(s => `"${s?.SearchTerm || s?.search_term || ''}"`).filter(t => t !== '""');
    if (terms.length > 0) rollups.push(`Recent TikTok searches include: ${terms.slice(0, 20).join(', ')}.`);
  }

  // --- Following ---
  const following = activity?.['Following List']?.Following
    || activity?.following
    || [];
  if (Array.isArray(following) && following.length > 0) {
    rollups.push(`You follow ${following.length} accounts on TikTok.`);
    const topAccounts = following.slice(0, 25).map(f => f?.UserName || f?.user_name || '').filter(Boolean);
    if (topAccounts.length > 0) rollups.push(`Accounts you follow on TikTok include: ${topAccounts.slice(0, 20).join(', ')}.`);
  }

  // --- Shares ---
  const shares = activity?.['Share History']?.ShareHistoryList
    || activity?.share_history
    || [];
  if (Array.isArray(shares) && shares.length > 0) {
    rollups.push(`You've shared ${shares.length} TikToks.`);
  }

  // --- Profile info ---
  const username = profile?.userName || profile?.['User Name'] || null;
  const bio = profile?.profileBio || profile?.bioDescription || null;
  if (username) rollups.push(`Your TikTok username is @${username}.`);
  if (bio) rollups.push(`Your TikTok bio reads: "${bio}"`);

  if (rollups.length === 0 && observations.length === 0) {
    throw new Error('TikTok export appears empty or has an unrecognised structure');
  }

  return [...rollups, ...observations];
}

// ---------------------------------------------------------------------------
// X (Twitter) — archive ZIP
// ---------------------------------------------------------------------------
// Users download their archive from x.com/settings/your_account/download_an_archive.
// The ZIP contains JS files like tweets.js, like.js, following.js (each a
// window.YTD.* = [...] assignment) plus HTML viewer. We care about tweets,
// likes, and following list.

function readXArchiveEntry(zip, name) {
  const entry = zip.getEntries().find(e => new RegExp(`${name}\\.js$`, 'i').test(e.entryName));
  if (!entry) return null;
  const content = entry.getData().toString('utf8');
  // Strip leading "window.YTD.tweets.part0 = " to leave raw JSON array
  const eq = content.indexOf('=');
  if (eq === -1) return null;
  try {
    return JSON.parse(content.slice(eq + 1).trim().replace(/;$/, ''));
  } catch {
    return null;
  }
}

function parseXArchive(buffer) {
  if (!(buffer[0] === 0x50 && buffer[1] === 0x4B)) {
    throw new Error('X archive must be a ZIP (download from x.com/settings/your_account/download_an_archive)');
  }

  let zip;
  try { zip = new AdmZip(buffer); } catch (e) {
    throw new Error(`X archive extract failed: ${e.message}`);
  }

  const rollups = [];
  const observations = [];
  const MAX_PER_SECTION = 300;

  // ----- Tweets -----
  const tweets = readXArchiveEntry(zip, 'tweets') || readXArchiveEntry(zip, 'tweet');
  if (Array.isArray(tweets) && tweets.length > 0) {
    rollups.push(`Your X archive contains ${tweets.length} tweets.`);

    // Compute reply/retweet/original ratios
    let replies = 0, retweets = 0, originals = 0;
    const perTweet = [];
    const sorted = [...tweets].sort((a, b) => {
      const ta = new Date(a?.tweet?.created_at || a?.created_at || 0).getTime();
      const tb = new Date(b?.tweet?.created_at || b?.created_at || 0).getTime();
      return tb - ta;
    });

    for (const entry of sorted) {
      const t = entry?.tweet || entry;
      const text = (t?.full_text || t?.text || '').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const isReply = !!t?.in_reply_to_status_id || text.startsWith('@');
      const isRetweet = text.startsWith('RT @');
      if (isRetweet) retweets++;
      else if (isReply) replies++;
      else originals++;

      if (perTweet.length < MAX_PER_SECTION && !isRetweet) {
        const date = t?.created_at?.slice(0, 10) || '';
        perTweet.push(`You tweeted${date ? ` on ${date}` : ''}: "${text.slice(0, 280)}"`);
      }
    }

    if (originals + replies + retweets > 0) {
      const total = originals + replies + retweets;
      rollups.push(`Of those tweets: ${Math.round(originals / total * 100)}% originals, ${Math.round(replies / total * 100)}% replies, ${Math.round(retweets / total * 100)}% retweets.`);
    }
    observations.push(...perTweet);
  }

  // ----- Likes -----
  const likes = readXArchiveEntry(zip, 'like') || readXArchiveEntry(zip, 'likes');
  if (Array.isArray(likes) && likes.length > 0) {
    rollups.push(`Your X archive shows ${likes.length} liked tweets.`);
    const sampleLikes = likes.slice(0, 50).map(l => (l?.like?.fullText || l?.fullText || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    for (const text of sampleLikes.slice(0, 50)) {
      observations.push(`You liked a tweet on X: "${text.slice(0, 280)}"`);
    }
  }

  // ----- Following -----
  const following = readXArchiveEntry(zip, 'following') || readXArchiveEntry(zip, 'following-list');
  if (Array.isArray(following) && following.length > 0) {
    rollups.push(`You follow ${following.length} accounts on X.`);
  }

  // ----- Profile -----
  const profile = readXArchiveEntry(zip, 'profile');
  if (Array.isArray(profile) && profile[0]) {
    const p = profile[0]?.profile || profile[0];
    const bio = p?.description?.bio || p?.bio;
    const loc = p?.description?.location || p?.location;
    if (bio) rollups.push(`Your X bio reads: "${bio}"`);
    if (loc) rollups.push(`Your X profile location is: ${loc}.`);
  }

  if (rollups.length === 0 && observations.length === 0) {
    throw new Error('X archive appears empty or has an unrecognised structure');
  }

  return [...rollups, ...observations];
}

// ---------------------------------------------------------------------------
// Apple Music — GDPR data export CSV
// ---------------------------------------------------------------------------
// Users request their data from privacy.apple.com. The ZIP contains several
// CSVs under "Apple Media Services information/Apple Music Activity/":
//   - Apple Music - Play History Daily Tracks.csv
//   - Apple Music - Recently Played Tracks.csv
//   - Apple Music Likes and Dislikes.csv
//   - Apple Music Library Activity.csv
//   - Apple Music Library Tracks.csv
// We prefer "Play History Daily Tracks" because it has the richest temporal
// detail (song + album + date played + play count).

function extractAppleMusicCsv(buffer) {
  if (buffer[0] === 0x50 && buffer[1] === 0x4B) {
    try {
      const zip = new AdmZip(buffer);
      const preferred = [
        /Play History Daily Tracks\.csv$/i,
        /Recently Played Tracks\.csv$/i,
        /Library Tracks\.csv$/i,
      ];
      for (const re of preferred) {
        const entry = zip.getEntries().find(e => re.test(e.entryName));
        if (entry) return { csv: entry.getData().toString('utf8'), name: entry.entryName };
      }
      // Fallback: any Apple Music CSV inside the ZIP
      const any = zip.getEntries().find(e => /Apple Music.*\.csv$/i.test(e.entryName));
      if (any) return { csv: any.getData().toString('utf8'), name: any.entryName };
      throw new Error('Apple Music ZIP missing a recognised Play History / Recently Played / Library Tracks CSV');
    } catch (e) {
      throw new Error(`Apple Music ZIP extract failed: ${e.message}`);
    }
  }
  return { csv: buffer.toString('utf8'), name: 'apple_music.csv' };
}

function parseAppleMusic(buffer) {
  const { csv, name } = extractAppleMusicCsv(buffer);
  const rows = csvToObjects(csv);
  if (rows.length === 0) throw new Error('Apple Music CSV has no rows');

  const MAX_OBS = 400;
  const songStats = {};
  const artistStats = {};
  const albumStats = {};
  const hourBuckets = new Array(24).fill(0);
  let totalPlays = 0;

  const hdrs = Object.keys(rows[0]).reduce((acc, h) => { acc[h.toLowerCase()] = h; return acc; }, {});
  const colSong = hdrs['song name'] || hdrs['track description'] || hdrs['title'] || 'Song Name';
  const colArtist = hdrs['artist name'] || hdrs['artist'] || 'Artist Name';
  const colAlbum = hdrs['album name'] || hdrs['album'] || 'Album Name';
  const colPlayDate = hdrs['date played'] || hdrs['last played date'] || hdrs['play date'] || hdrs['event date time'] || 'Date Played';
  const colPlayCount = hdrs['play count'] || hdrs['total plays'] || null;

  for (const r of rows) {
    const song = (r[colSong] || '').trim();
    if (!song) continue;
    const artist = (r[colArtist] || '').trim();
    const album = (r[colAlbum] || '').trim();
    const date = (r[colPlayDate] || '').trim();
    const pc = colPlayCount ? parseInt(r[colPlayCount] || '1', 10) || 1 : 1;

    const key = `${song} — ${artist}`;
    songStats[key] = (songStats[key] || 0) + pc;
    if (artist) artistStats[artist] = (artistStats[artist] || 0) + pc;
    if (album) albumStats[album] = (albumStats[album] || 0) + pc;
    totalPlays += pc;

    if (date) {
      const d = new Date(date);
      if (!Number.isNaN(d.getTime())) hourBuckets[d.getHours()] += pc;
    }
  }

  const rollups = [];
  rollups.push(`Your Apple Music export (${name.split('/').pop()}) has ${totalPlays.toLocaleString('en-US')} plays across ${Object.keys(songStats).length} distinct tracks, ${Object.keys(artistStats).length} artists, and ${Object.keys(albumStats).length} albums.`);

  const topArtists = Object.entries(artistStats).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (topArtists.length > 0) {
    rollups.push(`Your top Apple Music artists by plays: ${topArtists.map(([a, p]) => `${a} (${p})`).join(', ')}.`);
  }

  const topAlbums = Object.entries(albumStats).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (topAlbums.length > 0) {
    rollups.push(`Your most-played Apple Music albums: ${topAlbums.map(([a, p]) => `${a} (${p})`).join('; ')}.`);
  }

  const peakHour = hourBuckets.reduce((max, v, i) => v > max.v ? { v, i } : max, { v: 0, i: 0 });
  if (peakHour.v > 0) {
    const fmtHour = h => h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`;
    rollups.push(`Your Apple Music peak listening hour is ${fmtHour(peakHour.i)}.`);
  }

  // Per-song observations (top N by plays)
  const topSongs = Object.entries(songStats).sort((a, b) => b[1] - a[1]).slice(0, MAX_OBS);
  const perSong = topSongs.map(([key, plays]) =>
    `You've played "${key}" on Apple Music ${plays} time${plays === 1 ? '' : 's'}.`
  );

  return [...rollups, ...perSong];
}

// ---------------------------------------------------------------------------
// SoundCloud — GDPR data export ZIP
// ---------------------------------------------------------------------------
// SoundCloud has a CSV/XML-based export that includes your own tracks,
// liked tracks, followings, playlists, comments. We parse the key CSVs:
//   - likes.csv   (tracks you've liked)
//   - followings.csv (users you follow)
//   - playlists.csv (playlists you created)
//   - your_tracks.csv (tracks you uploaded)
// Fields and filenames are inconsistent across export vintages — we fuzzy-match.

function parseSoundCloud(buffer) {
  if (!(buffer[0] === 0x50 && buffer[1] === 0x4B)) {
    throw new Error('SoundCloud export must be a ZIP (request at soundcloud.com/settings/account then download)');
  }

  let zip;
  try { zip = new AdmZip(buffer); } catch (e) {
    throw new Error(`SoundCloud ZIP extract failed: ${e.message}`);
  }

  const findCsv = (re) => {
    const entry = zip.getEntries().find(e => re.test(e.entryName) && !e.isDirectory);
    if (!entry) return null;
    return csvToObjects(entry.getData().toString('utf8'));
  };

  const likes = findCsv(/likes?\.csv$/i) || findCsv(/favourites\.csv$/i);
  const followings = findCsv(/followings?\.csv$/i);
  const playlists = findCsv(/playlists?\.csv$/i);
  const yourTracks = findCsv(/your[-_ ]tracks?\.csv$/i) || findCsv(/tracks?\.csv$/i);
  const comments = findCsv(/comments?\.csv$/i);

  const rollups = [];
  const observations = [];
  const MAX_OBS = 250;

  // --- Likes ---
  if (likes && likes.length > 0) {
    rollups.push(`You've liked ${likes.length} tracks on SoundCloud.`);
    const artistCounts = {};
    for (const r of likes) {
      const a = (r['Artist'] || r['User'] || r['Creator'] || '').trim();
      if (a) artistCounts[a] = (artistCounts[a] || 0) + 1;
    }
    const topArtists = Object.entries(artistCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (topArtists.length > 0) {
      rollups.push(`Top artists you liked on SoundCloud: ${topArtists.map(([a, c]) => `${a} (${c})`).join(', ')}.`);
    }
    for (const r of likes.slice(0, MAX_OBS)) {
      const title = (r['Title'] || r['Track'] || '').trim();
      const artist = (r['Artist'] || r['User'] || r['Creator'] || '').trim();
      const date = (r['Date'] || r['Created At'] || r['Liked At'] || '').trim();
      if (!title) continue;
      const parts = [`You liked "${title}"`];
      if (artist) parts.push(`by ${artist}`);
      parts.push('on SoundCloud');
      if (date) parts.push(`(${date})`);
      observations.push(parts.join(' ') + '.');
    }
  }

  // --- Followings ---
  if (followings && followings.length > 0) {
    rollups.push(`You follow ${followings.length} accounts on SoundCloud.`);
    const names = followings.slice(0, 25).map(r => (r['Name'] || r['User'] || r['Username'] || '').trim()).filter(Boolean);
    if (names.length > 0) rollups.push(`Accounts you follow on SoundCloud include: ${names.slice(0, 20).join(', ')}.`);
  }

  // --- Playlists ---
  if (playlists && playlists.length > 0) {
    rollups.push(`You have ${playlists.length} playlists on SoundCloud.`);
    const titles = playlists.slice(0, 15).map(r => (r['Title'] || r['Name'] || '').trim()).filter(Boolean);
    if (titles.length > 0) rollups.push(`Your SoundCloud playlist names: ${titles.slice(0, 12).map(t => `"${t}"`).join(', ')}.`);
  }

  // --- Uploads ---
  if (yourTracks && yourTracks.length > 0) {
    rollups.push(`You've uploaded ${yourTracks.length} tracks to SoundCloud.`);
  }

  // --- Comments ---
  if (comments && comments.length > 0) {
    rollups.push(`You've made ${comments.length} comments on SoundCloud.`);
    for (const r of comments.slice(0, 20)) {
      const txt = (r['Comment'] || r['Body'] || r['Text'] || '').trim();
      if (txt && txt.length > 4) observations.push(`On SoundCloud you commented: "${txt.slice(0, 280)}"`);
    }
  }

  if (rollups.length === 0 && observations.length === 0) {
    throw new Error('SoundCloud export appears empty or has an unrecognised structure');
  }

  return [...rollups, ...observations];
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Parse a GDPR data export and ingest into the memory stream.
 *
 * @param {string}  userId     - The user's UUID (public.users.id)
 * @param {string}  platform   - 'spotify' | 'youtube' | 'discord' | 'reddit' | 'android_usage' |
 *                               'google_search' | 'whatsapp' | 'apple_health' |
 *                               'health_connect' | 'sms_patterns' | 'letterboxd' | 'goodreads' |
 *                               'netflix' | 'tiktok' | 'x_archive'
 * @param {Buffer}  fileBuffer - Raw file bytes
 * @param {string}  fileName   - Original file name (for logging / import record)
 * @returns {{ importId, observationsCreated, factsCreated, error? }}
 */
export async function processGdprImport(userId, platform, fileBuffer, fileName) {
  if (!userId) throw new Error('userId required');
  if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) throw new Error('fileBuffer must be a Buffer');

  const importId = await createImportRecord(userId, platform, fileName, fileBuffer.length);
  let observations = [];
  let observationsCreated = 0;
  const factsCreated = 0;

  try {
    log.info(`Processing ${platform} export for user ${userId} (${fileBuffer.length} bytes)`);

    switch (platform) {
      case 'spotify':
        observations = parseSpotify(fileBuffer);
        break;
      case 'youtube':
        observations = parseYouTube(fileBuffer);
        break;
      case 'discord':
        observations = parseDiscord(fileBuffer);
        break;
      case 'reddit':
        observations = parseReddit(fileBuffer);
        break;
      case 'android_usage':
        observations = parseAndroidUsage(fileBuffer);
        break;
      case 'google_search':
        observations = parseGoogleSearch(fileBuffer);
        break;
      case 'whatsapp':
        observations = parseWhatsApp(fileBuffer);
        break;
      case 'whoop':
        observations = parseWhoop(fileBuffer);
        break;
      case 'apple_health':
        observations = parseAppleHealth(fileBuffer);
        break;
      case 'health_connect':
        observations = parseHealthConnect(fileBuffer);
        break;
      case 'android_health':
        observations = parseAndroidHealthConnect(fileBuffer);
        break;
      case 'sms_patterns':
        observations = parseSmsPatterns(fileBuffer);
        break;
      case 'letterboxd':
        observations = parseLetterboxd(fileBuffer);
        break;
      case 'goodreads':
        observations = parseGoodreads(fileBuffer);
        break;
      case 'netflix':
        observations = parseNetflix(fileBuffer);
        break;
      case 'tiktok':
        observations = parseTikTok(fileBuffer);
        break;
      case 'x_archive':
        observations = parseXArchive(fileBuffer);
        break;
      case 'apple_music':
        observations = parseAppleMusic(fileBuffer);
        break;
      case 'soundcloud':
        observations = parseSoundCloud(fileBuffer);
        break;
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }

    log.info(`Parsed ${observations.length} observations from ${platform}`);

    const existingHashes = await loadExistingHashes(userId, platform);
    const result = await writeObservations(userId, platform, observations, importId, existingHashes);
    observationsCreated = result.created;

    log.info(`Wrote ${observationsCreated} new observations (${result.skipped} duplicates skipped)`);

    await finalizeImportRecord(importId, 'completed', observationsCreated, factsCreated);

    // Trigger reflection if meaningful data was imported (same threshold as post-onboarding)
    if (observationsCreated > 20) {
      const shouldReflect = await shouldTriggerReflection(userId);
      if (shouldReflect) {
        log.info(`Triggering reflection for user ${userId}`);
        generateReflections(userId).catch((err) =>
          log.error('Reflection error:', err.message)
        );
      }
    }

    return { importId, observationsCreated, factsCreated };

  } catch (err) {
    log.error(`Error processing ${platform} for user ${userId}:`, err.message);
    await finalizeImportRecord(importId, 'error', observationsCreated, factsCreated, err.message);
    return { importId, observationsCreated, factsCreated, error: err.message };
  }
}

/**
 * List import history for a user.
 */
export async function listUserImports(userId) {
  if (!userId) throw new Error('userId required');
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('user_data_imports')
    .select('id, platform, status, observations_created, facts_created, file_name, file_size_bytes, created_at, completed_at, error_message')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return data || [];
}
