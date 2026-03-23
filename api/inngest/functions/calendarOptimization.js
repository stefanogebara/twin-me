/**
 * Inngest Function: Calendar Optimization
 * =========================================
 * Detects when user has low recovery + packed calendar and suggests
 * rescheduling non-critical meetings to protect energy.
 *
 * Trigger: twin/skill.calendar_optimization (from cron or manual)
 * Cooldown: 24 hours
 * Cost: ~$0.002 per suggestion (TIER_EXTRACTION)
 */

import { inngest, EVENTS } from '../../services/inngestClient.js';
import { complete, TIER_EXTRACTION } from '../../services/llmGateway.js';
import { getBlocks } from '../../services/coreMemoryService.js';
import { normalizeHealthScore } from '../../services/moodAssessmentService.js';
import { deliverInsight } from '../../services/messageRouter.js';
import { logAgentAction } from '../../services/autonomyService.js';
import { isInsightDuplicate } from '../../services/proactiveInsights.js';
import { supabaseAdmin } from '../../services/database.js';
import { createLogger } from '../../services/logger.js';

const log = createLogger('CalendarOptimization');

const COOLDOWN_HOURS = 24;
const HEALTH_PROVIDERS = ['whoop', 'oura', 'garmin', 'fitbit', 'strava'];
const CALENDAR_PROVIDERS = ['google_calendar', 'outlook'];
const MIN_EVENT_THRESHOLD = 3;
const MAX_RECOVERY_SCORE = 50;

