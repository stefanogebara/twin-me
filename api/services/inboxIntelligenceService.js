/**
 * Inbox Intelligence Service
 * ===========================
 * Scans unread Gmail for the last 48h, filters noise, scores real emails
 * by urgency/opportunity/relationship, cross-references senders with the
 * user's memory stream, and generates a draft reply for each.
 *
 * Output is a WhatsApp-ready brief + structured email data for the in-app view.
 * Called as a step in the Inngest morning briefing function.
 */

import { getEmails } from './googleWorkspaceActions.js';
import { complete, TIER_EXTRACTION, TIER_ANALYSIS } from './llmGateway.js';
import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';

const log = createLogger('InboxIntelligence');

const MAX_EMAILS_TO_SCORE = 20;
const MAX_EMAILS_TO_SURFACE = 5;

// Senders that are always noise — no real person is waiting
const NOISE_PATTERNS = [
  'noreply', 'no-reply', 'donotreply', 'do-not-reply',
  'notifications@', 'newsletter', 'updates@', 'hello@mail',
  'support@', 'info@mail', 'mailer@', 'bounce@', 'mailchimp',
  'sendgrid', 'beehiiv', 'substack.com', 'github.com',
  'linkedin.com', 'twitter.com', 'instagram.com', 'facebook.com',
  'samsung', 'glovo', 'uber', 'ifood', 'amazon',
];

function isNoise(from = '') {
  const f = from.toLowerCase();
  return NOISE_PATTERNS.some(p => f.includes(p));
}

function extractName(from = '') {
  // "Pedro Alves <pedro@example.com>" → "Pedro Alves"
  const match = from.match(/^([^<]+)</);
  if (match) return match[1].trim();
  // "pedro@example.com" → "pedro"
  return from.split('@')[0].replace(/[._]/g, ' ').trim();
}

function extractEmail(from = '') {
  const match = from.match(/<(.+)>/);
  return match ? match[1] : from;
}

/**
 * Search user_memories for any mentions of a sender's name or email.
 */
async function getSenderContext(userId, from) {
  const email = extractEmail(from);
  const name = extractName(from);
  const searchTerm = name.length > 3 ? name : email.split('@')[0];

  const { data } = await supabaseAdmin
    .from('user_memories')
    .select('content')
    .eq('user_id', userId)
    .ilike('content', `%${searchTerm}%`)
    .limit(3);

  return (data || []).map(m => m.content).join(' | ') || null;
}

/**
 * Score emails and generate a one-sentence summary of each using LLM.
 * Returns a scored, sorted, filtered list of real emails.
 */
async function scoreEmails(userId, emails) {
  if (!emails.length) return [];

  const emailList = emails.map((e, i) =>
    `${i + 1}. From: ${e.from} | Subject: ${e.subject || '(no subject)'} | Preview: ${(e.snippet || '').slice(0, 120)}`
  ).join('\n');

  const prompt = `You are triaging emails for someone's morning brief. Score and summarize each email.

EMAILS:
${emailList}

For each email, return a JSON object. Score 1-10 on three axes:
- urgency: how time-sensitive is this? (deadline today = 10, newsletter = 1)
- opportunity: could this lead to business value, money, or career benefit? (investor inquiry = 10, receipt = 1)
- relationship: is a real person waiting for a reply? (personal friend = 10, automated bot = 1)

Return ONLY a valid JSON array, no markdown, no explanation:
[{"index":1,"urgency":7,"opportunity":5,"relationship":8,"summary":"wants to schedule a call to discuss the proposal","category":"relationship"},...]

Categories: lead | relationship | action_required | fyi | noise
Mark as "noise" if it is clearly automated, promotional, or no reply is needed.`;

  const response = await complete({
    messages: [{ role: 'user', content: prompt }],
    tier: TIER_EXTRACTION,
    maxTokens: 500,
    temperature: 0.1,
    userId,
    serviceName: 'inbox-score',
  });

  const text = response?.content || '';
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) {
    log.warn('Failed to parse email scores', { userId, text: text.slice(0, 200) });
    return [];
  }

  try {
    const scored = JSON.parse(match[0]);
    return scored
      .filter(s => s.category !== 'noise' && s.category !== 'fyi')
      .map(s => {
        const email = emails[s.index - 1];
        if (!email) return null;
        return {
          ...email,
          score: (s.urgency + s.opportunity + s.relationship) / 3,
          urgency: s.urgency,
          opportunity: s.opportunity,
          relationship: s.relationship,
          summary: s.summary,
          category: s.category,
        };
      })
      .filter(Boolean)
      .filter(e => e.score >= 4)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_EMAILS_TO_SURFACE);
  } catch (err) {
    log.warn('JSON parse failed for email scores', { userId, error: err.message });
    return [];
  }
}

