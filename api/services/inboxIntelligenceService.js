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

import { getEmails, getEmail } from './googleWorkspaceActions.js';
import { complete, TIER_EXTRACTION, TIER_ANALYSIS } from './llmGateway.js';
import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';
import { isNoise } from './noiseSenders.js';
import { proposeDepartmentAction, getPendingProposals } from './departmentService.js';

const log = createLogger('InboxIntelligence');

const MAX_EMAILS_TO_SCORE = 20;
const MAX_EMAILS_TO_SURFACE = 5;

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

// Common first names that produce false-positive matches when ilike'd against
// memory content. Anything in this set must match by full email instead.
const GENERIC_NAME_STOPWORDS = new Set([
  'stefano', 'maria', 'joão', 'joao', 'ana', 'pedro', 'lucas', 'carlos',
  'paulo', 'jose', 'josé', 'antonio', 'antônio', 'rafael', 'gabriel',
  'admin', 'team', 'support', 'hello', 'hi', 'contact',
]);

/**
 * Search user_memories for mentions of a sender. Skips ambiguous queries
 * that would false-positive (e.g. searching for "Maria" matches every memory
 * containing the word). Prefers full email > full name > email localpart.
 */
async function getSenderContext(userId, from) {
  const email = extractEmail(from);
  const name = extractName(from);
  const localpart = email.split('@')[0];

  // Pick the most specific search term we can.
  let searchTerm = null;

  // Prefer full email — most specific
  if (email && email.includes('@')) {
    searchTerm = email;
  }
  // Fall back to full name if it's specific enough
  else if (name && name.length >= 5 && !GENERIC_NAME_STOPWORDS.has(name.toLowerCase().split(' ')[0])) {
    searchTerm = name;
  }
  // Fall back to localpart only if it's specific
  else if (localpart && localpart.length >= 5 && !GENERIC_NAME_STOPWORDS.has(localpart.toLowerCase())) {
    searchTerm = localpart;
  }

  if (!searchTerm) return null;

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
 * Fetch the full body of an email, falling back to the snippet.
 */
async function getEmailBody(userId, email) {
  if (!email.id) return email.snippet || '';
  try {
    const result = await getEmail(userId, email.id);
    if (result.success && result.email?.body) {
      // Strip quoted reply blocks and trim to 1500 chars
      const body = result.email.body
        .replace(/^>.*$/gm, '')        // remove quoted lines
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')    // collapse runs of blank lines
        .trim();
      return body.slice(0, 1500);
    }
  } catch {
    // Fall through to snippet
  }
  return email.snippet || '';
}

/**
 * Generate a short draft reply for a single email in the user's voice.
 */
async function generateDraft(userId, email, senderContext) {
  // Never draft a reply to automation — a no-reply sender or another AI
  // assistant's notification bot. The upstream isNoise filter should have
  // caught these; this is the last gate before we put words in the user's
  // mouth addressed to a machine (replan-2026-06-10 Track B).
  if (isNoise(email.from)) return null;

  const body = await getEmailBody(userId, email);
  const contextSection = senderContext
    ? `\nContext from past interactions with this person: ${senderContext}`
    : '';

  const prompt = `Write a short draft reply to the email below. CRITICAL RULES:
- Use ONLY information explicitly stated in the email. Never invent details, dates, names, or specifics.
- If the email content is ambiguous or you don't know enough to be specific, be vague and friendly instead of guessing.
- 2-4 sentences max. No greeting ("Hi X"). No sign-off. Just the body text.
- Casual, direct tone — like texting a colleague.

EMAIL:
From: ${email.from}
Subject: ${email.subject || '(no subject)'}
Content: ${body}${contextSection}

Draft reply (body only):`;

  const response = await complete({
    messages: [{ role: 'user', content: prompt }],
    tier: TIER_ANALYSIS,
    maxTokens: 150,
    temperature: 0.5,
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
 *   count: number,
 *   status: 'ok'
 * } | {
 *   status: 'gmail_not_connected' | 'no_unread' | 'all_noise' | 'all_low_priority',
 *   message: string,
 *   emails: [],
 *   count: 0
 * }>}
 *
 * Always returns a structured object — never null — so the dashboard card
 * can communicate the actual state to the user instead of silently hiding.
 */
export async function generateInboxBrief(userId) {
  // Fetch recent unread emails
  const emailResult = await getEmails(userId, {
    query: 'is:unread newer_than:2d',
    maxResults: MAX_EMAILS_TO_SCORE,
  });

  if (!emailResult.success) {
    log.info('Gmail not connected or fetch failed', { userId, error: emailResult.error });
    return {
      status: 'gmail_not_connected',
      message: 'Connect Gmail to triage your inbox.',
      emails: [],
      count: 0,
    };
  }

  const rawEmails = (emailResult.emails || []).filter(e => !e.error);
  if (!rawEmails.length) {
    return {
      status: 'no_unread',
      message: 'No unread email in the last 48 hours. Inbox zero.',
      emails: [],
      count: 0,
    };
  }

  // Filter noise upfront to save LLM tokens
  const realEmails = rawEmails.filter(e => !isNoise(e.from));
  if (!realEmails.length) {
    return {
      status: 'all_noise',
      message: `${rawEmails.length} unread email${rawEmails.length === 1 ? '' : 's'} — all newsletters or notifications. Nothing needs you.`,
      emails: [],
      count: 0,
    };
  }

  log.info('Scoring emails', { userId, total: rawEmails.length, real: realEmails.length });

  // Score and surface top emails
  const topEmails = await scoreEmails(userId, realEmails);
  if (!topEmails.length) {
    return {
      status: 'all_low_priority',
      message: `${realEmails.length} unread email${realEmails.length === 1 ? '' : 's'} — none scored urgent enough to surface.`,
      emails: [],
      count: 0,
    };
  }

  // Enrich with sender context + generate drafts (sequential per email to avoid rate limits)
  const enrichedEmails = [];
  for (const email of topEmails) {
    const senderContext = await getSenderContext(userId, email.from);
    const draft = await generateDraft(userId, email, senderContext);
    enrichedEmails.push({ ...email, senderContext, draft });
  }

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
    status: 'ok',
    message: lines.join('\n'),
    emails: enrichedEmails,
    count,
  };
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Bridge the triage result into ONE approvable threaded-reply proposal.
 *
 * generateInboxBrief delivers a text brief but stops there — the real thread
 * (messageId) and a drafted reply never become something the user can act on.
 * This takes the top-scored actionable email (it has a draft and a real human
 * sender) and queues a gmail_draft proposal threaded onto that conversation
 * (replyToMessageId). The existing thread-approval rail then offers it over
 * WhatsApp ("reply yes and I'll draft a reply to Pedro"); on "yes",
 * executeApprovedAction runs gmail_draft → draftEmail and the threaded draft
 * lands in Gmail.
 *
 * proposeDepartmentAction enforces the communications-department autonomy gate
 * (level must be > OBSERVE) and budget, so this is strictly opt-in. One
 * proposal per run, and we de-dupe against any pending proposal already
 * targeting the same thread. Never throws.
 *
 * @returns {Promise<{proposed:boolean, reason?:string, status?:string, actionId?:string, to?:string, messageId?:string}>}
 */
export async function proposeTopEmailReply(userId, brief) {
  try {
    if (!brief || brief.status !== 'ok' || !Array.isArray(brief.emails) || brief.emails.length === 0) {
      return { proposed: false, reason: 'no_brief' };
    }

    // The user's own address — never propose drafting a reply to ourselves.
    const { data: u } = await supabaseAdmin.from('users').select('email').eq('id', userId).single();
    const selfEmail = (u?.email || '').toLowerCase();

    // Emails arrive score-sorted; take the first that has a draft, a real
    // message id, and a parseable non-noise, non-self sender.
    const candidate = brief.emails.find((e) => {
      if (!e?.draft || !e?.id) return false;
      const to = extractEmail(e.from).toLowerCase();
      return EMAIL_RE.test(to) && !isNoise(to) && to !== selfEmail;
    });
    if (!candidate) return { proposed: false, reason: 'no_candidate' };

    const to = extractEmail(candidate.from).toLowerCase();

    // De-dupe: skip if a pending proposal already targets this thread.
    const pending = await getPendingProposals(userId);
    const alreadyProposed = (pending || []).some((p) => {
      try {
        const pa = typeof p.proposed_action === 'string' ? JSON.parse(p.proposed_action) : p.proposed_action;
        return pa?.params?.replyToMessageId === candidate.id;
      } catch { return false; }
    });
    if (alreadyProposed) return { proposed: false, reason: 'already_proposed', messageId: candidate.id };

    const senderName = extractName(candidate.from);
    const subject = /^re:/i.test(candidate.subject || '')
      ? candidate.subject
      : `Re: ${candidate.subject || ''}`.trim();

    const result = await proposeDepartmentAction(userId, 'communications', {
      toolName: 'gmail_draft',
      params: { to, subject, body: candidate.draft, replyToMessageId: candidate.id },
      context: `Reply to ${senderName}: ${candidate.summary || candidate.subject || ''}`.slice(0, 200),
      reasoning: `Triaged ${candidate.category ? candidate.category + ' ' : ''}email (score ${candidate.score}); ${senderName} is awaiting a reply`.slice(0, 300),
      priority: 'high',
    });

    if (result?.actionId) {
      log.info('Email reply proposal queued', { userId, to, messageId: candidate.id, actionId: result.actionId });
      return { proposed: true, status: result.status, actionId: result.actionId, to, messageId: candidate.id };
    }
    return { proposed: false, reason: result?.status || 'not_queued', to, messageId: candidate.id };
  } catch (err) {
    log.warn('proposeTopEmailReply failed (non-fatal)', { userId, error: err.message });
    return { proposed: false, reason: err.message };
  }
}
