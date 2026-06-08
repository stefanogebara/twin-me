/**
 * Browser Extension Data Capture Routes
 *
 * Receives data captured by browser extension from platforms:
 * - YouTube: watch history, search queries, recommendations
 * - Twitch: stream watches, browse history, chat engagement
 * - Netflix: viewing history, genres, watch time
 *
 * Stores in user_platform_data table with extension-specific data_type values.
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../config/supabase.js';
import { ingestWebObservations } from '../services/observationIngestion.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('ExtensionData');

const router = express.Router();

const allowedPlatforms = ['netflix', 'youtube', 'twitch', 'reddit', 'amazon', 'hbo', 'disney', 'web', 'instagram', 'disneyplus', 'hbomax', 'hulu', 'primevideo'];

/**
 * Normalize event.timestamp into a valid ISO 8601 string.
 *
 * audit-2026-05-28: collectors send timestamps in MIXED shapes —
 *   background.js / soul-observer.js sometimes use Date.now() (epoch ms, number)
 *   instagram.js / most others use new Date().toISOString() (string)
 * The route handler was previously inserting whatever shape arrived directly
 * into the user_platform_data.extracted_at column. Postgres parses a raw
 * number as "years BC" via the timestamp-without-time-zone type, yields
 * error 22007 (invalid_datetime_format) → every batch from the affected
 * collectors got rejected with 500.
 *
 * This normalizer accepts string | number | Date | undefined and always
 * returns a valid ISO string OR the current time as a safe fallback.
 * Defensive, server-side — no client changes needed.
 */
/** Best-effort top-level key list for diagnostic logging (never throws). */
function safeKeys(obj) {
  try {
    return obj && typeof obj === 'object' ? Object.keys(obj).slice(0, 15) : typeof obj;
  } catch {
    return 'unknown';
  }
}

function normalizeExtractedAt(ts) {
  if (ts === null || ts === undefined) return new Date().toISOString();
  // epoch ms — branch on number first (typeof '0' === 'string' is true)
  if (typeof ts === 'number' && Number.isFinite(ts)) {
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }
  if (ts instanceof Date) {
    return Number.isNaN(ts.getTime()) ? new Date().toISOString() : ts.toISOString();
  }
  if (typeof ts === 'string') {
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }
  return new Date().toISOString();
}

/**
 * Map raw event types from extension to valid data_type CHECK constraint values
 */
function mapEventType(eventType, platform = '') {
  // Platform-specific mappings (search_query differs by platform)
  if (eventType === 'search_query') {
    return platform === 'web' ? 'extension_search_query' : 'extension_search';
  }

  const mapping = {
    // YouTube events
    'video_watch': 'extension_video_watch',
    'video_play': 'extension_video_watch',
    'video_pause': 'extension_video_watch',
    'video_complete': 'extension_video_watch',
    'recommendation_feed': 'extension_recommendation',
    'homepage_snapshot': 'extension_homepage',
    // Twitch events
    'stream_watch': 'extension_stream_watch',
    'category_browse': 'extension_browse',
    'chat_engagement': 'extension_chat',
    'clip_view': 'extension_clip_view',
    // Web browsing events
    // Streaming platform events (Disney+, HBO Max, Hulu, Prime Video)
    'watch': 'extension_video_watch',
    'watchlist_add': 'extension_video_watch',
    'continue_watching': 'extension_video_watch',
    'capture': 'extension_video_watch',
    // Instagram events
    'post_like': 'extension_page_visit',
    'story_view': 'extension_page_visit',
    'follow': 'extension_page_visit',
    // Discord live-collector events (3.10.0)
    'channel_visit': 'extension_page_visit',
    'channel_dwell': 'extension_page_visit',
    'message_sent': 'extension_chat',
    'server_sidebar': 'extension_page_visit',
    // LinkedIn live-collector events (3.10.0)
    'page_dwell': 'extension_page_visit',
    'profile_view': 'extension_page_visit',
    'reaction_click': 'extension_page_visit',
    'connect_click': 'extension_page_visit',
    'share_click': 'extension_page_visit',
    // Web browsing events
    'tab_visit': 'extension_page_visit',
    'page_visit': 'extension_page_visit',
    'article_read': 'extension_article_read',
    'web_video_watch': 'extension_web_video',
    // Soul observer engagement events
    'page_summary': 'extension_page_visit',
    'reading_completion': 'extension_article_read',
    'reading_analysis': 'extension_article_read',
    'page_load': 'extension_page_visit',
    // Tab pattern aggregation (15-min intervals)
    'tab_pattern': 'extension_page_visit',
    // History import (one-time bootstrap)
    'history_import': 'extension_page_visit',
    // On-demand page analysis
    'page_analysis': 'extension_page_visit',
    // Pass-throughs: already valid DB storage values
    'extension_page_visit': 'extension_page_visit',
    'extension_article_read': 'extension_article_read',
    'extension_web_video': 'extension_web_video',
    'extension_search_query': 'extension_search_query',
    'extension_search': 'extension_search',
    'extension_video_watch': 'extension_video_watch',
    'extension_recommendation': 'extension_recommendation',
    'extension_homepage': 'extension_homepage',
    'extension_stream_watch': 'extension_stream_watch',
    'extension_browse': 'extension_browse',
    'extension_chat': 'extension_chat',
    'extension_clip_view': 'extension_clip_view',
    // Screen context (active app tracking)
    'active_app': 'extension_page_visit',
    'app_switch': 'extension_page_visit',
    'screen_time': 'extension_page_visit',
    // Generic
    'capture': 'activity'
  };
  return mapping[eventType] || 'activity';
}

