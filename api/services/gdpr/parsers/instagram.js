/**
 * GDPR parser: Instagram.
 * Extracted verbatim from gdprImportService.js (audit A2-M2a god-file split).
 * Pure code motion — only import/export plumbing added.
 */

import { safeAdmZip, isSafeZipEntryName } from '../zipSafety.js';

// ---------------------------------------------------------------------------
// Instagram — GDPR JSON export (ZIP)
// ---------------------------------------------------------------------------
// Users download from instagram.com → Settings → Meta Accounts Center →
// Your information and permissions → Download your information → JSON format.
// Arrives as a ZIP with many JSON files nested under varying subdirectory
// depths. We match by basename regex so we're resilient to Meta's reshuffling.

// Instagram search term -> rough topic category (same pattern as Reddit inference)
const INSTAGRAM_TOPIC_MAP = {
  fitness: ['gym', 'workout', 'fitness', 'running', 'yoga', 'crossfit', 'pilates', 'hiit', 'muscle', 'abs'],
  food: ['recipe', 'cooking', 'food', 'restaurant', 'chef', 'baking', 'coffee', 'wine', 'vegan', 'pizza'],
  travel: ['travel', 'flight', 'hotel', 'beach', 'hiking', 'vacation', 'trip', 'airbnb', 'wanderlust'],
  fashion: ['fashion', 'outfit', 'style', 'dress', 'sneakers', 'ootd', 'streetwear', 'designer'],
  tech: ['tech', 'ai', 'coding', 'programming', 'startup', 'crypto', 'iphone', 'gadget'],
  music: ['music', 'concert', 'festival', 'dj', 'album', 'song', 'guitar', 'spotify', 'rap', 'hiphop'],
  art: ['art', 'design', 'painting', 'photography', 'illustration', 'architecture', 'museum'],
  sports: ['football', 'soccer', 'basketball', 'nba', 'nfl', 'tennis', 'golf', 'f1', 'formula'],
  wellness: ['meditation', 'mindfulness', 'wellness', 'therapy', 'mental health', 'self care'],
  business: ['business', 'entrepreneur', 'marketing', 'finance', 'investing', 'stocks'],
};

function igSafeJson(entry) {
  try {
    return JSON.parse(entry.getData().toString('utf8'));
  } catch {
    return null;
  }
}

function igFindEntries(zip, basenameRegex) {
  return zip.getEntries().filter(e => !e.isDirectory && isSafeZipEntryName(e.entryName) && basenameRegex.test(e.entryName));
}

