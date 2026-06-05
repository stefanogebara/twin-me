/**
 * YouTube recent watching aggregator.
 *
 * YouTube Data API does NOT expose watch history directly (privacy
 * decision baked into the API since 2016). The closest accessible
 * proxy is `likes` (the user's liked-videos playlist), which most
 * heavy YouTube users do tap as a way to bookmark + signal taste.
 *
 * Endpoints used:
 *   - /playlistItems?playlistId=LL&part=snippet&maxResults=50  (liked videos)
 *   - /channels?id=...&part=snippet,topicDetails  (channel taxonomy
 *     for genre roll-up)
 *
 * Returns:
 *   - totals: liked_videos, unique_channels
 *   - top_channels: ordered by liked-video count
 *   - top_topics: from channel topicDetails (best-effort)
 *   - by_day: per-day liked-video count
 *   - list: most-recent liked videos (title, channel)
 */

const DEFAULT_LIST_LIMIT = 10;
const MAX_VIDEOS = 50; // playlistItems max page

function dayKey(iso) {
  return (iso ?? '').slice(0, 10);
}

/**
 * @param {object} client — { get(path) -> Promise<any> }
 * @param {{ list_limit?: number }} [params]
 */
export async function getRecentWatching(client, params = {}) {
  const listLimit = params.list_limit ?? DEFAULT_LIST_LIMIT;

  const liked = await client
    .get(`/playlistItems?playlistId=LL&part=snippet&maxResults=${MAX_VIDEOS}`)
    .catch(() => ({ items: [] }));
  const items = Array.isArray(liked?.items) ? liked.items : [];

  // Aggregate by channel.
  const channelMap = new Map();
  const dayMap = new Map();
  for (const it of items) {
    const sn = it.snippet ?? {};
    const channelId = sn.videoOwnerChannelId ?? sn.channelId ?? 'unknown';
    const channelTitle = sn.videoOwnerChannelTitle ?? sn.channelTitle ?? 'unknown';
    const entry = channelMap.get(channelId) || {
      channel_id: channelId,
      channel_title: channelTitle,
      count: 0,
    };
    entry.count += 1;
    channelMap.set(channelId, entry);

    const dk = dayKey(sn.publishedAt);
    if (dk) dayMap.set(dk, (dayMap.get(dk) ?? 0) + 1);
  }

  const topChannels = [...channelMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((c) => ({ channel: c.channel_title, count: c.count }));

  // Topic resolution — fetch /channels for the top 3 channels.
  const topChannelIds = [...channelMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map((c) => c.channel_id)
    .filter((id) => id && id !== 'unknown');
  let topTopics = [];
  if (topChannelIds.length > 0) {
    const ch = await client
      .get(`/channels?id=${topChannelIds.join(',')}&part=snippet,topicDetails`)
      .catch(() => ({ items: [] }));
    const chItems = Array.isArray(ch?.items) ? ch.items : [];
    const topicMap = new Map();
    for (const c of chItems) {
      const topics = c.topicDetails?.topicCategories ?? [];
      for (const url of topics) {
        // Topic URLs look like "https://en.wikipedia.org/wiki/Knowledge"
        // — take the last path segment, snake-case → human readable.
        const slug = decodeURIComponent(url.split('/').pop() ?? '').replace(/_/g, ' ');
        if (slug) topicMap.set(slug, (topicMap.get(slug) ?? 0) + 1);
      }
    }
    topTopics = [...topicMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic, count]) => ({ topic, count }));
  }

  const list = items.slice(0, listLimit).map((it) => ({
    title: it.snippet?.title ?? 'untitled',
    channel: it.snippet?.videoOwnerChannelTitle ?? it.snippet?.channelTitle ?? 'unknown',
    published_at: it.snippet?.publishedAt ?? null,
  }));

  const days_array = [...dayMap.entries()]
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => a.day.localeCompare(b.day));

  return {
    totals: {
      liked_videos: items.length,
      unique_channels: channelMap.size,
    },
    top_channels: topChannels,
    top_topics: topTopics,
    by_day: days_array,
    list,
  };
}
