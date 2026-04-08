/**
 * Communications Department Executor
 * Drafts emails in the user's voice using their personality profile.
 */

import { complete, TIER_ANALYSIS } from '../llmGateway.js';
import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';

const log = createLogger('CommunicationsExecutor');

/**
 * Draft an email body that matches the user's writing style.
 *
 * @param {string} userId
 * @param {{ to: string, subject: string, context: string }} params
 * @returns {Promise<string|null>} The drafted email body, or null on failure.
 */
export async function draftEmailInUserVoice(userId, { to, subject, context }) {
  if (!userId || !to || !subject) {
    throw new Error('userId, to, and subject are required');
  }

  try {
    // 1. Fetch personality profile (OCEAN + stylometrics) in parallel with voice examples
    const [profileResult, examplesResult] = await Promise.all([
      supabaseAdmin
        .from('user_personality_profiles')
        .select('ocean_openness, ocean_conscientiousness, ocean_extraversion, ocean_agreeableness, ocean_neuroticism, stylometric_fingerprint')
        .eq('user_id', userId)
        .single(),
      supabaseAdmin
        .from('twin_messages')
        .select('content')
        .eq('user_id', userId)
        .eq('role', 'user')
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

    const profile = profileResult.data;
    const examples = examplesResult.data;

    // 2. Build style notes from personality data (graceful when missing)
    const styleNotes = buildStyleNotes(profile);
    const voiceExamples = (examples || []).map(e => e.content).join('\n---\n');

    // 3. LLM prompt — personality-aware email drafting
    const prompt = buildEmailPrompt({ styleNotes, voiceExamples, to, subject, context });

    const response = await complete({
      messages: [{ role: 'user', content: prompt }],
      tier: TIER_ANALYSIS,
      maxTokens: 500,
      temperature: 0.6,
      userId,
      serviceName: 'communications-dept-email-draft',
    });

    const body = response?.content || response?.text || null;

    log.info('Email drafted', { userId, to, subject, bodyLength: body?.length || 0 });
    return body;
  } catch (err) {
    log.error('draftEmailInUserVoice failed', { userId, to, subject, error: err.message });
    throw err;
  }
}

// ── Internal helpers ──────────────────────────────────────────────────

function buildStyleNotes(profile) {
  if (!profile) {
    return 'No personality data available -- use a natural, friendly tone.';
  }

  const parts = [];

  if (profile.stylometric_fingerprint) {
    parts.push(`Writing style: ${JSON.stringify(profile.stylometric_fingerprint)}`);
  }

  const ocean = [
    profile.ocean_openness != null && `Openness: ${profile.ocean_openness}`,
    profile.ocean_conscientiousness != null && `Conscientiousness: ${profile.ocean_conscientiousness}`,
    profile.ocean_extraversion != null && `Extraversion: ${profile.ocean_extraversion}`,
    profile.ocean_agreeableness != null && `Agreeableness: ${profile.ocean_agreeableness}`,
    profile.ocean_neuroticism != null && `Neuroticism: ${profile.ocean_neuroticism}`,
  ].filter(Boolean);

  if (ocean.length > 0) {
    parts.push(`OCEAN personality: ${ocean.join(', ')}`);
  }

  return parts.length > 0
    ? parts.join('\n')
    : 'No personality data available -- use a natural, friendly tone.';
}

function buildEmailPrompt({ styleNotes, voiceExamples, to, subject, context }) {
  return `Draft an email for a user. Write it EXACTLY how they would write it -- match their tone, formality level, and vocabulary.

${styleNotes}

Examples of how this person actually writes:
${voiceExamples || 'No examples available -- use casual professional tone.'}

DRAFT THIS EMAIL:
To: ${to}
Subject: ${subject}
Context: ${context || 'No additional context provided.'}

Rules:
- Match the user's writing style (sentence length, formality, humor level)
- Don't add a signature -- the email client handles that
- Keep it concise unless the context warrants detail
- Return ONLY the email body text, no subject line or headers`;
}