function igUsernameFromHref(href) {
  if (!href || typeof href !== 'string') return null;
  const m = href.match(/instagram\.com\/([^\/?#]+)/i);
  return m ? m[1] : null;
}

function parseInstagram(buffer) {
  if (!(buffer[0] === 0x50 && buffer[1] === 0x4B)) {
    throw new Error('Instagram export must be a ZIP (download JSON format from Meta Accounts Center)');
  }

  let zip;
  try { zip = safeAdmZip(buffer); } catch (e) {
    throw new Error(`Instagram ZIP extract failed: ${e.message}`);
  }

  const rollups = [];
  const TOP_N_CREATORS = 10;
  const TOP_N_FOLLOWING = 25;

  // --- Liked posts ---
  // Shape: { likes_media_likes: [{ title, string_list_data: [{ href, value, timestamp }] }] }
  // title is often the creator username. Multiple files possible (_1, _2, ...).
  const likedEntries = igFindEntries(zip, /liked_posts(_\d+)?\.json$/i);
  const creatorCounts = {};
  let totalLiked = 0;
  for (const entry of likedEntries) {
    const data = igSafeJson(entry);
    const items = Array.isArray(data?.likes_media_likes) ? data.likes_media_likes : [];
    for (const item of items) {
      totalLiked++;
      let creator = typeof item?.title === 'string' && item.title.trim() ? item.title.trim() : null;
      if (!creator) {
        const href = item?.string_list_data?.[0]?.href;
        creator = igUsernameFromHref(href);
      }
      if (creator) {
        const handle = creator.replace(/^@/, '').slice(0, 40);
        creatorCounts[handle] = (creatorCounts[handle] || 0) + 1;
      }
    }
  }
  if (totalLiked > 0) {
    const top = Object.entries(creatorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_N_CREATORS)
      .map(([h]) => `@${h}`);
    const topStr = top.length > 0 ? ` Top creators you liked most: ${top.join(', ')}.` : '';
    rollups.push(`You've liked ${totalLiked.toLocaleString()} posts on Instagram.${topStr}`);
  }

  // --- Following ---
  // Shape: { relationships_following: [{ string_list_data: [{ href, value, timestamp }] }] }
  const followingEntries = igFindEntries(zip, /(?:^|\/)following(_\d+)?\.json$/i);
  const followingHandles = [];
  let totalFollowing = 0;
  for (const entry of followingEntries) {
    const data = igSafeJson(entry);
    const items = Array.isArray(data?.relationships_following) ? data.relationships_following : [];
    for (const item of items) {
      totalFollowing++;
      const sld = item?.string_list_data?.[0];
      const handle = (typeof sld?.value === 'string' && sld.value) || igUsernameFromHref(sld?.href);
      if (handle) followingHandles.push(handle.replace(/^@/, '').slice(0, 40));
    }
  }
  if (totalFollowing > 0) {
    const sample = followingHandles.slice(0, TOP_N_FOLLOWING).map(h => `@${h}`);
    const sampleStr = sample.length > 0 ? ` Accounts you follow include: ${sample.join(', ')}.` : '';
    rollups.push(`You follow ${totalFollowing.toLocaleString()} accounts on Instagram.${sampleStr}`);
  }

  // --- Followers ---
  const followerEntries = igFindEntries(zip, /(?:^|\/)followers(_\d+)?\.json$/i);
  let totalFollowers = 0;
  for (const entry of followerEntries) {
    const data = igSafeJson(entry);
    const items = Array.isArray(data) ? data
      : Array.isArray(data?.relationships_followers) ? data.relationships_followers
      : [];
    totalFollowers += items.length;
  }
  if (totalFollowers > 0) {
    rollups.push(`Your Instagram has ${totalFollowers.toLocaleString()} followers.`);
  }

  // --- Saved posts ---
  const savedEntries = igFindEntries(zip, /saved_posts(_\d+)?\.json$/i);
  let totalSaved = 0;
  for (const entry of savedEntries) {
    const data = igSafeJson(entry);
    const items = Array.isArray(data?.saved_saved_media) ? data.saved_saved_media
      : Array.isArray(data?.saved_posts) ? data.saved_posts
      : [];
    totalSaved += items.length;
  }
  if (totalSaved > 0) {
    rollups.push(`You've saved ${totalSaved.toLocaleString()} posts on Instagram — the ones you want to come back to.`);
  }

  // --- Liked comments (count only) ---
  const likedCommentsEntries = igFindEntries(zip, /liked_comments(_\d+)?\.json$/i);
  let totalLikedComments = 0;
  for (const entry of likedCommentsEntries) {
    const data = igSafeJson(entry);
    const items = Array.isArray(data?.likes_comment_likes) ? data.likes_comment_likes : [];
    totalLikedComments += items.length;
  }
  if (totalLikedComments > 0) {
    rollups.push(`You've liked ${totalLikedComments.toLocaleString()} comments on Instagram.`);
  }

  // --- Word/phrase searches (topic clustering, privacy-safe) ---
  const wordSearchEntries = igFindEntries(zip, /word_or_phrase_searches\.json$/i);
  const topicCounts = {};
  let totalWordSearches = 0;
  for (const entry of wordSearchEntries) {
    const data = igSafeJson(entry);
    const items = Array.isArray(data?.searches_keyword) ? data.searches_keyword
      : Array.isArray(data?.searches_user) ? data.searches_user
      : [];
    for (const item of items) {
      totalWordSearches++;
      const term = (item?.string_map_data?.Search?.value
        || item?.string_map_data?.Query?.value
        || item?.string_list_data?.[0]?.value
        || '').toLowerCase();
      if (!term) continue;
      for (const [topic, keywords] of Object.entries(INSTAGRAM_TOPIC_MAP)) {
        if (keywords.some(k => term.includes(k))) {
          topicCounts[topic] = (topicCounts[topic] || 0) + 1;
        }
      }
    }
  }
  if (totalWordSearches > 0) {
    const topTopics = Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([t]) => t);
    if (topTopics.length > 0) {
      rollups.push(`Your Instagram searches reveal interest in: ${topTopics.join(', ')}.`);
    } else {
      rollups.push(`You've made ${totalWordSearches.toLocaleString()} keyword searches on Instagram.`);
    }
  }

  // --- Account searches ---
  const accountSearchEntries = igFindEntries(zip, /account_searches\.json$/i);
  let totalAccountSearches = 0;
  for (const entry of accountSearchEntries) {
    const data = igSafeJson(entry);
    const items = Array.isArray(data?.searches_user) ? data.searches_user
      : Array.isArray(data?.searches_account) ? data.searches_account
      : [];
    totalAccountSearches += items.length;
  }
  if (totalAccountSearches > 0) {
    rollups.push(`You've searched for ${totalAccountSearches.toLocaleString()} accounts on Instagram.`);
  }

  // --- Profile info (bio only — strip emails/phones) ---
  const profileEntries = igFindEntries(zip, /personal_information\.json$/i);
  const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
  const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/g;
  for (const entry of profileEntries) {
    const data = igSafeJson(entry);
    const profiles = Array.isArray(data?.profile_user) ? data.profile_user : [];
    for (const p of profiles) {
      const sm = p?.string_map_data || {};
      const bio = sm?.Bio?.value || sm?.bio?.value || '';
      if (typeof bio === 'string' && bio.trim()) {
        const safeBio = bio.replace(EMAIL_RE, '').replace(PHONE_RE, '').replace(/\s+/g, ' ').trim().slice(0, 300);
        if (safeBio) rollups.push(`Your Instagram bio reads: "${safeBio}"`);
      }
    }
  }

  if (rollups.length === 0) {
    throw new Error('Instagram export appears empty or has an unrecognised structure — did you select JSON format?');
  }

  return rollups;
}

export { parseInstagram };
