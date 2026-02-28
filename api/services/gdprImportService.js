/**
 * GDPR Import Service
 * ===================
 * Parses platform GDPR/data-export archives and ingests them into the memory stream.
 *
 * Supported platforms:
 *   - Spotify  : StreamingHistory*.json
 *   - YouTube  : watch-history.json  (Google Takeout)
 *   - Discord  : messages/ * /messages.json  (inside a ZIP)
 *   - Reddit   : reddit-data-*.json  (nested JSON export)
 *
 * Pipeline:
 *   fileBuffer -> platformParser -> observations[] -> dedup -> addPlatformObservation
 *   -> update user_data_imports row -> optionally trigger reflection
 */

import crypto from 'crypto';
import AdmZip from 'adm-zip';
import { addPlatformObservation } from './memoryStreamService.js';
import { shouldTriggerReflection, generateReflections } from './reflectionEngine.js';

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
        console.error(`[GdprImport] Failed to write observation: ${err.message}`);
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
// Main export
// ---------------------------------------------------------------------------

/**
 * Parse a GDPR data export and ingest into the memory stream.
 *
 * @param {string}  userId     - The user's UUID (public.users.id)
 * @param {string}  platform   - 'spotify' | 'youtube' | 'discord' | 'reddit'
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
    console.log(`[GdprImport] Processing ${platform} export for user ${userId} (${fileBuffer.length} bytes)`);

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
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }

    console.log(`[GdprImport] Parsed ${observations.length} observations from ${platform}`);

    const existingHashes = await loadExistingHashes(userId, platform);
    const result = await writeObservations(userId, platform, observations, importId, existingHashes);
    observationsCreated = result.created;

    console.log(`[GdprImport] Wrote ${observationsCreated} new observations (${result.skipped} duplicates skipped)`);

    await finalizeImportRecord(importId, 'completed', observationsCreated, factsCreated);

    // Trigger reflection if meaningful data was imported (same threshold as post-onboarding)
    if (observationsCreated > 20) {
      const shouldReflect = await shouldTriggerReflection(userId);
      if (shouldReflect) {
        console.log(`[GdprImport] Triggering reflection for user ${userId}`);
        generateReflections(userId).catch((err) =>
          console.error('[GdprImport] Reflection error:', err.message)
        );
      }
    }

    return { importId, observationsCreated, factsCreated };

  } catch (err) {
    console.error(`[GdprImport] Error processing ${platform} for user ${userId}:`, err.message);
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
