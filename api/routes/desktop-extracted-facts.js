/**
 * Desktop onboarding "Here's what I learned about you" — extracted facts.
 * =======================================================================
 * POST /api/desktop/extracted-facts
 *
 * Second wow moment in the desktop onboarding flow (v2 #5). After the
 * local clip-summary reveal at the current onboarding step ("Here's
 * what I noticed"), we ask the user to sign in, then surface 4-6
 * concrete facts the twin has extracted from their REAL connected
 * platforms — not invented, not mocked, pulled directly from their
 * Google account + calendar.
 *
 * Frontend gap: .claude/plans/2026-06-10-v2-5-extracted-facts/README.md
 * Reference moment: research/competitor-onboarding-screenshots/askjo_15-39-22.png
 *
 * Cost discipline: zero LLM calls. All 5 fact builders are pure
 * template interpolation with regex / frequency aggregation. Single
 * Google API hit for calendar events (capped 30 days), plus the
 * userinfo we already have from OAuth. Target p50 < 600ms.
 *
 * Caching: 1-hour Redis cache per user. "Look again" reruns return
 * cached payload — keeps the screen responsive on retry clicks
 * without re-hitting Google.
 */
import express from 'express';
import axios from 'axios';
import { authenticateUser } from '../middleware/auth.js';
import { getValidAccessToken } from '../services/tokenRefreshService.js';
import { sanitizeExternal } from '../services/observationUtils.js';
import { createLogger } from '../services/logger.js';
import { get as redisGet, set as redisSet } from '../services/redisClient.js';

const router = express.Router();
const log = createLogger('DesktopExtractedFacts');

const MAX_NAME_LEN = 60;
const CACHE_TTL_SECONDS = 60 * 60; // 1 hour
const CALENDAR_DAYS_BACK = 30;
const CALENDAR_EVENT_CAP = 250;

/**
 * Sniff Google `userinfo` for identity + locale + zoneinfo. This is
 * the cheap path — OAuth token already grants `openid email profile`
 * scope, so no extra capability ask.
 */
async function getGoogleUserInfo(token) {
  try {
    const res = await axios.get('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 5000,
    });
    return res.data || null;
  } catch (err) {
    log.warn('getGoogleUserInfo failed', { error: err.message });
    return null;
  }
}

/**
 * Fetch the user's last N days of calendar events from the PRIMARY
 * calendar. We deliberately don't list all calendars here (the
 * observation pipeline already does that) — for the wow moment we
 * want the user's own working calendar, not their "Holidays in
 * Brazil" subscription. Single round-trip, capped event count.
 */
async function fetchRecentCalendarEvents(token) {
  try {
    const now = new Date();
    const past = new Date(now.getTime() - CALENDAR_DAYS_BACK * 24 * 36e5);
    const res = await axios.get(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          timeMin: past.toISOString(),
          timeMax: now.toISOString(),
          maxResults: CALENDAR_EVENT_CAP,
          singleEvents: true,
          orderBy: 'startTime',
        },
        timeout: 8000,
      }
    );
    return Array.isArray(res.data?.items) ? res.data.items : [];
  } catch (err) {
    log.warn('fetchRecentCalendarEvents failed', { error: err.message });
    return [];
  }
}

// ─── Fact builders — pure, no I/O, ≤ 40 lines each ─────────────────────────

/**
 * F1 — identity: derive company affiliation from email domain.
 * "Linked to anthropic.com, with a profile that points to {locale}."
 *
 * Heuristic only — we don't claim "Anthropic the company" because the
 * domain could be personal. Stick to the verbatim domain, let the
 * model / user fill in the rest. Returns null when there's no Google
 * profile (the F1 fact is skipped entirely).
 */
function buildIdentityFact(userInfo) {
  if (!userInfo || !userInfo.email) return null;
  const at = userInfo.email.indexOf('@');
  if (at < 0) return null;
  const domain = userInfo.email.slice(at + 1).toLowerCase();
  // Skip generic email providers — telling someone "linked to gmail.com"
  // is useless and feels surveillance-y.
  const generic = new Set([
    'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'yahoo.com',
    'icloud.com', 'me.com', 'protonmail.com', 'pm.me', 'aol.com',
  ]);
  if (generic.has(domain)) return null;
  // Strip the TLD for the display name. "anthropic.com" → "Anthropic"
  // is the heuristic the user will read most naturally.
  const root = domain.split('.')[0];
  const display = root.charAt(0).toUpperCase() + root.slice(1);
  return {
    id: 'identity',
    icon: 'briefcase',
    text: `Your email is tied to ${sanitizeExternal(display, 60)}.`,
    source: 'Google account',
    confidence: 'high',
    editable: true,
  };
}

