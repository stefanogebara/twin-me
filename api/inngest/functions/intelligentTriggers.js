/**
 * Inngest Function: Intelligent Triggers — Data-Driven Twin Anticipation
 * ======================================================================
 * Evaluates proactive trigger conditions across all platforms.
 * Each trigger ONLY fires when backed by ACTUAL user data with
 * specific numbers. No template guesses, no generic alerts.
 *
 * Triggers (data-gated — skip if no evidence):
 *   1. Recovery + Calendar Clash — actual health score + event count
 *   2. Listening Anomaly — actual Spotify observations with content
 *   3. Birthday/Special Event — actual calendar event data
 *   4. Goal Milestone — actual streak/progress numbers
 *   5. Pattern Break — actual platform activity comparison
 *
 * Quality gate: LLM output must contain specific data references.
 * Generic advice without data citations is rejected.
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
import { isInsightDuplicate } from '../../services/proactiveInsights.js';
import { acquireCooldownLock } from '../../services/skillCooldownLock.js';
import { supabaseAdmin } from '../../services/database.js';
import { createLogger } from '../../services/logger.js';

const log = createLogger('IntelligentTriggers');

const COOLDOWN_HOURS = 20;

export const intelligentTriggersFunction = inngest.createFunction(
  { id: 'intelligent-triggers', name: 'Intelligent Triggers Check', retries: 1 },
  { event: EVENTS.INTELLIGENT_TRIGGERS },
  async ({ event, step }) => {
    const { userId } = event.data;

    // Atomic cooldown lock
    const lock = await step.run('acquire-cooldown-lock', async () => {
      return acquireCooldownLock(userId, 'intelligent_triggers', COOLDOWN_HOURS);
    });

    if (!lock.acquired) return { success: false, reason: 'cooldown', message: lock.reason };

    // Gather all data in parallel
    const data = await step.run('gather-data', async () => {
      const HEALTH_PROVIDERS = ['whoop', 'oura', 'garmin', 'fitbit', 'strava'];
      const CALENDAR_PROVIDERS = ['google_calendar', 'outlook'];

      // Health data — today + yesterday for comparison
      let healthRaw = null;
      let healthProvider = null;
      let previousHealthRaw = null;
      for (const p of HEALTH_PROVIDERS) {
        try {
          const { data: rows } = await supabaseAdmin.from('platform_data').select('raw_data, created_at')
            .eq('user_id', userId).eq('provider', p).order('created_at', { ascending: false }).limit(2);
          if (rows?.length > 0 && rows[0].raw_data) {
            healthRaw = rows[0].raw_data;
            healthProvider = p;
            if (rows.length > 1 && rows[1].raw_data) {
              previousHealthRaw = rows[1].raw_data;
            }
            break;
          }
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

      return {
        healthRaw,
        healthProvider,
        previousHealthRaw,
        calendarRaw,
        recentObs: recentObs || [],
        baselineObs: baselineObs || [],
        goals: goals || [],
      };
    });

    // Evaluate triggers — ONLY fire with actual data evidence
    const firedTriggers = await step.run('evaluate-triggers', async () => {
      const fired = [];

      // ── Extract health signals ────────────────────────────────
      const healthSignals = extractHealthSignals(data.healthRaw);
      const health = normalizeHealthScore(healthSignals);
      const previousHealthSignals = extractHealthSignals(data.previousHealthRaw);
      const previousHealth = normalizeHealthScore(previousHealthSignals);

      // ── Extract calendar events ───────────────────────────────
      let calendarEvents = [];
      if (data.calendarRaw) {
        calendarEvents = data.calendarRaw.items || data.calendarRaw.events || (Array.isArray(data.calendarRaw) ? data.calendarRaw : []);
      }
      const eventCount = calendarEvents.length;

      // 1. Recovery + Calendar Clash — REQUIRES both health score AND calendar data
      if (health.score != null && health.score < 50 && eventCount >= 4) {
        const parts = [`${data.healthProvider} ${health.label} (score: ${health.score})`];
        if (previousHealth.score != null) {
          parts.push(`was ${previousHealth.score} yesterday`);
        }
        parts.push(`${eventCount} events scheduled today`);
        const eventNames = calendarEvents.slice(0, 3).map(e => e.summary || e.title || 'untitled').join(', ');
        if (eventNames) parts.push(`including: ${eventNames}`);

        fired.push({
          type: 'recovery_clash',
          severity: 'high',
          context: parts.join('. '),
          dataPoints: { healthScore: health.score, previousScore: previousHealth.score, eventCount, provider: data.healthProvider },
        });
      }

      // 2. Listening Anomaly — REQUIRES actual Spotify observations with content
      const spotifyObs = data.recentObs.filter(o => o.metadata?.platform === 'spotify');
      if (spotifyObs.length > 0) {
        const lateNightObs = spotifyObs.filter(o => {
          const obsHour = new Date(o.created_at).getUTCHours();
          return obsHour >= 23 || obsHour < 4;
        });
        const moodObs = spotifyObs.filter(o =>
          /sad|melancholy|introspective|low valence|anxious|lonely|heartbreak/i.test(o.content)
        );

        if (lateNightObs.length > 0) {
          const sampleContent = lateNightObs[0].content.slice(0, 150);
          const time = new Date(lateNightObs[0].created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'UTC' });
          fired.push({
            type: 'listening_anomaly',
            severity: 'medium',
            context: `Late-night Spotify activity at ${time} UTC: "${sampleContent}"`,
            dataPoints: { obsCount: lateNightObs.length, sampleContent, time },
          });
        } else if (moodObs.length > 0) {
          const sampleContent = moodObs[0].content.slice(0, 150);
          fired.push({
            type: 'listening_anomaly',
            severity: 'medium',
            context: `Mood shift detected in recent Spotify data: "${sampleContent}" (${moodObs.length} observation${moodObs.length > 1 ? 's' : ''} in 48h)`,
            dataPoints: { obsCount: moodObs.length, sampleContent },
          });
        }
        // If Spotify observations exist but no anomaly detected, skip entirely
      }

      // 3. Birthday/Special Event — REQUIRES actual calendar event match
      if (calendarEvents.length > 0) {
        const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
        for (const evt of calendarEvents) {
          const title = (evt.summary || evt.title || evt.name || '').toLowerCase();
          if (/birthday|anniversary|celebration|bday|aniversario/i.test(title)) {
            const evtDate = new Date(evt.start?.dateTime || evt.start?.date || evt.start || evt.date);
            if (evtDate <= threeDaysFromNow && evtDate >= new Date()) {
              const eventName = evt.summary || evt.title || evt.name;
              const dateStr = evtDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
              fired.push({
                type: 'birthday',
                severity: 'low',
                context: `"${eventName}" is on ${dateStr} (from your calendar)`,
                dataPoints: { eventName, date: dateStr },
              });
              break;
            }
          }
        }
      }

      // 4. Goal Milestone — REQUIRES actual goal data with real numbers
      for (const goal of data.goals) {
        const streak = goal.current_streak || 0;
        if ([7, 14, 21, 30, 60, 90].includes(streak)) {
          fired.push({
            type: 'goal_milestone',
            severity: 'medium',
            context: `${streak}-day streak on "${goal.title}" (target: ${goal.target_streak || 'ongoing'})`,
            dataPoints: { streak, goalTitle: goal.title, targetStreak: goal.target_streak },
          });
        }
        if (goal.target_value && goal.current_value != null && goal.current_value >= goal.target_value) {
          fired.push({
            type: 'goal_milestone',
            severity: 'medium',
            context: `Goal "${goal.title}" reached target! Current: ${goal.current_value}, target was ${goal.target_value}`,
            dataPoints: { goalTitle: goal.title, currentValue: goal.current_value, targetValue: goal.target_value },
          });
        }
      }

      // 5. Pattern Break — REQUIRES both recent AND baseline data with measurable drop
      if (data.recentObs.length > 0 && data.baselineObs.length > 0) {
        const recentByPlatform = {};
        for (const o of data.recentObs) {
          const p = o.metadata?.platform || 'unknown';
          if (p === 'unknown') continue;
          recentByPlatform[p] = (recentByPlatform[p] || 0) + 1;
        }
        const baselineByPlatform = {};
        for (const o of data.baselineObs) {
          const p = o.metadata?.platform || 'unknown';
          if (p === 'unknown') continue;
          baselineByPlatform[p] = (baselineByPlatform[p] || 0) + 1;
        }

        // Normalize baseline to 2-day equivalent (baseline is 23 days, recent is 2 days)
        for (const [platform, count] of Object.entries(baselineByPlatform)) {
          const baselineDaily = count / 23;
          const recentDaily = (recentByPlatform[platform] || 0) / 2;
          // Require minimum baseline AND significant drop (70%+)
          if (baselineDaily > 1 && recentDaily < baselineDaily * 0.3) {
            // Include actual content sample from baseline for context
            const baselineSample = data.baselineObs
              .filter(o => o.metadata?.platform === platform)
              .slice(0, 1)
              .map(o => o.content?.slice(0, 80))
              .filter(Boolean);
            fired.push({
              type: 'pattern_break',
              severity: 'high',
              context: `${platform} activity dropped from ~${baselineDaily.toFixed(1)}/day (30-day avg) to ~${recentDaily.toFixed(1)}/day (last 48h)${baselineSample.length > 0 ? `. Recent baseline: "${baselineSample[0]}"` : ''}`,
              dataPoints: { platform, baselineDaily: baselineDaily.toFixed(1), recentDaily: recentDaily.toFixed(1) },
            });
          }
        }
      }

      // NOTE: "Weekend Empty" trigger removed — it was template-based
      // (fired with no data evidence beyond "calendar has few events")
      // and generated generic activity suggestions unrelated to user data.

      return fired;
    });

    const triggersEvaluated = countEvaluatedTriggers(data);

    if (firedTriggers.length === 0) {
      await step.run('log-no-triggers', async () => {
        await supabaseAdmin.from('agent_events').insert({
          user_id: userId,
          event_type: 'intelligent_triggers_checked',
          event_data: { triggersEvaluated, fired: 0, dataAvailable: summarizeDataAvailability(data) },
          source: 'intelligent_triggers',
        });
      });
      return { success: true, fired: 0, evaluated: triggersEvaluated };
    }

    // Compose and deliver suggestions for each fired trigger
    const results = await step.run('compose-and-deliver', async () => {
      const coreBlocks = await getBlocks(userId);
      const soul = (coreBlocks.soul_signature?.content || '').slice(0, 400);
      const delivered = [];
      const rejected = [];

      for (const trigger of firedTriggers) {
        const prompt = buildTriggerPrompt(trigger, soul);

        const response = await complete({
          messages: [{ role: 'user', content: prompt }],
          tier: TIER_EXTRACTION,
          maxTokens: 150,
          temperature: 0.7,
          userId,
          serviceName: `inngest-trigger-${trigger.type}`,
        });

        const suggestion = response?.content || response?.text || '';

        // ── QUALITY GATE: reject generic suggestions without data ──
        if (!passesQualityGate(suggestion, trigger)) {
          log.info('Trigger suggestion rejected by quality gate (no specific data)', {
            userId,
            type: trigger.type,
            suggestion: suggestion.slice(0, 100),
          });
          rejected.push(trigger.type);
          continue;
        }

        // Dedup check before inserting
        const triggerCategory = trigger.type;
        if (await isInsightDuplicate(userId, suggestion, triggerCategory)) {
          log.info('Intelligent trigger insight deduplicated', { userId, type: triggerCategory });
          continue;
        }

        // Deliver via message router (Telegram + web)
        const insight = {
          user_id: userId,
          insight: suggestion,
          urgency: trigger.severity === 'high' ? 'high' : trigger.severity === 'medium' ? 'medium' : 'low',
          category: triggerCategory,
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
          platformSources: trigger.dataPoints?.provider ? [trigger.dataPoints.provider] : [],
        });

        delivered.push(trigger.type);
      }

      // Log the check
      await supabaseAdmin.from('agent_events').insert({
        user_id: userId,
        event_type: 'intelligent_triggers_checked',
        event_data: {
          triggersEvaluated,
          fired: firedTriggers.length,
          delivered: delivered,
          rejected: rejected,
          dataAvailable: summarizeDataAvailability(data),
        },
        source: 'intelligent_triggers',
      });

      return delivered;
    });

    log.info('Intelligent triggers complete', { userId, fired: results.length, types: results });

    return { success: true, fired: results.length, types: results };
  }
);

// ── Helper: Extract health signals from raw platform data ─────────────

function extractHealthSignals(raw) {
  const signals = {};
  if (!raw) return signals;

  if (raw.recovery_score != null) signals.recovery = raw.recovery_score;
  else if (raw.score?.recovery_score != null) signals.recovery = raw.score.recovery_score;
  if (raw.readiness != null) signals.readiness = raw.readiness;
  if (raw.body_battery != null) signals.body_battery = raw.body_battery;
  if (raw.sleep_hours != null) signals.sleep_hours = raw.sleep_hours;
  if (raw.hrv != null) signals.hrv = raw.hrv;
  if (raw.score?.hrv_rmssd_milli != null) signals.hrv = Math.round(raw.score.hrv_rmssd_milli);
  return signals;
}

// ── Quality gate: reject generic LLM output ───────────────────────────

/**
 * Checks whether the LLM-generated suggestion contains specific data
 * references rather than being generic advice. Returns true if it passes.
 *
 * Rules:
 * 1. Must contain at least one number (score, count, streak, percentage, time)
 * 2. For health triggers: must reference recovery/score/sleep/HRV
 * 3. For pattern_break: must reference a platform name
 * 4. Must not be empty or too short
 */
