/**
 * purchaseContextBuilder
 *
 * Assembles a snapshot of the user's BEHAVIORAL state at the moment they're
 * about to make a purchase. Used by the WhatsApp pre-purchase reflection bot
 * (Phase: Financial-Emotional Twin, 2026-04-24).
 *
 * Biology (Whoop/Oura/Fitbit/Garmin) is deferred to a premium tier — V1
 * leans on behavior-as-biology: mood from Spotify, stress load from Calendar,
 * time-of-day, day-of-week. Renan's moat claim ("biology + mood + stress +
 * comms + banking") assumed a durable wearable signal which in practice is
 * brittle (Whoop token rots, users lose devices, Apple Health is iOS-locked).
 * Mood + stress + time + day is still a moat vs banks/LLMs and works for
 * every user today with zero device friction.
 *
 * Queries `user_platform_data` and `calendar_events` directly — does NOT
 * re-hit Spotify/Calendar APIs per call (those are synced by background crons).
 *
 * Returns a plain object; caller decides how to format it for the LLM.
 */
import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';

const log = createLogger('PurchaseContext');

// Max age before a signal is considered stale and flagged in the output.
const FRESHNESS_HOURS = {
  spotify: 24,    // Spotify recently_played refreshes often; >1d = stale
};

function ageHours(ts) {
  if (!ts) return null;
  return (Date.now() - new Date(ts).getTime()) / 36e5;
}

/**
 * Time-of-day + day-of-week signal. Pure compute, no DB. Cheap proxy for
 * "what emotional context is this purchase happening in?" — late-night alone
 * on a Sunday reads very differently than lunch on a Wednesday.
 *
 * Uses the user's timezone if available in the session; falls back to UTC.
 * Caller passes timezone explicitly to avoid a DB lookup.
 */
function computeMoment(timezone = 'UTC') {
  const now = new Date();
  let hour, dayOfWeek, localIso;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric', hour12: false,
      weekday: 'long',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    hour = Number(parts.find(p => p.type === 'hour')?.value ?? now.getUTCHours());
    dayOfWeek = parts.find(p => p.type === 'weekday')?.value?.toLowerCase() ?? '';
    localIso = now.toISOString();
  } catch {
    hour = now.getUTCHours();
    dayOfWeek = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][now.getUTCDay()];
    localIso = now.toISOString();
  }

  const band =
    hour < 5 ? 'late_night' :
    hour < 9 ? 'early_morning' :
    hour < 12 ? 'morning' :
    hour < 14 ? 'midday' :
    hour < 17 ? 'afternoon' :
    hour < 20 ? 'evening' :
    hour < 23 ? 'night' : 'late_night';

  const is_weekend = dayOfWeek === 'saturday' || dayOfWeek === 'sunday';

  return { hour, band, day_of_week: dayOfWeek, is_weekend, timezone, local_iso: localIso };
}

async function fetchRecentTracks(userId, lookbackHours = 6) {
  // We fetch the last ~30 `recently_played` rows and filter client-side by
  // `played_at` inside raw_data — avoids a jsonb path index we don't have.
  const { data, error } = await supabaseAdmin
    .from('user_platform_data')
    .select('raw_data, extracted_at')
    .eq('user_id', userId)
    .eq('platform', 'spotify')
    .eq('data_type', 'recently_played')
    .order('extracted_at', { ascending: false })
    .limit(30);

  if (error || !data?.length) return { available: false, reason: error?.message || 'no spotify data' };

  const cutoff = Date.now() - lookbackHours * 36e5;
  const tracks = data
    .map(row => row.raw_data)
    .filter(r => r?.played_at && new Date(r.played_at).getTime() >= cutoff)
    .map(r => ({
      track: r.track_name,
      artist: r.artist_name,
      album: r.album_name,
      popularity: r.popularity,
      context_type: r.context_type, // 'playlist' | 'album' | 'artist' | null — cue for intent
      played_at: r.played_at,
    }));

  // Light vibe heuristic: avg popularity (mainstream vs niche), unique artists
  // (breadth of mood), context diversity (single-album deep-dive vs playlist
  // drift). Actual vibe inference is left to the LLM — these are hints.
  const pops = tracks.map(t => t.popularity).filter(p => typeof p === 'number');
  const avgPopularity = pops.length ? Math.round(pops.reduce((a, b) => a + b, 0) / pops.length) : null;
  const uniqueArtists = new Set(tracks.map(t => t.artist).filter(Boolean)).size;
  const contextMix = [...new Set(tracks.map(t => t.context_type).filter(Boolean))];

  const latest = data[0]?.extracted_at;
  const age = ageHours(latest);

  return {
    available: true,
    stale: age > FRESHNESS_HOURS.spotify,
    age_hours: Math.round(age),
    window_hours: lookbackHours,
    tracks,
    track_count: tracks.length,
    unique_artists: uniqueArtists,
    avg_popularity: avgPopularity, // 0-100; low = niche, high = mainstream
    context_types: contextMix,
    as_of: latest,
  };
}

