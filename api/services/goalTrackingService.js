/**
 * Goal Tracking Service
 * =====================
 * Twin-driven goal system where the twin observes platform data patterns
 * and suggests achievable goals. Once accepted, progress is auto-tracked
 * from platform data and the twin weaves accountability into conversations.
 *
 * Architecture:
 *   1. Observation ingestion runs -> platform data arrives
 *   2. generateGoalSuggestions() analyzes recent patterns
 *   3. Twin suggests goals conversationally (status='suggested')
 *   4. User accepts -> status='active', dates set
 *   5. trackGoalProgress() auto-tracks from platform data each ingestion
 *   6. Twin chat includes goal context for natural accountability
 *   7. On completion -> celebration insight generated
 *
 * Metric Types:
 *   sleep_hours    (Whoop) - totalSleepMs / 3600000
 *   recovery_score (Whoop) - recovery.score (0-100)
 *   hrv            (Whoop) - recovery.hrv_rmssd_milli
 *   meeting_count  (Calendar) - Count today's events
 *   focus_time     (Calendar) - Unbooked hours 9am-6pm
 *   listening_hours (Spotify) - Sum recent track durations
 */

import { complete, TIER_ANALYSIS } from './llmGateway.js';
import { getRecentMemories, retrieveMemories } from './memoryStreamService.js';
import { supabaseAdmin } from './database.js';

import { createLogger } from './logger.js';

const log = createLogger('GoalTracking');

// Throttle: max once per 24 hours per user
const suggestionCooldowns = new Map();
const SUGGESTION_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MAX_PENDING_SUGGESTIONS = 2;

// Prune expired cooldown entries to prevent unbounded map growth in long-running servers
function pruneSuggestionCooldowns() {
  const now = Date.now();
  for (const [uid, ts] of suggestionCooldowns) {
    if (now - ts >= SUGGESTION_COOLDOWN_MS) {
      suggestionCooldowns.delete(uid);
    }
  }
}

// ====================================================================
// Core CRUD Operations
// ====================================================================

/**
 * Get goals for a user, optionally filtered by status.
 * @param {string} userId
 * @param {string|string[]|null} statusFilter
 * @param {{ limit?: number, offset?: number }|undefined} pagination - When provided,
 *   returns `{ data, total }` instead of a plain array (backward compatible).
 */
async function getUserGoals(userId, statusFilter = null, pagination) {
  const supabase = supabaseAdmin;
  const paginated = pagination && typeof pagination.limit === 'number';

  let query = supabase
    .from('twin_goals')
    .select('*', paginated ? { count: 'exact' } : undefined)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (statusFilter) {
    if (Array.isArray(statusFilter)) {
      query = query.in('status', statusFilter);
    } else {
      query = query.eq('status', statusFilter);
    }
  }

  if (paginated) {
    query = query.range(pagination.offset, pagination.offset + pagination.limit - 1);
  }

  const { data, count, error } = await query;

  if (error) {
    log.warn('getUserGoals error', { error });
    return paginated ? { data: [], total: 0 } : [];
  }

  return paginated ? { data: data || [], total: count || 0 } : (data || []);
}

/**
 * Get a single goal with its progress log.
 */
async function getGoalWithProgress(goalId, userId) {
  const supabase = supabaseAdmin;

  const [goalResult, progressResult] = await Promise.all([
    supabase
      .from('twin_goals')
      .select('*')
      .eq('id', goalId)
      .eq('user_id', userId)
      .single(),
    supabase
      .from('goal_progress_log')
      .select('*')
      .eq('goal_id', goalId)
      .eq('user_id', userId)
      .order('tracked_date', { ascending: false })
      .limit(60),
  ]);

  if (goalResult.error || !goalResult.data) {
    return null;
  }

  return {
    ...goalResult.data,
    progress: progressResult.data || [],
  };
}

/**
 * Accept a suggested goal -> active.
 */
