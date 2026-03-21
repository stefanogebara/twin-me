/**
 * Inngest Function: Intelligent Triggers — Twin Anticipates
 * ============================================================
 * Evaluates 6 proactive trigger conditions across all platforms.
 * Each trigger is a pure heuristic (no LLM). When conditions fire,
 * composes a personality-filtered suggestion and delivers via
 * message router (web + Telegram).
 *
 * Triggers:
 *   1. Recovery + Calendar Clash — suggest rescheduling
 *   2. Unusual Listening Pattern — emotional check-in
 *   3. Birthday/Special Event — suggest celebration
 *   4. Goal Milestone — celebrate + next step
 *   5. Pattern Break — alert to behavioral drift
 *   6. Weekend Empty — suggest activities
 *
 * Cost: ~$0.0001 per fired trigger (TIER_EXTRACTION LLM for suggestion)
 * Cron: daily 10am UTC (7am São Paulo)
 */

import { inngest, EVENTS } from '../../services/inngestClient.js';
import { complete, TIER_EXTRACTION } from '../../services/llmGateway.js';
import { getBlocks } from '../../services/coreMemoryService.js';
import { normalizeHealthScore } from '../../services/moodAssessmentService.js';
import { deliverInsight } from '../../services/messageRouter.js';
import { logAgentAction } from '../../services/autonomyService.js';
import { supabaseAdmin } from '../../services/database.js';
import { createLogger } from '../../services/logger.js';

const log = createLogger('IntelligentTriggers');

const COOLDOWN_HOURS = 20;

