/**
 * /api/onboarding/wow — the M1 activation endpoint.
 *
 * POST returns { voiceRead, drafts, draftsCreated }: right after Gmail connects,
 * fetch the user's most recent inbox messages, and let onboardingWow pick the
 * replyable ones, draft each in the user's voice (persisted as pending
 * twin_actions), and read back how they write.
 *
 * Auth-gated; the `/api/onboarding/*` rate limiter (server.js) covers it — right,
 * since this makes LLM calls. Never hard-fails: if Gmail isn't connected or a
 * fetch errors, it returns a graceful voice read with zero drafts so onboarding
 * always moves forward.
 */
import express from 'express';
import { google } from 'googleapis';
import { authenticateUser } from '../middleware/auth.js';
import { getValidAccessToken as getGoogleToken } from '../services/tokenRefreshService.js';
import { generateWowDrafts, buildVoiceRead } from '../services/onboardingWow.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('OnboardingWow');
const router = express.Router();

const INBOX_FETCH_MAX = 8; // fetch a few; onboardingWow drafts the top 2 replyable

/**
 * Recent inbox messages as lightweight single-message threads (subject + Gmail
 * snippet). The snippet is enough for a relevant first draft — full MIME body
 * extraction is a later enrichment. Returns [] if Gmail isn't connected.
 */
async function fetchInboxThreads(userId) {
  const token = await getGoogleToken(userId, 'google_calendar'); // Gmail shares the Google token
  if (!token?.success || !token.accessToken) return [];

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: token.accessToken });
  const gmail = google.gmail({ version: 'v1', auth });

  const list = await gmail.users.messages.list({
    userId: 'me',
    maxResults: INBOX_FETCH_MAX,
    labelIds: ['INBOX'],
    q: 'is:unread OR newer_than:3d',
  });
  const ids = (list.data.messages || []).map((m) => m.id).filter(Boolean);
  if (ids.length === 0) return [];

  const threads = await Promise.all(ids.map(async (id) => {
    try {
      const msg = await gmail.users.messages.get({
        userId: 'me',
        id,
        format: 'metadata',
        metadataHeaders: ['Subject', 'From', 'Date'],
      });
      const headers = msg.data.payload?.headers || [];
      const header = (n) => headers.find((h) => h.name === n)?.value || '';
      const from = header('From');
      const nameMatch = from.match(/^([^<]+)/);
      return {
        id: msg.data.threadId || id,
        subject: header('Subject') || '(no subject)',
        messages: [{
          from,
          fromName: nameMatch ? nameMatch[1].trim().replace(/"/g, '') : '',
          text: (msg.data.snippet || '').trim(),
          date: header('Date'),
        }],
      };
    } catch {
      return null; // one bad message shouldn't sink the wow
    }
  }));
  return threads.filter(Boolean);
}

// POST /api/onboarding/wow
router.post('/wow', authenticateUser, async (req, res) => {
  const userId = req.user?.id;
  const userEmail = req.user?.email;
  try {
    const threads = await fetchInboxThreads(userId);
    const wow = await generateWowDrafts({ userId, userEmail, threads });
    return res.json({ success: true, data: wow });
  } catch (err) {
    log.error('onboarding wow failed', { userId, error: err?.message });
    // Onboarding must never dead-end: fall back to a voice read with no drafts.
    return res.json({ success: true, data: { voiceRead: buildVoiceRead(null), drafts: [], draftsCreated: 0 } });
  }
});

export default router;
