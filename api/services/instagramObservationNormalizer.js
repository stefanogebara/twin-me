/**
 * Instagram Observation Normalizer
 * =================================
 * Converts scraped Instagram data (from /saved/all-posts/, /{user}/, /following/)
 * into natural-language observation strings consumed by addPlatformObservation().
 *
 * Pure functions — no I/O, no LLM calls. Mirrors twitch.js patterns:
 * each observation is `{ content: string, contentType: 'daily_summary' | 'current_state' | 'weekly_summary' }`.
 *
 * Phase 1: vanilla Playwright scrape -> normalize -> store via existing pipeline.
 */

import { sanitizeExternal } from './observationUtils.js';

const CAPTION_MAX_CHARS = 400;
const DEFAULT_MAX_OBSERVATIONS = 60;
const MIN_SIGNAL_LENGTH = 8;

// Hashtag-only or emoji-only captions are low signal — drop them.
// A caption is meaningful if removing hashtags + emojis leaves >= MIN_SIGNAL_LENGTH chars of text.
function _hasMeaningfulText(s) {
  if (!s || typeof s !== 'string') return false;
  const stripped = s
    .replace(/#[^\s#]+/g, '')                          // drop hashtags
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/gu, '') // drop emoji blocks
    .replace(/\s+/g, ' ')
    .trim();
  return stripped.length >= MIN_SIGNAL_LENGTH;
}

function _cleanCaption(raw) {
  if (!raw || typeof raw !== 'string') return '';
  // Strip control chars, collapse whitespace, trim, then sanitize external text.
  const noControl = raw.replace(/[\x00-\x1F\x7F]/g, ' ');
  const collapsed = noControl.replace(/\s+/g, ' ').trim();
  const truncated = collapsed.length > CAPTION_MAX_CHARS
    ? collapsed.slice(0, CAPTION_MAX_CHARS).trimEnd() + '...'
    : collapsed;
  return sanitizeExternal(truncated, CAPTION_MAX_CHARS + 10);
}

/**
 * Normalize a single saved post (or reel) into an observation.
 * Returns null if the post has no usable signal.
 *
 * @param {Object} item - { url, alt, kind }
 * @returns {{ content: string, contentType: string } | null}
 */
export function normalizeSavedPost(item) {
  if (!item || typeof item !== 'object') return null;
  const cleaned = _cleanCaption(item.alt);
  if (!cleaned || !_hasMeaningfulText(cleaned)) return null;

  const kindLabel = item.kind === 'reel' ? 'reel' : 'post';
  return {
    content: `Saved a ${kindLabel} on Instagram: "${cleaned}"`,
    contentType: 'weekly_summary',
  };
}

/**
 * Normalize a single post on the user's own profile.
 * Different prefix from saved posts — semantically different signal.
 */
export function normalizeOwnPost(item) {
  if (!item || typeof item !== 'object') return null;
  const cleaned = _cleanCaption(item.alt);
  if (!cleaned || !_hasMeaningfulText(cleaned)) return null;

  const kindLabel = item.kind === 'reel' ? 'reel' : 'post';
  return {
    content: `Posted a ${kindLabel} on Instagram: "${cleaned}"`,
    contentType: 'weekly_summary',
  };
}

/**
 * Normalize a follow relationship into an observation.
 * Returns null if username is empty.
 */
export function normalizeFollow(item) {
  if (!item || typeof item !== 'object') return null;
  const username = sanitizeExternal(item.username || '', 40);
  if (!username) return null;
  const displayName = sanitizeExternal(item.display_name || '', 60);
  const suffix = displayName && displayName !== username ? ` (${displayName})` : '';
  return {
    content: `Follows @${username}${suffix} on Instagram`,
    contentType: 'current_state',
  };
}

/**
 * Orchestrate normalization across all scraped surfaces.
 * Produces a deduplicated, capped list of observations including summary observations.
 *
 * @param {Object} scrape - { saved_posts: [], own_posts: [], follows: [] }
 * @param {Object} options - { maxObservations: number }
 * @returns {Array<{ content: string, contentType: string }>}
 */
export function normalizeInstagramScrape(scrape, options = {}) {
  const maxObservations = options.maxObservations || DEFAULT_MAX_OBSERVATIONS;
  const observations = [];

  const savedPosts = Array.isArray(scrape?.saved_posts) ? scrape.saved_posts : [];
  const ownPosts = Array.isArray(scrape?.own_posts) ? scrape.own_posts : [];
  const follows = Array.isArray(scrape?.follows) ? scrape.follows : [];

  // Summary observations (weekly_summary contentType — these are stable signals).
  if (savedPosts.length > 0) {
    observations.push({
      content: `Saved ${savedPosts.length} posts on Instagram in this sync`,
      contentType: 'weekly_summary',
    });
  }
  if (follows.length > 0) {
    observations.push({
      content: `Follows ${follows.length} accounts on Instagram`,
      contentType: 'current_state',
    });
  }

  // Per-item observations, filtering out null normalizations.
  for (const post of savedPosts) {
    const obs = normalizeSavedPost(post);
    if (obs) observations.push(obs);
    if (observations.length >= maxObservations) return observations;
  }
  for (const post of ownPosts) {
    const obs = normalizeOwnPost(post);
    if (obs) observations.push(obs);
    if (observations.length >= maxObservations) return observations;
  }
  for (const follow of follows) {
    const obs = normalizeFollow(follow);
    if (obs) observations.push(obs);
    if (observations.length >= maxObservations) return observations;
  }

  return observations;
}

export default {
  normalizeSavedPost,
  normalizeOwnPost,
  normalizeFollow,
  normalizeInstagramScrape,
};
