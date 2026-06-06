/**
 * Instagram GDPR export parser.
 *
 * Instagram exports come as a zip with this top-level structure (JSON format,
 * "Information about you" Meta export, 2024+):
 *
 *   personal_information/personal_information.json
 *   your_activity/
 *     content/
 *       posts_1.json           array of {media, creation_timestamp, caption}
 *       reels.json             same shape
 *       stories.json           same shape
 *     comments/
 *       post_comments_1.json
 *     likes/
 *       liked_posts.json
 *     saved/
 *       saved_posts.json
 *     searches/
 *       account_searches.json
 *
 * We extract: post + reel + story counts, posting cadence, top searched
 * terms, comment volume, likes-given volume, saved-content volume.
 *
 * Privacy: NEVER surface caption text, comment bodies, or message contents.
 * Counts, timestamps and search queries only.
 */

import { findEntry, listEntriesUnder, readEntryJson, safeDate, bump, topN } from '../zipHelpers.js';

export async function detectInstagramExport(zip) {
  // Distinct top-level: "personal_information/" + "your_activity/" both
  // present is a strong signal that nothing else uses.
  return Boolean(
    findEntry(zip, (n) => n.includes('personal_information/') && n.endsWith('.json')) &&
      findEntry(zip, (n) => n.includes('your_activity/'))
  );
}

function readArrayOfTimestamps(zip, predicate, timestampField = 'creation_timestamp') {
  const data = readEntryJson(zip, predicate);
  if (!data) return [];
  // Both "ig_other_data" wrapper formats and bare arrays show up depending
  // on the export year. Handle both.
  const items = Array.isArray(data) ? data : data.ig_posts ?? data.likes_media_likes ?? data.saved_saved_media ?? data.story_activities ?? [];
  const stamps = [];
  for (const item of items) {
    const ts =
      item?.[timestampField] ??
      item?.title_owner?.timestamp ??
      item?.string_list_data?.[0]?.timestamp ??
      item?.media?.[0]?.creation_timestamp;
    if (typeof ts === 'number') stamps.push(new Date(ts * 1000));
  }
  return stamps;
}

function summarizeCadence(dates) {
  if (dates.length === 0) return { active_days: 0, posts_per_day: 0 };
  const dayKeys = new Set(dates.map((d) => d.toISOString().slice(0, 10)));
  const windowDays =
    Math.max(1, Math.ceil((Math.max(...dates.map((d) => d.getTime())) - Math.min(...dates.map((d) => d.getTime()))) / (24 * 60 * 60 * 1000)));
  return {
    active_days: dayKeys.size,
    window_days: windowDays,
    posts_per_day: Number((dates.length / windowDays).toFixed(3)),
  };
}

export async function parseInstagramExport(zip) {
  const personal = readEntryJson(zip, (n) => n.endsWith('personal_information.json'));
  const username = personal?.profile_user?.[0]?.string_map_data?.Username?.value ?? null;

  const postDates = readArrayOfTimestamps(zip, (n) => n.endsWith('content/posts_1.json'));
  const reelDates = readArrayOfTimestamps(zip, (n) => n.endsWith('content/reels.json'));
  const storyDates = readArrayOfTimestamps(zip, (n) => n.endsWith('content/stories.json'));

  // Likes (different shape: liked_posts.json -> { likes_media_likes: [{string_list_data:[{timestamp}]}] })
  const likedRaw = readEntryJson(zip, (n) => n.endsWith('likes/liked_posts.json'));
  const likedTimestamps = (likedRaw?.likes_media_likes ?? []).flatMap((item) =>
    (item.string_list_data ?? []).map((s) => s.timestamp).filter((t) => typeof t === 'number')
  );
  const likedDates = likedTimestamps.map((t) => new Date(t * 1000));

  // Saved
  const savedRaw = readEntryJson(zip, (n) => n.endsWith('saved/saved_posts.json'));
  const savedCount = (savedRaw?.saved_saved_media ?? []).length;

  // Comments
  const commentEntries = listEntriesUnder(zip, 'your_activity/comments/');
  let commentCount = 0;
  for (const entry of commentEntries) {
    if (!entry.entryName.endsWith('.json')) continue;
    try {
      const data = JSON.parse(zip.readAsText(entry, 'utf8'));
      const arr = data?.comments_media_comments ?? data?.organic_comments ?? [];
      commentCount += arr.length;
    } catch {
      // ignore malformed
    }
  }

  // Searches
  const searchesRaw = readEntryJson(zip, (n) => n.endsWith('searches/account_searches.json'));
  const searchTopics = {};
  const searchItems =
    searchesRaw?.searches_user ??
    searchesRaw?.account_searches ??
    [];
  for (const item of searchItems) {
    const q = item.string_map_data?.Search?.value ?? item.string_map_data?.['Search Click']?.value;
    if (q && q.length > 0) bump(searchTopics, q.toLowerCase());
  }

  const aggregates = {
    identity: { username },
    totals: {
      posts: postDates.length,
      reels: reelDates.length,
      stories: storyDates.length,
      likes_given: likedDates.length,
      comments_made: commentCount,
      saved_items: savedCount,
      searches: searchItems.length,
    },
    posting_cadence: summarizeCadence([...postDates, ...reelDates]),
    likes_cadence: summarizeCadence(likedDates),
    top_search_topics: topN(searchTopics, 10, 'query'),
  };

  return { aggregates, observations: buildInstagramObservations(aggregates) };
}

function buildInstagramObservations(a) {
  const out = [];
  const t = a.totals;
  if (t.posts + t.reels + t.stories > 0) {
    out.push(
      `Instagram creator activity: ${t.posts} posts, ${t.reels} reels, ${t.stories} stories. Cadence ${a.posting_cadence.posts_per_day} posts/day over ${a.posting_cadence.active_days} active days.`
    );
  }
  if (t.likes_given > 0 || t.saved_items > 0) {
    out.push(
      `Instagram engagement: ${t.likes_given} likes given, ${t.saved_items} items saved, ${t.comments_made} comments left.`
    );
  }
  if (a.top_search_topics.length > 0) {
    const named = a.top_search_topics
      .slice(0, 5)
      .map((s) => `"${s.query}"`)
      .join(', ');
    out.push(`Top Instagram search topics: ${named}.`);
  }
  return out;
}
