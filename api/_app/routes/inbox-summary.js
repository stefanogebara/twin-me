/**
 * Inbox Summary Route — Communications Department Helper
 * ========================================================
 * GET /api/inbox/summary — Returns categorized inbox summary
 *
 * Cache-first (2026-07-03 backend-cost audit): the GET never blocks on Gmail
 * or the LLM. Cache hits are served instantly; a cache miss returns a cheap
 * `pending: true` response and kicks the expensive refresh (20-message Gmail
 * fetch + TIER_EXTRACTION categorization) fire-and-forget. A single-flight
 * guard (in-process promise map + short Redis marker) prevents concurrent
 * misses from stampeding N Gmail/LLM calls. Successful summaries cache for
 * 10 minutes; Gmail failures cache for 2 minutes and surface as 400 on the
 * next poll.
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { getEmails } from '../services/googleWorkspaceActions.js';
import { complete, TIER_EXTRACTION } from '../services/llmGateway.js';
import { get as cacheGet, set as cacheSet, del as cacheDel } from '../services/redisClient.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('InboxSummary');
const router = express.Router();

const CACHE_TTL_SECONDS = 600;       // 10 minutes for successful summaries
const ERROR_CACHE_TTL_SECONDS = 120; // 2 minutes for Gmail failures (fast retry after reconnect)
const REFRESH_LOCK_TTL_SECONDS = 60; // cross-instance refresh marker

const EMPTY_SUMMARY = Object.freeze({ needsReply: [], fyi: [], promotional: 0, total: 0 });

const cacheKeyFor = (userId) => `inbox_summary:${userId}`;
const lockKeyFor = (userId) => `inbox_summary_refreshing:${userId}`;

// In-process single-flight guard: at most one refresh per user per instance.
const inFlightRefreshes = new Map();

/**
 * Kick a background refresh for a user unless one is already in flight in
 * this process. Synchronous check-and-set — safe against concurrent misses
 * within the same event loop.
 */
function startRefresh(userId) {
  if (inFlightRefreshes.has(userId)) return inFlightRefreshes.get(userId);

  const refreshPromise = refreshInboxSummary(userId)
    .catch((err) => {
      log.error('Background inbox summary refresh failed', { userId, error: err.message });
    })
    .finally(() => inFlightRefreshes.delete(userId));

  inFlightRefreshes.set(userId, refreshPromise);
  return refreshPromise;
}

/**
 * Fetch + categorize + cache. Guarded by a short Redis marker so concurrent
 * misses on OTHER instances skip the work too (best effort — the in-process
 * map is the hard guarantee per instance).
 */
async function refreshInboxSummary(userId) {
  const lockKey = lockKeyFor(userId);
  const alreadyRefreshing = await cacheGet(lockKey);
  if (alreadyRefreshing) return;
  await cacheSet(lockKey, { startedAt: Date.now() }, REFRESH_LOCK_TTL_SECONDS);

  try {
    const summary = await buildInboxSummary(userId);
    const ttl = summary.unavailable ? ERROR_CACHE_TTL_SECONDS : CACHE_TTL_SECONDS;
    await cacheSet(cacheKeyFor(userId), summary, ttl);
  } finally {
    await cacheDel(lockKey);
  }
}

/**
 * The expensive part: Gmail fetch + LLM categorization.
 * Returns { needsReply, fyi, promotional, total } on success,
 * or { unavailable: true, error } when Gmail can't be reached.
 */
async function buildInboxSummary(userId) {
  const emailResult = await getEmails(userId, {
    query: 'is:unread',
    maxResults: 20,
  });

  if (!emailResult.success) {
    return {
      unavailable: true,
      error: emailResult.error || 'Failed to fetch Gmail messages. Is Gmail connected?',
    };
  }

  const emails = (emailResult.emails || []).filter(e => !e.error);

  if (emails.length === 0) {
    return { ...EMPTY_SUMMARY };
  }

  // Build compact email list for LLM categorization
  const emailDescriptions = emails.map((e, i) => (
    `${i + 1}. From: ${e.from || 'unknown'} | Subject: ${e.subject || '(no subject)'} | Snippet: ${(e.snippet || '').slice(0, 80)}`
  )).join('\n');

  const prompt = `Categorize these unread emails into exactly 3 categories:
- "needs_reply": Someone is waiting for a response from the user
- "fyi": Informational, no action needed (updates, notifications, receipts)
- "promotional": Marketing emails, newsletters, promotions

EMAILS:
${emailDescriptions}

Return ONLY a JSON object with this exact format (no markdown, no explanation):
{"categories":[{"index":1,"category":"needs_reply"},{"index":2,"category":"fyi"},...]}

Rules:
- Use the index number (1-based) from the email list
- Every email must be categorized
- Be conservative: if unsure, use "fyi"`;

  const llmResponse = await complete({
    messages: [{ role: 'user', content: prompt }],
    tier: TIER_EXTRACTION,
    maxTokens: 300,
    temperature: 0.1,
    userId,
    serviceName: 'inbox-summary',
  });

  // Parse LLM response
  const text = llmResponse?.content || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  let categories = [];

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      categories = parsed.categories || [];
    } catch {
      log.warn('Failed to parse inbox categorization', { text: text.slice(0, 200) });
    }
  }

  // Build categorized result
  const needsReply = [];
  const fyi = [];
  let promotional = 0;

  for (const cat of categories) {
    const email = emails[cat.index - 1];
    if (!email) continue;

    const summary = {
      from: email.from || 'unknown',
      subject: email.subject || '(no subject)',
      date: email.date || null,
    };

    if (cat.category === 'needs_reply') {
      needsReply.push(summary);
    } else if (cat.category === 'promotional') {
      promotional++;
    } else {
      fyi.push(summary);
    }
  }

  // Handle uncategorized emails as fyi
  const categorizedIndices = new Set(categories.map(c => c.index - 1));
  for (let i = 0; i < emails.length; i++) {
    if (!categorizedIndices.has(i)) {
      fyi.push({
        from: emails[i].from || 'unknown',
        subject: emails[i].subject || '(no subject)',
        date: emails[i].date || null,
      });
    }
  }

  return { needsReply, fyi, promotional, total: emails.length };
}

/** Parse a cached value that may be a legacy double-stringified entry. */
function normalizeCached(cached) {
  if (typeof cached !== 'string') return cached;
  try {
    return JSON.parse(cached);
  } catch {
    return null;
  }
}

/**
 * GET /api/inbox/summary
 * Returns categorized inbox summary: needs_reply, fyi, promotional counts.
 * Never blocks on Gmail/LLM — a miss returns { pending: true } and refreshes
 * in the background; poll again for real data.
 */
router.get('/summary', authenticateUser, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    const cached = normalizeCached(await cacheGet(cacheKeyFor(userId)));

    if (cached && cached.unavailable) {
      return res.status(400).json({ success: false, error: cached.error, cached: true });
    }

    if (cached) {
      return res.json({ success: true, ...cached, cached: true });
    }

    // Cache miss: kick the expensive refresh fire-and-forget and answer cheap.
    startRefresh(userId);

    return res.json({
      success: true,
      pending: true,
      ...EMPTY_SUMMARY,
      cached: false,
    });
  } catch (err) {
    log.error('Inbox summary failed', { userId, error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to generate inbox summary' });
  }
});

export default router;