export const calendarOptimizationFunction = inngest.createFunction(
  {
    id: 'calendar-optimization',
    name: 'Calendar Optimization',
    retries: 1,
    concurrency: { limit: 1, key: 'event.data.userId' },
  },
  { event: EVENTS.CALENDAR_OPTIMIZATION },
  async ({ event, step }) => {
    const { userId } = event.data;

    // Step 1: Hard cooldown — check proactive_insights for calendar_optimization within 24h
    const shouldSkip = await step.run('hard-cooldown-check', async () => {
      const cutoff = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();
      const { count } = await supabaseAdmin
        .from('proactive_insights')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('category', 'calendar_optimization')
        .gte('created_at', cutoff);
      return (count || 0) > 0;
    });

    if (shouldSkip) {
      return { success: false, reason: 'cooldown', message: `Calendar optimization insight exists within last ${COOLDOWN_HOURS}h` };
    }

    // Step 2: Gather health data from ANY connected health platform (fallback chain)
    const healthResult = await step.run('gather-health', async () => {
      for (const provider of HEALTH_PROVIDERS) {
        try {
          const { data } = await supabaseAdmin
            .from('platform_data')
            .select('raw_data')
            .eq('user_id', userId)
            .eq('provider', provider)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          if (data?.raw_data) return { provider, data: data.raw_data };
        } catch { /* try next */ }
      }
      return { provider: null, data: null };
    });

    // Step 3: Gather calendar events from ANY connected calendar platform
    const calendarResult = await step.run('gather-calendar', async () => {
      for (const provider of CALENDAR_PROVIDERS) {
        try {
          const { data } = await supabaseAdmin
            .from('platform_data')
            .select('raw_data')
            .eq('user_id', userId)
            .eq('provider', provider)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          if (data?.raw_data) return { provider, data: data.raw_data };
        } catch { /* try next */ }
      }
      return { provider: null, data: null };
    });

    // Step 4: Evaluate energy — need both health AND calendar data
    const evaluation = await step.run('evaluate-energy', async () => {
      if (!healthResult.data) {
        return { skip: true, reason: 'no_health_data' };
      }
      if (!calendarResult.data) {
        return { skip: true, reason: 'no_calendar_data' };
      }

      // Extract health signals (same pattern as intelligentTriggers.js)
      const healthSignals = extractHealthSignals(healthResult.data);
      const health = normalizeHealthScore(healthSignals);

      if (health.score == null) {
        return { skip: true, reason: 'no_health_score' };
      }

      // Extract calendar events
      const calendarRaw = calendarResult.data;
      const events = calendarRaw.items || calendarRaw.events || (Array.isArray(calendarRaw) ? calendarRaw : []);
      const eventCount = events.length;

      // Gate: recovery >= 50 means user is fine, skip
      if (health.score >= MAX_RECOVERY_SCORE) {
        return { skip: true, reason: 'recovery_adequate', score: health.score };
      }

      // Gate: fewer than MIN_EVENT_THRESHOLD events means calendar is light, skip
      if (eventCount < MIN_EVENT_THRESHOLD) {
        return { skip: true, reason: 'calendar_light', eventCount };
      }

      return {
        skip: false,
        healthScore: health.score,
        healthLabel: health.label,
        healthSource: health.source,
        healthProvider: healthResult.provider,
        calendarProvider: calendarResult.provider,
        events,
        eventCount,
      };
    });

    if (evaluation.skip) {
      // Log the check even when skipped
      await step.run('log-skip', async () => {
        await supabaseAdmin.from('agent_events').insert({
          user_id: userId,
          event_type: 'calendar_optimization_checked',
          event_data: { skipped: true, reason: evaluation.reason, score: evaluation.score, eventCount: evaluation.eventCount },
          source: 'calendar_optimization',
        });
      });
      return { success: false, reason: evaluation.reason };
    }

    // Step 5: Identify moveable meetings via LLM
    const moveableMeetings = await step.run('identify-moveable', async () => {
      const coreBlocks = await getBlocks(userId);
      const soul = (coreBlocks.soul_signature?.content || '').slice(0, 400);
      const goalsBlock = (coreBlocks.goals?.content || '').slice(0, 300);

      const eventList = evaluation.events.slice(0, 10).map(e => {
        const title = e.summary || e.title || e.name || 'Untitled';
        const start = e.start?.dateTime || e.start?.date || e.start || '';
        const attendees = e.attendees?.length || 0;
        return `- "${title}" at ${start} (${attendees} attendee${attendees !== 1 ? 's' : ''})`;
      }).join('\n');

      const prompt = `Analyze these calendar events and identify which could be rescheduled given low energy.

RECOVERY: ${evaluation.healthLabel} (score: ${evaluation.healthScore}/100)
EVENTS TODAY (${evaluation.eventCount} total):
${eventList}

PERSONALITY: ${soul || 'Unknown'}
GOALS: ${goalsBlock || 'None specified'}

Rules for identifying moveable meetings:
- KEEP: 1-on-1s with manager/boss, client meetings, external calls, interviews
- KEEP: Meetings with 5+ attendees (hard to reschedule)
- MOVEABLE: Internal team syncs, optional meetings, brainstorms, reviews
- MOVEABLE: Meetings where user is not the organizer

Return a JSON array of moveable meetings. Each item:
{ "title": "Meeting Title", "time": "time string", "reason": "why this can move" }

If no meetings are moveable, return [].
Return ONLY the JSON array, no explanation.`;

      const response = await complete({
        messages: [{ role: 'user', content: prompt }],
        tier: TIER_EXTRACTION,
        maxTokens: 300,
        temperature: 0.3,
        userId,
        serviceName: 'inngest-calendar-opt-identify',
      });

      const text = response?.content || response?.text || '[]';
      try {
        const match = text.match(/\[[\s\S]*\]/);
        return match ? JSON.parse(match[0]) : [];
      } catch {
        return [];
      }
    });

    if (moveableMeetings.length === 0) {
      await step.run('log-no-moveable', async () => {
        await supabaseAdmin.from('agent_events').insert({
          user_id: userId,
          event_type: 'calendar_optimization_checked',
          event_data: { skipped: true, reason: 'no_moveable_meetings', score: evaluation.healthScore, eventCount: evaluation.eventCount },
          source: 'calendar_optimization',
        });
      });
      return { success: false, reason: 'no_moveable_meetings' };
    }

    // Step 6: Compose personality-matched suggestion
    const suggestion = await step.run('compose-suggestion', async () => {
      const coreBlocks = await getBlocks(userId);
      const soul = (coreBlocks.soul_signature?.content || '').slice(0, 400);

      const moveableList = moveableMeetings
        .slice(0, 3)
        .map(m => `"${m.title}" at ${m.time} — ${m.reason}`)
        .join('; ');

      const prompt = `You're a digital twin noticing your human is pushing too hard today. Write a brief, caring suggestion.

ACTUAL DATA:
- ${evaluation.healthProvider} ${evaluation.healthLabel} (score: ${evaluation.healthScore}/100)
- ${evaluation.eventCount} meetings scheduled today
- Moveable meetings: ${moveableList}

PERSONALITY: ${soul || 'A thoughtful person who values authenticity.'}

Write 2-3 sentences. Reference the actual recovery score and specific meetings by name. Sound like a caring friend, not a productivity coach. Include a concrete suggestion (e.g., "move your 2pm team sync to tomorrow").

IMPORTANT: Your response MUST include the actual recovery score number and at least one specific meeting name. Do NOT write generic advice.`;

      const response = await complete({
        messages: [{ role: 'user', content: prompt }],
        tier: TIER_EXTRACTION,
        maxTokens: 150,
        temperature: 0.7,
        userId,
        serviceName: 'inngest-calendar-opt-compose',
      });

      return response?.content || response?.text || null;
    });

    if (!suggestion) {
      return { success: false, reason: 'suggestion_generation_failed' };
    }

    // Step 7: Deliver as proactive insight
    const delivery = await step.run('deliver', async () => {
      // Dedup check
      const isDuplicate = await isInsightDuplicate(userId, suggestion, 'calendar_optimization');
      if (isDuplicate) {
        log.info('Calendar optimization insight deduplicated', { userId });
        return { deduplicated: true };
      }

      // Store as proactive insight
      const insight = {
        user_id: userId,
        insight: suggestion,
        urgency: 'high',
        category: 'calendar_optimization',
        delivered: false,
      };

      await supabaseAdmin.from('proactive_insights').insert(insight);

      // Deliver via message router (Telegram + web)
      await deliverInsight(userId, insight);

      // Log agent action
      await logAgentAction(userId, {
        skillName: 'calendar_optimization',
        actionType: 'suggestion',
        content: `Recovery ${evaluation.healthScore}% + ${evaluation.eventCount} meetings → suggested rescheduling ${moveableMeetings.length} meeting(s)`,
        autonomyLevel: 1,
        platformSources: [evaluation.healthProvider, evaluation.calendarProvider].filter(Boolean),
      });

      // Log agent event
      await supabaseAdmin.from('agent_events').insert({
        user_id: userId,
        event_type: 'calendar_optimization_triggered',
        event_data: {
          healthScore: evaluation.healthScore,
          healthProvider: evaluation.healthProvider,
          calendarProvider: evaluation.calendarProvider,
          eventCount: evaluation.eventCount,
          moveableMeetings: moveableMeetings.length,
          suggestionLength: suggestion.length,
        },
        source: 'calendar_optimization',
      });

      log.info('Calendar optimization delivered', {
        userId,
        healthScore: evaluation.healthScore,
        eventCount: evaluation.eventCount,
        moveable: moveableMeetings.length,
      });

      return { delivered: true };
    });

    return {
      success: true,
      userId,
      healthScore: evaluation.healthScore,
      eventCount: evaluation.eventCount,
      moveableMeetings: moveableMeetings.length,
      deduplicated: delivery.deduplicated || false,
    };
  }
);

// ── Helper: Extract health signals from raw platform data ─────────────

function extractHealthSignals(raw) {
  const signals = {};
  if (!raw) return signals;

  if (raw.recovery_score != null) signals.recovery = raw.recovery_score;
  else if (raw.score?.recovery_score != null) signals.recovery = raw.score.recovery_score;
  if (raw.readiness != null) signals.readiness = raw.readiness;
  if (raw.readiness_score != null) signals.readiness = raw.readiness_score;
  if (raw.body_battery != null) signals.body_battery = raw.body_battery;
  if (raw.sleep_hours != null) signals.sleep_hours = raw.sleep_hours;
  if (raw.hrv != null) signals.hrv = raw.hrv;
  if (raw.hrv_rmssd_milli != null) signals.hrv = Math.round(raw.hrv_rmssd_milli);
  if (raw.score?.hrv_rmssd_milli != null) signals.hrv = Math.round(raw.score.hrv_rmssd_milli);
  if (raw.sleep_score != null) signals.sleep_score = raw.sleep_score;
  return signals;
}