async function acceptGoal(goalId, userId) {
  const supabase = supabaseAdmin;

  const now = new Date();
  const startDate = now.toISOString().split('T')[0];

  // Fetch the goal to get duration_days
  const { data: goal, error: fetchErr } = await supabase
    .from('twin_goals')
    .select('duration_days, status')
    .eq('id', goalId)
    .eq('user_id', userId)
    .single();

  if (fetchErr || !goal) {
    return { success: false, error: 'Goal not found' };
  }

  if (goal.status !== 'suggested') {
    return { success: false, error: `Cannot accept a goal with status '${goal.status}'` };
  }

  // Clamp duration_days: must be a positive integer, max 365 days
  const rawDays = Number(goal.duration_days);
  const durationDays = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(Math.round(rawDays), 365) : 14;
  const endDate = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('twin_goals')
    .update({
      status: 'active',
      start_date: startDate,
      end_date: endDate,
    })
    .eq('id', goalId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    log.warn('acceptGoal error', { error });
    return { success: false, error: error.message };
  }

  log.info('Goal accepted', { title: data.title, startDate, endDate });
  return { success: true, data };
}

/**
 * Abandon an active goal.
 */
async function abandonGoal(goalId, userId) {
  const supabase = supabaseAdmin;

  const { data, error } = await supabase
    .from('twin_goals')
    .update({ status: 'abandoned' })
    .eq('id', goalId)
    .eq('user_id', userId)
    .in('status', ['active', 'suggested'])
    .select()
    .single();

  if (error) {
    log.warn('abandonGoal error', { error });
    return { success: false, error: error.message };
  }

  return { success: true, data };
}

/**
 * Dismiss a suggested goal (not interested).
 */
async function dismissGoal(goalId, userId) {
  const supabase = supabaseAdmin;

  // Fetch current metadata first to avoid overwriting existing fields
  const { data: existing, error: fetchError } = await supabase
    .from('twin_goals')
    .select('metadata')
    .eq('id', goalId)
    .eq('user_id', userId)
    .single();

  if (fetchError) {
    log.warn('dismissGoal fetch error', { error: fetchError });
    return { success: false, error: fetchError.message };
  }

  const mergedMetadata = { ...(existing?.metadata || {}), dismissed: true, dismissedAt: new Date().toISOString() };

  const { data, error } = await supabase
    .from('twin_goals')
    .update({ status: 'abandoned', metadata: mergedMetadata })
    .eq('id', goalId)
    .eq('user_id', userId)
    .eq('status', 'suggested')
    .select()
    .single();

  if (error) {
    log.warn('dismissGoal error', { error });
    return { success: false, error: error.message };
  }

  return { success: true, data };
}

/**
 * Get formatted active goal context for twin chat system prompt.
 * Returns a string to inject into the twin's context.
 */
async function getActiveGoalContext(userId) {
  const goals = await getUserGoals(userId, 'active');

  if (goals.length === 0) return null;

  const lines = goals.map(g => {
    const successRate = g.total_days_tracked > 0
      ? Math.round((g.total_days_met / g.total_days_tracked) * 100)
      : 0;
    const daysLeft = g.end_date
      ? Math.max(0, Math.ceil((new Date(g.end_date) - new Date()) / (24 * 60 * 60 * 1000)))
      : '?';

    return `- "${g.title}" (${g.category}): streak ${g.current_streak}d, ` +
      `best ${g.best_streak}d, ${successRate}% success, ${daysLeft} days left`;
  });

  return `ACTIVE GOALS (reference naturally, celebrate streaks, be supportive not nagging):\n${lines.join('\n')}`;
}

/**
 * Get a summary of all goals for dashboard display.
 */
async function getGoalSummary(userId) {
  const supabase = supabaseAdmin;

  const { data: goals, error } = await supabase
    .from('twin_goals')
    .select('status, current_streak, best_streak, total_days_met, total_days_tracked, category')
    .eq('user_id', userId);

  if (error || !goals) return { active: 0, suggested: 0, completed: 0, bestStreak: 0 };

  const active = goals.filter(g => g.status === 'active');
  const suggested = goals.filter(g => g.status === 'suggested');
  const completed = goals.filter(g => g.status === 'completed');

  const bestStreak = goals.reduce((max, g) => Math.max(max, g.best_streak || 0), 0);

  return {
    active: active.length,
    suggested: suggested.length,
    completed: completed.length,
    bestStreak,
    categories: [...new Set(active.map(g => g.category))],
  };
}

// ====================================================================
// Platform-to-Metric Extraction
// ====================================================================

