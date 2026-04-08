/**
 * Inngest Function: Smart Email Draft
 * ====================================
 * Monitors recent emails and drafts personality-matched replies.
 * Uses stylometric fingerprint from OCEAN + writing samples.
 *
 * Trigger: twin/skill.email_draft event (from intelligent triggers or manual)
 * Cooldown: 4 hours between drafts per user
 * Cost: ~$0.0003 per draft (TIER_ANALYSIS — stylometric matching doesn't need Sonnet)
 */

import { inngest, EVENTS } from '../../services/inngestClient.js';
import { complete, TIER_ANALYSIS } from '../../services/llmGateway.js';
import { getBlocks } from '../../services/coreMemoryService.js';
import { getAutonomyBySkillName, logAgentAction } from '../../services/autonomyService.js';
import { isInsightDuplicate } from '../../services/proactiveInsights.js';
import { acquireCooldownLock } from '../../services/skillCooldownLock.js';
import { deliverInsight } from '../../services/messageRouter.js';
import { supabaseAdmin } from '../../services/database.js';
import { createLogger } from '../../services/logger.js';

const log = createLogger('SmartEmailDraft');

const COOLDOWN_HOURS = 4;

/**
 * Score an email for reply urgency.
 * Higher score = more important to reply to.
 */
function scoreEmail(email) {
  let score = 0;
  const subject = (email.subject || '').toLowerCase();
  const from = (email.from || '').toLowerCase();
  const content = (email.content || email.snippet || '').toLowerCase();

  // Urgency keywords in subject
  if (/urgent|asap|important|action required|deadline|time.?sensitive/i.test(subject)) score += 30;
  if (/question|help|request|follow.?up|waiting|reply/i.test(subject)) score += 15;
  if (/re:|fwd:/i.test(subject)) score += 10; // Part of a thread

  // Sender signals
  if (/boss|ceo|cto|manager|director|founder/i.test(from)) score += 20;
  if (!/@(gmail|yahoo|hotmail|outlook)\./i.test(from)) score += 5; // Custom domain = likely professional

  // Content urgency signals
  if (/can you|could you|would you|please|when can|are you available/i.test(content)) score += 10;
  if (/tomorrow|today|this week|by end of/i.test(content)) score += 15;

  return score;
}