/**
 * POST /api/extension/capture/:platform
 * Receive individual capture event from extension
 */
router.post('/capture/:platform', authenticateUser, async (req, res) => {
  const { platform } = req.params;
  const userId = req.user.id;
  const capturedData = req.body;

  log.info(`Receiving ${platform} data for user ${userId}`);

  try {
    if (!allowedPlatforms.includes(platform.toLowerCase())) {
      return res.status(400).json({
        error: 'Invalid platform',
        message: `Platform must be one of: ${allowedPlatforms.join(', ')}`
      });
    }

    const dataType = mapEventType(capturedData.data_type || capturedData.eventType || 'capture', platform);

    const { data, error } = await supabaseAdmin
      .from('user_platform_data')
      .insert({
        user_id: userId,
        platform: platform.toLowerCase(),
        data_type: dataType,
        raw_data: capturedData,
        extracted_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      log.error(`Failed to store ${platform} data:`, error);
      throw error;
    }

    log.info(`Stored ${platform} data: ${data.id}`);

    res.json({
      success: true,
      id: data.id,
      platform,
      dataType,
      dataType: capturedData.data_type || capturedData.eventType || 'capture'
    });

  } catch (error) {
    log.error(`Error processing ${platform} data:`, error);
    res.status(500).json({
      error: 'Failed to store extension data',
      ...(process.env.NODE_ENV !== 'production' && { message: error.message })
    });
  }
});

/**
 * POST /api/extension/batch
 * Receive batch sync from extension (multiple events, possibly mixed platforms)
 */
router.post('/batch', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  const { platform, events } = req.body;

  log.info(`Receiving batch sync: ${events?.length || 0} events from ${platform || 'mixed'}`);

  try {
    if (!events || !Array.isArray(events)) {
      return res.status(400).json({
        error: 'Invalid batch data',
        message: 'Request must include events array'
      });
    }

    if (events.length === 0) {
      return res.json({
        success: true,
        inserted: 0,
        message: 'No events to sync'
      });
    }

    // Transform events for insertion.
    //
    // audit-2026-05-28: build records PER-EVENT with isolation. Previously a
    // single malformed event (non-string platform, non-serializable raw_data,
    // etc.) threw inside events.map() BEFORE the upsert ran — no row landed,
    // the supabase-error diagnostic never fired, and the whole batch 500'd
    // via the outer catch. The Instagram collector's collectedData was the
    // trigger. Now each event is mapped in its own try/catch; a bad event is
    // skipped + logged instead of nuking the batch.
    const skipped = [];
    const records = [];
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      try {
        // Coerce platform to a safe lowercase string. A non-string platform
        // (object/array from a buggy collector) would throw on .toLowerCase().
        const rawPlat = event?.platform ?? platform ?? 'unknown';
        const eventPlatform = String(rawPlat).toLowerCase();

        // user_platform_data has UNIQUE (user_id, platform, data_type,
        // source_url) NULLS NOT DISTINCT. Null source_url collapses all events
        // for one (user, platform, data_type) into one row → 23505 without
        // upsert. Pull a URL from wherever the collectors stash it.
        let sourceUrl =
          event?.url ||
          event?.source_url ||
          event?.raw_data?.url ||
          event?.raw_data?.source_url ||
          event?.data?.url ||
          event?.data?.source_url ||
          null;

        // OCCURRENCE EVENTS (each one a distinct moment) must NOT upsert-
        // collapse onto each other. Without this, two reaction_clicks on
        // the same LinkedIn feed page would collide on (user_id, platform,
        // 'extension_page_visit', 'https://www.linkedin.com/feed/') and
        // only the last one would survive. Same for message_sent on the
        // same Discord channel.
        //
        // Fix: append the event's own timestamp as a URL fragment so each
        // occurrence has a unique conflict key while preserving the human-
        // readable URL prefix. Hash fragments don't affect routing or
        // any downstream URL processing.
        const innerType = event?.raw_data?.type ?? event?.data?.type ?? event?.eventType ?? null;
        const OCCURRENCE_TYPES = new Set([
          'message_sent',
          'reaction_click',
          'connect_click',
          'share_click',
          'profile_view',
          'channel_visit',
          'channel_dwell',
          'page_dwell',
          'search_query',
        ]);
        if (innerType && OCCURRENCE_TYPES.has(innerType)) {
          // Apply even when sourceUrl is null — without it, all occurrence
          // events for this user/platform/data_type collapse to one row
          // under NULLS NOT DISTINCT. Synthesize a synthetic-prefix URL
          // so each occurrence gets its own slot.
          const ts = event?.timestamp || event?.raw_data?.timestamp || new Date().toISOString();
          const base = sourceUrl || `extension://event/${eventPlatform}`;
          sourceUrl = `${base}#t=${ts}&e=${innerType}`;
        }

        // raw_data must be JSON-serializable. DOM-scraped collector payloads
        // can carry circular refs / non-plain values that throw when the
        // supabase client stringifies the request body. Round-trip-guard it.
        let rawData = event?.raw_data || event;
        try {
          JSON.stringify(rawData);
        } catch {
          rawData = { _unserializable: true, platform: eventPlatform, keys: safeKeys(event) };
          log.warn('Extension event raw_data unserializable — replaced with stub', {
            eventIndex: i, platform: eventPlatform,
          });
        }

        records.push({
          user_id: userId,
          platform: eventPlatform,
          data_type: mapEventType(event?.data_type || event?.eventType || 'capture', eventPlatform),
          raw_data: rawData,
          source_url: sourceUrl,
          // normalize: some collectors send Date.now() (number) which Postgres
          // rejects as 22007 invalid_datetime_format on a timestamp column.
          extracted_at: normalizeExtractedAt(event?.timestamp),
        });
      } catch (mapErr) {
        skipped.push({ index: i, error: mapErr.message, keys: safeKeys(event) });
      }
    }

    if (skipped.length > 0) {
      log.warn('Skipped malformed extension events during record build', {
        skippedCount: skipped.length,
        totalEvents: events.length,
        samples: skipped.slice(0, 5),
      });
    }

    if (records.length === 0) {
      // Every event was malformed — nothing to insert. Return 200 (the batch
      // was received and processed) so the extension doesn't retry forever.
      return res.json({
        success: true,
        inserted: 0,
        skipped: skipped.length,
        message: 'No valid events after sanitization',
      });
    }

    // audit-2026-05-28: collapse duplicate-key records WITHIN the batch before
    // upserting. A single INSERT ... ON CONFLICT DO UPDATE cannot touch the same
    // target row twice — Postgres throws 21000 cardinality_violation ("ON CONFLICT
    // DO UPDATE command cannot affect row a second time"). The extension's MV3
    // alarm flushes the whole queue every ~5 min; a queue that revisited the same
    // URL (e.g. instagram.com/ several times) carries duplicate
    // (user_id, platform, data_type, source_url) tuples. That poisoned batch 500'd
    // on every retry and never cleared (the per-event loop above only guards record
    // BUILDING, not the upsert). Keep the LAST occurrence per key — identical to
    // what the ON CONFLICT UPDATE would have left, so no data is lost.
    // NULLS NOT DISTINCT: a null source_url shares one bucket per (user,platform,type).
    const dedupedByKey = new Map();
    for (const rec of records) {
      const key = `${rec.user_id}|${rec.platform}|${rec.data_type}|${rec.source_url ?? ''}`;
      dedupedByKey.set(key, rec); // later entries overwrite earlier → newest snapshot wins
    }
    const dedupedRecords = [...dedupedByKey.values()];
    if (dedupedRecords.length < records.length) {
      log.warn('Collapsed duplicate-key events within batch before upsert', {
        original: records.length,
        deduped: dedupedRecords.length,
        removed: records.length - dedupedRecords.length,
      });
    }

    // audit-2026-05-28: CHUNKED parallel upsert. History: insert()->upsert() killed
    // 23505 unique_violations; dedup (above) killed 21000 cardinality; a per-row
    // fallback stopped one bad row from sinking the batch. But an UNBOUNDED per-row
    // fallback over a large backlog (~1000 events) ran ~1000 sequential round-trips
    // and blew the 30s request timeout in server.js (504). So: upsert in small
    // chunks IN PARALLEL — dedup guarantees globally-unique conflict keys, so no two
    // chunks can collide. A chunk that fails the bulk upsert falls back to per-row
    // ONLY within that chunk (bounded ~150), logging the exact pgError, while every
    // other chunk still lands. Client gets a 2xx unless nothing lands at all.
    const CHUNK_SIZE = 150;
    const chunks = [];
    for (let i = 0; i < dedupedRecords.length; i += CHUNK_SIZE) {
      chunks.push(dedupedRecords.slice(i, i + CHUNK_SIZE));
    }

    const landed = [];
    const rowErrors = [];

    await Promise.all(chunks.map(async (chunk) => {
      const { data: chunkData, error: chunkErr } = await supabaseAdmin
        .from('user_platform_data')
        .upsert(chunk, {
          onConflict: 'user_id,platform,data_type,source_url',
          ignoreDuplicates: false,
        })
        .select('id');

      if (!chunkErr) {
        if (chunkData) landed.push(...chunkData);
        return;
      }

      // This chunk holds an un-storable row — isolate per-row within JUST this
      // chunk (bounded) so the bad row is logged with its exact code and the rest
      // of the chunk still lands. Other chunks already succeeded in parallel.
      log.warn('Chunk upsert failed — isolating per-row within chunk', {
        code: chunkErr.code,
        message: chunkErr.message,
        chunkSize: chunk.length,
      });
      for (const rec of chunk) {
        const { data: rowData, error: rowErr } = await supabaseAdmin
          .from('user_platform_data')
          .upsert(rec, {
            onConflict: 'user_id,platform,data_type,source_url',
            ignoreDuplicates: false,
          })
          .select('id');
        if (rowErr) {
          rowErrors.push({
            code: rowErr.code,
            message: (rowErr.message || '').slice(0, 150),
            data_type: rec.data_type,
            source_url: (rec.source_url || '').slice(0, 100),
          });
        } else if (rowData && rowData[0]) {
          landed.push(rowData[0]);
        }
      }
    }));

    if (rowErrors.length > 0) {
      // The real root-cause surface: the exact pgError for each failing row.
      log.error('Per-row upsert isolated failing rows', {
        failed: rowErrors.length,
        landed: landed.length,
        total: dedupedRecords.length,
        samples: rowErrors.slice(0, 10),
      });
    }

    // Nothing landed => systemic failure (DB down / auth / transient), not a few
    // poison rows. Throw so the client retries later instead of dropping the batch.
    if (landed.length === 0 && dedupedRecords.length > 0) {
      throw new Error('Extension batch: all chunks failed to upsert');
    }

    const data = landed;

    log.info(`Batch inserted ${data.length} events`);

    // B1: Route web tab visits → memory stream via ingestWebObservations (non-blocking)
    // This converts dwell-time events into NL observations stored in user_memories.
    const WEB_INGEST_TYPES = new Set([
      'tab_visit', 'page_visit', 'page_summary', 'page_load', 'history_import', 'page_analysis',
      'reading_completion', 'reading_analysis', 'search_query',
      'extension_page_visit', 'extension_article_read', 'extension_search_query', 'extension_web_video',
    ]);
    const webEvents = events.filter(e =>
      (e.platform === 'web' || platform === 'web') &&
      WEB_INGEST_TYPES.has(e.data_type || e.eventType || '')
    );
    if (webEvents.length > 0) {
      // Normalise event shape for ingestWebObservations (expects data_type + raw_data with flat fields)
      const normalised = webEvents.map(e => {
        // Extension sends {eventType, platform, data: {url, domain, timeOnPage, ...}}
        // ingestWebObservations expects {data_type, raw_data: {url, domain, duration_seconds, title, ...}}
        const inner = e.raw_data || e.data || e;
        const timeMs = inner.timeOnPage || inner.duration || 0;
        return {
          data_type: e.data_type || mapEventType(e.eventType || 'page_visit', 'web'),
          raw_data: {
            ...inner,
            duration_seconds: inner.duration_seconds || inner.durationSeconds || Math.round(timeMs / 1000),
            timestamp: e.timestamp || new Date().toISOString(),
          },
        };
      });
      ingestWebObservations(userId, normalised).catch(err =>
        log.warn('Web observation ingestion failed (non-fatal):', err.message)
      );
    }

    // B2: Route streaming/social platform data → memory stream (non-blocking)
    // Trimmed 2026-06-05: the disney+/hbo/hulu/prime collectors were double-broken
    // (isolated-world fetch + blob send-shape) with ~0 real volume and were removed
    // from the manifest. Netflix (MAIN-world interceptor) + Instagram remain.
    // Extended 2026-06-06 (extension v3.10.0): the new Discord + LinkedIn
    // collectors ship per-event payloads with title/url shaped the same way
    // Instagram does, so they ride the exact same memory-stream path.
    const STREAMING_PLATFORMS = new Set(['netflix', 'instagram', 'discord', 'linkedin']);
    const streamingEvents = events.filter(e => {
      const p = (e.platform || platform || '').toLowerCase();
      return STREAMING_PLATFORMS.has(p);
    });
    if (streamingEvents.length > 0) {
      const streamPlatform = (streamingEvents[0].platform || platform || 'streaming').toLowerCase();
      const isInteractionPlatform = streamPlatform === 'discord' || streamPlatform === 'linkedin';
      const observations = streamingEvents.map(e => {
        const inner = e.raw_data || e.data || e;
        const title = inner.title || inner.name || 'Unknown';
        const type = inner.type || 'content';
        if (isInteractionPlatform) {
          // Discord + LinkedIn collectors ship pre-phrased rich titles
          // ("Sent a message in Discord channel X", "Spent 12m scrolling
          // LinkedIn feed") — pass them through the generic page-visit
          // branch of ingestWebObservations so the observation reads
          // naturally instead of getting wrapped as "Watched ...".
          return {
            data_type: 'extension_page_visit',
            raw_data: {
              title,
              domain: streamPlatform === 'discord' ? 'discord.com' : 'linkedin.com',
              platform: streamPlatform,
              url: inner.url || '',
              timestamp: e.timestamp || new Date().toISOString(),
            },
          };
        }
        return {
          data_type: 'extension_video_watch',
          raw_data: {
            title,
            platform: streamPlatform,
            content_type: type,
            url: inner.url || '',
            timestamp: e.timestamp || new Date().toISOString(),
          },
        };
      });
      ingestWebObservations(userId, observations).catch(err =>
        log.warn(`${streamPlatform} observation ingestion failed (non-fatal):`, err.message)
      );

      // Surface extension-only platforms as "connected" so they appear in the
      // platforms UI. The extension has no OAuth, so without a platform_connections
      // row these feed the twin's memory but stay invisible as platforms. Only
      // Netflix is surfaced (pure extension capture; no fetch-cron fetcher exists,
      // so the row is display-only). Instagram keeps its own connection model
      // (instagram_sessions) and is intentionally not surfaced here.
      if (streamPlatform === 'netflix') {
        const nowIso = new Date().toISOString();
        supabaseAdmin
          .from('platform_connections')
          .upsert(
            {
              user_id: userId,
              platform: 'netflix',
              status: 'connected',
              last_sync_status: 'success',
              last_sync_at: nowIso,
              connected_at: nowIso,
              metadata: { source: 'browser_extension' },
            },
            { onConflict: 'user_id,platform' }
          )
          .then(({ error }) => {
            if (error) log.warn('Surface netflix connection failed (non-fatal):', error.message);
          });
      }
    }

    res.json({
      success: true,
      inserted: data.length,
      platform: platform || 'mixed',
      ids: data.map(d => d.id)
    });

  } catch (error) {
    // audit-2026-05-28: surface the exception class + message + stack so we can
    // see which code path threw. The supabase-insert path has its own structured
    // log; this outer catch fires for everything else (record-mapping throws,
    // post-success code paths, etc.). Without these fields we just see "Batch
    // sync error" in the Vercel UI and have to guess.
    log.error('Batch sync error', {
      name: error?.name,
      message: error?.message,
      code: error?.code,
      stack: error?.stack?.split('\n').slice(0, 4).join(' | '),
      eventCount: req.body?.events?.length || 0,
      firstEventKeys: req.body?.events?.[0]
        ? Object.keys(req.body.events[0]).slice(0, 12)
        : [],
      requestPlatform: req.body?.platform || null,
    });
    res.status(500).json({
      error: 'Batch sync failed',
      ...(process.env.NODE_ENV !== 'production' && { message: error.message })
    });
  }
});

