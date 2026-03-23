/**
 * Inngest Function: Smart Email Triage
 * ======================================
 * Analyzes recent email activity and composes proactive suggestions:
 * - Identifies email patterns (busy inbox, important senders, overdue replies)
 * - Composes draft reply suggestions in the user's voice
 * - Uses stylometric fingerprint + OCEAN for voice matching
 *
 * Read-only: uses existing gmail.readonly data, no send capability.
 * The twin suggests; the user acts.
 *
 * Trigger: daily cron or on Gmail observation ingestion
 * Cost: ~$0.0003 per trigger (one TIER_ANALYSIS call)
 */

import { inngest, EVENTS } from '../../services/inngestClient.js';
import { complete, TIER_ANALYSIS } from '../../services/llmGateway.js';
import { getBlocks } from '../../services/coreMemoryService.js';
import { getAutonomyBySkillName, logAgentAction } from '../../services/autonomyService.js';
import { isInsightDuplicate } from '../../services/proactiveInsights.js';
import { acquireCooldownLock } from '../../services/skillCooldownLock.js';
import { supabaseAdmin } from '../../services/database.js';
import { createLogger } from '../../services/logger.js';

const log = createLogger('EmailTriage');

const COOLDOWN_HOURS = 20; // Once per day max

export const emailTriageFunction = inngest.createFunction(
  {
    id: 'email-triage',
    name: 'Smart Email Triage',
    retries: 1,
  },
  { event: EVENTS.EMAIL_TRIAGE },
  async ({ event, step }) => {
    const { userId } = event.data;

    // Step 1: Atomic cooldown lock
    const lock = await step.run('acquire-cooldown-lock', async () => {
      return acquireCooldownLock(userId, 'email_triage', COOLDOWN_HOURS);
    });

    if (!lock.acquired) return { success: false, reason: 'cooldown', message: lock.reason };

    // Step 2: Check autonomy
    const autonomyLevel = await step.run('check-autonomy', async () => {
      // email_triage isn't seeded yet — default to SUGGEST if skill not found
      const level = await getAutonomyBySkillName(userId, 'email_triage');
      return level;
    });

    if (autonomyLevel === -1) return { success: false, reason: 'skill_disabled' };

    // Step 3: Gather email observations from memory stream (last 48h)
    const emailContext = await step.run('gather-email-data', async () => {
      const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const { data: memories } = await supabaseAdmin
        .from('user_memories')
        .select('content, metadata, created_at')
        .eq('user_id', userId)
        .eq('memory_type', 'platform_data')
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(50);

      // Filter to email-related observations
      const emailMems = (memories || []).filter(m =>
        m.metadata?.platform === 'google_gmail' ||
        m.metadata?.platform === 'outlook' ||
        m.content?.toLowerCase().includes('email') ||
        m.content?.toLowerCase().includes('inbox') ||
        m.content?.toLowerCase().includes('sent')
      );

      return emailMems.map(m => m.content).slice(0, 10);
    });

    if (emailContext.length === 0) {
      return { success: false, reason: 'no_email_data' };
    }

    // Step 4: Gather calendar context (for prioritization)
    const calendarContext = await step.run('gather-calendar', async () => {
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
          if (data?.raw_data) return JSON.stringify(data.raw_data).slice(0, 600);
        } catch { /* next */ }
      }
      return null;
    });

    // Step 5: Get personality + writing style
    const personality = await step.run('gather-personality', async () => {
      const [blocks, profile] = await Promise.all([
        getBlocks(userId),
        supabaseAdmin
          .from('user_personality_profiles')
          .select('openness, conscientiousness, extraversion, agreeableness, neuroticism, avg_sentence_length, formality_score, vocabulary_richness')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .single()
          .then(r => r.data)
          .catch(() => null)
      ]);

      return { blocks, profile };
    });

    // Step 6: Compose email triage with draft suggestions
    const triage = await step.run('compose-triage', async () => {
      const soul = personality.blocks?.soul_signature?.content || '';
      const human = personality.blocks?.human?.content || '';
      const prof = personality.profile;

      let styleSection = '';
      if (prof) {
        const sl = prof.avg_sentence_length;
        const f = prof.formality_score;
        styleSection = `\nWRITING STYLE TO MATCH:
- Sentences: ${sl ? (sl < 12 ? 'short, punchy' : sl < 20 ? 'medium' : 'long, detailed') : 'natural'}
- Formality: ${f != null ? (f < 0.3 ? 'very casual' : f < 0.6 ? 'balanced' : 'professional') : 'natural'}
- OCEAN: O=${((prof.openness||0.5)*100).toFixed(0)} C=${((prof.conscientiousness||0.5)*100).toFixed(0)} E=${((prof.extraversion||0.5)*100).toFixed(0)} A=${((prof.agreeableness||0.5)*100).toFixed(0)} N=${((prof.neuroticism||0.5)*100).toFixed(0)}`;
      }

      const prompt = `You are a digital twin analyzing your human's email situation and suggesting how to handle it.

PERSONALITY:
${soul}

CONTEXT:
${human}

RECENT EMAIL OBSERVATIONS:
${emailContext.join('\n')}

TODAY'S SCHEDULE:
${calendarContext || 'No calendar data'}
${styleSection}

Write a brief, helpful email triage (2-3 paragraphs). Include:
1. Quick summary of email activity (volume, notable senders, patterns)
2. If there are emails that seem to need attention, suggest a draft reply — write it IN THEIR VOICE (match the writing style above)
3. Any email habits you notice (response time, inbox management)

Format any draft replies as:
---
TO: [person/context]
DRAFT: [the actual reply text in their voice]
---

Keep the overall tone casual and friend-like. This is their twin helping with email, not an assistant generating reports.`;

      const response = await complete({
        messages: [{ role: 'user', content: prompt }],
        tier: TIER_ANALYSIS,
        maxTokens: 700,
        temperature: 0.7,
        userId,
        serviceName: 'inngest-email-triage',
      });

      return response?.content || response?.text || null;
    });

    if (!triage) return { success: false, reason: 'generation_failed' };

    // Step 7: Deliver (with dedup check)
    await step.run('deliver', async () => {
      if (await isInsightDuplicate(userId, triage, 'email_triage')) {
        log.info('Email triage deduplicated — skipping insert', { userId });
        return;
      }

      await supabaseAdmin.from('proactive_insights').insert({
        user_id: userId,
        insight: triage,
        urgency: 'medium',
        category: 'email_triage',
        delivered: false,
      });

      await logAgentAction(userId, {
        skillName: 'email_triage',
        actionType: 'suggestion',
        content: triage.slice(0, 300),
        autonomyLevel,
        platformSources: ['google_gmail'],
      });

      await supabaseAdmin.from('agent_events').insert({
        user_id: userId,
        event_type: 'email_triage_generated',
        event_data: {
          emailObservations: emailContext.length,
          hasCalendar: !!calendarContext,
          triageLength: triage.length,
        },
        source: 'email_triage_skill',
      });

      log.info('Email triage delivered', { userId, chars: triage.length });
    });

    return {
      success: true,
      userId,
      emailObservations: emailContext.length,
      triageLength: triage.length,
    };
  }
);
