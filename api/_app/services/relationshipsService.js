/**
 * Relationships Service
 * =====================
 * Detects people waiting on the user — Gmail threads where someone wrote and
 * the user hasn't replied. Renan's parked "never-miss-relationships" idea.
 *
 * V1 signal: inbound message > N days old, from a real person (noise-filter
 * shared with inbox triage), where the user did NOT send a follow-up after.
 * Group by sender so one person with three unanswered messages shows as one
 * surfaced row, not three.
 *
 * Output is consumed by `cron-relationships.js`, which writes one
 * `proactive_insights` row per result (category='relationship_followup'),
 * letting the existing InsightsFeed render them with no new UI.
 */

import { getEmails } from './googleWorkspaceActions.js';
import { isNoise } from './noiseSenders.js';
import { createLogger } from './logger.js';

const log = createLogger('RelationshipsService');

const DEFAULT_MAX_THREADS_TO_INSPECT = 30;
const DEFAULT_OLDER_THAN_DAYS = 3;
const DEFAULT_LIMIT = 5;

function extractName(from = '') {
  const m = from.match(/^([^<]+)</);
  if (m) return m[1].trim().replace(/^"|"$/g, '');
  return from.split('@')[0].replace(/[._]/g, ' ').trim();
}

function extractEmail(from = '') {
  const m = from.match(/<(.+)>/);
  return m ? m[1] : from;
}

function daysSince(dateStr) {
  if (!dateStr) return 0;
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

/**
 * Find unanswered Gmail threads for a user.
 *
 * @param {string} userId
 * @param {object} [opts]
 * @param {number} [opts.olderThanDays=3]
 * @param {number} [opts.limit=5]
 * @param {number} [opts.maxThreadsToInspect=30]
 * @returns {Promise<{
 *   status: 'ok' | 'gmail_not_connected' | 'no_unanswered',
 *   relationships: Array<{
 *     from: string,
 *     name: string,
 *     email: string,
 *     thread_count: number,
 *     days_unanswered: number,
 *     last_subject: string,
 *     last_thread_id: string,
 *     gmail_url: string,
 *     score: number,
 *   }>,
 * }>}
 */
export async function findUnansweredThreads(userId, opts = {}) {
  const olderThanDays = opts.olderThanDays ?? DEFAULT_OLDER_THAN_DAYS;
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const maxThreadsToInspect = opts.maxThreadsToInspect ?? DEFAULT_MAX_THREADS_TO_INSPECT;

  // Gmail search: inbox messages from real humans we haven't acted on, older
  // than N days. The `-from:me` filter does the heavy lifting on "unanswered"
  // — Gmail surfaces only messages where the latest message is from someone
  // else when combined with `in:inbox`. Categories filter cuts marketing.
  const query = [
    `older_than:${olderThanDays}d`,
    'in:inbox',
    '-in:sent',
    '-in:promotions',
    '-in:social',
    '-in:updates',
    '-from:me',
  ].join(' ');

  const result = await getEmails(userId, { query, maxResults: maxThreadsToInspect });

  if (!result.success) {
    log.info('Gmail not connected or fetch failed', { userId, error: result.error });
    return { status: 'gmail_not_connected', relationships: [] };
  }

  const messages = (result.emails || []).filter(m => !m.error && m.from);
  if (!messages.length) {
    return { status: 'no_unanswered', relationships: [] };
  }

  // Filter senders that are automation, not people.
  const realMessages = messages.filter(m => !isNoise(m.from));
  if (!realMessages.length) {
    return { status: 'no_unanswered', relationships: [] };
  }

  // Group by sender email. One person who emailed three times still counts
  // as one row in the dashboard, with thread_count as a recency-of-pressure
  // signal feeding the score.
  const grouped = new Map();
  for (const msg of realMessages) {
    const email = extractEmail(msg.from).toLowerCase();
    if (!email) continue;

    const existing = grouped.get(email);
    const msgDate = msg.date || msg.internalDate || null;
    const days = daysSince(msgDate);

    if (!existing) {
      grouped.set(email, {
        from: msg.from,
        name: extractName(msg.from),
        email,
        thread_count: 1,
        days_unanswered: days,
        last_subject: msg.subject || '(no subject)',
        last_thread_id: msg.threadId || msg.id || '',
      });
    } else {
      existing.thread_count += 1;
      // Most recent age (lowest days_unanswered) wins for the surface metric;
      // we want to know how long the *most recent* message sat.
      if (days < existing.days_unanswered) {
        existing.days_unanswered = days;
        existing.last_subject = msg.subject || existing.last_subject;
        existing.last_thread_id = msg.threadId || msg.id || existing.last_thread_id;
      }
    }
  }

  // Score: thread_count rewards repeat senders (real obligation building up),
  // days_unanswered rewards age (this person is being ghosted longer).
  // Cap days_unanswered at 30 so a 3-month-old single email doesn't dominate
  // a fresh 3-message thread from this week.
  const scored = Array.from(grouped.values()).map(r => ({
    ...r,
    score: r.thread_count * 1.0 + Math.min(r.days_unanswered, 30) * 0.5,
    gmail_url: `https://mail.google.com/mail/u/0/#inbox/${r.last_thread_id}`,
  }));

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, limit);

  if (!top.length) {
    return { status: 'no_unanswered', relationships: [] };
  }

  return { status: 'ok', relationships: top };
}
