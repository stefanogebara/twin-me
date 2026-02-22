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

// Lazy-load to avoid circular dependency
let supabaseAdmin = null;
async function getSupabase() {
  if (!supabaseAdmin) {
    const mod = await import('./database.js');
    supabaseAdmin = mod.supabaseAdmin;
  }
  return supabaseAdmin;
}

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
 */
async function getUserGoals(userId, statusFilter = null) {
  const supabase = await getSupabase();

  let query = supabase
    .from('twin_goals')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (statusFilter) {
    if (Array.isArray(statusFilter)) {
      query = query.in('status', statusFilter);
    } else {
      query = query.eq('status', statusFilter);
    }
  }

  const { data, error } = await query;

  if (error) {
    console.warn('[GoalTracking] getUserGoals error:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Get a single goal with its progress log.
 */
async function getGoalWithProgress(goalId, userId) {
  const supabase = await getSupabase();

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
  const supabase = await getSupabase();

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
    console.warn('[GoalTracking] acceptGoal error:', error.message);
    return { success: false, error: error.message };
  }

  console.log(`[GoalTracking] Goal accepted: "${data.title}" (${startDate} -> ${endDate})`);
  return { success: true, data };
}

/**
 * Abandon an active goal.
 */
async function abandonGoal(goalId, userId) {
  const supabase = await getSupabase();

  const { data, error } = await supabase
    .from('twin_goals')
    .update({ status: 'abandoned' })
    .eq('id', goalId)
    .eq('user_id', userId)
    .in('status', ['active', 'suggested'])
    .select()
    .single();

  if (error) {
    console.warn('[GoalTracking] abandonGoal error:', error.message);
    return { success: false, error: error.message };
  }

  return { success: true, data };
}

/**
 * Dismiss a suggested goal (not interested).
 */
async function dismissGoal(goalId, userId) {
  const supabase = await getSupabase();

  const { data, error } = await supabase
    .from('twin_goals')
    .update({ status: 'abandoned', metadata: { dismissed: true } })
    .eq('id', goalId)
    .eq('user_id', userId)
    .eq('status', 'suggested')
    .select()
    .single();

  if (error) {
    console.warn('[GoalTracking] dismissGoal error:', error.message);
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
  const supabase = await getSupabase();

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
      console.warn(`[GoalTracking] Unknown metric type: ${metricType}`);
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
    meeting_count: /(\d+)\s+(?:events?|meetings?)\s+(?:today|scheduled)/i,
  };

  const pattern = patterns[metricType];
  if (!pattern) return null;

  // Reasonable upper bounds per metric type to reject absurd regex matches
  const METRIC_BOUNDS = {
    sleep_hours: { min: 0, max: 24 },
    recovery_score: { min: 0, max: 100 },
    hrv: { min: 0, max: 300 },
    meeting_count: { min: 0, max: 50 },
  };

  for (const mem of recent) {
    const match = mem.content.match(pattern);
    if (match) {
      const value = parseFloat(match[1]);
      const bounds = METRIC_BOUNDS[metricType];
      if (!isNaN(value) && bounds && value >= bounds.min && value <= bounds.max) {
        console.log(`[GoalTracking] Extracted ${metricType}=${value} from memory: "${mem.content.substring(0, 60)}..."`);
        return value;
      }
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
    // Check cooldown
    const lastSuggestion = suggestionCooldowns.get(userId);
    if (lastSuggestion && (Date.now() - lastSuggestion) < SUGGESTION_COOLDOWN_MS) {
      return 0;
    }

    const supabase = await getSupabase();

    // Check pending suggestion count
    const { data: pending } = await supabase
      .from('twin_goals')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'suggested');

    if ((pending?.length || 0) >= MAX_PENDING_SUGGESTIONS) {
      return 0;
    }

    // Fetch recent memories for pattern detection
    const recentMemories = await getRecentMemories(userId, 50);
    if (recentMemories.length < 5) {
      console.log(`[GoalTracking] Not enough memories (${recentMemories.length}) for suggestions`);
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
      console.warn('[GoalTracking] Failed to parse suggestion response:', text.substring(0, 100));
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
        console.log(`[GoalTracking] Suggested goal: "${s.title}" (${s.metric_type})`);
      } else {
        console.warn('[GoalTracking] Failed to store suggestion:', error.message);
      }
    }

    // Set cooldown and prune expired entries to keep map size bounded
    suggestionCooldowns.set(userId, Date.now());
    pruneSuggestionCooldowns();

    console.log(`[GoalTracking] Generated ${stored} suggestions for user ${userId}`);
    return stored;
  } catch (error) {
    console.error('[GoalTracking] generateGoalSuggestions error:', error.message);
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
 * @param {object} platformData - Live platform data from twinContextBuilder format
 */
async function trackGoalProgress(userId, platformData) {
  try {
    const supabase = await getSupabase();
    const activeGoals = await getUserGoals(userId, 'active');

    if (activeGoals.length === 0) return 0;

    const today = new Date().toISOString().split('T')[0];
    let tracked = 0;

    for (const goal of activeGoals) {
      // Check if already tracked today
      const { data: existing } = await supabase
        .from('goal_progress_log')
        .select('id')
        .eq('goal_id', goal.id)
        .eq('tracked_date', today)
        .maybeSingle();

      if (existing) continue;

      // Extract metric from platform data, or fallback to recent memories
      let measuredValue = extractMetricFromPlatformData(goal.metric_type, platformData);
      if (measuredValue == null) {
        measuredValue = await extractMetricFromMemories(userId, goal.metric_type);
      }
      if (measuredValue == null) continue;

      const targetMet = evaluateTarget(measuredValue, goal.target_value, goal.target_operator);

      // Insert progress log
      const { error: insertErr } = await supabase
        .from('goal_progress_log')
        .insert({
          goal_id: goal.id,
          user_id: userId,
          tracked_date: today,
          measured_value: measuredValue,
          target_met: targetMet,
          source_data: { metric_type: goal.metric_type, platform: goal.source_platform },
        });

      if (insertErr) {
        console.warn(`[GoalTracking] Progress insert error for goal ${goal.id}:`, insertErr.message);
        continue;
      }

      // Update streak counters
      const newStreak = targetMet ? (goal.current_streak || 0) + 1 : 0;
      const newBestStreak = Math.max(newStreak, goal.best_streak || 0);
      const newTotalTracked = (goal.total_days_tracked || 0) + 1;
      const newTotalMet = (goal.total_days_met || 0) + (targetMet ? 1 : 0);

      // Check for completion
      let newStatus = goal.status;
      const isCompleted = goal.end_date && today >= goal.end_date;
      const streakCompleted = newStreak >= (goal.duration_days || 14);

      if (isCompleted || streakCompleted) {
        const successRate = newTotalTracked > 0 ? newTotalMet / newTotalTracked : 0;
        newStatus = successRate >= 0.7 ? 'completed' : 'expired';
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
        })
        .eq('id', goal.id);

      if (updateErr) {
        console.warn(`[GoalTracking] Goal update error for ${goal.id}:`, updateErr.message);
      }

      tracked++;

      if (newStatus === 'completed') {
        console.log(`[GoalTracking] Goal completed! "${goal.title}" (streak: ${newStreak}, best: ${newBestStreak})`);
      }
    }

    if (tracked > 0) {
      console.log(`[GoalTracking] Tracked progress for ${tracked}/${activeGoals.length} goals for user ${userId}`);
    }

    return tracked;
  } catch (error) {
    console.error('[GoalTracking] trackGoalProgress error:', error.message);
    return 0;
  }
}

// ====================================================================
// Exports
// ====================================================================

export {
  getUserGoals,
  getGoalWithProgress,
  acceptGoal,
  abandonGoal,
  dismissGoal,
  getActiveGoalContext,
  getGoalSummary,
  extractMetricFromPlatformData,
  evaluateTarget,
  generateGoalSuggestions,
  trackGoalProgress,
};
