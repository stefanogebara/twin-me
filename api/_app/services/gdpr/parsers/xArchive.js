/**
 * GDPR parser: X (Twitter) archive.
 * Extracted verbatim from gdprImportService.js (audit A2-M2a god-file split).
 * Pure code motion — only import/export plumbing added.
 */

import { safeAdmZip } from '../zipSafety.js';

// ---------------------------------------------------------------------------
// X (Twitter) — archive ZIP
// ---------------------------------------------------------------------------
// Users download their archive from x.com/settings/your_account/download_an_archive.
// The ZIP contains JS files like tweets.js, like.js, following.js (each a
// window.YTD.* = [...] assignment) plus HTML viewer. We care about tweets,
// likes, and following list.

function readXArchiveEntry(zip, name) {
  const entry = zip.getEntries().find(e => new RegExp(`${name}\\.js$`, 'i').test(e.entryName));
  if (!entry) return null;
  const content = entry.getData().toString('utf8');
  // Strip leading "window.YTD.tweets.part0 = " to leave raw JSON array
  const eq = content.indexOf('=');
  if (eq === -1) return null;
  try {
    return JSON.parse(content.slice(eq + 1).trim().replace(/;$/, ''));
  } catch {
    return null;
  }
}

function parseXArchive(buffer) {
  if (!(buffer[0] === 0x50 && buffer[1] === 0x4B)) {
    throw new Error('X archive must be a ZIP (download from x.com/settings/your_account/download_an_archive)');
  }

  let zip;
  try { zip = safeAdmZip(buffer); } catch (e) {
    throw new Error(`X archive extract failed: ${e.message}`);
  }

  const rollups = [];
  const observations = [];
  const MAX_PER_SECTION = 300;

  // ----- Tweets -----
  const tweets = readXArchiveEntry(zip, 'tweets') || readXArchiveEntry(zip, 'tweet');
  if (Array.isArray(tweets) && tweets.length > 0) {
    rollups.push(`Your X archive contains ${tweets.length} tweets.`);

    // Compute reply/retweet/original ratios
    let replies = 0, retweets = 0, originals = 0;
    const perTweet = [];
    const sorted = [...tweets].sort((a, b) => {
      const ta = new Date(a?.tweet?.created_at || a?.created_at || 0).getTime();
      const tb = new Date(b?.tweet?.created_at || b?.created_at || 0).getTime();
      return tb - ta;
    });

    for (const entry of sorted) {
      const t = entry?.tweet || entry;
      const text = (t?.full_text || t?.text || '').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const isReply = !!t?.in_reply_to_status_id || text.startsWith('@');
      const isRetweet = text.startsWith('RT @');
      if (isRetweet) retweets++;
      else if (isReply) replies++;
      else originals++;

      if (perTweet.length < MAX_PER_SECTION && !isRetweet) {
        // X archive created_at is legacy format ("Wed Oct 10 20:19:24 +0000 2018"),
        // not ISO — slice(0,10) would yield "Wed Oct 10". Parse + reformat to ISO date.
        const parsedAt = t?.created_at ? new Date(t.created_at) : null;
        const date = (parsedAt && !Number.isNaN(parsedAt.getTime())) ? parsedAt.toISOString().slice(0, 10) : '';
        perTweet.push(`You tweeted${date ? ` on ${date}` : ''}: "${text.slice(0, 280)}"`);
      }
    }

    if (originals + replies + retweets > 0) {
      const total = originals + replies + retweets;
      rollups.push(`Of those tweets: ${Math.round(originals / total * 100)}% originals, ${Math.round(replies / total * 100)}% replies, ${Math.round(retweets / total * 100)}% retweets.`);
    }
    observations.push(...perTweet);
  }

  // ----- Likes -----
  const likes = readXArchiveEntry(zip, 'like') || readXArchiveEntry(zip, 'likes');
  if (Array.isArray(likes) && likes.length > 0) {
    rollups.push(`Your X archive shows ${likes.length} liked tweets.`);
    const sampleLikes = likes.slice(0, 50).map(l => (l?.like?.fullText || l?.fullText || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    for (const text of sampleLikes.slice(0, 50)) {
      observations.push(`You liked a tweet on X: "${text.slice(0, 280)}"`);
    }
  }

  // ----- Following -----
  const following = readXArchiveEntry(zip, 'following') || readXArchiveEntry(zip, 'following-list');
  if (Array.isArray(following) && following.length > 0) {
    rollups.push(`You follow ${following.length} accounts on X.`);
  }

  // ----- Profile -----
  const profile = readXArchiveEntry(zip, 'profile');
  if (Array.isArray(profile) && profile[0]) {
    const p = profile[0]?.profile || profile[0];
    const bio = p?.description?.bio || p?.bio;
    const loc = p?.description?.location || p?.location;
    if (bio) rollups.push(`Your X bio reads: "${bio}"`);
    if (loc) rollups.push(`Your X profile location is: ${loc}.`);
  }

  if (rollups.length === 0 && observations.length === 0) {
    throw new Error('X archive appears empty or has an unrecognised structure');
  }

  return [...rollups, ...observations];
}

export { parseXArchive };
