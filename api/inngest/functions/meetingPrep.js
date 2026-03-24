/**
 * Inngest Function: Meeting Prep — Auto-Generate Briefing Before Events
 * =====================================================================
 * Runs ~30 minutes before each upcoming meeting. Gathers context from
 * memory stream, platform data, and past interactions to generate
 * a personalized briefing.
 *
 * Trigger: twin/skill.meeting_prep (from intelligent triggers or manual)
 * Cooldown: 1 per event (dedup by event ID)
 * Cost: ~$0.003 per briefing (TIER_EXTRACTION)
 */

import { inngest, EVENTS } from '../../services/inngestClient.js';
import { complete, TIER_EXTRACTION } from '../../services/llmGateway.js';
import { getBlocks } from '../../services/coreMemoryService.js';
import { retrieveMemories } from '../../services/memoryStreamService.js';
import { deliverInsight } from '../../services/messageRouter.js';
import { logAgentAction } from '../../services/autonomyService.js';
import { supabaseAdmin } from '../../services/database.js';
import { createLogger } from '../../services/logger.js';

const log = createLogger('MeetingPrep');

export const meetingPrepFunction = inngest.createFunction(
  {
    id: 'meeting-prep',
    name: 'Meeting Prep Briefing',
    retries: 2,
    concurrency: { limit: 1, key: 'event.data.userId' },
  },
  { event: EVENTS.MEETING_PREP },
  async ({ event, step }) => {
    const { userId, eventId, eventTitle, eventStart, attendees } = event.data;

    // ── Step 0: Hard cooldown — max 1 briefing per event (dedup by event ID via agent_events) ──
    const shouldSkip = await step.run('hard-cooldown-check', async () => {
      if (!eventId) return false; // No event ID = manual trigger, allow

      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabaseAdmin
        .from('agent_events')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('event_type', 'meeting_prep_generated')
        .gte('created_at', cutoff)
        .contains('event_data', { eventId });

      return (count || 0) > 0;
    });

    if (shouldSkip) {
      return { success: false, reason: 'cooldown', message: 'Briefing already generated for this event' };
    }

    // ── Step 1: Gather event context from platform_data ──────────────
    const eventContext = await step.run('gather-event-context', async () => {
      // If event details were passed in the trigger, use those
      if (eventTitle && eventStart) {
        return {
          title: eventTitle,
          start: eventStart,
          attendees: attendees || [],
          eventId: eventId || null,
          source: 'trigger_data',
        };
      }

      // Otherwise fetch from google_calendar platform_data
      try {
        const { data } = await supabaseAdmin
          .from('platform_data')
          .select('raw_data')
          .eq('user_id', userId)
          .eq('provider', 'google_calendar')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (!data?.raw_data) return null;

        const calendarData = data.raw_data;
        const events = calendarData.items || calendarData.events || (Array.isArray(calendarData) ? calendarData : []);

        // Find the next upcoming event within 2 hours
        const now = new Date();
        const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);

        const upcomingEvent = events.find(evt => {
          const start = new Date(evt.start?.dateTime || evt.start?.date || evt.start);
          return start > now && start <= twoHoursFromNow;
        });

        if (!upcomingEvent) return null;

        const eventAttendees = (upcomingEvent.attendees || [])
          .map(a => ({
            name: a.displayName || a.email?.split('@')[0] || 'Unknown',
            email: a.email || null,
            responseStatus: a.responseStatus || null,
          }))
          .filter(a => a.email);

        return {
          title: upcomingEvent.summary || upcomingEvent.title || 'Untitled Meeting',
          start: upcomingEvent.start?.dateTime || upcomingEvent.start?.date || upcomingEvent.start,
          end: upcomingEvent.end?.dateTime || upcomingEvent.end?.date || upcomingEvent.end || null,
          location: upcomingEvent.location || null,
          description: (upcomingEvent.description || '').slice(0, 500),
          attendees: eventAttendees,
          eventId: upcomingEvent.id || eventId || null,
          source: 'google_calendar',
        };
      } catch {
        return null;
      }
    });

    if (!eventContext) {
      return { success: false, reason: 'no_event', message: 'No upcoming event found' };
    }

    // ── Step 2: Gather attendee context from memory stream ───────────
    const attendeeContext = await step.run('gather-attendee-context', async () => {
      const attendeeNames = eventContext.attendees
        .map(a => a.name)
        .filter(name => name && name !== 'Unknown');

      if (attendeeNames.length === 0) return [];

      const attendeeMemories = [];
      for (const name of attendeeNames.slice(0, 5)) { // Cap at 5 attendees
        try {
          const memories = await retrieveMemories(
            userId,
            `${name} person interaction meeting conversation`,
            5,
            'default'
          );
          if (memories.length > 0) {
            attendeeMemories.push({
              name,
              memories: memories.map(m => m.content).slice(0, 3),
            });
          }
        } catch {
          // Individual attendee lookup failure is non-fatal
        }
      }

      return attendeeMemories;
    });

    // ── Step 3: Gather topic context from memory stream ──────────────
    const topicContext = await step.run('gather-topic-context', async () => {
      const searchQuery = eventContext.title + (eventContext.description ? ` ${eventContext.description}` : '');

      try {
        const memories = await retrieveMemories(
          userId,
          searchQuery,
          8,
          'default'
        );
        return memories.map(m => m.content).slice(0, 6);
      } catch {
        return [];
      }
    });

    // ── Step 4: Gather health/energy context (Whoop) ─────────────────
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

    // ── Step 5: Get core memory blocks for personality context ────────
    const coreBlocks = await step.run('gather-personality', async () => {
      return getBlocks(userId);
    });

    // ── Step 6: Compose the briefing with LLM ────────────────────────
    const briefing = await step.run('compose-briefing', async () => {
      const soulSignature = coreBlocks.soul_signature?.content || '';
      const humanBlock = coreBlocks.human?.content || '';

      // Format attendee context
      const attendeeSection = attendeeContext.length > 0
        ? attendeeContext.map(a =>
            `**${a.name}**: ${a.memories.join(' | ')}`
          ).join('\n')
        : 'No prior context on attendees.';

      // Format topic context
      const topicSection = topicContext.length > 0
        ? topicContext.join('\n- ')
        : 'No related memories found.';

      // Format health context
      let healthSection = 'No health data available.';
      if (healthData) {
        const recovery = healthData.recovery_score ?? healthData.score?.recovery_score;
        const sleep = healthData.sleep_hours;
        const hrv = healthData.hrv ?? healthData.score?.hrv_rmssd_milli;
        const parts = [];
        if (recovery != null) parts.push(`Recovery: ${recovery}%`);
        if (sleep != null) parts.push(`Sleep: ${sleep}h`);
        if (hrv != null) parts.push(`HRV: ${Math.round(hrv)}ms`);
        healthSection = parts.length > 0 ? parts.join(', ') : 'No health data available.';
      }

      // Format meeting time
      const meetingTime = new Date(eventContext.start);
      const timeStr = meetingTime.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/Sao_Paulo',
      });
      const dayStr = meetingTime.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        timeZone: 'America/Sao_Paulo',
      });

      const attendeeList = eventContext.attendees
        .map(a => a.name)
        .filter(n => n !== 'Unknown')
        .join(', ') || 'No attendees listed';

      const prompt = `You are composing a meeting prep briefing for someone as their digital twin — a close friend who knows them deeply.

WHO THEY ARE:
${soulSignature}

WHAT YOU KNOW ABOUT THEM:
${humanBlock}

MEETING DETAILS:
- Title: "${eventContext.title}"
- When: ${dayStr} at ${timeStr}
- Where: ${eventContext.location || 'Not specified'}
- Attendees: ${attendeeList}
${eventContext.description ? `- Description: ${eventContext.description}` : ''}

WHAT YOU KNOW ABOUT THE ATTENDEES:
${attendeeSection}

RELEVANT MEMORIES (related to the meeting topic):
- ${topicSection}

ENERGY/RECOVERY:
${healthSection}

Write a warm, concise meeting prep briefing (3-5 short paragraphs). Include:
1. Meeting summary (who, what, when, where) — keep it brief
2. Key attendee context — what you know about the people they're meeting (from memory). If nothing, say so briefly.
3. Relevant context from their memory stream — anything they've been thinking about, working on, or discussing that relates to this meeting
4. 2-3 suggested talking points based on the topic and what you know about them
5. Energy context if health data is available (frame as a friend would)

Keep it casual, warm, and USEFUL. No corporate speak. No bullet lists.
Write it like a text from their smartest, most perceptive friend who's helping them prepare.
If you don't have context on attendees or topics, acknowledge it naturally — don't make things up.`;

      const response = await complete({
        messages: [{ role: 'user', content: prompt }],
        tier: TIER_EXTRACTION,
        maxTokens: 700,
        temperature: 0.7,
        userId,
        serviceName: 'inngest-meeting-prep',
      });

      return response?.content || response?.text || null;
    });

    if (!briefing) {
      return { success: false, reason: 'briefing_generation_failed' };
    }

    // ── Step 7: Deliver as proactive insight via message router ───────
    await step.run('deliver', async () => {
      const insight = {
        user_id: userId,
        insight: briefing,
        urgency: 'medium',
        category: 'meeting_prep',
      };

      await supabaseAdmin
        .from('proactive_insights')
        .insert({
          ...insight,
          delivered: false,
        });

      await deliverInsight(userId, insight);

      // Log agent action
      await logAgentAction(userId, {
        skillName: 'meeting_prep',
        actionType: 'briefing',
        content: `Meeting prep for "${eventContext.title}" — ${briefing.slice(0, 200)}`,
        autonomyLevel: 1,
        platformSources: [
          'google_calendar',
          healthData ? 'whoop' : null,
        ].filter(Boolean),
      });

      // Log agent event
      await supabaseAdmin
        .from('agent_events')
        .insert({
          user_id: userId,
          event_type: 'meeting_prep_generated',
          event_data: {
            eventId: eventContext.eventId,
            eventTitle: eventContext.title,
            attendeeCount: eventContext.attendees.length,
            hasAttendeeContext: attendeeContext.length > 0,
            hasTopicContext: topicContext.length > 0,
            hasHealth: !!healthData,
            briefingLength: briefing.length,
          },
          source: 'meeting_prep_skill',
        });

      log.info('Meeting prep delivered', {
        userId,
        event: eventContext.title,
        chars: briefing.length,
      });
    });

    return {
      success: true,
      userId,
      eventTitle: eventContext.title,
      briefingLength: briefing.length,
      sources: {
        attendeeContext: attendeeContext.length,
        topicMemories: topicContext.length,
        health: !!healthData,
      },
    };
  }
);
