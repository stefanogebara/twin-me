/**
 * Chat-side glue for Instagram GDPR export.
 */

import { makeExportRun, makeExportLearn } from '../chatAdapter.js';

const NOUNS = [/\binstagram\b/i, /\binsta\b/i, /\big\b/i, /\bposts?\b/i, /\breels?\b/i, /\bstories\b/i];

const PHRASES = [
  /\b(my )?instagram (activity|history|usage|profile|engagement|stats?|patterns?)\b/i,
  /\b(top|favorite) (instagram )?(searches?|saved|interests?|topics?)\b/i,
  /\bhow many (instagram |insta )?(posts?|reels?|stories|likes|comments|saved)\b/i,
  /\bwhat (do I|am I) (post|save|like|search) on (instagram|insta)\b/i,
  /\b(my )?(instagram )?(posting cadence|content cadence)\b/i,
];

function any(patterns, text) {
  return patterns.some((re) => re.test(text));
}

export function detectInstagramExportIntent(message) {
  const text = String(message ?? '').trim();
  if (text.length === 0) return { kind: null };
  if (any(PHRASES, text) && any(NOUNS, text)) return { kind: 'export' };
  if (any(PHRASES, text)) return { kind: 'export' };
  return { kind: null };
}

export function formatInstagramExport(a) {
  if (!a || !a.totals) return null;
  const t = a.totals;
  const parts = [];

  const creator = t.posts + t.reels + t.stories;
  if (creator > 0) {
    parts.push(
      `Instagram (from data export): ${t.posts} posts, ${t.reels} reels, ${t.stories} stories. Cadence ~${a.posting_cadence?.posts_per_day ?? 0} posts/day over ${a.posting_cadence?.active_days ?? 0} active days.`
    );
  }

  if (t.likes_given > 0 || t.saved_items > 0 || t.comments_made > 0) {
    parts.push(
      `Engagement: ${t.likes_given} likes given, ${t.saved_items} saved, ${t.comments_made} comments left.`
    );
  }

  if ((a.top_search_topics ?? []).length > 0) {
    const named = a.top_search_topics
      .slice(0, 5)
      .map((s) => `"${s.query}"`)
      .join(', ');
    parts.push(`Top search topics: ${named}.`);
  }

  return parts.length > 0 ? parts.join(' ') : null;
}

export const instagramExportRun = makeExportRun({
  platform: 'instagram_export',
  formatAggregates: formatInstagramExport,
});

export const instagramExportLearn = makeExportLearn({
  platform: 'instagram_export',
  sourceKey: 'instagram_export',
});
