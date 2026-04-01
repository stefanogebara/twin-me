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
import { deliverInsight } from '../../services/messageRouter.js';
import { createLogger } from '../../services/logger.js';

const log = createLogger('MorningBriefing');

export const morningBriefingFunction = inngest.createFunction(
  {
    id: 'morning-briefing',
    name: 'Daily Morning Briefing',
    retries: 2,
    concurrency: { limit: 1, key: 'event.data.userId' },
  },
  { event: EVENTS.GENERATE_BRIEFING },
  async ({ event, step }) => {
    const { userId } = event.data;

    // Step 0: Hard cooldown — max 1 briefing per 20 hours
    const shouldSkip = await step.run('hard-cooldown-check', async () => {
      const cutoff = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
      const { count } = await supabaseAdmin
        .from('proactive_insights')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('category', 'briefing')
        .gte('created_at', cutoff);
      return (count || 0) > 0;
    });

    if (shouldSkip) {
      return { success: false, reason: 'cooldown', message: 'Briefing exists within last 20h' };
    }

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

      const hasCalendar = !!calendarData;
      const hasHealth = !!healthData;

      const prompt = `You are composing a ${timeContext.label} briefing for someone as their digital twin.

CURRENT TIME: ${dayOfWeek}, ~${saoPauloHour}:00 in their timezone. ${timeContext.hint}

WHO THEY ARE:
${soulSignature}

WHAT YOU KNOW:
${humanBlock}

GOALS:
${goalsBlock}

${hasCalendar ? `TODAY'S CALENDAR:\n${JSON.stringify(calendarData).slice(0, 1500)}` : '[NO CALENDAR DATA — skip calendar section entirely]'}

${hasHealth ? `HEALTH/RECOVERY:\n${JSON.stringify(healthData).slice(0, 800)}` : '[NO HEALTH DATA — skip health section entirely]'}

GROUNDING RULES (CRITICAL — read before writing):
- ONLY mention specific times, events, numbers, scores, or facts that appear in the data above.
- If a section says "NO DATA", do NOT guess or fill in. Skip that topic completely.
- NEVER fabricate sleep times, commit times, workout times, or any specific numbers.
- NEVER say "I saw you were up until 3am" unless a timestamp proves it.
- It is MUCH better to write a shorter briefing with only real data than a longer one with guesses.
- If you have almost no data, just give a warm greeting + what you DO know. That's fine.

Write a warm, concise ${timeContext.label} briefing (2-3 short paragraphs, max 120 words).
${timeContext.greetingHint}
${hasHealth ? '- Include recovery/health data (friend tone, not clinical)' : ''}
${hasCalendar ? '- Highlight today\'s agenda' : ''}
${hasCalendar && hasHealth ? '- One insight connecting calendar + health' : ''}
- End with something encouraging

Casual, warm, USEFUL. Like a text from a smart friend. No bullet lists.`;

      const response = await complete({
        messages: [{ role: 'user', content: prompt }],
        tier: TIER_ANALYSIS,
        maxTokens: 600,
        temperature: 0.7,
        userId,
        serviceName: 'inngest-morning-briefing',
      });

      return response?.content || response?.text || null;
    });

    if (!briefing) {
      return { success: false, reason: 'briefing_generation_failed' };
    }

    // Step 5: Deliver as proactive insight
    await step.run('deliver', async () => {
      const { data: insertedInsight } = await supabaseAdmin
        .from('proactive_insights')
        .insert({
          user_id: userId,
          insight: briefing,
          urgency: 'medium',
          category: 'briefing',
          delivered: false
        })
        .select('id, insight, category, urgency')
        .single();

      // Deliver to all enabled channels (WhatsApp, Telegram, push)
      if (insertedInsight) {
        try {
          await deliverInsight(userId, insertedInsight);
          log.info('Morning briefing delivered to messaging channels', { userId });
        } catch (deliverErr) {
          log.warn('Channel delivery failed', { userId, error: deliverErr.message });
        }
      }

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
