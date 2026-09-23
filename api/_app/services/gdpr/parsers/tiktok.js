/**
 * GDPR parser: TikTok.
 * Extracted verbatim from gdprImportService.js (audit A2-M2a god-file split).
 * Pure code motion — only import/export plumbing added.
 */

import { safeAdmZip } from '../zipSafety.js';

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
      const zip = safeAdmZip(buffer);
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

export { parseTikTok };