/**
 * Quick browsing analysis for periodic triggers
 */
async function quickBrowsingAnalysis(userId) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: webData } = await supabaseAdmin
    .from('user_platform_data')
    .select('raw_data, data_type')
    .eq('user_id', userId)
    .eq('platform', 'web')
    .gte('extracted_at', sevenDaysAgo)
    .limit(300);

  if (!webData) return { topCategories: [], topTopics: [], topDomains: [], recentSearches: [], pageCount: 0, searchCount: 0 };

  const pageVisits = webData.filter(d => ['extension_page_visit', 'extension_article_read'].includes(d.data_type));
  const searchEvents = webData.filter(d => d.data_type === 'extension_search_query');

  const categoryCounts = {};
  const topicCounts = {};
  const domainCounts = {};
  pageVisits.forEach(d => {
    const cat = d.raw_data?.category || 'Other';
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    const domain = d.raw_data?.domain;
    if (domain) domainCounts[domain] = (domainCounts[domain] || 0) + 1;
    (d.raw_data?.metadata?.topics || []).forEach(t => {
      topicCounts[t] = (topicCounts[t] || 0) + 1;
    });
  });

  return {
    topCategories: Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c]) => c),
    topTopics: Object.entries(topicCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t]) => t),
    topDomains: Object.entries(domainCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([d]) => d),
    recentSearches: searchEvents.slice(0, 10).map(d => d.raw_data?.searchQuery).filter(Boolean),
    pageCount: pageVisits.length,
    searchCount: searchEvents.length
  };
}

