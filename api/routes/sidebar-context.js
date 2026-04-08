/**
 * Sidebar Context API
 *
 * Single endpoint that returns today's calendar events + recent email subjects
 * for the chat context sidebar. Designed for low latency with parallel fetches
 * and per-section graceful failure.
 */

import express from 'express';
import { google } from 'googleapis';
import { authenticateUser } from '../middleware/auth.js';
import { getValidAccessToken as getCentralizedToken } from '../services/tokenRefreshService.js';
import { get as cacheGet, set as cacheSet } from '../services/redisClient.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('SidebarContext');
const router = express.Router();

const CACHE_TTL = 120; // 2 minutes

/**
 * Fetch today's calendar events (up to 8).
 * Returns null on any failure.
 */
async function fetchTodayEvents(userId) {
  const tokenResult = await getCentralizedToken(userId, 'google_calendar');
  if (!tokenResult.success) return null;

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: tokenResult.accessToken });
  const calendar = google.calendar({ version: 'v3', auth });

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    maxResults: 8,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const items = response.data.items || [];
  return items.map((ev) => {
    const startRaw = ev.start?.dateTime || ev.start?.date || null;
    const isAllDay = !ev.start?.dateTime;

    let time = '';
    if (isAllDay) {
      time = 'All day';
    } else if (startRaw) {
      const d = new Date(startRaw);
      time = d.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    }

    return {
      title: ev.summary || '(No title)',
      time,
      location: ev.location || undefined,
    };
  });
}

/**
 * Fetch recent email subjects (up to 5).
 * Uses gmail.readonly scope to list messages + batch-get subjects.
 * Returns null on any failure.
 */
async function fetchRecentEmails(userId) {
  // Gmail uses the same Google token as Calendar
  const tokenResult = await getCentralizedToken(userId, 'google_calendar');
  if (!tokenResult.success) return null;

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: tokenResult.accessToken });
  const gmail = google.gmail({ version: 'v1', auth });

  // List the 5 most recent messages in INBOX
  const listRes = await gmail.users.messages.list({
    userId: 'me',
    maxResults: 5,
    labelIds: ['INBOX'],
    q: 'is:unread OR newer_than:1d',
  });

  const messageIds = (listRes.data.messages || []).map((m) => m.id);
  if (messageIds.length === 0) return [];

  // Batch-fetch metadata for each message (only headers)
  const emails = await Promise.all(
    messageIds.map(async (id) => {
      try {
        const msgRes = await gmail.users.messages.get({
          userId: 'me',
          id,
          format: 'metadata',
          metadataHeaders: ['Subject', 'From', 'Date'],
        });

        const headers = msgRes.data.payload?.headers || [];
        const subject = headers.find((h) => h.name === 'Subject')?.value || '(No subject)';
        const from = headers.find((h) => h.name === 'From')?.value || '';
        const dateStr = headers.find((h) => h.name === 'Date')?.value || '';

        // Extract sender name (before email angle brackets)
        const senderMatch = from.match(/^([^<]+)/);
        const sender = senderMatch ? senderMatch[1].trim().replace(/"/g, '') : from.split('@')[0];

        return { subject, sender, date: dateStr };
      } catch {
        return null;
      }
    })
  );

  return emails.filter(Boolean);
}

/**
 * GET /api/sidebar/context
 *
 * Returns { calendarEvents, recentEmails } — each section fails independently.
 * Cached for 2 minutes per user.
 */
router.get('/', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const cacheKey = `sidebar-ctx:${userId}`;

    // Check cache
    const cached = await cacheGet(cacheKey);
    if (cached) {
      return res.json({ success: true, ...cached });
    }

    // Fetch calendar + email in parallel (each has ~3s implicit timeout via token fetch)
    const [calendarEvents, recentEmails] = await Promise.all([
      fetchTodayEvents(userId).catch((err) => {
        log.warn('Calendar fetch failed:', err.message);
        return null;
      }),
      fetchRecentEmails(userId).catch((err) => {
        log.warn('Email fetch failed:', err.message);
        return null;
      }),
    ]);

    const payload = {
      calendarEvents: calendarEvents || [],
      recentEmails: recentEmails || [],
    };

    // Cache (fire-and-forget)
    cacheSet(cacheKey, payload, CACHE_TTL).catch(() => {});

    return res.json({ success: true, ...payload });
  } catch (error) {
    log.error('Sidebar context error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to load sidebar context',
    });
  }
});

export default router;