function passesQualityGate(suggestion, trigger) {
  if (!suggestion || suggestion.length < 20) return false;

  const hasNumber = /\d+/.test(suggestion);
  const lower = suggestion.toLowerCase();

  switch (trigger.type) {
    case 'recovery_clash':
      // Must mention recovery/score/sleep AND a number
      return hasNumber && /recovery|score|sleep|hrv|strain|energy|battery/i.test(suggestion);

    case 'listening_anomaly':
      // Must reference music/listening context (not just "take care of yourself")
      return /music|listen|song|playlist|spotify|track|album|late.night|mood/i.test(suggestion);

    case 'birthday':
      // Must mention the event or person
      return trigger.dataPoints?.eventName
        ? lower.includes(trigger.dataPoints.eventName.toLowerCase().split(' ')[0])
        : true;

    case 'goal_milestone':
      // Must reference the streak/goal with a number
      return hasNumber && /streak|goal|day|target|progress|reached/i.test(suggestion);

    case 'pattern_break':
      // Must mention the specific platform
      return trigger.dataPoints?.platform
        ? lower.includes(trigger.dataPoints.platform.toLowerCase())
        : hasNumber;

    default:
      return hasNumber;
  }
}

// ── Prompt builders per trigger type ────────────────────────────────────

function buildTriggerPrompt(trigger, soulSignature) {
  const personality = soulSignature || 'A thoughtful person.';

  // All prompts include ACTUAL DATA and instruct the LLM to cite specifics
  const dataInstruction = `\nIMPORTANT: Your response MUST reference the specific data points provided. Include actual numbers, names, or metrics. Do NOT write generic wellness advice. If you can't cite the data, say nothing.`;

  const prompts = {
    recovery_clash: `You're a digital twin noticing your human is pushing too hard today.
ACTUAL DATA: ${trigger.context}
PERSONALITY: ${personality}
${dataInstruction}
Write 1-2 sentences referencing their actual recovery score and event count. Be caring but not preachy. Sound like a friend, not a doctor.`,

    listening_anomaly: `You're a digital twin who noticed something specific in your human's music.
ACTUAL DATA: ${trigger.context}
PERSONALITY: ${personality}
${dataInstruction}
Write 1-2 casual sentences that reference what they were actually listening to. Don't say "I noticed your Spotify" — be natural. Reference the actual content or timing.`,

    birthday: `You're a digital twin who spotted a specific event in your human's calendar.
ACTUAL DATA: ${trigger.context}
PERSONALITY: ${personality}
${dataInstruction}
Write 1-2 sentences mentioning the specific event by name and date. Suggest they plan something. Match their style.`,

    goal_milestone: `You're a digital twin celebrating your human's actual achievement.
ACTUAL DATA: ${trigger.context}
PERSONALITY: ${personality}
${dataInstruction}
Write 1-2 sentences citing the specific streak or metric. Not cheesy — match their personality. Include the actual number.`,

    pattern_break: `You're a digital twin who noticed a measurable shift in your human's behavior.
ACTUAL DATA: ${trigger.context}
PERSONALITY: ${personality}
${dataInstruction}
Write 1-2 gentle sentences citing the specific platform and the drop in activity. Don't alarm — just observe with actual data.`,
  };

  return prompts[trigger.type] || `Trigger: ${trigger.type}. Data: ${trigger.context}. Personality: ${personality}.${dataInstruction} Write a brief, natural suggestion citing the data.`;
}

// ── Data availability summary for logging ────────────────────────────

function summarizeDataAvailability(data) {
  return {
    hasHealth: !!data.healthRaw,
    hasPreviousHealth: !!data.previousHealthRaw,
    healthProvider: data.healthProvider || null,
    hasCalendar: !!data.calendarRaw,
    recentObsCount: data.recentObs.length,
    baselineObsCount: data.baselineObs.length,
    activeGoals: data.goals.length,
    platforms: [...new Set(data.recentObs.map(o => o.metadata?.platform).filter(Boolean))],
  };
}

/**
 * Count how many triggers could actually be evaluated
 * (had the required data to check the condition)
 */
function countEvaluatedTriggers(data) {
  let count = 0;
  if (data.healthRaw && data.calendarRaw) count++; // recovery_clash needs both
  if (data.recentObs.some(o => o.metadata?.platform === 'spotify')) count++; // listening_anomaly
  if (data.calendarRaw) count++; // birthday
  if (data.goals.length > 0) count++; // goal_milestone
  if (data.recentObs.length > 0 && data.baselineObs.length > 0) count++; // pattern_break
  return count;
}
