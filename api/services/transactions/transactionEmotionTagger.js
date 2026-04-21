/**
 * Transaction Emotion Tagger
 * ==========================
 * For each bank transaction, joins the transaction timestamp with the user's
 * biological, mood, and stress signals from `user_platform_data` within a
 * +/- 2h window. Writes the fingerprint to `transaction_emotional_context`.
 *
 * Signals considered:
 *   - Biology: Whoop/Oura/Garmin HRV, recovery %, strain, sleep score
 *   - Mood:    Spotify audio features (valence, energy)
 *   - Load:    Google Calendar event density in +/- 2h
 *
 * Composite stress score (0-1):
 *   Weighted combination: 0.45*biology + 0.30*calendar + 0.25*music_inverse
 *   where biology = 1 - (recovery/100) and music_inverse = 1 - valence.
 *
 * Pure-ish — reads platform data, writes emotion context rows only.
 */

import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';
import { isDiscretionaryCategory } from './merchantNormalizer.js';
import { estimateValence } from './musicValenceDictionary.js';

const log = createLogger('transaction-emotion-tagger');

const WINDOW_HOURS = 2;
const BIOLOGY_LOOKBACK_HOURS = 20; // biology signals are daily-ish
const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * Parse a timestamp string or return null.
 */
function parseIso(str) {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Return the best "event-time" for a platform_data row. Uses the payload's own
 * timestamp when available (e.g. Whoop recovery.created_at, Spotify played_at,
 * Calendar event.start) and falls back to the row's extracted_at column.
 *
 * This is the key fix: extraction can lag the event by hours or days, but
 * correlating a transaction with HRV or music requires the actual event time.
 */
export function getEffectiveEventTime(row) {
  const d = row?.raw_data || {};
  const candidates = [
    d.played_at,                            // Spotify recently_played
    d.created_at,                           // Whoop recovery
    d.start, d.end,                         // Whoop sleep/workout, Calendar event
    d.start_time, d.end_time,               // alt naming
    d.startTime, d.endTime,                 // alt naming
    d.dateTime, d.date_time,                // Google Calendar
    d.start?.dateTime, d.start?.date,       // Google Calendar event nested shape
    d.timestamp,
  ];
  for (const c of candidates) {
    const dt = parseIso(c);
    if (dt) return dt;
  }
  return parseIso(row?.extracted_at);
}

/**
 * For rows that contain a `history` array (Whoop recovery), unroll each history
 * entry as a virtual row with its own event time. This lets us match a transaction
 * on Apr 3 against the Apr 3 history entry even when the parent row's `created_at`
 * is Apr 4.
 */
function expandHistoryRows(rows) {
  const out = [];
  for (const row of rows || []) {
    const d = row?.raw_data || {};
    if (Array.isArray(d.history) && d.history.length > 0) {
      for (const h of d.history) {
        out.push({
          ...row,
          raw_data: { ...h },
          _fromHistory: true,
        });
      }
    } else {
      out.push(row);
    }
  }
  return out;
}

/**
 * Fetch platform_data rows and filter them in memory by effective event time
 * within a +/- windowHours window around centerTs. Uses a wide extracted_at
 * pre-filter so we don't miss late-extracted rows whose real event time
 * falls inside the window.
 */
async function fetchWindowSignals(userId, centerTs, platforms, dataTypes = null, windowHours = WINDOW_HOURS) {
  // Pre-filter: extracted_at within 60 days either side of event. Wide enough
  // to catch late-extracted rows, narrow enough to avoid a full scan.
  const preStart = new Date(centerTs.getTime() - 60 * 24 * MS_PER_HOUR).toISOString();
  const preEnd = new Date(centerTs.getTime() + 60 * 24 * MS_PER_HOUR).toISOString();

  let query = supabaseAdmin
    .from('user_platform_data')
    .select('platform, data_type, raw_data, extracted_at')
    .eq('user_id', userId)
    .in('platform', platforms)
    .gte('extracted_at', preStart)
    .lte('extracted_at', preEnd);

  if (dataTypes?.length) {
    query = query.in('data_type', dataTypes);
  }

  const { data, error } = await query;
  if (error) {
    log.warn(`window query failed for user ${userId}: ${error.message}`);
    return [];
  }

  const expanded = expandHistoryRows(data || []);
  const windowMs = windowHours * MS_PER_HOUR;
  const centerMs = centerTs.getTime();
  return expanded.filter((row) => {
    const eventTs = getEffectiveEventTime(row);
    return eventTs && Math.abs(eventTs.getTime() - centerMs) <= windowMs;
  });
}

/**
 * Find the biology signal whose effective event time is nearest to centerTs
 * within hoursBack behind + 1h ahead. Biology is daily-ish so the window is wide.
 */
async function fetchNearestRecent(userId, centerTs, platforms, dataTypes, hoursBack = BIOLOGY_LOOKBACK_HOURS) {
  // Pre-filter wide so we don't miss late-extracted rows.
  const preStart = new Date(centerTs.getTime() - 60 * 24 * MS_PER_HOUR).toISOString();
  const preEnd = new Date(centerTs.getTime() + 60 * 24 * MS_PER_HOUR).toISOString();

  let query = supabaseAdmin
    .from('user_platform_data')
    .select('platform, data_type, raw_data, extracted_at')
    .eq('user_id', userId)
    .in('platform', platforms)
    .gte('extracted_at', preStart)
    .lte('extracted_at', preEnd);

  if (dataTypes?.length) query = query.in('data_type', dataTypes);
  const { data, error } = await query;
  if (error) return null;

  const expanded = expandHistoryRows(data || []);
  const centerMs = centerTs.getTime();
  const backMs = hoursBack * MS_PER_HOUR;
  const forwardMs = MS_PER_HOUR;

  // Keep rows with event time in [centerTs - hoursBack, centerTs + 1h], pick nearest.
  const candidates = expanded
    .map((row) => ({ row, eventTs: getEffectiveEventTime(row) }))
    .filter(({ eventTs }) => {
      if (!eventTs) return false;
      const delta = eventTs.getTime() - centerMs;
      return delta <= forwardMs && delta >= -backMs;
    })
    .sort((a, b) => Math.abs(a.eventTs.getTime() - centerMs) - Math.abs(b.eventTs.getTime() - centerMs));

  return candidates[0]?.row || null;
}

function pickNumeric(source, ...keys) {
  if (!source || typeof source !== 'object') return null;
  for (const k of keys) {
    const v = source[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

/**
 * Extract structured biology signals from a Whoop/Oura/Garmin data row.
 */
function extractBiologyFromRow(row) {
  const d = row?.raw_data || {};
  return {
    hrv: pickNumeric(d, 'hrv', 'hrv_rmssd_milli', 'hrv_ms', 'hrvMs'),
    recovery: pickNumeric(d, 'recovery', 'recovery_score', 'recoveryScore', 'readiness'),
    strain: pickNumeric(d, 'strain', 'day_strain', 'score'),
    // Whoop exposes `sleep_performance_percentage`, Oura `sleep_score`, generic fallback `sleep`
    sleep: pickNumeric(d, 'sleep_score', 'sleepScore', 'sleep_performance', 'sleep_performance_percentage', 'sleep'),
  };
}

function extractMusicFromRow(row) {
  const d = row?.raw_data || {};
  // Prefer real valence when present; fall back to artist-name heuristic
  // (Spotify restricted audio-features Nov 2024 — heuristic is the only path).
  const realValence = pickNumeric(d, 'valence', 'audio_valence');
  const valence = realValence !== null ? realValence : estimateValence(d);
  return {
    valence,
    energy: pickNumeric(d, 'energy', 'audio_energy'),
  };
}

/**
 * Compute the emotional context for a single transaction.
 * Returns the shape to insert into transaction_emotional_context.
 */
export async function computeTransactionEmotionalContext(userId, transaction) {
  const ts = new Date(transaction.transaction_date);
  if (isNaN(ts.getTime())) {
    log.warn(`invalid transaction_date for ${transaction.id}`);
    return null;
  }

  // 1. Biology (Whoop/Oura/Garmin) — usually 1-2 readings per day.
  //    Look back up to 20h; grab the most recent before/near transaction.
  const biologyRow = await fetchNearestRecent(
    userId,
    ts,
    ['whoop', 'oura', 'garmin', 'fitbit'],
    null,
    20,
  );
  const biology = biologyRow ? extractBiologyFromRow(biologyRow) : { hrv: null, recovery: null, strain: null, sleep: null };

  // 2. Music (Spotify) — prefer recently played within +/- 2h
  const musicRows = await fetchWindowSignals(userId, ts, ['spotify'], ['recent_play', 'recently_played', 'track']);
  let musicValence = null;
  let musicEnergy = null;
  if (musicRows.length) {
    // Average across tracks in window
    const vals = musicRows.map(extractMusicFromRow).filter(m => m.valence !== null);
    if (vals.length) {
      musicValence = vals.reduce((s, m) => s + m.valence, 0) / vals.length;
      const energies = vals.map(m => m.energy).filter(v => v !== null);
      if (energies.length) musicEnergy = energies.reduce((s, e) => s + e, 0) / energies.length;
    }
  }

  // 3. Calendar load — count events that overlap +/- 2h window
  const calendarRows = await fetchWindowSignals(
    userId,
    ts,
    ['calendar', 'google_calendar'],
    ['event', 'events', 'recent_event', 'upcoming_event'],
  );
  const calendarLoad = calendarRows.length;

  // 4. Composite stress score
  //    Higher = more stressed. Uses what we have; returns null if nothing at all.
  let stressScore = null;
  let signalsFound = 0;
  const components = [];

  if (biology.recovery !== null) {
    components.push({ weight: 0.45, value: 1 - biology.recovery / 100 });
    signalsFound++;
  } else if (biology.hrv !== null) {
    // HRV (ms): typical healthy range 20-100, lower = more stress
    const hrvStress = Math.max(0, Math.min(1, 1 - (biology.hrv - 20) / 80));
    components.push({ weight: 0.45, value: hrvStress });
    signalsFound++;
  }

  if (calendarLoad > 0) {
    // 0 events = 0, 3+ events = 1
    components.push({ weight: 0.30, value: Math.min(1, calendarLoad / 3) });
    signalsFound++;
  }

  if (musicValence !== null) {
    // low valence → sad → stressed. 1 - valence = stress contribution.
    components.push({ weight: 0.25, value: 1 - musicValence });
    signalsFound++;
  }

  if (biology.sleep !== null) {
    signalsFound++; // counted, even if not in composite
  }

  if (components.length) {
    const totalWeight = components.reduce((s, c) => s + c.weight, 0);
    stressScore = components.reduce((s, c) => s + c.weight * c.value, 0) / totalWeight;
  }

  // 5. Stress-shop candidate: outflow + high stress + discretionary-looking
  const isOutflow = transaction.amount < 0;
  const absAmount = Math.abs(transaction.amount);
  const isStressShop =
    isOutflow &&
    stressScore !== null &&
    stressScore >= 0.6 &&
    absAmount >= 20 && // ignore micro-transactions
    absAmount <= 2000; // ignore huge purchases (likely planned)

  return {
    transaction_id: transaction.id,
    user_id: userId,
    hrv_score: biology.hrv,
    recovery_score: biology.recovery,
    sleep_score: biology.sleep,
    strain_score: biology.strain,
    music_valence: musicValence,
    music_energy: musicEnergy,
    calendar_load: calendarLoad,
    message_tone: null, // Phase 2B — will mine from gmail/whatsapp
    computed_stress_score: stressScore,
    is_stress_shop_candidate: isStressShop,
    signals_found: signalsFound,
    computed_at: new Date().toISOString(),
  };
}

/**
 * Fetch all platform_data rows relevant for a batch of transactions in one shot,
 * then compute emotion context in memory. Much faster than per-transaction fetch.
 */
async function prefetchPlatformDataForBatch(userId, transactions) {
  if (!transactions.length) return { biology: [], music: [], calendar: [] };

  const times = transactions
    .map(t => new Date(t.transaction_date))
    .filter(d => !isNaN(d.getTime()));
  if (!times.length) return { biology: [], music: [], calendar: [] };

  const minTs = new Date(Math.min(...times.map(d => d.getTime())) - 2 * 24 * MS_PER_HOUR);
  const maxTs = new Date(Math.max(...times.map(d => d.getTime())) + 2 * 24 * MS_PER_HOUR);

  // Biology needs extra back-lookback (for sleep captured next morning)
  const bioStart = new Date(minTs.getTime() - BIOLOGY_LOOKBACK_HOURS * MS_PER_HOUR);

  // Pre-filter extracted_at with a modest buffer. 10 days is enough to catch
  // the common late-extraction case (platform polling runs within hours of
  // events) while keeping Supabase query payload small (<2000 rows typical).
  // Previously used 60d which returned 8k+ rows for active users and hit the
  // Vercel serverless response timeout.
  const preStart = new Date(bioStart.getTime() - 10 * 24 * MS_PER_HOUR).toISOString();
  const preEnd = new Date(maxTs.getTime() + 10 * 24 * MS_PER_HOUR).toISOString();

  const fetchOne = async (platforms, dataTypes) => {
    let q = supabaseAdmin
      .from('user_platform_data')
      .select('platform, data_type, raw_data, extracted_at')
      .eq('user_id', userId)
      .in('platform', platforms)
      .gte('extracted_at', preStart)
      .lte('extracted_at', preEnd)
      .order('extracted_at', { ascending: false })
      // Safety cap: prevents unbounded query payloads on heavy users. Tagger
      // in-memory filter will still narrow by effective event time per tx.
      .limit(1500);
    if (dataTypes?.length) q = q.in('data_type', dataTypes);
    const { data, error } = await q;
    if (error) {
      log.warn(`prefetch ${platforms.join(',')} failed: ${error.message}`);
      return [];
    }
    return expandHistoryRows(data || []);
  };

  const [biology, music, calendar] = await Promise.all([
    fetchOne(['whoop', 'oura', 'garmin', 'fitbit'], null),
    fetchOne(['spotify'], ['recent_play', 'recently_played', 'track']),
    fetchOne(['calendar', 'google_calendar'], ['event', 'events', 'recent_event', 'upcoming_event']),
  ]);

  return { biology, music, calendar };
}

/**
 * Compute emotion context for a single transaction using a pre-fetched bundle
 * of biology/music/calendar rows (filtered in memory).
 */
function computeFromBundle(userId, tx, bundle) {
  const ts = new Date(tx.transaction_date);
  if (isNaN(ts.getTime())) return null;
  const centerMs = ts.getTime();

  // Biology — nearest within -20h, +1h
  const bioBack = BIOLOGY_LOOKBACK_HOURS * MS_PER_HOUR;
  const bioForward = MS_PER_HOUR;
  const bioCandidates = bundle.biology
    .map(r => ({ r, t: getEffectiveEventTime(r) }))
    .filter(({ t }) => t && (t.getTime() - centerMs) <= bioForward && (t.getTime() - centerMs) >= -bioBack)
    .sort((a, b) => Math.abs(a.t.getTime() - centerMs) - Math.abs(b.t.getTime() - centerMs));
  const biology = bioCandidates[0]
    ? extractBiologyFromRow(bioCandidates[0].r)
    : { hrv: null, recovery: null, strain: null, sleep: null };

  // Music — avg valence/energy for rows in +/- 2h window
  const windowMs = WINDOW_HOURS * MS_PER_HOUR;
  const musicRows = bundle.music.filter(r => {
    const t = getEffectiveEventTime(r);
    return t && Math.abs(t.getTime() - centerMs) <= windowMs;
  });
  let musicValence = null;
  let musicEnergy = null;
  if (musicRows.length) {
    const vals = musicRows.map(extractMusicFromRow).filter(m => m.valence !== null);
    if (vals.length) {
      musicValence = vals.reduce((s, m) => s + m.valence, 0) / vals.length;
      const energies = vals.map(m => m.energy).filter(v => v !== null);
      if (energies.length) musicEnergy = energies.reduce((s, e) => s + e, 0) / energies.length;
    }
  }

  // Calendar load — events in +/- 2h (proximity) AND broader daily window
  const calendarLoad = bundle.calendar.filter(r => {
    const t = getEffectiveEventTime(r);
    return t && Math.abs(t.getTime() - centerMs) <= windowMs;
  }).length;
  // Broader 12h daily-stress window — captures "busy day before evening spend"
  const dailyCalendarLoad = bundle.calendar.filter(r => {
    const t = getEffectiveEventTime(r);
    return t && Math.abs(t.getTime() - centerMs) <= 12 * MS_PER_HOUR;
  }).length;

  // Composite stress score (same math as single-row path)
  let stressScore = null;
  let signalsFound = 0;
  const components = [];

  if (biology.recovery !== null) {
    components.push({ weight: 0.45, value: 1 - biology.recovery / 100 });
    signalsFound++;
  } else if (biology.hrv !== null) {
    const hrvStress = Math.max(0, Math.min(1, 1 - (biology.hrv - 20) / 80));
    components.push({ weight: 0.45, value: hrvStress });
    signalsFound++;
  }
  // Calendar: prefer proximity (+/- 2h) — if zero, use the broader 12h daily-load as a
  // lighter-weight fallback signal. 4+ events in 12h is meaningful daily stress.
  if (calendarLoad > 0) {
    components.push({ weight: 0.30, value: Math.min(1, calendarLoad / 3) });
    signalsFound++;
  } else if (dailyCalendarLoad >= 3) {
    components.push({ weight: 0.15, value: Math.min(1, (dailyCalendarLoad - 2) / 5) });
    signalsFound++;
  }
  if (musicValence !== null) {
    components.push({ weight: 0.25, value: 1 - musicValence });
    signalsFound++;
  }
  if (biology.sleep !== null) signalsFound++;

  if (components.length) {
    const totalWeight = components.reduce((s, c) => s + c.weight, 0);
    stressScore = components.reduce((s, c) => s + c.weight * c.value, 0) / totalWeight;
  }

  // Stress-shop gating (improved):
  //   - outflow (money going out)
  //   - stress score >= 0.6
  //   - category is DISCRETIONARY (food_delivery, shopping, streaming, entertainment)
  //     subscriptions like "Spotify Premium" with category=streaming are discretionary,
  //     but the amount band filters tiny recurring charges
  //   - amount in R$30-2000 band (ignore micro + large planned)
  //   - if streaming, require R$50+ to ignore Netflix/Spotify R$21-55 monthlies
  const isOutflow = tx.amount < 0;
  const absAmount = Math.abs(tx.amount);
  const category = tx.category || 'other';
  const discretionary = isDiscretionaryCategory(category);
  // Streaming (Netflix, Spotify, Disney+) is almost always a recurring subscription —
  // only flag if the charge is unusually large (R$100+) which would indicate a new/yearly plan.
  const minAmount = category === 'streaming' ? 100 : 30;

  // Recurring charges (subscriptions, habits, monthly bills) are NOT impulses —
  // they happen on schedule regardless of how stressed you were that day.
  // Renan feedback 2026-04-21: "separa o joio do trigo — o que é assinatura,
  // o que é recorrente" — a recurring bill correlating with a high-stress
  // day is coincidence, not causation.
  const isRecurring = tx.is_recurring === true;

  const isStressShop =
    isOutflow &&
    !isRecurring &&
    stressScore !== null &&
    stressScore >= 0.6 &&
    discretionary &&
    absAmount >= minAmount &&
    absAmount <= 2000;

  return {
    transaction_id: tx.id,
    user_id: userId,
    hrv_score: biology.hrv,
    recovery_score: biology.recovery,
    sleep_score: biology.sleep,
    strain_score: biology.strain,
    music_valence: musicValence,
    music_energy: musicEnergy,
    calendar_load: calendarLoad,
    message_tone: null,
    computed_stress_score: stressScore,
    is_stress_shop_candidate: isStressShop,
    signals_found: signalsFound,
    computed_at: new Date().toISOString(),
  };
}

/**
 * Tag a batch of transactions. Safe to run async after upload — never throws;
 * errors are logged and partial success is fine.
 *
 * Optimised: one prefetch query per data domain, then per-transaction compute
 * in memory. For 20 transactions we now hit the DB ~3 times instead of ~80.
 */
export async function tagTransactionsBatch(userId, transactionIds) {
  if (!transactionIds?.length) return { tagged: 0, errors: 0 };

  const { data: txns, error } = await supabaseAdmin
    .from('user_transactions')
    .select('id, transaction_date, amount, category, merchant_normalized, is_recurring')
    .eq('user_id', userId)
    .in('id', transactionIds);

  if (error) {
    log.warn(`fetch transactions failed: ${error.message}`);
    return { tagged: 0, errors: transactionIds.length };
  }

  const bundle = await prefetchPlatformDataForBatch(userId, txns || []);
  log.info(
    `prefetched for user ${userId}: bio=${bundle.biology.length} music=${bundle.music.length} cal=${bundle.calendar.length}`,
  );

  const rows = [];
  let errors = 0;
  for (const tx of txns || []) {
    try {
      const ctx = computeFromBundle(userId, tx, bundle);
      if (ctx) rows.push(ctx);
    } catch (err) {
      errors++;
      log.warn(`tag failed for ${tx.id}: ${err.message}`);
    }
  }

  let tagged = 0;
  if (rows.length) {
    const { error: upsertErr } = await supabaseAdmin
      .from('transaction_emotional_context')
      .upsert(rows, { onConflict: 'transaction_id' });

    if (upsertErr) {
      log.warn(`upsert emotional context failed: ${upsertErr.message}`);
      errors += rows.length;
    } else {
      tagged = rows.length;
    }
  }

  log.info(`tagged ${tagged}/${transactionIds.length} transactions (${errors} errors) for user ${userId}`);
  return { tagged, errors };
}
