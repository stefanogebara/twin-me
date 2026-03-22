/**
 * Inngest Function: Evening Recap
 * =================================
 * Generates a personalized end-of-day summary. Gathers data from ALL
 * connected platforms (health, calendar, music, activity), composes a
 * personality-filtered recap, and delivers as proactive insight.
 *
 * Platform-agnostic: uses fallback chains for health + calendar data.
 * Pulls from user_memories for recent observations across all platforms.
 *
 * Trigger: Vercel cron at user's evening time (default 8pm UTC)
 * Cost: ~$0.0003 per trigger (one TIER_ANALYSIS LLM call)
 */

import { inngest, EVENTS } from '../../services/inngestClient.js';
import { complete, TIER_ANALYSIS } from '../../services/llmGateway.js';
import { getBlocks } from '../../services/coreMemoryService.js';
import { getAutonomyBySkillName, logAgentAction } from '../../services/autonomyService.js';
import { isInsightDuplicate } from '../../services/proactiveInsights.js';
import { acquireCooldownLock } from '../../services/skillCooldownLock.js';
import { supabaseAdmin } from '../../services/database.js';
import { createLogger } from '../../services/logger.js';

const log = createLogger('EveningRecap');

const COOLDOWN_HOURS = 18; // Once per day max

export const eveningRecapFunction = inngest.createFunction(
  {
    id: 'evening-recap',
    name: 'Daily Evening Recap',
    retries: 1,
  },
  { event: EVENTS.EVENING_RECAP },
  async ({ event, step }) => {
    const { userId } = event.data;

    // Step 1: Atomic cooldown lock
    const lock = await step.run('acquire-cooldown-lock', async () => {
      return acquireCooldownLock(userId, 'evening_recap', COOLDOWN_HOURS);
    });

    if (!lock.acquired) {
      return { success: false, reason: 'cooldown', message: lock.reason };
    }

    // Step 2: Check skill is enabled
    const autonomyLevel = await step.run('check-autonomy', async () => {
      return getAutonomyBySkillName(userId, 'evening_recap');
    });

    if (autonomyLevel === -1) {
      return { success: false, reason: 'skill_disabled' };
    }

    // Step 3: Gather health data (fallback chain across all health platforms)
    const healthData = await step.run('gather-health', async () => {
      const HEALTH_PROVIDERS = ['whoop', 'oura', 'garmin', 'fitbit', 'strava'];
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

    // Step 4: Gather calendar data (fallback chain)
    const calendarData = await step.run('gather-calendar', async () => {
      const CALENDAR_PROVIDERS = ['google_calendar', 'outlook'];
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

    // Step 5: Gather today's observations across ALL platforms from memory stream
    const todaysActivity = await step.run('gather-activity', async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data: memories } = await supabaseAdmin
        .from('user_memories')
        .select('content, memory_type, metadata, created_at')
        .eq('user_id', userId)
        .in('memory_type', ['platform_data', 'observation'])
        .gte('created_at', todayStart.toISOString())
        .order('created_at', { ascending: false })
        .limit(30);

      if (!memories?.length) return null;

      // Group by platform and take highlights
      const byPlatform = {};
      for (const mem of memories) {
        const platform = mem.metadata?.platform || mem.metadata?.source || 'unknown';
        if (!byPlatform[platform]) byPlatform[platform] = [];
        if (byPlatform[platform].length < 3) {
          byPlatform[platform].push(mem.content);
        }
      }

      return byPlatform;
    });

    // Step 6: Gather today's agent actions (what the twin did today)
    const twinActions = await step.run('gather-twin-actions', async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data: actions } = await supabaseAdmin
        .from('agent_actions')
        .select('skill_name, action_type, action_content, created_at')
        .eq('user_id', userId)
        .gte('created_at', todayStart.toISOString())
        .order('created_at', { ascending: false })
        .limit(5);

      return actions || [];
    });

    // Step 7: Get personality context
    const coreBlocks = await step.run('gather-personality', async () => {
      return getBlocks(userId);
    });

    // Step 8: Compose the evening recap
    const recap = await step.run('compose-recap', async () => {
      const soulSignature = coreBlocks.soul_signature?.content || '';
      const humanBlock = coreBlocks.human?.content || '';
      const goalsBlock = coreBlocks.goals?.content || '';

      // Build activity summary from observations
      let activitySection = 'No platform activity tracked today.';
      if (todaysActivity && Object.keys(todaysActivity).length > 0) {
        activitySection = Object.entries(todaysActivity)
          .map(([platform, items]) => `${platform}: ${items.join(' | ')}`)
          .join('\n');
      }

      // Build twin actions summary
      let actionsSection = '';
      if (twinActions.length > 0) {
        actionsSection = `\nTHINGS I DID TODAY:\n${twinActions.map(a => `- ${a.skill_name || a.action_type}: ${a.action_content?.slice(0, 100)}`).join('\n')}`;
      }

      const prompt = `You are composing an evening recap for someone as their digital twin — a close friend wrapping up the day together.

WHO THEY ARE:
${soulSignature}

WHAT YOU KNOW:
${humanBlock}

THEIR GOALS:
${goalsBlock}

TODAY'S CALENDAR:
${calendarData.data ? JSON.stringify(calendarData.data).slice(0, 1200) : 'No calendar data'}

HEALTH/RECOVERY:
${healthData.data ? JSON.stringify(healthData.data).slice(0, 600) : 'No health data'}
(Source: ${healthData.provider || 'none'})

TODAY'S ACTIVITY ACROSS PLATFORMS:
${activitySection}
${actionsSection}

Write a warm, reflective evening recap (3-5 short paragraphs). Include:
1. How the day actually went (based on data, not generic)
2. Health/energy reflection if data available (friend tone, not clinical)
3. What stood out today — any interesting patterns or moments
4. A brief look-ahead or suggestion for the evening
5. A genuine closing note (not cheesy, match their personality)

Keep it casual, warm, and REAL. No corporate speak. No bullet lists.
Write it like texting a close friend at the end of the day.`;

      const response = await complete({
        messages: [{ role: 'user', content: prompt }],
        tier: TIER_ANALYSIS,
        maxTokens: 700,
        temperature: 0.7,
        userId,
        purpose: 'evening_recap'
      });

      return response?.content || response?.text || null;
    });

    if (!recap) {
      return { success: false, reason: 'recap_generation_failed' };
    }

    // Step 9: Deliver (with dedup check)
    await step.run('deliver', async () => {
      if (await isInsightDuplicate(userId, recap, 'evening_recap')) {
        log.info('Evening recap deduplicated — skipping insert', { userId });
        return;
      }

      await supabaseAdmin.from('proactive_insights').insert({
        user_id: userId,
        insight: recap,
        urgency: 'low',
        category: 'evening_recap',
        delivered: false,
      });

      await logAgentAction(userId, {
        skillName: 'evening_recap',
        actionType: 'briefing',
        content: recap.slice(0, 300),
        autonomyLevel,
        platformSources: [
          healthData.provider,
          calendarData.provider,
          ...(todaysActivity ? Object.keys(todaysActivity) : []),
        ].filter(Boolean),
      });

      await supabaseAdmin.from('agent_events').insert({
        user_id: userId,
        event_type: 'evening_recap_generated',
        event_data: {
          healthSource: healthData.provider,
          calendarSource: calendarData.provider,
          platformsActive: todaysActivity ? Object.keys(todaysActivity) : [],
          twinActionsToday: twinActions.length,
          recapLength: recap.length,
        },
        source: 'evening_recap_skill',
      });

      log.info('Evening recap delivered', { userId, chars: recap.length });
    });

    return {
      success: true,
      userId,
      recapLength: recap.length,
      sources: {
        health: healthData.provider,
        calendar: calendarData.provider,
        platformsActive: todaysActivity ? Object.keys(todaysActivity).length : 0,
        twinActions: twinActions.length,
      },
    };
  }
);