export const smartEmailDraftFunction = inngest.createFunction(
  {
    id: 'smart-email-draft',
    name: 'Smart Email Draft',
    retries: 1,
    concurrency: { limit: 1, key: 'event.data.userId' },
  },
  { event: EVENTS.EMAIL_DRAFT },
  async ({ event, step }) => {
    const { userId } = event.data;

    // Step 1: HARD cooldown — check proactive_insights directly.
    const shouldSkip = await step.run('hard-cooldown-check', async () => {
      const cutoff = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();
      const { count } = await supabaseAdmin
        .from('proactive_insights')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('category', 'email_draft')
        .gte('created_at', cutoff);
      return (count || 0) > 0;
    });

    if (shouldSkip) {
      return { success: false, reason: 'cooldown', message: `Email draft insight exists within last ${COOLDOWN_HOURS}h` };
    }

    // Step 2: Check prerequisites — Gmail connected + autonomy
    const prerequisites = await step.run('check-prerequisites', async () => {
      const autonomyLevel = await getAutonomyBySkillName(userId, 'email_draft');
      if (autonomyLevel === -1) return { skip: true, reason: 'skill_disabled' };

      // Atomic cooldown lock to prevent parallel executions
      const lock = await acquireCooldownLock(userId, 'email_draft', COOLDOWN_HOURS);
      if (!lock.acquired) return { skip: true, reason: 'cooldown_lock' };

      // Check Gmail connection via platform_data presence
      const { count } = await supabaseAdmin
        .from('platform_data')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('provider', 'google_gmail');

      if (!count || count === 0) return { skip: true, reason: 'gmail_not_connected' };

      return { skip: false, autonomyLevel };
    });

    if (prerequisites.skip) {
      return { success: false, reason: prerequisites.reason };
    }

    // Step 3: Gather recent email data from platform_data and memory stream
    const emails = await step.run('gather-emails', async () => {
      const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

      // Fetch from platform_data (structured Gmail data)
      const { data: platformEmails } = await supabaseAdmin
        .from('platform_data')
        .select('raw_data, created_at')
        .eq('user_id', userId)
        .eq('provider', 'google_gmail')
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(5);

      // Also fetch email observations from memory stream
      const { data: emailMemories } = await supabaseAdmin
        .from('user_memories')
        .select('content, metadata, created_at')
        .eq('user_id', userId)
        .eq('memory_type', 'platform_data')
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(50);

      const emailObs = (emailMemories || []).filter(m =>
        m.metadata?.platform === 'google_gmail' ||
        m.content?.toLowerCase().includes('email') ||
        m.content?.toLowerCase().includes('inbox')
      );

      return {
        structured: (platformEmails || []).map(e => e.raw_data).filter(Boolean),
        observations: emailObs.map(m => m.content).slice(0, 10),
      };
    });

    const hasData = emails.structured.length > 0 || emails.observations.length > 0;
    if (!hasData) {
      return { success: false, reason: 'no_email_data', message: 'No recent email data found' };
    }

    // Step 4: Select the most important unanswered email
    const selectedEmail = await step.run('select-email', async () => {
      // Extract individual emails from structured data
      const allEmails = [];

      for (const rawData of emails.structured) {
        if (Array.isArray(rawData)) {
          allEmails.push(...rawData);
        } else if (rawData.messages && Array.isArray(rawData.messages)) {
          allEmails.push(...rawData.messages);
        } else if (rawData.subject || rawData.from) {
          allEmails.push(rawData);
        }
      }

      if (allEmails.length === 0) {
        // Fall back to observations — pick the most recent one
        return {
          source: 'observation',
          context: emails.observations.slice(0, 5).join('\n'),
        };
      }

      // Score and sort emails
      const scored = allEmails.map(email => ({
        ...email,
        urgencyScore: scoreEmail(email),
      }));

      scored.sort((a, b) => b.urgencyScore - a.urgencyScore);

      const best = scored[0];
      return {
        source: 'structured',
        from: best.from || best.sender || 'Unknown',
        subject: best.subject || 'No subject',
        snippet: (best.snippet || best.body || best.content || '').slice(0, 800),
        urgencyScore: best.urgencyScore,
      };
    });

    // Step 5: Draft reply using soul signature + writing style
    const draft = await step.run('draft-reply', async () => {
      const [blocks, profile] = await Promise.all([
        getBlocks(userId),
        supabaseAdmin
          .from('user_personality_profiles')
          .select('openness, conscientiousness, extraversion, agreeableness, neuroticism, stylometric_fingerprint, avg_sentence_length, formality_score, vocabulary_richness')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .single()
          .then(r => r.data)
          .catch(() => null),
      ]);

      const soul = blocks?.soul_signature?.content || '';
      const human = blocks?.human?.content || '';

      // Build writing style section from personality profile
      let styleSection = '';
      if (profile) {
        const sl = profile.avg_sentence_length || profile.stylometric_fingerprint?.avg_sentence_length;
        const f = profile.formality_score || profile.stylometric_fingerprint?.formality_score;
        styleSection = `\nWRITING STYLE TO MATCH:
- Sentences: ${sl ? (sl < 12 ? 'short, punchy' : sl < 20 ? 'medium' : 'long, detailed') : 'natural'}
- Formality: ${f != null ? (f < 0.3 ? 'very casual' : f < 0.6 ? 'balanced' : 'professional') : 'natural'}
- OCEAN: O=${((profile.openness || 0.5) * 100).toFixed(0)} C=${((profile.conscientiousness || 0.5) * 100).toFixed(0)} E=${((profile.extraversion || 0.5) * 100).toFixed(0)} A=${((profile.agreeableness || 0.5) * 100).toFixed(0)} N=${((profile.neuroticism || 0.5) * 100).toFixed(0)}`;
      }

      // Build the email context for the prompt
      let emailContext;
      if (selectedEmail.source === 'structured') {
        emailContext = `FROM: ${selectedEmail.from}
SUBJECT: ${selectedEmail.subject}
CONTENT: ${selectedEmail.snippet}`;
      } else {
        emailContext = `RECENT EMAIL OBSERVATIONS:\n${selectedEmail.context}`;
      }

      const prompt = `You are a digital twin drafting an email reply for your human. The reply must sound EXACTLY like them — not like an AI assistant.

PERSONALITY:
${soul}

ABOUT THEM:
${human}
${styleSection}

EMAIL TO REPLY TO:
${emailContext}

Draft a reply to this email IN THEIR EXACT VOICE. Rules:
1. Match their writing style precisely (sentence length, formality, vocabulary)
2. Include greeting and sign-off that match their personality
3. Address the email's content directly and helpfully
4. Sound like a real person, NOT a corporate template
5. Keep it concise — match typical email length for this context

Format:
SUBJECT: Re: [original subject or new subject]
---
[The full email draft]
---`;

      const response = await complete({
        messages: [{ role: 'user', content: prompt }],
        tier: TIER_ANALYSIS,
        maxTokens: 500,
        temperature: 0.6,
        userId,
        serviceName: 'inngest-smart-email-draft',
      });

      return response?.content || response?.text || null;
    });

    if (!draft) {
      return { success: false, reason: 'generation_failed', message: 'LLM failed to generate draft' };
    }

    // Step 6: Deliver — store as proactive insight + deliver via message router
    const delivery = await step.run('deliver', async () => {
      // Compose the insight text
      const emailLabel = selectedEmail.source === 'structured'
        ? `Re: ${selectedEmail.subject} (from ${selectedEmail.from})`
        : 'Based on recent email activity';

      const insightText = `📧 Draft reply ready — ${emailLabel}\n\n${draft}`;

      // Dedup check
      if (await isInsightDuplicate(userId, insightText, 'email_draft')) {
        log.info('Email draft deduplicated — skipping insert', { userId });
        return { deduplicated: true };
      }

      // Store as proactive insight
      const { data: insight } = await supabaseAdmin
        .from('proactive_insights')
        .insert({
          user_id: userId,
          insight: insightText,
          urgency: 'medium',
          category: 'email_draft',
          delivered: false,
        })
        .select('id')
        .single();

      // Deliver via message router (push, Telegram, etc.)
      try {
        await deliverInsight(userId, {
          id: insight?.id,
          insight: insightText,
          urgency: 'medium',
          category: 'email_draft',
        });
      } catch (err) {
        log.warn('Message router delivery failed (non-fatal)', { userId, error: err.message });
      }

      // Log agent action
      await logAgentAction(userId, {
        skillName: 'email_draft',
        actionType: 'suggestion',
        content: `Draft reply: ${emailLabel}`.slice(0, 300),
        autonomyLevel: prerequisites.autonomyLevel,
        platformSources: ['google_gmail'],
      });

      // Log agent event
      await supabaseAdmin.from('agent_events').insert({
        user_id: userId,
        event_type: 'email_draft_generated',
        event_data: {
          emailSource: selectedEmail.source,
          emailFrom: selectedEmail.from || null,
          emailSubject: selectedEmail.subject || null,
          urgencyScore: selectedEmail.urgencyScore || null,
          draftLength: draft.length,
        },
        source: 'email_draft_skill',
      });

      log.info('Smart Email Draft delivered', {
        userId,
        source: selectedEmail.source,
        draftLength: draft.length,
      });

      return { delivered: true };
    });

    return {
      success: true,
      userId,
      emailSource: selectedEmail.source,
      emailFrom: selectedEmail.from || null,
      emailSubject: selectedEmail.subject || null,
      draftLength: draft.length,
      deduplicated: delivery.deduplicated || false,
    };
  }
);