export const intelligentTriggersFunction = inngest.createFunction(
  { id: 'intelligent-triggers', name: 'Intelligent Triggers Check', retries: 1 },
  { event: EVENTS.INTELLIGENT_TRIGGERS },
  async ({ event, step }) => {
    const { userId } = event.data;

    // Cooldown
    const shouldSkip = await step.run('check-cooldown', async () => {
      const cutoff = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();
      const { count } = await supabaseAdmin
        .from('agent_events')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('event_type', 'intelligent_triggers_checked')
        .gte('created_at', cutoff);
      return (count || 0) > 0;
    });

    if (shouldSkip) return { success: false, reason: 'cooldown' };

    // Gather all data in parallel
    const data = await step.run('gather-data', async () => {
      const HEALTH_PROVIDERS = ['whoop', 'oura', 'garmin', 'fitbit', 'strava'];
      const CALENDAR_PROVIDERS = ['google_calendar', 'outlook'];

      // Health data
      let healthRaw = null;
      for (const p of HEALTH_PROVIDERS) {
        try {
          const { data: d } = await supabaseAdmin.from('platform_data').select('raw_data')
            .eq('user_id', userId).eq('provider', p).order('created_at', { ascending: false }).limit(1).single();
          if (d?.raw_data) { healthRaw = d.raw_data; break; }
        } catch {}
      }

      // Calendar data
      let calendarRaw = null;
      for (const p of CALENDAR_PROVIDERS) {
        try {
          const { data: d } = await supabaseAdmin.from('platform_data').select('raw_data')
            .eq('user_id', userId).eq('provider', p).order('created_at', { ascending: false }).limit(1).single();
          if (d?.raw_data) { calendarRaw = d.raw_data; break; }
        } catch {}
      }

      // Recent observations (48h, all platforms)
      const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const { data: recentObs } = await supabaseAdmin
        .from('user_memories')
        .select('content, metadata, created_at')
        .eq('user_id', userId)
        .in('memory_type', ['platform_data', 'observation'])
        .gte('created_at', cutoff48h)
        .order('created_at', { ascending: false })
        .limit(50);

      // Baseline observations (7-30 days ago)
      const cutoff7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const cutoff30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: baselineObs } = await supabaseAdmin
        .from('user_memories')
        .select('content, metadata')
        .eq('user_id', userId)
        .in('memory_type', ['platform_data', 'observation'])
        .gte('created_at', cutoff30d)
        .lte('created_at', cutoff7d)
        .limit(100);

      // Active goals
      const { data: goals } = await supabaseAdmin
        .from('twin_goals')
        .select('id, title, current_streak, target_streak, status, metric_type, target_value, current_value')
        .eq('user_id', userId)
        .eq('status', 'active')
        .limit(10);

      return { healthRaw, calendarRaw, recentObs: recentObs || [], baselineObs: baselineObs || [], goals: goals || [] };
    });

    // Evaluate all 6 triggers
    const firedTriggers = await step.run('evaluate-triggers', async () => {
      const fired = [];

      // Health signals
      const healthSignals = {};
      if (data.healthRaw) {
        if (data.healthRaw.recovery_score != null) healthSignals.recovery = data.healthRaw.recovery_score;
        else if (data.healthRaw.score?.recovery_score != null) healthSignals.recovery = data.healthRaw.score.recovery_score;
        if (data.healthRaw.readiness != null) healthSignals.readiness = data.healthRaw.readiness;
        if (data.healthRaw.body_battery != null) healthSignals.body_battery = data.healthRaw.body_battery;
        if (data.healthRaw.sleep_hours != null) healthSignals.sleep_hours = data.healthRaw.sleep_hours;
        if (data.healthRaw.hrv != null) healthSignals.hrv = data.healthRaw.hrv;
        if (data.healthRaw.score?.hrv_rmssd_milli != null) healthSignals.hrv = Math.round(data.healthRaw.score.hrv_rmssd_milli);
      }
      const health = normalizeHealthScore(healthSignals);

      // Calendar events
      let eventCount = 0;
      let calendarEvents = [];
      if (data.calendarRaw) {
        calendarEvents = data.calendarRaw.items || data.calendarRaw.events || (Array.isArray(data.calendarRaw) ? data.calendarRaw : []);
        eventCount = calendarEvents.length;
      }

      // 1. Recovery + Calendar Clash
      if (health.score != null && health.score < 50 && eventCount >= 4) {
        fired.push({
          type: 'recovery_clash',
          severity: 'high',
          context: `${health.label} but ${eventCount} events today`,
        });
      }

      // 2. Unusual Listening Pattern
      const spotifyObs = data.recentObs.filter(o => o.metadata?.platform === 'spotify');
      const currentHour = new Date().getHours();
      const lateNightListening = spotifyObs.some(o => {
        const obsHour = new Date(o.created_at).getHours();
        return obsHour >= 23 || obsHour < 4;
      });
      const moodShift = spotifyObs.some(o =>
        /sad|melancholy|introspective|low valence|anxious/i.test(o.content)
      );
      if (lateNightListening || moodShift) {
        fired.push({
          type: 'listening_anomaly',
          severity: 'medium',
          context: lateNightListening ? 'late-night listening detected' : 'mood shift in music',
        });
      }

      // 3. Birthday/Special Event Approaching
      const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      for (const evt of calendarEvents) {
        const title = (evt.summary || evt.title || evt.name || '').toLowerCase();
        if (/birthday|anniversary|celebration|bday|aniversario/i.test(title)) {
          const evtDate = new Date(evt.start?.dateTime || evt.start?.date || evt.start || evt.date);
          if (evtDate <= threeDaysFromNow && evtDate >= new Date()) {
            fired.push({
              type: 'birthday',
              severity: 'low',
              context: `"${evt.summary || evt.title}" on ${evtDate.toLocaleDateString()}`,
            });
            break;
          }
        }
      }

      // 4. Goal Milestone
      for (const goal of data.goals) {
        const streak = goal.current_streak || 0;
        if ([7, 14, 21, 30, 60, 90].includes(streak)) {
          fired.push({
            type: 'goal_milestone',
            severity: 'medium',
            context: `${streak}-day streak on "${goal.title}"`,
          });
        }
        if (goal.target_value && goal.current_value >= goal.target_value) {
          fired.push({
            type: 'goal_milestone',
            severity: 'medium',
            context: `Goal "${goal.title}" reached target!`,
          });
        }
      }

      // 5. Pattern Break (Behavioral Drift)
      const recentByPlatform = {};
      for (const o of data.recentObs) {
        const p = o.metadata?.platform || 'unknown';
        recentByPlatform[p] = (recentByPlatform[p] || 0) + 1;
      }
      const baselineByPlatform = {};
      for (const o of data.baselineObs) {
        const p = o.metadata?.platform || 'unknown';
        baselineByPlatform[p] = (baselineByPlatform[p] || 0) + 1;
      }
      // Normalize baseline to 2-day equivalent (baseline is 23 days, recent is 2 days)
      for (const [platform, count] of Object.entries(baselineByPlatform)) {
        const baselineDaily = count / 23;
        const recentDaily = (recentByPlatform[platform] || 0) / 2;
        if (baselineDaily > 1 && recentDaily < baselineDaily * 0.3) {
          fired.push({
            type: 'pattern_break',
            severity: 'high',
            context: `${platform} activity dropped significantly (was ~${baselineDaily.toFixed(1)}/day, now ~${recentDaily.toFixed(1)}/day)`,
          });
        }
      }

      // 6. Weekend Empty (only check Thu/Fri)
      const dayOfWeek = new Date().getDay();
      if (dayOfWeek === 4 || dayOfWeek === 5) {
        // Look for weekend events in calendar
        const saturday = new Date();
        saturday.setDate(saturday.getDate() + (6 - dayOfWeek));
        saturday.setHours(0, 0, 0, 0);
        const monday = new Date(saturday);
        monday.setDate(monday.getDate() + 2);

        const weekendEvents = calendarEvents.filter(evt => {
          const d = new Date(evt.start?.dateTime || evt.start?.date || evt.start || evt.date);
          return d >= saturday && d < monday;
        });

        if (weekendEvents.length <= 1) {
          fired.push({
            type: 'weekend_empty',
            severity: 'low',
            context: `Weekend looks open (${weekendEvents.length} event${weekendEvents.length === 1 ? '' : 's'})`,
          });
        }
      }

      return fired;
    });

    if (firedTriggers.length === 0) {
      // Log the check even if nothing fired
      await step.run('log-no-triggers', async () => {
        await supabaseAdmin.from('agent_events').insert({
          user_id: userId,
          event_type: 'intelligent_triggers_checked',
          event_data: { triggersEvaluated: 6, fired: 0 },
          source: 'intelligent_triggers',
        });
      });
      return { success: true, fired: 0 };
    }

    // Compose and deliver suggestions for each fired trigger
    const results = await step.run('compose-and-deliver', async () => {
      const coreBlocks = await getBlocks(userId);
      const soul = (coreBlocks.soul_signature?.content || '').slice(0, 400);
      const delivered = [];

      for (const trigger of firedTriggers) {
        const prompt = buildTriggerPrompt(trigger, soul);

        const response = await complete({
          messages: [{ role: 'user', content: prompt }],
          tier: TIER_EXTRACTION,
          maxTokens: 120,
          temperature: 0.7,
          userId,
          purpose: `trigger_${trigger.type}`,
        });

        const suggestion = response?.content || response?.text || trigger.context;

        // Deliver via message router (Telegram + web)
        const insight = {
          user_id: userId,
          insight: suggestion,
          urgency: trigger.severity === 'high' ? 'high' : trigger.severity === 'medium' ? 'medium' : 'low',
          category: trigger.type,
        };

        await supabaseAdmin.from('proactive_insights').insert({
          ...insight,
          delivered: false,
        });

        await deliverInsight(userId, insight);

        await logAgentAction(userId, {
          skillName: 'intelligent_triggers',
          actionType: 'suggestion',
          content: `[${trigger.type}] ${suggestion.slice(0, 200)}`,
          autonomyLevel: 1,
          platformSources: [],
        });

        delivered.push(trigger.type);
      }

      // Log the check
      await supabaseAdmin.from('agent_events').insert({
        user_id: userId,
        event_type: 'intelligent_triggers_checked',
        event_data: {
          triggersEvaluated: 6,
          fired: firedTriggers.length,
          types: delivered,
        },
        source: 'intelligent_triggers',
      });

      return delivered;
    });

    log.info('Intelligent triggers complete', { userId, fired: results.length, types: results });

    return { success: true, fired: results.length, types: results };
  }
);