/**
 * Fetch structured platform data from `user_platform_data` table.
 * Builds the shape expected by extractMetricFromPlatformData():
 *   { whoop: { sleepHours, recovery, hrv }, calendar: { todayEvents }, spotify: { recentTracks } }
 *
 * This is the bridge between the raw data stored by observation ingestion
 * (storeWhoopPlatformData, etc.) and the goal metric extraction logic.
 */
async function fetchStructuredPlatformData(userId) {
  const supabase = supabaseAdmin;
  if (!supabase) return null;

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Fetch today's (or yesterday's) Whoop + Calendar data in one query
  const { data: rows, error } = await supabase
    .from('user_platform_data')
    .select('platform, data_type, raw_data, source_url')
    .eq('user_id', userId)
    .in('platform', ['whoop', 'google_calendar', 'calendar'])
    .order('created_at', { ascending: false })
    .limit(20);

  if (error || !rows || rows.length === 0) return null;

  const result = { whoop: {}, calendar: {}, spotify: {} };

  for (const row of rows) {
    const src = row.source_url || '';

    // Whoop recovery — prefer today's, fall back to yesterday's
    if (row.platform === 'whoop' && row.data_type === 'recovery') {
      if (src.includes(today) || src.includes(yesterday) || !result.whoop.recovery) {
        const raw = row.raw_data || {};
        if (raw.recovery_score != null) result.whoop.recovery = raw.recovery_score;
        if (raw.hrv_rmssd_milli != null) result.whoop.hrv = Math.round(raw.hrv_rmssd_milli);
      }
    }

    // Whoop sleep
    if (row.platform === 'whoop' && row.data_type === 'sleep') {
      if (src.includes(today) || src.includes(yesterday) || !result.whoop.sleepHours) {
        const raw = row.raw_data || {};
        if (raw.total_sleep_hours != null) result.whoop.sleepHours = raw.total_sleep_hours;
      }
    }

    // Calendar events — use latest row (today's events are stored as data_type='events')
    if ((row.platform === 'google_calendar' || row.platform === 'calendar') && row.data_type === 'events') {
      if (!result.calendar.todayEvents) {
        const raw = row.raw_data || {};
        const items = raw.items || [];
        // Map to the shape extractMetricFromPlatformData expects: { start, end }
        result.calendar.todayEvents = items.map(e => ({
          start: e.start?.dateTime || e.start?.date,
          end: e.end?.dateTime || e.end?.date,
          summary: e.summary,
        }));
      }
    }
  }

  // Only return if we found something useful
  const hasWhoop = result.whoop.recovery != null || result.whoop.sleepHours != null || result.whoop.hrv != null;
  const hasCalendar = result.calendar.todayEvents != null;
  if (!hasWhoop && !hasCalendar) return null;

  log.info('Fetched structured platform data', {
    userId,
    hasWhoop,
    hasCalendar,
    whoopRecovery: result.whoop.recovery,
    whoopSleep: result.whoop.sleepHours,
    calendarEvents: result.calendar.todayEvents?.length,
  });

  return result;
}

/**
 * Extract a metric value from platform data.
 * Platform data comes from twinContextBuilder's _fetchPlatformData format.
 */
function extractMetricFromPlatformData(metricType, platformData) {
  if (!platformData) return null;

  switch (metricType) {
    case 'sleep_hours': {
      const sleepHours = platformData.whoop?.sleepHours;
      return sleepHours ? parseFloat(sleepHours) : null;
    }

    case 'recovery_score': {
      const recovery = platformData.whoop?.recovery;
      return recovery != null ? Number(recovery) : null;
    }

    case 'hrv': {
      const hrv = platformData.whoop?.hrv;
      return hrv != null ? Number(hrv) : null;
    }

    case 'meeting_count': {
      const events = platformData.calendar?.todayEvents;
      return events ? events.length : null;
    }

    case 'focus_time': {
      // Estimate unbooked hours between 9am-6pm (9 total hours)
      const events = platformData.calendar?.todayEvents;
      if (!events) return null;
      const meetingHours = events.reduce((sum, e) => {
        if (!e.start) return sum;
        const start = new Date(e.start);
        if (isNaN(start.getTime())) return sum; // skip events with invalid start dates
        const end = e.end ? new Date(e.end) : new Date(start.getTime() + 60 * 60 * 1000);
        if (isNaN(end.getTime())) return sum; // skip events with invalid end dates
        const hours = (end - start) / (60 * 60 * 1000);
        return sum + (hours > 0 ? hours : 0); // guard against negative durations
      }, 0);
      return Math.max(0, 9 - meetingHours);
    }

    case 'listening_hours': {
      const tracks = platformData.spotify?.recentTracks;
      if (!tracks || tracks.length === 0) return null;
      // Estimate: average track ~3.5 minutes
      return (tracks.length * 3.5) / 60;
    }

    default:
      log.warn('Unknown metric type', { metricType });
      return null;
  }
}

