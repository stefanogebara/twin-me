/**
 * Duolingo Data Extractor
 *
 * Uses Duolingo's unofficial public endpoint — no OAuth, no API key. The user
 * only supplies a username (stored in platform_connections.metadata.duolingoUsername).
 *
 * Language choices reveal cultural curiosity. Streak length reveals discipline.
 * Multiple courses reveal breadth vs depth.
 *
 * Reference: https://github.com/KartikTalwar/Duolingo
 *
 * Endpoint: GET https://www.duolingo.com/2017-06-30/users?username={username}
 */

import { supabaseAdmin } from '../database.js';
import { addPlatformObservation } from '../memoryStreamService.js';
import { createLogger } from '../logger.js';

const log = createLogger('DuolingoExtractor');

const DUOLINGO_API_BASE = 'https://www.duolingo.com';
// Cache window — don't re-fetch within 24h of last extraction
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// ISO-639 code -> human-readable name. Duolingo uses ISO codes in `learningLanguage`
// / `fromLanguage` fields. Unknown codes fall back to the code itself.
const LANGUAGE_NAMES = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
  pt: 'Portuguese', nl: 'Dutch', sv: 'Swedish', no: 'Norwegian', da: 'Danish',
  pl: 'Polish', ru: 'Russian', uk: 'Ukrainian', cs: 'Czech', hu: 'Hungarian',
  ro: 'Romanian', tr: 'Turkish', el: 'Greek', ja: 'Japanese', ko: 'Korean',
  zh: 'Chinese', zs: 'Chinese', 'zh-cn': 'Chinese', vi: 'Vietnamese',
  th: 'Thai', id: 'Indonesian', hi: 'Hindi', ar: 'Arabic', he: 'Hebrew',
  fi: 'Finnish', ga: 'Irish', cy: 'Welsh', la: 'Latin', eo: 'Esperanto',
  sw: 'Swahili', hv: 'High Valyrian', kl: 'Klingon', nv: 'Navajo', haw: 'Hawaiian',
};

function languageName(code) {
  if (!code) return 'unknown';
  const key = String(code).toLowerCase();
  return LANGUAGE_NAMES[key] || code;
}

function disciplineLabel(streak) {
  if (streak > 365) return 'extraordinary dedication';
  if (streak > 100) return 'serious dedication';
  if (streak > 30) return 'a regular habit';
  return 'a recent start';
}

function timeAgoLabel(creationDateSeconds) {
  if (!creationDateSeconds) return null;
  const ms = Date.now() - creationDateSeconds * 1000;
  const months = Math.floor(ms / (30 * 24 * 3600 * 1000));
  const years = Math.floor(months / 12);
  if (years >= 1) {
    const remMonths = months % 12;
    if (remMonths === 0) return { label: `${years} year${years > 1 ? 's' : ''} ago`, months };
    return { label: `${years} year${years > 1 ? 's' : ''} ago`, months };
  }
  if (months >= 1) return { label: `${months} month${months > 1 ? 's' : ''} ago`, months };
  return { label: 'less than a month ago', months: 0 };
}

async function loadConnection(userId) {
  const { data, error } = await supabaseAdmin
    .from('platform_connections')
    .select('metadata, last_sync_at')
    .eq('user_id', userId)
    .eq('platform', 'duolingo')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Duolingo is not connected');
  const username = data.metadata?.duolingoUsername;
  if (!username) throw new Error('Missing duolingoUsername on Duolingo connection metadata');
  return { username, metadata: data.metadata || {}, lastSyncAt: data.last_sync_at };
}

async function fetchProfile(username) {
  const url = `${DUOLINGO_API_BASE}/2017-06-30/users?username=${encodeURIComponent(username)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'TwinMe/1.0 (+https://twinme.app)',
      Accept: 'application/json',
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Duolingo API returned ${res.status}`);
  const json = await res.json();
  const users = Array.isArray(json?.users) ? json.users : [];
  return users[0] || null;
}

async function storeObservation(userId, content, metadata) {
  try {
    const ok = await addPlatformObservation(userId, content, 'duolingo', {
      ingestion_source: 'on_demand',
      ingested_at: new Date().toISOString(),
      ...metadata,
    });
    return ok ? 1 : 0;
  } catch (e) {
    log.warn('Failed to store Duolingo observation', { error: e.message });
    return 0;
  }
}

