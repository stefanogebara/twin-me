/**
 * purchaseContextBuilder
 *
 * Assembles a snapshot of the user's biological + behavioral state at the
 * moment they're about to make a purchase. Used by the WhatsApp pre-purchase
 * reflection bot (Phase: Financial-Emotional Twin, 2026-04-24).
 *
 * Queries `user_platform_data` and `calendar_events` directly — does NOT
 * re-hit Whoop/Spotify APIs per call (those are synced by background crons).
 *
 * Returns a plain object; caller decides how to format it for the LLM.
 */
import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';

const log = createLogger('PurchaseContext');

// Max age before a signal is considered stale and flagged in the output.
const FRESHNESS_HOURS = {
  whoop: 48,      // Whoop syncs nightly; >2d = stale
  spotify: 24,    // Spotify recently_played refreshes often; >1d = stale
  calendar: 1,    // Calendar is pushed; anything > 1h stale is suspicious
};

function ageHours(ts) {
  if (!ts) return null;
  return (Date.now() - new Date(ts).getTime()) / 36e5;
}

async function fetchWhoop(userId) {
  const { data, error } = await supabaseAdmin
    .from('user_platform_data')
    .select('raw_data, extracted_at')
    .eq('user_id', userId)
    .eq('platform', 'whoop')
    .eq('data_type', 'recovery')
    .order('extracted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return { available: false, reason: error?.message || 'no recovery data' };

  const r = data.raw_data || {};
  const age = ageHours(data.extracted_at);
  return {
    available: true,
    stale: age > FRESHNESS_HOURS.whoop,
    age_hours: Math.round(age),
    recovery_score: r.recovery_score ?? null,
    hrv_ms: r.hrv_rmssd_milli != null ? Math.round(r.hrv_rmssd_milli * 10) / 10 : null,
    resting_hr: r.resting_heart_rate ?? null,
    as_of: data.extracted_at,
  };
}

async function fetchRecentTracks(userId, lookbackHours = 6) {
  // We fetch the last ~20 `recently_played` rows and then filter client-side by
  // `played_at` inside raw_data — avoids a jsonb path index we don't have.
  const { data, error } = await supabaseAdmin
    .from('user_platform_data')
    .select('raw_data, extracted_at')
    .eq('user_id', userId)
    .eq('platform', 'spotify')
    .eq('data_type', 'recently_played')
    .order('extracted_at', { ascending: false })
    .limit(20);

  if (error || !data?.length) return { available: false, reason: error?.message || 'no spotify data' };

  const cutoff = Date.now() - lookbackHours * 36e5;
  const tracks = data
    .map(row => row.raw_data)
    .filter(r => r?.played_at && new Date(r.played_at).getTime() >= cutoff)
    .map(r => ({
      track: r.track_name,
      artist: r.artist_name,
      played_at: r.played_at,
    }));

  const latest = data[0]?.extracted_at;
  const age = ageHours(latest);

  return {
    available: true,
    stale: age > FRESHNESS_HOURS.spotify,
    age_hours: Math.round(age),
    window_hours: lookbackHours,
    tracks,
    track_count: tracks.length,
    as_of: latest,
  };
}

async function fetchCalendarDensity(userId, pastHours = 2, futureHours = 3) {
  const now = new Date();
  const past = new Date(now.getTime() - pastHours * 36e5);
  const future = new Date(now.getTime() + futureHours * 36e5);

  const { data, error } = await supabaseAdmin
    .from('calendar_events')
    .select('title, start_time, end_time, is_important')
    .eq('user_id', userId)
    .gte('start_time', past.toISOString())
    .lte('start_time', future.toISOString())
    .order('start_time', { ascending: true });

  if (error) return { available: false, reason: error.message };

  const nowTs = now.getTime();
  const events = (data || []).map(e => ({
    title: e.title,
    start: e.start_time,
    end: e.end_time,
    is_important: !!e.is_important,
    relation: new Date(e.start_time).getTime() < nowTs ? 'past' : 'upcoming',
  }));

  return {
    available: true,
    window: { past_hours: pastHours, future_hours: futureHours },
    events,
    past_count: events.filter(e => e.relation === 'past').length,
    upcoming_count: events.filter(e => e.relation === 'upcoming').length,
  };
}

/**
 * Main entry. Returns a snapshot the caller can hand to the LLM.
 *
 * @param {string} userId — public.users.id (UUID)
 * @param {object} opts — { spotifyLookbackHours, calendarPast, calendarFuture }
 */
export async function buildPurchaseContext(userId, opts = {}) {
  if (!userId) throw new Error('userId required');

  const {
    spotifyLookbackHours = 6,
    calendarPast = 2,
    calendarFuture = 3,
  } = opts;

  const t0 = Date.now();
  const [biology, music, schedule] = await Promise.all([
    fetchWhoop(userId),
    fetchRecentTracks(userId, spotifyLookbackHours),
    fetchCalendarDensity(userId, calendarPast, calendarFuture),
  ]);

  const elapsed_ms = Date.now() - t0;
  log.info('Built purchase context', {
    userId,
    elapsed_ms,
    biology_ok: biology.available,
    biology_stale: biology.stale,
    tracks: music.available ? music.track_count : 0,
    calendar: schedule.available ? schedule.events.length : 0,
  });

  return {
    user_id: userId,
    built_at: new Date().toISOString(),
    elapsed_ms,
    biology,
    music,
    schedule,
  };
}

export default buildPurchaseContext;
