/**
 * YouTube observation fetcher.
 * Extracted from observationIngestion.js — do not change function signatures.
 */

import axios from 'axios';
import { getValidAccessToken } from '../tokenRefreshService.js';
import { createLogger } from '../logger.js';
import { sanitizeExternal, getSupabase, _hasNangoMapping } from '../observationUtils.js';
import { buildLikedVideosObservation } from './youtubeText.js';

const log = createLogger('ObservationIngestion');

/**
 * Fetch YouTube data and return natural-language observations.
 * Supports both Nango-managed connections (proxy) and direct OAuth tokens.
 */
async function fetchYouTubeObservations(userId) {
  const observations = [];

  const supabase = await getSupabase();
  if (!supabase) return observations;

  // Check if this is a Nango-managed YouTube connection
  const { data: ytConn } = await supabase
    .from('platform_connections')
    .select('access_token')
    .eq('user_id', userId)
    .eq('platform', 'youtube')
    .single();

  const isNangoManaged = ytConn?.access_token === 'NANGO_MANAGED' || (!ytConn && await _hasNangoMapping(supabase, userId, 'youtube'));

  let subsItems = [];
  let likedItems = [];

  if (isNangoManaged) {
    try {
      const nangoService = await import('../nangoService.js');
      const [subsResult, likedResult] = await Promise.all([
        nangoService.youtube.getSubscriptions(userId),
        nangoService.youtube.getLikedVideos(userId),
      ]);
      subsItems = subsResult.success ? (subsResult.data?.items || []) : [];
      likedItems = likedResult.success ? (likedResult.data?.items || []) : [];
    } catch (e) {
      log.warn('YouTube Nango fetch error', { error: e });
      return observations;
    }
  } else {
    const tokenResult = await getValidAccessToken(userId, 'youtube');
    if (!tokenResult.success || !tokenResult.accessToken) {
      // audit-2026-05-29 (Bug A): tagged throw so orchestrator marks
      // platform_connections.status='auth_failed' + last_sync_error,
      // unmasking what used to be a silent "no_new_data".
      const err = new Error(tokenResult.error || 'YouTube token unavailable');
      err.code = tokenResult.requiresReauth ? 'AUTH_FAILED' : 'TOKEN_UNAVAILABLE';
      throw err;
    }
    const headers = { Authorization: `Bearer ${tokenResult.accessToken}` };

    try {
      // Paginate up to 500 subscriptions (10 pages of 50). YouTube data API supports
      // maxResults=50 per page and returns nextPageToken when more exist.
      let nextPageToken = null;
      const MAX_SUBS = 500;
      const MAX_PAGES = 10;
      for (let page = 0; page < MAX_PAGES; page++) {
        const url = `https://www.googleapis.com/youtube/v3/subscriptions?part=snippet&mine=true&maxResults=50${nextPageToken ? `&pageToken=${encodeURIComponent(nextPageToken)}` : ''}`;
        const subsRes = await axios.get(url, { headers, timeout: 10000 });
        const items = subsRes.data?.items || [];
        subsItems.push(...items);
        nextPageToken = subsRes.data?.nextPageToken || null;
        if (!nextPageToken || subsItems.length >= MAX_SUBS) break;
      }
      if (subsItems.length > MAX_SUBS) subsItems = subsItems.slice(0, MAX_SUBS);
    } catch (e) {
      log.warn('YouTube subscriptions error', { error: e });
    }

    try {
      const likedRes = await axios.get(
        'https://www.googleapis.com/youtube/v3/videos?part=snippet,topicDetails&myRating=like&maxResults=15',
        { headers, timeout: 10000 }
      );
      likedItems = likedRes.data?.items || [];
    } catch (e) {
      log.warn('YouTube liked videos error', { error: e });
    }

    // No watch-activity fetch here. Google removed watch history from
    // youtube/v3/activities in 2016: the endpoint still answers 200, but never
    // with snippet.type === 'watch'. The filter that looked for it matched
    // nothing, so the three observations behind it — recently watched, weekly
    // volume, time-of-day peak — were unreachable while the request ran every
    // ingestion cycle. Watch data reaches us through the browser extension
    // instead (see the note in realTimeExtractor.extractYouTubeSignature).
  }

  // Subscribed channels
  if (subsItems.length > 0) {
    const channelNames = subsItems.map(i => sanitizeExternal(i.snippet?.title)).filter(Boolean).slice(0, 10);
    observations.push({
      content: `Subscribed to ${subsItems.length} YouTube channel${subsItems.length !== 1 ? 's' : ''}, including: ${channelNames.join(', ')}`,
      contentType: 'weekly_summary',
    });

    // Subscription tenure analysis from publishedAt timestamps
    const subDates = subsItems
      .map(i => i.snippet?.publishedAt ? new Date(i.snippet.publishedAt) : null)
      .filter(d => d && !isNaN(d.getTime()));
    if (subDates.length >= 3) {
      const now = Date.now();
      const agesMonths = subDates.map(d => (now - d.getTime()) / (1000 * 60 * 60 * 24 * 30));
      const avgAge = Math.round(agesMonths.reduce((a, b) => a + b, 0) / agesMonths.length);
      const oldestAge = Math.round(Math.max(...agesMonths));

      // Identify recently subscribed (< 30 days)
      const recentSubs = subsItems.filter(i => {
        const d = i.snippet?.publishedAt ? new Date(i.snippet.publishedAt) : null;
        return d && (now - d.getTime()) < 30 * 24 * 60 * 60 * 1000;
      });
      const recentNames = recentSubs.map(i => sanitizeExternal(i.snippet?.title, 40)).filter(Boolean).slice(0, 3);

      observations.push({
        content: `YouTube subscription tenure: average ${avgAge} months, oldest ${oldestAge} months${recentNames.length > 0 ? `, recently subscribed to: ${recentNames.join(', ')}` : ''}`,
        contentType: 'weekly_summary',
      });
    }

    // Channel topic enrichment — fetch topicDetails for subscribed channels (direct OAuth only)
    if (!isNangoManaged) {
      try {
        const tokenResult2 = await getValidAccessToken(userId, 'youtube');
        if (tokenResult2.success && tokenResult2.accessToken) {
          const channelIds = subsItems
            .map(i => i.snippet?.resourceId?.channelId)
            .filter(Boolean)
            .slice(0, 20);
          if (channelIds.length >= 3) {
            const channelRes = await axios.get(
              `https://www.googleapis.com/youtube/v3/channels?part=topicDetails,brandingSettings&id=${channelIds.join(',')}`,
              { headers: { Authorization: `Bearer ${tokenResult2.accessToken}` }, timeout: 10000 }
            );
            const channels = channelRes.data?.items || [];
            const topicCounts = {};
            const keywords = [];
            for (const ch of channels) {
              const topics = ch.topicDetails?.topicCategories || [];
              for (const url of topics) {
                const label = url.split('/wiki/').pop()?.replace(/_/g, ' ');
                if (label) topicCounts[label] = (topicCounts[label] || 0) + 1;
              }
              const kw = ch.brandingSettings?.channel?.keywords;
              if (kw) keywords.push(...kw.split(/\s+/).slice(0, 3));
            }
            const topTopics = Object.entries(topicCounts)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 6)
              .map(([t, c]) => `${t} (${c})`);
            if (topTopics.length > 0) {
              observations.push({
                content: `YouTube subscription topics: ${topTopics.join(', ')}`,
                contentType: 'weekly_summary',
              });
            }
          }
        }
      } catch (e) {
        log.debug('YouTube channel topics error', { error: e?.message });
      }
    }
  }

  // Liked videos (recent activity signal)
  if (likedItems.length > 0) {
    // Guarding likedItems is not enough — the TITLES are what get rendered,
    // and they can all vanish to sanitizing. See youtubeText.js.
    const liked = buildLikedVideosObservation(likedItems);
    if (liked) {
      observations.push({ content: liked, contentType: 'daily_summary' });
    }

    // Topic clustering from liked videos — prefer topicDetails (Wikipedia categories) over categoryId
    const topicCounts = {};
    const categoryCounts = {};
    for (const item of likedItems) {
      // Rich topic categories from topicDetails (Wikipedia URLs)
      const topicCategories = item.topicDetails?.topicCategories || [];
      for (const url of topicCategories) {
        // Extract label from Wikipedia URL: https://en.wikipedia.org/wiki/Entertainment → Entertainment
        const label = url.split('/wiki/').pop()?.replace(/_/g, ' ');
        if (label) topicCounts[label] = (topicCounts[label] || 0) + 1;
      }
      // Fallback to categoryId
      const cat = item.snippet?.categoryId;
      if (cat) {
        const categoryMap = { '1': 'Film & Animation', '2': 'Autos', '10': 'Music', '15': 'Pets', '17': 'Sports', '20': 'Gaming', '22': 'People & Vlogs', '23': 'Comedy', '24': 'Entertainment', '25': 'News', '26': 'How-to & Style', '27': 'Education', '28': 'Science & Tech' };
        const label = categoryMap[cat] || `Category ${cat}`;
        categoryCounts[label] = (categoryCounts[label] || 0) + 1;
      }
    }

    // Prefer topicDetails if available, fall back to categoryId
    const topicSource = Object.keys(topicCounts).length > 0 ? topicCounts : categoryCounts;
    const topCategories = Object.entries(topicSource)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([cat, count]) => `${cat} (${count})`);
    if (topCategories.length > 0) {
      observations.push({
        content: `YouTube content interests: ${topCategories.join(', ')}`,
        contentType: 'weekly_summary',
      });
    }
  }

  // ── User playlists — curation behavior signal ─────────────────────────────
  if (!isNangoManaged) {
    try {
      const tokenResult2 = await getValidAccessToken(userId, 'youtube');
      if (tokenResult2.success && tokenResult2.accessToken) {
        const playlistRes = await axios.get(
          'https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&mine=true&maxResults=10',
          { headers: { Authorization: `Bearer ${tokenResult2.accessToken}` }, timeout: 10000 }
        );
        const playlists = playlistRes.data?.items || [];
        if (playlists.length > 0) {
          const plNames = playlists.map(p => sanitizeExternal(p.snippet?.title, 50)).filter(Boolean).slice(0, 6);
          const avgItems = Math.round(playlists.reduce((s, p) => s + (p.contentDetails?.itemCount || 0), 0) / playlists.length);
          observations.push({
            content: `Has ${playlists.length} YouTube playlist${playlists.length !== 1 ? 's' : ''}: ${plNames.join(', ')} (avg ${avgItems} videos each)`,
            contentType: 'weekly_summary',
          });

          // Store for feature extractor
          try {
            const supabase2 = await getSupabase();
            if (supabase2) {
              const today = new Date().toISOString().slice(0, 10);
              await supabase2.from('user_platform_data').upsert({
                user_id: userId,
                platform: 'youtube',
                data_type: 'user_playlists',
                source_url: `youtube:user_playlists:${today}`,
                raw_data: {
                  total: playlists.length,
                  playlists: playlists.map(p => ({
                    title: p.snippet?.title,
                    description: p.snippet?.description?.slice(0, 200),
                    itemCount: p.contentDetails?.itemCount,
                    publishedAt: p.snippet?.publishedAt,
                    privacyStatus: p.status?.privacyStatus,
                  })),
                },
                processed: true,
              }, { onConflict: 'user_id,platform,data_type,source_url' });
            }
          } catch (storeErr) {
            log.warn('YouTube: failed to store user playlists', { error: storeErr });
          }
        }
      }
    } catch (e) {
      log.debug('YouTube user playlists error', { error: e?.message });
    }
  }

  return observations;
}

export default fetchYouTubeObservations;
export { fetchYouTubeObservations };