/**
 * Orchestrator-compatible entry point.
 */
export async function extractAll(userId, _connectorId) {
  log.info('Starting Duolingo extraction', { userId });
  let stored = 0;

  try {
    const { username, lastSyncAt } = await loadConnection(userId);

    // 24h cache — don't hammer the endpoint
    if (lastSyncAt) {
      const age = Date.now() - new Date(lastSyncAt).getTime();
      if (Number.isFinite(age) && age < CACHE_TTL_MS) {
        log.info('Duolingo extraction skipped (within 24h cache)', { userId, ageMs: age });
        return { success: true, itemsExtracted: 0, cached: true };
      }
    }

    const profile = await fetchProfile(username);
    if (!profile) {
      stored += await storeObservation(
        userId,
        `Duolingo profile @${username} could not be found. Check that the username is correct and the profile is public.`,
        { observation_type: 'profile_missing' }
      );
      return { success: false, itemsExtracted: stored, error: 'profile_not_found' };
    }

    const streak = Number(profile.streak || 0);
    const totalXp = Number(profile.totalXp || 0);
    const courses = Array.isArray(profile.courses) ? profile.courses : [];

    // 1. Profile rollup — languages + streak + totalXp
    const learning = courses
      .map(c => languageName(c.learningLanguage))
      .filter(n => n && n !== 'unknown');
    const uniqueLearning = Array.from(new Set(learning));
    const languagesPhrase = uniqueLearning.length > 0
      ? uniqueLearning.join(', ')
      : 'no active language';

    stored += await storeObservation(
      userId,
      `You're learning ${languagesPhrase} on Duolingo with a ${streak}-day streak and ${totalXp.toLocaleString()} total XP.`,
      {
        observation_type: 'profile',
        streak,
        total_xp: totalXp,
        learning_languages: uniqueLearning,
      }
    );

    // 2. Course-specific — the most-progressed language (max XP)
    if (courses.length > 0) {
      const sorted = courses.slice().sort((a, b) => (b.xp || 0) - (a.xp || 0));
      const top = sorted[0];
      if (top && (top.xp || 0) > 0) {
        const lang = languageName(top.learningLanguage);
        const crowns = Number(top.crowns || 0);
        const xp = Number(top.xp || 0);
        stored += await storeObservation(
          userId,
          `Your most-progressed Duolingo language is ${lang} with ${xp.toLocaleString()} XP and ${crowns} crowns.`,
          {
            observation_type: 'top_course',
            learning_language: top.learningLanguage,
            xp,
            crowns,
          }
        );
      }

      // If learning multiple languages, the breadth itself is a signal
      if (uniqueLearning.length >= 3) {
        stored += await storeObservation(
          userId,
          `You study ${uniqueLearning.length} languages on Duolingo — breadth of linguistic curiosity over single-language depth.`,
          { observation_type: 'language_breadth', count: uniqueLearning.length }
        );
      }
    }

    // 3. Account age
    const ago = timeAgoLabel(profile.creationDate);
    if (ago) {
      stored += await storeObservation(
        userId,
        `You started Duolingo ${ago.label}${ago.months > 0 ? ` — ${ago.months} months of language learning` : ''}.`,
        { observation_type: 'account_age', months: ago.months }
      );
    }

    // 4. Streak signal — discipline marker
    if (streak > 0) {
      stored += await storeObservation(
        userId,
        `Your Duolingo discipline shows — a ${streak}-day streak indicates ${disciplineLabel(streak)}.`,
        { observation_type: 'streak_signal', streak }
      );
    }

    // 5. Premium signal
    if (profile.hasPlus || profile.plusStatus) {
      stored += await storeObservation(
        userId,
        `You subscribe to Duolingo Super — you pay to protect your learning experience.`,
        { observation_type: 'premium', plus: true }
      );
    }

    // Update last_sync_at so the 24h cache works
    await supabaseAdmin
      .from('platform_connections')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('platform', 'duolingo');

    log.info('Duolingo extraction complete', { userId, stored });
    return { success: true, itemsExtracted: stored };
  } catch (err) {
    log.error('Duolingo extraction error', { error: err.message });
    return { success: false, itemsExtracted: stored, error: err.message };
  }
}

export default { extractAll };