/**
 * GET /api/extension/stats
 * Get statistics on extension-captured data
 */
router.get('/stats', authenticateUser, async (req, res) => {
  const userId = req.user.id;

  try {
    const { data, error } = await supabaseAdmin
      .from('user_platform_data')
      .select('platform, data_type, raw_data, extracted_at')
      .eq('user_id', userId)
      .like('data_type', 'extension_%')
      .order('extracted_at', { ascending: false })
      .limit(500);

    if (error) throw error;

    // Aggregate statistics
    const stats = {
      total: data.length,
      by_platform: {},
      by_event_type: {},
      recent_activity: []
    };

    data.forEach(record => {
      const plat = record.platform;
      if (!stats.by_platform[plat]) {
        stats.by_platform[plat] = { total: 0, by_type: {} };
      }
      stats.by_platform[plat].total++;

      const eventType = record.data_type;
      if (!stats.by_platform[plat].by_type[eventType]) {
        stats.by_platform[plat].by_type[eventType] = 0;
      }
      stats.by_platform[plat].by_type[eventType]++;

      if (!stats.by_event_type[eventType]) {
        stats.by_event_type[eventType] = 0;
      }
      stats.by_event_type[eventType]++;
    });

    // Recent activity (last 10)
    stats.recent_activity = data
      .sort((a, b) => new Date(b.extracted_at) - new Date(a.extracted_at))
      .slice(0, 10)
      .map(record => ({
        platform: record.platform,
        eventType: record.data_type,
        title: record.raw_data?.title || record.raw_data?.videoId || record.raw_data?.channelName || 'Unknown',
        timestamp: record.extracted_at
      }));

    res.json({ success: true, stats });

  } catch (error) {
    log.error(`Stats error:`, error);
    res.status(500).json({
      error: 'Failed to get stats',
      ...(process.env.NODE_ENV !== 'production' && { message: error.message })
    });
  }
});

