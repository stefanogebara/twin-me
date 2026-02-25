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
// Spotify parser
// ---------------------------------------------------------------------------

function parseSpotify(buffer) {
  let raw;
  try {
    raw = JSON.parse(buffer.toString('utf8'));
  } catch {
    throw new Error('Invalid Spotify JSON — expected StreamingHistory*.json');
  }

  if (!Array.isArray(raw)) {
    throw new Error('Spotify file must be a JSON array');
  }

  const MIN_MS = 30_000; // skip tracks played < 30 s (skips)
  const playsByArtist = {};   // artist -> { count, msTotal }
  const hourBuckets = new Array(24).fill(0);

  // Individual play observations (sample up to 500 most recent)
  const individualObs = [];
  const sorted = raw.filter(e => e.msPlayed >= MIN_MS).slice(-500);

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

    // Aggregate
    if (!playsByArtist[artist]) playsByArtist[artist] = { count: 0, msTotal: 0 };
    playsByArtist[artist].count++;
    playsByArtist[artist].msTotal += (entry.msPlayed || 0);

    if (when) hourBuckets[when.getHours()]++;
  }

  const allValid = raw.filter(e => e.msPlayed >= MIN_MS);
  const totalPlays = allValid.length;

  // Top artist observations
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

  // Time-of-day pattern
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

  // Support both field name conventions from mobile app
  const apps = Array.isArray(data.appUsage) ? data.appUsage
    : Array.isArray(data.apps) ? data.apps : [];
  const notifications = Array.isArray(data.notificationPatterns) ? data.notificationPatterns
    : Array.isArray(data.notifications) ? data.notifications : [];
  const observations = [];

  // Aggregate app usage across all entries
  const appTotals = {};
  for (const entry of apps) {
    const key = entry.appName || entry.packageName || 'Unknown';
    appTotals[key] = (appTotals[key] || 0) + (entry.totalTimeMs || 0);
  }

  const topApps = Object.entries(appTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // Screen-on time from dedicated field (more accurate than sum of app times)
  const screenOnMs = typeof data.screenOnTimeMs === 'number' ? data.screenOnTimeMs : 0;
  if (screenOnMs > 0) {
    const screenHours = (screenOnMs / 3_600_000).toFixed(1);
    observations.push(`Android screen-on time in last 24h: ${screenHours} hours`);
  }

  if (topApps.length > 0) {
    const topAppNames = topApps.slice(0, 5).map(([name]) => name).join(', ');
    observations.push(`Most-used apps on Android: ${topAppNames}`);

    // Per-app observations for top 3 (gives twin concrete data points)
    for (const [appName, timeMs] of topApps.slice(0, 3)) {
      const mins = Math.round(Number(timeMs) / 60_000);
      if (mins >= 5) {
        observations.push(`Used ${appName} for ${mins >= 60 ? `${(mins / 60).toFixed(1)}h` : `${mins}min`} on Android`);
      }
    }
  }

  // Category hints from package names
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

  // Notification patterns
  const notifTotals = {};
  for (const entry of notifications) {
    const key = entry.appName || entry.packageName || 'Unknown';
    notifTotals[key] = (notifTotals[key] || 0) + (entry.count || 0);
  }
  const topNotifApps = Object.entries(notifTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  if (topNotifApps.length > 0) {
    const names = topNotifApps.map(([name]) => name).join(', ');
    observations.push(`Most notifications on Android from: ${names}`);
  }

  return observations;
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
