/**
 * Inbox Summary Route — Communications Department Helper
 * ========================================================
 * GET /api/inbox/summary — Returns categorized inbox summary
 *
 * Fetches unread Gmail messages, categorizes them via LLM (cheapest tier),
 * and returns a compact summary for the Communications department card.
 * Results are cached in Redis for 10 minutes to avoid excessive API calls.
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { getEmails } from '../services/googleWorkspaceActions.js';
import { complete, TIER_EXTRACTION } from '../services/llmGateway.js';
import { get as cacheGet, set as cacheSet } from '../services/redisClient.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('InboxSummary');
const router = express.Router();

const CACHE_TTL_SECONDS = 600; // 10 minutes

/**
 * GET /api/inbox/summary
 * Returns categorized inbox summary: needs_reply, fyi, promotional counts.
 */
router.get('/summary', authenticateUser, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    // Check cache first
    const cacheKey = `inbox_summary:${userId}`;
    const cached = await cacheGet(cacheKey);
    if (cached) {
      const parsed = typeof cached === 'string' ? JSON.parse(cached) : cached;
      return res.json({ success: true, ...parsed, cached: true });
    }

    // Fetch unread emails via existing Gmail integration
    const emailResult = await getEmails(userId, {
      query: 'is:unread',
      maxResults: 20,
    });

    if (!emailResult.success) {
      return res.status(400).json({
        success: false,
        error: emailResult.error || 'Failed to fetch Gmail messages. Is Gmail connected?',
      });
    }

    const emails = (emailResult.emails || []).filter(e => !e.error);

    if (emails.length === 0) {
      const emptyResult = { needsReply: [], fyi: [], promotional: 0, total: 0 };
      await cacheSet(cacheKey, JSON.stringify(emptyResult), CACHE_TTL_SECONDS);
      return res.json({ success: true, ...emptyResult, cached: false });
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

    const result = {
      needsReply,
      fyi,
      promotional,
      total: emails.length,
    };

    // Cache for 10 minutes
    await cacheSet(cacheKey, JSON.stringify(result), CACHE_TTL_SECONDS);

    return res.json({ success: true, ...result, cached: false });
  } catch (err) {
    log.error('Inbox summary failed', { userId, error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to generate inbox summary' });
  }
});

export default router;