/**
 * DELETE /api/extension/clear/:platform
 * Clear all extension data for a specific platform
 */
router.delete('/clear/:platform', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  const { platform } = req.params;

  try {
    const { data, error } = await supabaseAdmin
      .from('user_platform_data')
      .delete()
      .eq('user_id', userId)
      .eq('platform', platform)
      .like('data_type', 'extension_%')
      .select();

    if (error) throw error;

    log.info(`Cleared ${data.length} records for ${platform}`);

    res.json({
      success: true,
      deleted: data.length,
      platform
    });

  } catch (error) {
    log.error(`Clear error:`, error);
    res.status(500).json({
      error: 'Failed to clear data',
      ...(process.env.NODE_ENV !== 'production' && { message: error.message })
    });
  }
});

/**
 * POST /api/extension/analyze
 * Trigger browsing data analysis and push insights to Brain/Mem0/Soul Signature
 * Called manually or periodically after enough data accumulates
 */
router.post('/analyze', authenticateUser, async (req, res) => {
  const userId = req.user.id;

  log.info(`Triggering browsing analysis for user ${userId}`);

  try {
    // Get recent web browsing data
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: webData, error } = await supabaseAdmin
      .from('user_platform_data')
      .select('raw_data, data_type, extracted_at')
      .eq('user_id', userId)
      .eq('platform', 'web')
      .gte('extracted_at', sevenDaysAgo)
      .order('extracted_at', { ascending: false })
      .limit(300);

    if (error) throw error;

    if (!webData || webData.length === 0) {
      return res.json({ success: true, message: 'No browsing data to analyze' });
    }

    // Aggregate browsing patterns
    const pageVisits = webData.filter(d =>
      ['extension_page_visit', 'extension_article_read'].includes(d.data_type)
    );
    const searchEvents = webData.filter(d => d.data_type === 'extension_search_query');

    // Top categories
    const categoryCounts = {};
    pageVisits.forEach(d => {
      const cat = d.raw_data?.category || 'Other';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });
    const topCategories = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([category]) => category);

    // Top topics
    const topicCounts = {};
    pageVisits.forEach(d => {
      (d.raw_data?.metadata?.topics || []).forEach(t => {
        topicCounts[t] = (topicCounts[t] || 0) + 1;
      });
    });
    const topTopics = Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([topic]) => topic);

    // Top domains
    const domainCounts = {};
    pageVisits.forEach(d => {
      const domain = d.raw_data?.domain;
      if (domain) domainCounts[domain] = (domainCounts[domain] || 0) + 1;
    });
    const topDomains = Object.entries(domainCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([domain]) => domain);

    // Recent searches
    const recentSearches = searchEvents
      .slice(0, 10)
      .map(d => d.raw_data?.searchQuery)
      .filter(Boolean);

    // Push to integrations (fire-and-forget)
    pushBrowsingToIntegrations(userId, {
      topCategories,
      topTopics,
      topDomains,
      recentSearches,
      pageCount: pageVisits.length,
      searchCount: searchEvents.length
    }).catch(err => {
      log.warn('Integration push failed (non-blocking):', err.message);
    });

    res.json({
      success: true,
      analyzed: {
        pages: pageVisits.length,
        searches: searchEvents.length,
        categories: topCategories.length,
        topics: topTopics.length
      }
    });
  } catch (error) {
    log.error(`Analysis error:`, error);
    res.status(500).json({
      error: 'Analysis failed',
      ...(process.env.NODE_ENV !== 'production' && { message: error.message })
    });
  }
});