/**
 * F2 — location: surface timezone in human-friendly form.
 * "Looks like you're in {city} ({continent})."
 */
function buildLocationFact(userInfo, events) {
  // Prefer the userinfo zoneinfo when present (e.g. "America/Sao_Paulo")
  // because it survives even when the user's calendar is empty. Fall
  // back to the first event's timeZone if userinfo doesn't carry it.
  let zone = userInfo?.zoneinfo || null;
  if (!zone && Array.isArray(events) && events.length) {
    zone = events.find((e) => e?.start?.timeZone)?.start?.timeZone || null;
  }
  if (!zone) return null;
  // "America/Sao_Paulo" → city: "Sao Paulo", region: "America"
  const parts = zone.split('/');
  if (parts.length < 2) return null;
  const city = parts[parts.length - 1].replace(/_/g, ' ');
  const region = parts[0];
  return {
    id: 'location',
    icon: 'map-pin',
    text: `Looks like you're in ${sanitizeExternal(city, 60)} (${sanitizeExternal(region, 30)}).`,
    source: 'Google timezone',
    confidence: 'high',
    editable: true,
  };
}

/**
 * F3 — calendar cadence: which days of the week dominate. Pure
 * frequency aggregation over event start dates.
 */
function buildCadenceFact(events) {
  if (!Array.isArray(events) || events.length < 5) return null;
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const ev of events) {
    const iso = ev?.start?.dateTime || ev?.start?.date;
    if (!iso) continue;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) continue;
    counts[d.getDay()] += 1;
  }
  const total = counts.reduce((s, n) => s + n, 0);
  if (total < 5) return null;
  // Top 2 days by count
  const ranked = days
    .map((name, idx) => ({ name, count: counts[idx] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 2)
    .filter((d) => d.count > 0);
  if (ranked.length === 0) return null;
  const namesList = ranked.map((d) => d.name).join(' and ');
  const pct = Math.round(((ranked.reduce((s, d) => s + d.count, 0)) / total) * 100);
  return {
    id: 'calendar_cadence',
    icon: 'calendar',
    text: `Your calendar leans heavily into ${namesList} — that's ${pct}% of the last ${CALENDAR_DAYS_BACK} days.`,
    source: 'Google Calendar',
    confidence: 'medium',
    editable: true,
  };
}

/**
 * F4 — recurring focus blocks: find titles that appear ≥ 2 times.
 * Normalizes case + strips obvious volatile tokens (dates, numbers).
 */
function buildFocusBlocksFact(events) {
  if (!Array.isArray(events) || events.length < 5) return null;
  // normalized key → { count, display }. The display string keeps the
  // user's ORIGINAL casing (first occurrence wins) with only the
  // volatile numeric tokens stripped. We deliberately do NOT re-case:
  // JS \b\w title-casing is ASCII-only and mangles accented titles
  // ("Tênis Segovia" → "TêNis Segovia", "Álvaro psicólogo" →
  // "áLvaro PsicóLogo" — caught live in the 2026-06-10 prod smoke).
  // The original casing is also truer to the verbatim-proof spirit.
  const stripVolatile = (s) =>
    s.replace(/\b\d{1,4}([-/]\d{1,4})*\b/g, '').replace(/\s+/g, ' ').trim();
  const counts = new Map();
  for (const ev of events) {
    const raw = (ev?.summary || '').trim();
    if (!raw) continue;
    const display = stripVolatile(raw);
    const normalized = display.toLowerCase();
    if (normalized.length < 3) continue;
    const entry = counts.get(normalized);
    if (entry) entry.count += 1;
    else counts.set(normalized, { count: 1, display });
  }
  const recurring = Array.from(counts.values())
    .filter((e) => e.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map((e) => e.display.slice(0, 60));
  if (recurring.length < 2) return null;
  return {
    id: 'focus_blocks',
    icon: 'target',
    text: `Recurring blocks on your calendar: ${recurring.map((t) => sanitizeExternal(t, 60)).join(', ')}.`,
    source: 'Google Calendar',
    confidence: 'medium',
    editable: true,
  };
}

/**
 * F5 — language signal: detect non-English event titles. Useful for
 * users who live or work bilingually. Surface the actual titles as
 * proof rather than describing the language abstractly.
 */
function buildLanguageFact(events) {
  if (!Array.isArray(events) || events.length < 5) return null;
  // Diacritic / non-Latin-basic Unicode in event titles is our signal.
  // We're not trying to NLP-classify a language — just notice that
  // the user lives some of their life outside English. \uXXXX escapes
  // (not literal chars) for robustness across file-encoding gotchas:
  //   À-ɏ = Latin-1 Supplement + Latin Extended A + B (diacritics)
  //   Ѐ-ӿ = Cyrillic
  //   一-鿿 = CJK Unified Ideographs
  //   ぀-ヿ = Hiragana + Katakana
  const nonEnglish = /[À-ɏЀ-ӿ一-鿿぀-ヿ]/;
  const matches = [];
  for (const ev of events) {
    const raw = (ev?.summary || '').trim();
    if (!raw) continue;
    if (nonEnglish.test(raw)) matches.push(raw);
  }
  if (matches.length < 3) return null;
  // Dedupe + take 2-3 verbatim examples (sanitized for length)
  const uniq = Array.from(new Set(matches)).slice(0, 3);
  const examples = uniq.map((t) => sanitizeExternal(t.slice(0, 40), 40)).join(', ');
  return {
    id: 'language',
    icon: 'globe',
    text: `Your calendar mixes English with another language — entries like ${examples}.`,
    source: 'Google Calendar',
    confidence: 'low',
    editable: true,
  };
}

function confidenceRank(fact) {
  return { high: 3, medium: 2, low: 1 }[fact.confidence] || 0;
}

router.post('/extracted-facts', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, MAX_NAME_LEN) : '';

  // Read-through cache. Keyed per-user; 1-hour TTL keeps "Look again"
  // clicks cheap without serving stale facts indefinitely.
  const cacheKey = `extracted-facts:${userId}`;
  try {
    const cached = await redisGet(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      return res.json({ ...parsed, cached: true });
    }
  } catch (err) {
    // Cache miss / Redis down → fall through to live fetch. Don't log
    // here — redisClient already logs misses; this would be noise.
  }

  const tokenResult = await getValidAccessToken(userId, 'google_calendar').catch(() => ({ success: false }));
  if (!tokenResult?.success || !tokenResult.accessToken) {
    return res.json({
      success: true,
      facts: [],
      facts_count: 0,
      fallback_reason: tokenResult?.requiresReauth ? 'oauth_expired' : 'no_calendar_connected',
    });
  }

  try {
    const [userInfo, events] = await Promise.all([
      getGoogleUserInfo(tokenResult.accessToken),
      fetchRecentCalendarEvents(tokenResult.accessToken),
    ]);

    const facts = [
      buildIdentityFact(userInfo),
      buildLocationFact(userInfo, events),
      buildCadenceFact(events),
      buildFocusBlocksFact(events),
      buildLanguageFact(events),
    ].filter(Boolean);

    // Cap at 6, prefer high-confidence. v1 will rarely exceed 5 since
    // each builder caps at one fact, but the slice future-proofs us.
    const ranked = facts.sort((a, b) => confidenceRank(b) - confidenceRank(a)).slice(0, 6);

    const payload = {
      success: true,
      facts: ranked,
      facts_count: ranked.length,
      ...(ranked.length === 0 ? { fallback_reason: 'calendar_empty' } : {}),
    };

    // Cache the assembled payload (NOT the upstream events) — keeps
    // memory footprint tiny and lets us iterate the fact templates
    // without re-fetching Google.
    try {
      await redisSet(cacheKey, JSON.stringify(payload), CACHE_TTL_SECONDS);
    } catch (err) {
      // Cache write failure is non-fatal — payload still goes back to
      // the client. Logged at debug level in the redisClient.
    }

    return res.json(payload);
  } catch (err) {
    log.error('extracted-facts pipeline failed', { error: err.message });
    return res.status(502).json({ success: false, error: "Couldn't extract facts right now" });
  }
});

export default router;

// Named exports for unit testing the pure helpers in isolation.
export {
  buildIdentityFact,
  buildLocationFact,
  buildCadenceFact,
  buildFocusBlocksFact,
  buildLanguageFact,
  confidenceRank,
};