async function fetchCalendarDensity(userId, pastHours = 3, futureHours = 4) {
  // Google Calendar events land in user_platform_data as raw API responses
  // (one row per calendar per sync). The dedicated `calendar_events` table
  // is empty for most users — that was a legacy schema. We unpack items[]
  // from the most recent sync rows and dedupe by event id.
  const now = new Date();
  const past = new Date(now.getTime() - pastHours * 36e5);
  const future = new Date(now.getTime() + futureHours * 36e5);

  const { data, error } = await supabaseAdmin
    .from('user_platform_data')
    .select('raw_data, extracted_at')
    .eq('user_id', userId)
    .eq('platform', 'google_calendar')
    .eq('data_type', 'events')
    .order('extracted_at', { ascending: false })
    .limit(30); // last ~30 sync rows cover all connected calendars' recent extractions

  if (error) return { available: false, reason: error.message };
  if (!data?.length) return { available: false, reason: 'no google_calendar rows' };

  // Unpack + dedupe by event id (newer extraction wins since `data` is desc).
  const seen = new Map();
  for (const row of data) {
    const items = row.raw_data?.items;
    if (!Array.isArray(items)) continue;
    for (const ev of items) {
      if (!ev?.id || ev.status === 'cancelled') continue;
      if (seen.has(ev.id)) continue;
      const startTs = ev.start?.dateTime || ev.start?.date;
      if (!startTs) continue;
      const startMs = new Date(startTs).getTime();
      if (isNaN(startMs)) continue;
      if (startMs < past.getTime() || startMs > future.getTime()) continue;
      seen.set(ev.id, {
        id: ev.id,
        title: ev.summary || '(no title)',
        start: startTs,
        end: ev.end?.dateTime || ev.end?.date || null,
        is_all_day: !ev.start?.dateTime,
        attendee_count: Array.isArray(ev.attendees) ? ev.attendees.length : 0,
        calendar: row.raw_data?.summary || 'primary',
        relation: startMs < now.getTime() ? 'past' : 'upcoming',
      });
    }
  }

  const events = [...seen.values()].sort((a, b) => new Date(a.start) - new Date(b.start));
  const latestSync = data[0]?.extracted_at;
  const syncAgeHours = latestSync ? Math.round(ageHours(latestSync)) : null;

  return {
    available: true,
    window: { past_hours: pastHours, future_hours: futureHours },
    events,
    past_count: events.filter(e => e.relation === 'past').length,
    upcoming_count: events.filter(e => e.relation === 'upcoming').length,
    has_important_upcoming: false, // Google API doesn't expose an "important" flag; leave false
    sync_age_hours: syncAgeHours,
    sync_stale: syncAgeHours != null && syncAgeHours > 24, // >24h stale
  };
}

/**
 * Main entry. Returns a snapshot the caller can hand to the LLM.
 *
 * @param {string} userId — public.users.id (UUID)
 * @param {object} opts — { spotifyLookbackHours, calendarPast, calendarFuture, timezone }
 */
export async function buildPurchaseContext(userId, opts = {}) {
  if (!userId) throw new Error('userId required');

  const {
    spotifyLookbackHours = 6,
    calendarPast = 3,
    calendarFuture = 4,
    timezone,
  } = opts;

  // Resolve timezone lazily if not passed — default to America/Sao_Paulo for
  // Brazil-first positioning. Caller should pass user.timezone for accuracy.
  let tz = timezone;
  if (!tz) {
    const { data } = await supabaseAdmin
      .from('users')
      .select('timezone')
      .eq('id', userId)
      .maybeSingle();
    tz = data?.timezone || 'America/Sao_Paulo';
  }

  const moment = computeMoment(tz);

  const t0 = Date.now();
  const [music, schedule] = await Promise.all([
    fetchRecentTracks(userId, spotifyLookbackHours),
    fetchCalendarDensity(userId, calendarPast, calendarFuture),
  ]);

  const elapsed_ms = Date.now() - t0;
  log.info('Built purchase context', {
    userId,
    elapsed_ms,
    moment_band: moment.band,
    weekend: moment.is_weekend,
    tracks: music.available ? music.track_count : 0,
    calendar: schedule.available ? schedule.events.length : 0,
  });

  return {
    user_id: userId,
    built_at: new Date().toISOString(),
    elapsed_ms,
    moment,
    music,
    schedule,
    // biology: deferred to premium tier (Terra API or native integrations)
  };
}

export default buildPurchaseContext;