// ── Prompt builders per trigger type ────────────────────────────────────

function buildTriggerPrompt(trigger, soulSignature) {
  const personality = soulSignature || 'A thoughtful person.';

  const prompts = {
    recovery_clash: `You're a digital twin noticing your human is pushing too hard. ${trigger.context}.
PERSONALITY: ${personality}
Write 1-2 sentences suggesting they protect their energy today. Be caring but not preachy. Sound like a friend, not a doctor.`,

    listening_anomaly: `You're a digital twin who noticed something in your human's music. ${trigger.context}.
PERSONALITY: ${personality}
Write 1-2 casual sentences checking in. Don't be clinical — just notice, like a friend who pays attention. Don't say "I noticed your Spotify" — be natural.`,

    birthday: `You're a digital twin who spotted a special event coming up. ${trigger.context}.
PERSONALITY: ${personality}
Write 1-2 sentences mentioning it and suggesting they plan something. Match their style — casual or thoughtful based on personality.`,

    goal_milestone: `You're a digital twin celebrating your human's progress. ${trigger.context}.
PERSONALITY: ${personality}
Write 1-2 sentences of genuine celebration + a nudge for what's next. Not cheesy — match their personality. If they're understated, be understated.`,

    pattern_break: `You're a digital twin who noticed a shift in your human's behavior. ${trigger.context}.
PERSONALITY: ${personality}
Write 1-2 gentle sentences noting the change. Don't alarm — just observe, like a perceptive friend. Ask what's up without being intrusive.`,

    weekend_empty: `You're a digital twin noticing your human has a free weekend. ${trigger.context}.
PERSONALITY: ${personality}
Write 1-2 sentences suggesting how to spend it — match their interests and energy. Be specific to their personality, not generic.`,
  };

  return prompts[trigger.type] || `Trigger: ${trigger.type}. Context: ${trigger.context}. Personality: ${personality}. Write a brief, natural suggestion.`;
}
