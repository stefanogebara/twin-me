/**
 * Inngest Function: Morning Briefing (Skeleton)
 * ================================================
 * Generates a personalized daily briefing at the user's wake time.
 * Gathers data from all connected platforms, composes a personality-
 * filtered briefing, and delivers via proactive insight.
 *
 * This is the first "agentic skill" — the twin doing something
 * on behalf of the user without being asked.
 *
 * Phase 2 will add: WhatsApp delivery, Telegram delivery, push notifications.
 */

import { inngest, EVENTS } from '../../services/inngestClient.js';
import { complete, TIER_ANALYSIS } from '../../services/llmGateway.js';
import { getBlocks } from '../../services/coreMemoryService.js';
import { supabaseAdmin } from '../../services/database.js';
import { createLogger } from '../../services/logger.js';

const log = createLogger('MorningBriefing');

export const morningBriefingFunction = inngest.createFunction(
  {
    id: 'morning-briefing',
    name: 'Daily Morning Briefing',
    retries: 2,
  },
  { event: EVENTS.GENERATE_BRIEFING },
  async ({ event, step }) => {
    const { userId } = event.data;

    // Step 1: Gather calendar data
    const calendarData = await step.run('gather-calendar', async () => {
      try {
        const { data } = await supabaseAdmin
          .from('platform_data')
          .select('raw_data')
          .eq('user_id', userId)
          .eq('provider', 'google_calendar')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        return data?.raw_data || null;
      } catch {
        return null;
      }
    });

    // Step 2: Gather health data (Whoop)
    const healthData = await step.run('gather-health', async () => {
      try {
        const { data } = await supabaseAdmin
          .from('platform_data')
          .select('raw_data')
          .eq('user_id', userId)
          .eq('provider', 'whoop')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        return data?.raw_data || null;
      } catch {
        return null;
      }
    });

    // Step 3: Get core memory blocks for personality context
    const coreBlocks = await step.run('gather-personality', async () => {
      return getBlocks(userId);
    });

    // Step 4: Compose the briefing with personality filter
    const briefing = await step.run('compose-briefing', async () => {
      const soulSignature = coreBlocks.soul_signature?.content || '';
      const humanBlock = coreBlocks.human?.content || '';
      const goalsBlock = coreBlocks.goals?.content || '';

      // Compute time-of-day context for appropriate greeting
      // Cron fires at 10am UTC = 7am São Paulo (primary market)
      const nowUtc = new Date();
      const utcHour = nowUtc.getUTCHours();
      const saoPauloHour = (utcHour - 3 + 24) % 24; // UTC-3
      const timeContext = getTimeOfDayContext(saoPauloHour);
      const dayOfWeek = nowUtc.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/Sao_Paulo' });

      const prompt = `You are composing a ${timeContext.label} briefing for someone as their digital twin — a close friend who knows them deeply.

CURRENT TIME CONTEXT:
It's ${dayOfWeek}, ~${saoPauloHour}:00 in their timezone (São Paulo). ${timeContext.hint}

WHO THEY ARE:
${soulSignature}

WHAT YOU KNOW:
${humanBlock}

THEIR GOALS:
${goalsBlock}

TODAY'S CALENDAR:
${calendarData ? JSON.stringify(calendarData).slice(0, 1500) : 'No calendar data available'}

HEALTH/RECOVERY:
${healthData ? JSON.stringify(healthData).slice(0, 800) : 'No health data available'}

Write a warm, personal ${timeContext.label} briefing (3-5 short paragraphs). Include:
1. A time-appropriate, personality-matched greeting (${timeContext.greetingHint})
2. Health/recovery context if available (frame as a friend would, not clinical)
3. Today's agenda highlights (meetings, blocks, priorities)
4. One insight connecting their data (e.g., "packed day + moderate recovery = pace yourself")
5. A small positive note or encouragement

Keep it casual, warm, and USEFUL. No corporate speak. No bullet lists.
Write it like a text from their smartest, most perceptive friend.
Do NOT start with "Good morning" if it's not morning — match the actual time of day.`;

      const response = await complete({
        messages: [{ role: 'user', content: prompt }],
        tier: TIER_ANALYSIS,
        maxTokens: 600,
        temperature: 0.7,
        userId,
        purpose: 'morning_briefing'
      });

      return response?.content || response?.text || null;
    });

    if (!briefing) {
      return { success: false, reason: 'briefing_generation_failed' };
    }

    // Step 5: Deliver as proactive insight
    await step.run('deliver', async () => {
      await supabaseAdmin
        .from('proactive_insights')
        .insert({
          user_id: userId,
          insight: briefing,
          urgency: 'medium',
          category: 'briefing',
          delivered: false
        });

      // Log agent action
      await supabaseAdmin
        .from('agent_actions')
        .insert({
          user_id: userId,
          skill_name: 'morning_briefing',
          action_type: 'briefing',
          action_content: briefing,
          autonomy_level: 3, // Act & Notify
          platform_sources: [
            calendarData ? 'calendar' : null,
            healthData ? 'whoop' : null,
          ].filter(Boolean),
        });

      // Log agent event
      await supabaseAdmin
        .from('agent_events')
        .insert({
          user_id: userId,
          event_type: 'morning_briefing_generated',
          event_data: {
            hasCalendar: !!calendarData,
            hasHealth: !!healthData,
            briefingLength: briefing.length,
          },
          source: 'morning_briefing_skill',
        });

      log.info('Morning briefing delivered', { userId, chars: briefing.length });
    });

    return {
      success: true,
      userId,
      briefingLength: briefing.length,
      sources: {
        calendar: !!calendarData,
        health: !!healthData,
      }
    };
  }
);

// ── Time-of-day context for appropriate greeting ──────────────────────

function getTimeOfDayContext(localHour) {
  if (localHour >= 5 && localHour < 12) {
    return {
      label: 'morning',
      hint: 'They are starting their day.',
      greetingHint: 'use a morning greeting — "hey", "morning", "bom dia" etc.',
    };
  }
  if (localHour >= 12 && localHour < 17) {
    return {
      label: 'afternoon',
      hint: 'They are in the middle of their day.',
      greetingHint: 'use an afternoon greeting — acknowledge they are mid-day',
    };
  }
  if (localHour >= 17 && localHour < 21) {
    return {
      label: 'evening',
      hint: 'They are winding down their day.',
      greetingHint: 'use an evening greeting — acknowledge the day is wrapping up',
    };
  }
  return {
    label: 'late-night',
    hint: 'It is late at night for them.',
    greetingHint: 'acknowledge it is late — keep it brief and gentle',
  };
}