/**
 * Fallback: extract a metric from recent memory stream observations.
 * Used when trackGoalProgress is called without pre-fetched platform data
 * (e.g., from observation ingestion which passes null).
 *
 * Scans recent platform_data memories for regex-extractable values like:
 *   "Slept 8.2h" -> sleep_hours = 8.2
 *   "Recovery score: 82%" -> recovery_score = 82
 *   "HRV: 154ms" -> hrv = 154
 */
async function extractMetricFromMemories(userId, metricType) {
  // Fetch enough memories to find platform_data (reflections dominate recent stream)
  const recentMemories = await getRecentMemories(userId, 200);
  const platformMemories = recentMemories.filter(m => m.memory_type === 'platform_data' || m.memory_type === 'observation');

  // Consider memories from the last 36 hours (wider window than cron interval to avoid gaps)
  const windowMs = 36 * 60 * 60 * 1000;
  const recent = platformMemories.filter(m => new Date(m.created_at).getTime() > Date.now() - windowMs);

  const patterns = {
    sleep_hours: /[Ss]lept?\s+([\d.]+)\s*h/,
    recovery_score: /[Rr]ecovery\s+(?:score:?\s*)?([\d.]+)\s*%/,
    hrv: /HRV:?\s*([\d.]+)\s*ms/i,
    // Match "Calendar schedule today: 2 events" (primary ingestion format)
    // or "N meetings today/scheduled" (legacy format)
    meeting_count: /(?:Calendar schedule today:\s*(\d+)\s+events?|(\d+)\s+(?:events?|meetings?)\s+(?:today|scheduled))/i,
    listening_hours: /([\d.]+)\s*h(?:ours?)?\s+(?:of\s+)?listening/i,
    focus_time: /([\d.]+)\s*h(?:ours?)?\s+(?:focused|focus|deep\s+work|unbooked)/i,
  };

  const pattern = patterns[metricType];
  if (!pattern) return null;

  // Reasonable upper bounds per metric type to reject absurd regex matches
  const METRIC_BOUNDS = {
    sleep_hours: { min: 0, max: 24 },
    recovery_score: { min: 0, max: 100 },
    hrv: { min: 0, max: 300 },
    meeting_count: { min: 0, max: 50 },
    listening_hours: { min: 0, max: 24 },
    focus_time: { min: 0, max: 24 },
  };

  for (const mem of recent) {
    const match = mem.content.match(pattern);
    if (match) {
      // Some patterns use alternation with multiple capture groups (e.g. meeting_count).
      // Pick the first non-undefined group.
      const rawValue = match[1] || match[2];
      const value = parseFloat(rawValue);
      const bounds = METRIC_BOUNDS[metricType];
      if (!isNaN(value) && bounds && value >= bounds.min && value <= bounds.max) {
        log.info('Extracted metric from memory', { metricType, value, memoryPreview: mem.content.substring(0, 60) });
        return value;
      }
    }

    // Special cases that regex numeric patterns miss:
    // "Calendar schedule today: no meetings or events" -> meeting_count = 0
    if (metricType === 'meeting_count' && /no meetings or events/i.test(mem.content)) {
      log.info('Extracted metric from memory', { metricType, value: 0, memoryPreview: mem.content.substring(0, 60) });
      return 0;
    }
    // "completely open day" or "Free afternoon" -> focus_time = 9 (full 9am-6pm block)
    if (metricType === 'focus_time' && /completely open day/i.test(mem.content)) {
      log.info('Extracted metric from memory', { metricType, value: 9, memoryPreview: mem.content.substring(0, 60) });
      return 9;
    }
  }

  return null;
}

/**
 * Check if a measured value meets the target.
 */