/**
 * Generate a short draft reply for a single email in the user's voice.
 */
async function generateDraft(userId, email, senderContext) {
  const contextSection = senderContext
    ? `\nWhat I know about this person from past interactions: ${senderContext}`
    : '';

  const prompt = `Write a short email reply on behalf of the user. Be natural and personal, not corporate.

EMAIL:
From: ${email.from}
Subject: ${email.subject || '(no subject)'}
Content: ${email.snippet}${contextSection}

Write 2-4 sentences maximum. Write the actual reply text — no placeholders, no [brackets], no "Dear X". Just the reply body. Casual and direct.`;

  const response = await complete({
    messages: [{ role: 'user', content: prompt }],
    tier: TIER_ANALYSIS,
    maxTokens: 150,
    temperature: 0.7,
    userId,
    serviceName: 'inbox-draft',
  });

  return response?.content?.trim() || null;
}

/**
 * Generate the full inbox intelligence brief for a user.
 *
 * @param {string} userId
 * @returns {Promise<{
 *   message: string,        — WhatsApp-ready plain text
 *   emails: Array,          — enriched email objects with summary + draft
 *   count: number
 * } | null>}
 */
export async function generateInboxBrief(userId) {
  // Fetch recent unread emails
  const emailResult = await getEmails(userId, {
    query: 'is:unread newer_than:2d',
    maxResults: MAX_EMAILS_TO_SCORE,
  });

  if (!emailResult.success) {
    log.info('Gmail not connected or fetch failed', { userId, error: emailResult.error });
    return null;
  }

  const rawEmails = (emailResult.emails || []).filter(e => !e.error);
  if (!rawEmails.length) return null;

  // Filter noise upfront to save LLM tokens
  const realEmails = rawEmails.filter(e => !isNoise(e.from));
  if (!realEmails.length) return null;

  log.info('Scoring emails', { userId, total: rawEmails.length, real: realEmails.length });

  // Score and surface top emails
  const topEmails = await scoreEmails(userId, realEmails);
  if (!topEmails.length) return null;

  // Enrich with sender context + generate drafts (parallel per email)
  const enrichedEmails = await Promise.all(
    topEmails.map(async (email) => {
      const [senderContext, draft] = await Promise.all([
        getSenderContext(userId, email.from),
        generateDraft(userId, email, null), // draft first without context (faster)
      ]);
      return { ...email, senderContext, draft };
    })
  );

  // Build WhatsApp-ready message (no emojis per platform rules)
  const count = enrichedEmails.length;
  const lines = [
    `${count} email${count !== 1 ? 's' : ''} need${count === 1 ? 's' : ''} your attention:`,
    '',
  ];

  for (const [i, email] of enrichedEmails.entries()) {
    const name = extractName(email.from);
    lines.push(`${i + 1}. ${name} — ${email.summary}`);
  }

  lines.push('');
  lines.push('Open TwinMe to see drafts and reply in one tap.');

  return {
    message: lines.join('\n'),
    emails: enrichedEmails,
    count,
  };
}