/**
 * Push browsing insights to Twins Brain, Mem0, and Soul Signature
 * Runs asynchronously after analysis
 */
async function pushBrowsingToIntegrations(userId, analysis) {
  log.info(`Pushing browsing insights to integrations for user ${userId}`);

  // 1. Push to Twins Brain - interest nodes from browsing categories and topics
  try {
    const { twinsBrainService } = await import('../services/twinsBrainService.js');

    // Create interest nodes from top browsing categories
    for (const category of analysis.topCategories.slice(0, 5)) {
      try {
        const existing = await twinsBrainService.findNodes(userId, {
          type: 'interest',
          search: category
        });

        if (existing?.nodes?.length > 0) {
          await twinsBrainService.reinforceNode(userId, existing.nodes[0].id, {
            source: 'browser_extension',
            reinforcement_type: 'browsing_pattern'
          });
        } else {
          await twinsBrainService.addNode(userId, {
            node_type: 'interest',
            category: 'personal',
            label: `Browses: ${category}`,
            description: `Frequently browses ${category} content`,
            confidence: 0.6,
            strength: 0.5,
            source_type: 'browser_extension',
            platform: 'web',
            tags: ['browsing', 'interest'],
            data: { source: 'browser_extension', browsingCategory: category, pageCount: analysis.pageCount }
          });
        }
      } catch (err) {
        log.warn(`Brain node error for ${category}:`, err.message);
      }
    }

    // Create interest nodes from top topics
    for (const topic of analysis.topTopics.slice(0, 5)) {
      try {
        const existing = await twinsBrainService.findNodes(userId, {
          type: 'interest',
          search: topic
        });

        if (existing?.nodes?.length > 0) {
          await twinsBrainService.reinforceNode(userId, existing.nodes[0].id, {
            source: 'browser_extension',
            reinforcement_type: 'browsing_topic'
          });
        } else {
          await twinsBrainService.addNode(userId, {
            node_type: 'interest',
            category: 'learning',
            label: `Topic: ${topic}`,
            description: `Shows recurring interest in "${topic}" through browsing`,
            confidence: 0.5,
            strength: 0.4,
            source_type: 'browser_extension',
            platform: 'web',
            tags: ['browsing', 'topic'],
            data: { source: 'browser_extension', browsingTopic: topic }
          });
        }
      } catch (err) {
        log.warn(`Brain topic node error for ${topic}:`, err.message);
      }
    }

    log.info(`Brain: Created/reinforced ${analysis.topCategories.length + analysis.topTopics.length} browsing nodes`);
  } catch (err) {
    log.warn('Brain integration error:', err.message);
  }

  // 2. Push to Mem0 - browsing summary as memories
  try {
    const { addUserFact, addPlatformMemory } = await import('../services/mem0Service.js');

    // Store browsing summary as a fact
    const summary = `Browses ${analysis.topCategories.join(', ')} content most. Frequents ${analysis.topDomains.slice(0, 4).join(', ')}. ${analysis.pageCount} pages visited, ${analysis.searchCount} searches in the last week.`;
    await addUserFact(userId, summary);

    // Store search interests as platform memory
    if (analysis.recentSearches.length > 0) {
      await addPlatformMemory(userId, 'web', 'browsing_searches', {
        searches: analysis.recentSearches,
        topics: analysis.topTopics.slice(0, 8),
        analyzedAt: new Date().toISOString()
      });
    }

    log.info('Mem0: Stored browsing summary and search memories');
  } catch (err) {
    log.warn('Mem0 integration error:', err.message);
  }

  // 3. Trigger soul signature rebuild
  try {
    const { default: soulBuilder } = await import('../services/soulSignatureBuilder.js');
    await soulBuilder.buildSoulSignature(userId);
    log.info('Soul Signature: Rebuild triggered with browsing data');
  } catch (err) {
    log.warn('Soul Signature rebuild error:', err.message);
  }
}

export default router;