function evaluateTarget(measuredValue, targetValue, operator) {
  if (measuredValue == null || targetValue == null) return false;

  switch (operator) {
    case '>=': return measuredValue >= targetValue;
    case '<=': return measuredValue <= targetValue;
    case '>': return measuredValue > targetValue;
    case '<': return measuredValue < targetValue;
    case '=': return measuredValue === targetValue;
    default: return measuredValue >= targetValue;
  }
}

// ====================================================================
// Goal Suggestion Engine (Phase 2)
// ====================================================================

const GOAL_SUGGESTION_PROMPT = `You are analyzing a person's recent platform data patterns to suggest 1-2 achievable goals their digital twin should propose.

Available metrics you can target:
- sleep_hours (from Whoop) - hours of sleep, target operator >=
- recovery_score (from Whoop) - 0-100 percentage, target operator >=
- hrv (from Whoop) - HRV in milliseconds, target operator >=
- meeting_count (from Calendar) - number of meetings per day, target operator <=
- focus_time (from Calendar) - unbooked hours 9am-6pm, target operator >=

Categories: sleep, fitness, focus, schedule, balance

Recent observations about this person:
{observations}

Their existing active goals (avoid duplicates):
{existingGoals}

Generate 1-2 goal suggestions as a JSON array. Each goal should be:
- Based on a REAL pattern you see in the data
- Achievable (not too ambitious)
- 14-day duration default
- Written conversationally as the twin would suggest it

Return JSON array only:
[{
  "title": "Sleep 7+ hours for 2 weeks",
  "description": "I noticed your sleep has been averaging around 6 hours lately. What if we tried to get it up to 7? I'll track it from your Whoop data.",
  "category": "sleep",
  "source_platform": "whoop",
  "source_observation": "Average sleep 6.2 hours over past week",
  "metric_type": "sleep_hours",
  "target_value": 7.0,
  "target_operator": ">=",
  "target_unit": "hours",
  "duration_days": 14
}]`;

/**
 * Generate goal suggestions for a user based on recent platform data.
 * Called after observation ingestion. Throttled to once per 24 hours.
 */
async function generateGoalSuggestions(userId) {
  try {
    // Prune expired cooldown entries to prevent unbounded map growth
    pruneSuggestionCooldowns();

    // Check cooldown
    const lastSuggestion = suggestionCooldowns.get(userId);
    if (lastSuggestion && (Date.now() - lastSuggestion) < SUGGESTION_COOLDOWN_MS) {
      return 0;
    }

    const supabase = supabaseAdmin;

    // Check pending suggestion count
    const { data: pending, error: pendingErr } = await supabase
      .from('twin_goals')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'suggested');

    if (pendingErr) {
      log.warn('Failed to check pending suggestions', { error: pendingErr });
      return 0;
    }

    if ((pending?.length || 0) >= MAX_PENDING_SUGGESTIONS) {
      return 0;
    }

    // Fetch recent memories for pattern detection
    const recentMemories = await getRecentMemories(userId, 50);
    if (recentMemories.length < 5) {
      log.info('Not enough memories for suggestions', { count: recentMemories.length });
      return 0;
    }

    // Fetch existing active goals to avoid duplicates
    const activeGoals = await getUserGoals(userId, ['active', 'suggested']);
    const existingGoalText = activeGoals.length > 0
      ? activeGoals.map(g => `- ${g.title} (${g.metric_type})`).join('\n')
      : 'None';

    // Format observations
    const observations = recentMemories
      .filter(m => m.memory_type !== 'reflection')
      .slice(0, 25)
      .map(m => `- ${m.content.substring(0, 200)}`)
      .join('\n');

    // Generate via LLM
    const result = await complete({
      tier: TIER_ANALYSIS,
      messages: [{
        role: 'user',
        content: GOAL_SUGGESTION_PROMPT
          .replace('{observations}', observations)
          .replace('{existingGoals}', existingGoalText),
      }],
      maxTokens: 600,
      temperature: 0.5,
      serviceName: 'goalTracking-suggest',
    });

    const text = (result.content || '').trim();

    // Parse JSON response
    let suggestions;
    try {
      const jsonStr = text.replace(/^```json?\s*\n?/, '').replace(/\n?```\s*$/, '');
      suggestions = JSON.parse(jsonStr);
    } catch (parseError) {
      log.warn('Failed to parse suggestion response', { rawPreview: text.substring(0, 100) });
      return 0;
    }

    if (!Array.isArray(suggestions) || suggestions.length === 0) {
      return 0;
    }

    // Store suggestions (max 2)
    let stored = 0;
    for (const s of suggestions.slice(0, 2)) {
      if (!s.title || !s.metric_type) continue;

      // Check for duplicate metric_type among active/suggested goals
      const isDuplicate = activeGoals.some(g => g.metric_type === s.metric_type);
      if (isDuplicate) continue;

      const { error } = await supabase
        .from('twin_goals')
        .insert({
          user_id: userId,
          title: s.title.substring(0, 200),
          description: s.description?.substring(0, 500) || null,
          category: s.category || 'balance',
          source_platform: s.source_platform || null,
          source_observation: s.source_observation?.substring(0, 300) || null,
          metric_type: s.metric_type,
          target_value: s.target_value || null,
          target_operator: s.target_operator || '>=',
          target_unit: s.target_unit || null,
          duration_days: s.duration_days || 14,
          status: 'suggested',
        });

      if (!error) {
        stored++;
        log.info('Suggested goal', { title: s.title, metricType: s.metric_type });
      } else {
        log.warn('Failed to store suggestion', { error });
      }
    }

    // Set cooldown and prune expired entries to keep map size bounded
    suggestionCooldowns.set(userId, Date.now());
    pruneSuggestionCooldowns();

    log.info('Generated suggestions', { stored, userId });
    return stored;
  } catch (error) {
    log.error('generateGoalSuggestions error', { error });
    return 0;
  }
}

// ====================================================================
// Auto-Progress Tracking (Phase 3)
// ====================================================================

/**
 * Track progress for all active goals of a user.
 * Called during observation ingestion after platform data is fetched.
 *
 * @param {string} userId
 * @param {object|null} platformData - Live platform data from twinContextBuilder format.
 *   When null (e.g. called from observation ingestion), auto-fetches from user_platform_data table.
 */
async function trackGoalProgress(userId, platformData) {
  try {
    const supabase = supabaseAdmin;
    const activeGoals = await getUserGoals(userId, 'active');

    if (activeGoals.length === 0) return 0;

    // Auto-fetch structured data from DB when caller passes null
    const resolvedPlatformData = platformData || await fetchStructuredPlatformData(userId);

    const today = new Date().toISOString().split('T')[0];
    let tracked = 0;

    // Batch-check which goals are already tracked today (avoids N+1 query per goal)
    const goalIds = activeGoals.map(g => g.id);
    const { data: existingLogs, error: existingLogsErr } = await supabase
      .from('goal_progress_log')
      .select('goal_id')
      .in('goal_id', goalIds)
      .eq('tracked_date', today);
    if (existingLogsErr) log.warn('Error fetching existing logs', { error: existingLogsErr });
    const alreadyTracked = new Set((existingLogs || []).map(l => l.goal_id));

    for (const goal of activeGoals) {
      if (alreadyTracked.has(goal.id)) continue;

      // Extract metric from platform data, or fallback to recent memories
      let measuredValue = extractMetricFromPlatformData(goal.metric_type, resolvedPlatformData);
      if (measuredValue == null) {
        measuredValue = await extractMetricFromMemories(userId, goal.metric_type);
      }
      if (measuredValue == null) continue;

      const targetMet = evaluateTarget(measuredValue, goal.target_value, goal.target_operator);

      // Upsert progress log — UNIQUE(goal_id, tracked_date) so concurrent ingestions silently skip
      const { error: insertErr } = await supabase
        .from('goal_progress_log')
        .upsert({
          goal_id: goal.id,
          user_id: userId,
          tracked_date: today,
          measured_value: measuredValue,
          target_met: targetMet,
          source_data: { metric_type: goal.metric_type, platform: goal.source_platform },
        }, { onConflict: 'goal_id,tracked_date', ignoreDuplicates: true });

      if (insertErr) {
        log.warn('Progress upsert error', { goalId: goal.id, error: insertErr });
        continue;
      }

      // Update streak counters — grace_days=1 means one miss doesn't reset to 0
      const GRACE_DAYS = 1;
      const consecutiveMisses = (goal.metadata?.consecutive_misses ?? 0);
      let newStreak;
      let newConsecutiveMisses;
      if (targetMet) {
        newStreak = (goal.current_streak || 0) + 1;
        newConsecutiveMisses = 0;
      } else if (consecutiveMisses < GRACE_DAYS) {
        // Within grace window — preserve streak, increment miss counter
        newStreak = goal.current_streak || 0;
        newConsecutiveMisses = consecutiveMisses + 1;
      } else {
        // Grace exhausted — reset
        newStreak = 0;
        newConsecutiveMisses = 0;
      }
      const newBestStreak = Math.max(newStreak, goal.best_streak || 0);
      const newTotalTracked = (goal.total_days_tracked || 0) + 1;
      const newTotalMet = (goal.total_days_met || 0) + (targetMet ? 1 : 0);

      // Check for completion
      let newStatus = goal.status;
      const isCompleted = goal.end_date && today >= goal.end_date;
      const streakCompleted = newStreak >= (goal.duration_days || 14);

      if (isCompleted || streakCompleted) {
        const successRate = newTotalTracked > 0 ? newTotalMet / newTotalTracked : 0;
        // 60% success = completed (was 70% — too harsh, caused near-misses like 67% to expire)
        newStatus = successRate >= 0.6 ? 'completed' : 'expired';
      }

      const { error: updateErr } = await supabase
        .from('twin_goals')
        .update({
          current_streak: newStreak,
          best_streak: newBestStreak,
          total_days_tracked: newTotalTracked,
          total_days_met: newTotalMet,
          last_progress_check: new Date().toISOString(),
          status: newStatus,
          celebration_delivered: newStatus === 'completed' ? false : goal.celebration_delivered,
          metadata: { ...(goal.metadata ?? {}), consecutive_misses: newConsecutiveMisses },
        })
        .eq('id', goal.id);

      if (updateErr) {
        log.warn('Goal update error', { goalId: goal.id, error: updateErr });
      }

      tracked++;

      if (newStatus === 'completed') {
        log.info('Goal completed', { title: goal.title, streak: newStreak, bestStreak: newBestStreak });
      }
    }

    if (tracked > 0) {
      log.info('Tracked progress', { tracked, totalGoals: activeGoals.length, userId });
    }

    return tracked;
  } catch (error) {
    log.error('trackGoalProgress error', { error });
    return 0;
  }
}

// ====================================================================
// Exports
// ====================================================================

/**
 * Create a manual goal (status: active, no metric tracking).
 */
async function createManualGoal(userId, title, description) {
  const supabase = supabaseAdmin;

  const now = new Date();
  const startDate = now.toISOString().split('T')[0];
  const endDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('twin_goals')
    .insert({
      user_id: userId,
      title: title.substring(0, 200),
      description: description?.substring(0, 500) || null,
      category: 'balance',
      metric_type: 'manual',
      status: 'active',
      start_date: startDate,
      end_date: endDate,
      duration_days: 30,
    })
    .select()
    .single();

  if (error) {
    log.warn('createManualGoal error', { error });
    return { success: false, error: error.message };
  }

  log.info('Manual goal created', { title: data.title });
  return { success: true, data };
}

/**
 * Mark an active goal as completed.
 */
async function completeGoal(goalId, userId) {
  const supabase = supabaseAdmin;

  const { data: goal, error: fetchErr } = await supabase
    .from('twin_goals')
    .select('status')
    .eq('id', goalId)
    .eq('user_id', userId)
    .single();

  if (fetchErr || !goal) {
    return { success: false, error: 'Goal not found' };
  }

  if (goal.status !== 'active') {
    return { success: false, error: `Cannot complete a goal with status '${goal.status}'` };
  }

  const { data, error } = await supabase
    .from('twin_goals')
    .update({ status: 'completed' })
    .eq('id', goalId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    log.warn('completeGoal error', { error });
    return { success: false, error: error.message };
  }

  log.info('Goal completed', { goalId });
  return { success: true, data };
}

export {
  getUserGoals,
  getGoalWithProgress,
  acceptGoal,
  abandonGoal,
  dismissGoal,
  createManualGoal,
  completeGoal,
  getActiveGoalContext,
  getGoalSummary,
  extractMetricFromPlatformData,
  evaluateTarget,
  generateGoalSuggestions,
  trackGoalProgress,
};
