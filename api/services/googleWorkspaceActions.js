/**
 * Google Workspace Actions — Read & Write Across the Full Suite
 * ==============================================================
 * Enables the twin to act on behalf of the user across Google Workspace.
 * All actions use the user's OAuth token via getValidAccessToken().
 *
 * Inspired by dimension.dev's approach: OAuth -> Index -> Trigger -> Action.
 *
 * SAFETY: Write actions check autonomy level before executing.
 * Level 1 (SUGGEST): Read-only actions
 * Level 2 (DRAFT): Can create drafts, search, read
 * Level 3 (ACT_NOTIFY): Can send emails, create events, modify docs
 * Level 4 (AUTONOMOUS): Full write access
 *
 * Token providers:
 *   'google_gmail'    -> Gmail, Drive, Docs, Sheets, Contacts
 *   'google_calendar' -> Calendar
 */

import axios from 'axios';
import { getValidAccessToken } from './tokenRefreshService.js';
import { createLogger } from './logger.js';

const log = createLogger('GoogleWorkspace');

// API base URLs
const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';
const DRIVE_BASE = 'https://www.googleapis.com/drive/v3';
const DOCS_BASE = 'https://docs.googleapis.com/v1';
const SHEETS_BASE = 'https://sheets.googleapis.com/v4';
const PEOPLE_BASE = 'https://people.googleapis.com/v1';

const REQUEST_TIMEOUT = 15000;

// ========================================================================
// Helpers
// ========================================================================

/**
 * Get an authenticated axios config for a Google API call.
 * @param {string} userId
 * @param {string} provider - 'google_gmail' or 'google_calendar'
 * @returns {Promise<{success: boolean, headers?: object, error?: string}>}
 */
async function getAuthHeaders(userId, provider) {
  const tokenResult = await getValidAccessToken(userId, provider);
  if (!tokenResult.success) {
    return { success: false, error: tokenResult.error || `No valid token for ${provider}` };
  }
  return {
    success: true,
    headers: {
      Authorization: `Bearer ${tokenResult.accessToken}`,
      'Content-Type': 'application/json',
    },
  };
}

/**
 * Build an RFC 2822 message and return it as base64url encoded string.
 * Gmail API requires raw messages in this format for send/draft.
 */
function buildRawMessage({ to, cc, bcc, subject, body, replyToMessageId, references, inReplyTo }) {
  const lines = [];
  lines.push(`To: ${to}`);
  if (cc) lines.push(`Cc: ${cc}`);
  if (bcc) lines.push(`Bcc: ${bcc}`);
  lines.push(`Subject: ${subject || '(no subject)'}`);
  lines.push('MIME-Version: 1.0');
  lines.push('Content-Type: text/plain; charset="UTF-8"');
  if (inReplyTo) lines.push(`In-Reply-To: ${inReplyTo}`);
  if (references) lines.push(`References: ${references}`);
  lines.push(''); // blank line separates headers from body
  lines.push(body || '');

  const rawMessage = lines.join('\r\n');

  // base64url encode (no padding, URL-safe chars)
  const encoded = Buffer.from(rawMessage, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return encoded;
}

/**
 * Extract plain text body from a Gmail message payload.
 * Handles multipart messages by recursing through parts.
 */
function extractBody(payload) {
  if (!payload) return '';

  // Direct body data
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8');
  }

  // Multipart — look for text/plain first, then text/html
  if (payload.parts) {
    const textPart = payload.parts.find(p => p.mimeType === 'text/plain');
    if (textPart?.body?.data) {
      return Buffer.from(textPart.body.data, 'base64').toString('utf-8');
    }
    const htmlPart = payload.parts.find(p => p.mimeType === 'text/html');
    if (htmlPart?.body?.data) {
      return Buffer.from(htmlPart.body.data, 'base64').toString('utf-8');
    }
    // Recurse into nested multipart
    for (const part of payload.parts) {
      const nested = extractBody(part);
      if (nested) return nested;
    }
  }
  return '';
}

/**
 * Get a header value from a Gmail message payload.
 */
function getHeader(headers, name) {
  if (!headers) return '';
  const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
  return header?.value || '';
}

// ========================================================================
// GMAIL
// ========================================================================

/**
 * Send an email on behalf of the user.
 */
export async function sendEmail(userId, { to, cc, bcc, subject, body, replyToMessageId }) {
  if (!to) return { success: false, error: 'Recipient (to) is required' };
  if (!subject && !replyToMessageId) return { success: false, error: 'Subject is required for new emails' };

  const auth = await getAuthHeaders(userId, 'google_gmail');
  if (!auth.success) return { success: false, error: auth.error };

  try {
    let inReplyTo = null;
    let references = null;
    let threadId = null;

    // If replying, fetch the original message headers for threading
    if (replyToMessageId) {
      const origResp = await axios.get(
        `${GMAIL_BASE}/messages/${replyToMessageId}?format=metadata&metadataHeaders=Message-Id&metadataHeaders=Subject`,
        { headers: auth.headers, timeout: REQUEST_TIMEOUT }
      );
      const origHeaders = origResp.data?.payload?.headers || [];
      inReplyTo = getHeader(origHeaders, 'Message-Id');
      references = inReplyTo;
      threadId = origResp.data?.threadId;
      if (!subject) {
        const origSubject = getHeader(origHeaders, 'Subject');
        subject = origSubject.startsWith('Re:') ? origSubject : `Re: ${origSubject}`;
      }
    }

    const raw = buildRawMessage({ to, cc, bcc, subject, body, replyToMessageId, references, inReplyTo });
    const payload = { raw };
    if (threadId) payload.threadId = threadId;

    const resp = await axios.post(
      `${GMAIL_BASE}/messages/send`,
      payload,
      { headers: auth.headers, timeout: REQUEST_TIMEOUT }
    );

    log.info('Email sent', { userId, to, messageId: resp.data?.id });
    return { success: true, messageId: resp.data?.id, threadId: resp.data?.threadId };
  } catch (err) {
    log.error('sendEmail failed', { userId, error: err.response?.data || err.message });
    return { success: false, error: err.response?.data?.error?.message || err.message };
  }
}

/**
 * Create an email draft.
 */
export async function draftEmail(userId, { to, cc, bcc, subject, body, replyToMessageId }) {
  if (!to) return { success: false, error: 'Recipient (to) is required' };

  const auth = await getAuthHeaders(userId, 'google_gmail');
  if (!auth.success) return { success: false, error: auth.error };

  try {
    let inReplyTo = null;
    let references = null;
    let threadId = null;

    if (replyToMessageId) {
      const origResp = await axios.get(
        `${GMAIL_BASE}/messages/${replyToMessageId}?format=metadata&metadataHeaders=Message-Id&metadataHeaders=Subject`,
        { headers: auth.headers, timeout: REQUEST_TIMEOUT }
      );
      const origHeaders = origResp.data?.payload?.headers || [];
      inReplyTo = getHeader(origHeaders, 'Message-Id');
      references = inReplyTo;
      threadId = origResp.data?.threadId;
      if (!subject) {
        const origSubject = getHeader(origHeaders, 'Subject');
        subject = origSubject.startsWith('Re:') ? origSubject : `Re: ${origSubject}`;
      }
    }

    const raw = buildRawMessage({ to, cc, bcc, subject: subject || '(no subject)', body, references, inReplyTo });
    const draftPayload = { message: { raw } };
    if (threadId) draftPayload.message.threadId = threadId;

    const resp = await axios.post(
      `${GMAIL_BASE}/drafts`,
      draftPayload,
      { headers: auth.headers, timeout: REQUEST_TIMEOUT }
    );

    log.info('Draft created', { userId, to, draftId: resp.data?.id });
    return { success: true, draftId: resp.data?.id, messageId: resp.data?.message?.id };
  } catch (err) {
    log.error('draftEmail failed', { userId, error: err.response?.data || err.message });
    return { success: false, error: err.response?.data?.error?.message || err.message };
  }
}

/**
 * Search/list emails using the Gmail API (live, not cached).
 */
export async function getEmails(userId, { query, maxResults = 10, labelIds } = {}) {
  const auth = await getAuthHeaders(userId, 'google_gmail');
  if (!auth.success) return { success: false, error: auth.error };

  try {
    const params = { maxResults: Math.min(maxResults, 50) };
    if (query) params.q = query;
    if (labelIds) params.labelIds = Array.isArray(labelIds) ? labelIds.join(',') : labelIds;

    const listResp = await axios.get(`${GMAIL_BASE}/messages`, {
      headers: auth.headers,
      params,
      timeout: REQUEST_TIMEOUT,
    });

    const messageIds = (listResp.data?.messages || []).map(m => m.id);
    if (messageIds.length === 0) return { success: true, emails: [], resultSizeEstimate: 0 };

    // Fetch metadata for each message (batch, limited to 10 for speed)
    const batchIds = messageIds.slice(0, 10);
    const emails = await Promise.all(
      batchIds.map(async (id) => {
        try {
          const msgResp = await axios.get(
            `${GMAIL_BASE}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
            { headers: auth.headers, timeout: REQUEST_TIMEOUT }
          );
          const headers = msgResp.data?.payload?.headers || [];
          return {
            id: msgResp.data.id,
            threadId: msgResp.data.threadId,
            snippet: msgResp.data.snippet,
            from: getHeader(headers, 'From'),
            to: getHeader(headers, 'To'),
            subject: getHeader(headers, 'Subject'),
            date: getHeader(headers, 'Date'),
            labelIds: msgResp.data.labelIds || [],
          };
        } catch {
          return { id, error: 'Failed to fetch' };
        }
      })
    );

    return {
      success: true,
      emails,
      resultSizeEstimate: listResp.data?.resultSizeEstimate || emails.length,
    };
  } catch (err) {
    log.error('getEmails failed', { userId, error: err.response?.data || err.message });
    return { success: false, error: err.response?.data?.error?.message || err.message };
  }
}

/**
 * Get full email content by message ID.
 */
export async function getEmail(userId, messageId) {
  if (!messageId) return { success: false, error: 'messageId is required' };

  const auth = await getAuthHeaders(userId, 'google_gmail');
  if (!auth.success) return { success: false, error: auth.error };

  try {
    const resp = await axios.get(
      `${GMAIL_BASE}/messages/${messageId}?format=full`,
      { headers: auth.headers, timeout: REQUEST_TIMEOUT }
    );

    const headers = resp.data?.payload?.headers || [];
    const bodyText = extractBody(resp.data?.payload);

    return {
      success: true,
      email: {
        id: resp.data.id,
        threadId: resp.data.threadId,
        snippet: resp.data.snippet,
        from: getHeader(headers, 'From'),
        to: getHeader(headers, 'To'),
        cc: getHeader(headers, 'Cc'),
        subject: getHeader(headers, 'Subject'),
        date: getHeader(headers, 'Date'),
        body: bodyText,
        labelIds: resp.data.labelIds || [],
      },
    };
  } catch (err) {
    log.error('getEmail failed', { userId, messageId, error: err.response?.data || err.message });
    return { success: false, error: err.response?.data?.error?.message || err.message };
  }
}

/**
 * Reply to a specific email.
 */
export async function replyToEmail(userId, messageId, { body }) {
  if (!messageId) return { success: false, error: 'messageId is required' };
  if (!body) return { success: false, error: 'Reply body is required' };

  // Fetch original to get the sender (reply-to target)
  const auth = await getAuthHeaders(userId, 'google_gmail');
  if (!auth.success) return { success: false, error: auth.error };

  try {
    const origResp = await axios.get(
      `${GMAIL_BASE}/messages/${messageId}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Message-Id`,
      { headers: auth.headers, timeout: REQUEST_TIMEOUT }
    );
    const origHeaders = origResp.data?.payload?.headers || [];
    const from = getHeader(origHeaders, 'From');
    const origSubject = getHeader(origHeaders, 'Subject');
    const origMessageId = getHeader(origHeaders, 'Message-Id');
    const threadId = origResp.data?.threadId;

    const subject = origSubject.startsWith('Re:') ? origSubject : `Re: ${origSubject}`;
    const raw = buildRawMessage({
      to: from,
      subject,
      body,
      inReplyTo: origMessageId,
      references: origMessageId,
    });

    const payload = { raw };
    if (threadId) payload.threadId = threadId;

    const resp = await axios.post(
      `${GMAIL_BASE}/messages/send`,
      payload,
      { headers: auth.headers, timeout: REQUEST_TIMEOUT }
    );

    log.info('Reply sent', { userId, messageId, replyId: resp.data?.id });
    return { success: true, messageId: resp.data?.id, threadId: resp.data?.threadId };
  } catch (err) {
    log.error('replyToEmail failed', { userId, messageId, error: err.response?.data || err.message });
    return { success: false, error: err.response?.data?.error?.message || err.message };
  }
}

/**
 * Add/remove labels on an email message.
 */
export async function labelEmail(userId, messageId, { addLabels = [], removeLabels = [] }) {
  if (!messageId) return { success: false, error: 'messageId is required' };
  if (addLabels.length === 0 && removeLabels.length === 0) {
    return { success: false, error: 'At least one label to add or remove is required' };
  }

  const auth = await getAuthHeaders(userId, 'google_gmail');
  if (!auth.success) return { success: false, error: auth.error };

  try {
    const resp = await axios.post(
      `${GMAIL_BASE}/messages/${messageId}/modify`,
      {
        addLabelIds: addLabels,
        removeLabelIds: removeLabels,
      },
      { headers: auth.headers, timeout: REQUEST_TIMEOUT }
    );

    log.info('Labels modified', { userId, messageId, addLabels, removeLabels });
    return { success: true, labelIds: resp.data?.labelIds || [] };
  } catch (err) {
    log.error('labelEmail failed', { userId, messageId, error: err.response?.data || err.message });
    return { success: false, error: err.response?.data?.error?.message || err.message };
  }
}

/**
 * Archive an email (remove INBOX label).
 */
export async function archiveEmail(userId, messageId) {
  if (!messageId) return { success: false, error: 'messageId is required' };
  return labelEmail(userId, messageId, { removeLabels: ['INBOX'] });
}

// ========================================================================
// CALENDAR
// ========================================================================

/**
 * Create a calendar event.
 */
export async function createEvent(userId, { summary, description, start, end, attendees, location, reminders }) {
  if (!summary) return { success: false, error: 'Event summary (title) is required' };
  if (!start) return { success: false, error: 'Start time is required' };

  const auth = await getAuthHeaders(userId, 'google_calendar');
  if (!auth.success) return { success: false, error: auth.error };

  try {
    const event = {
      summary,
      description: description || undefined,
      location: location || undefined,
      start: typeof start === 'string'
        ? (start.length <= 10 ? { date: start } : { dateTime: start, timeZone: 'UTC' })
        : start,
      end: end
        ? (typeof end === 'string'
          ? (end.length <= 10 ? { date: end } : { dateTime: end, timeZone: 'UTC' })
          : end)
        : undefined,
    };

    // Default end to 1 hour after start if not provided and start is dateTime
    if (!event.end && event.start.dateTime) {
      const endDate = new Date(new Date(event.start.dateTime).getTime() + 60 * 60 * 1000);
      event.end = { dateTime: endDate.toISOString(), timeZone: 'UTC' };
    } else if (!event.end && event.start.date) {
      event.end = { date: event.start.date };
    }

    if (attendees) {
      event.attendees = (Array.isArray(attendees) ? attendees : [attendees]).map(email =>
        typeof email === 'string' ? { email } : email
      );
    }

    if (reminders) {
      event.reminders = reminders;
    }

    const resp = await axios.post(
      `${CALENDAR_BASE}/calendars/primary/events`,
      event,
      { headers: auth.headers, timeout: REQUEST_TIMEOUT }
    );

    log.info('Event created', { userId, eventId: resp.data?.id, summary });
    return {
      success: true,
      eventId: resp.data?.id,
      htmlLink: resp.data?.htmlLink,
      summary: resp.data?.summary,
      start: resp.data?.start,
      end: resp.data?.end,
    };
  } catch (err) {
    log.error('createEvent failed', { userId, error: err.response?.data || err.message });
    return { success: false, error: err.response?.data?.error?.message || err.message };
  }
}

/**
 * Modify an existing calendar event.
 */
export async function modifyEvent(userId, eventId, updates) {
  if (!eventId) return { success: false, error: 'eventId is required' };

  const auth = await getAuthHeaders(userId, 'google_calendar');
  if (!auth.success) return { success: false, error: auth.error };

  try {
    // Normalize start/end if provided as strings
    const patch = { ...updates };
    if (typeof patch.start === 'string') {
      patch.start = patch.start.length <= 10
        ? { date: patch.start }
        : { dateTime: patch.start, timeZone: 'UTC' };
    }
    if (typeof patch.end === 'string') {
      patch.end = patch.end.length <= 10
        ? { date: patch.end }
        : { dateTime: patch.end, timeZone: 'UTC' };
    }
    if (patch.attendees && !Array.isArray(patch.attendees)) {
      patch.attendees = [patch.attendees].map(email =>
        typeof email === 'string' ? { email } : email
      );
    }

    const resp = await axios.patch(
      `${CALENDAR_BASE}/calendars/primary/events/${eventId}`,
      patch,
      { headers: auth.headers, timeout: REQUEST_TIMEOUT }
    );

    log.info('Event modified', { userId, eventId });
    return {
      success: true,
      eventId: resp.data?.id,
      htmlLink: resp.data?.htmlLink,
      summary: resp.data?.summary,
      start: resp.data?.start,
      end: resp.data?.end,
    };
  } catch (err) {
    log.error('modifyEvent failed', { userId, eventId, error: err.response?.data || err.message });
    return { success: false, error: err.response?.data?.error?.message || err.message };
  }
}

/**
 * Delete a calendar event.
 */
export async function deleteEvent(userId, eventId) {
  if (!eventId) return { success: false, error: 'eventId is required' };

  const auth = await getAuthHeaders(userId, 'google_calendar');
  if (!auth.success) return { success: false, error: auth.error };

  try {
    await axios.delete(
      `${CALENDAR_BASE}/calendars/primary/events/${eventId}`,
      { headers: auth.headers, timeout: REQUEST_TIMEOUT }
    );

    log.info('Event deleted', { userId, eventId });
    return { success: true, eventId, deleted: true };
  } catch (err) {
    log.error('deleteEvent failed', { userId, eventId, error: err.response?.data || err.message });
    return { success: false, error: err.response?.data?.error?.message || err.message };
  }
}

/**
 * List calendar events (live from API, not cached).
 */
export async function getEvents(userId, { timeMin, timeMax, maxResults = 20, q } = {}) {
  const auth = await getAuthHeaders(userId, 'google_calendar');
  if (!auth.success) return { success: false, error: auth.error };

  try {
    const params = {
      maxResults: Math.min(maxResults, 100),
      singleEvents: true,
      orderBy: 'startTime',
    };
    if (timeMin) params.timeMin = timeMin;
    if (timeMax) params.timeMax = timeMax;
    if (q) params.q = q;

    // Default to today if no time range specified
    if (!timeMin && !timeMax) {
      const now = new Date();
      params.timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      params.timeMax = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7).toISOString();
    }

    const resp = await axios.get(
      `${CALENDAR_BASE}/calendars/primary/events`,
      { headers: auth.headers, params, timeout: REQUEST_TIMEOUT }
    );

    const events = (resp.data?.items || []).map(e => ({
      id: e.id,
      summary: e.summary,
      description: e.description,
      location: e.location,
      start: e.start,
      end: e.end,
      attendees: e.attendees?.map(a => ({ email: a.email, responseStatus: a.responseStatus })),
      htmlLink: e.htmlLink,
      status: e.status,
    }));

    return { success: true, events };
  } catch (err) {
    log.error('getEvents failed', { userId, error: err.response?.data || err.message });
    return { success: false, error: err.response?.data?.error?.message || err.message };
  }
}

/**
 * Find free time slots within a time range.
 * Uses the Calendar freebusy API.
 */
export async function findFreeSlots(userId, { timeMin, timeMax, durationMinutes = 30 }) {
  if (!timeMin || !timeMax) return { success: false, error: 'timeMin and timeMax are required' };

  const auth = await getAuthHeaders(userId, 'google_calendar');
  if (!auth.success) return { success: false, error: auth.error };

  try {
    const resp = await axios.post(
      `${CALENDAR_BASE}/freeBusy`,
      {
        timeMin,
        timeMax,
        items: [{ id: 'primary' }],
      },
      { headers: auth.headers, timeout: REQUEST_TIMEOUT }
    );

    const busyPeriods = resp.data?.calendars?.primary?.busy || [];

    // Calculate free slots
    const freeSlots = [];
    let cursor = new Date(timeMin).getTime();
    const end = new Date(timeMax).getTime();
    const durationMs = durationMinutes * 60 * 1000;

    for (const busy of busyPeriods) {
      const busyStart = new Date(busy.start).getTime();
      const busyEnd = new Date(busy.end).getTime();

      if (busyStart - cursor >= durationMs) {
        freeSlots.push({
          start: new Date(cursor).toISOString(),
          end: new Date(busyStart).toISOString(),
          durationMinutes: Math.round((busyStart - cursor) / 60000),
        });
      }
      cursor = Math.max(cursor, busyEnd);
    }

    // Check remaining time after last busy period
    if (end - cursor >= durationMs) {
      freeSlots.push({
        start: new Date(cursor).toISOString(),
        end: new Date(end).toISOString(),
        durationMinutes: Math.round((end - cursor) / 60000),
      });
    }

    return { success: true, freeSlots, busyPeriods: busyPeriods.length };
  } catch (err) {
    log.error('findFreeSlots failed', { userId, error: err.response?.data || err.message });
    return { success: false, error: err.response?.data?.error?.message || err.message };
  }
}

// ========================================================================
// DRIVE
// ========================================================================

/**
 * Search Drive files.
 */
export async function searchFiles(userId, { query, mimeType, maxResults = 20 } = {}) {
  const auth = await getAuthHeaders(userId, 'google_gmail');
  if (!auth.success) return { success: false, error: auth.error };

  try {
    const params = {
      pageSize: Math.min(maxResults, 100),
      fields: 'files(id,name,mimeType,modifiedTime,size,webViewLink,owners)',
    };

    // Build the q parameter for Drive search
    const qParts = [];
    if (query) qParts.push(`name contains '${query.replace(/'/g, "\\'")}'`);
    if (mimeType) qParts.push(`mimeType = '${mimeType}'`);
    qParts.push('trashed = false');
    params.q = qParts.join(' and ');

    const resp = await axios.get(`${DRIVE_BASE}/files`, {
      headers: auth.headers,
      params,
      timeout: REQUEST_TIMEOUT,
    });

    const files = (resp.data?.files || []).map(f => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      modifiedTime: f.modifiedTime,
      size: f.size,
      webViewLink: f.webViewLink,
      owner: f.owners?.[0]?.emailAddress,
    }));

    return { success: true, files };
  } catch (err) {
    log.error('searchFiles failed', { userId, error: err.response?.data || err.message });
    return { success: false, error: err.response?.data?.error?.message || err.message };
  }
}

/**
 * Get file content (text-based files only: Google Docs, Sheets, plain text, etc.).
 */
export async function getFileContent(userId, fileId) {
  if (!fileId) return { success: false, error: 'fileId is required' };

  const auth = await getAuthHeaders(userId, 'google_gmail');
  if (!auth.success) return { success: false, error: auth.error };

  try {
    // First get file metadata to determine type
    const metaResp = await axios.get(
      `${DRIVE_BASE}/files/${fileId}?fields=id,name,mimeType`,
      { headers: auth.headers, timeout: REQUEST_TIMEOUT }
    );
    const { mimeType, name } = metaResp.data;

    let content;

    // Google Docs — export as plain text
    if (mimeType === 'application/vnd.google-apps.document') {
      const exportResp = await axios.get(
        `${DRIVE_BASE}/files/${fileId}/export?mimeType=text/plain`,
        { headers: auth.headers, timeout: REQUEST_TIMEOUT, responseType: 'text' }
      );
      content = exportResp.data;
    }
    // Google Sheets — export as CSV
    else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      const exportResp = await axios.get(
        `${DRIVE_BASE}/files/${fileId}/export?mimeType=text/csv`,
        { headers: auth.headers, timeout: REQUEST_TIMEOUT, responseType: 'text' }
      );
      content = exportResp.data;
    }
    // Google Slides — export as plain text
    else if (mimeType === 'application/vnd.google-apps.presentation') {
      const exportResp = await axios.get(
        `${DRIVE_BASE}/files/${fileId}/export?mimeType=text/plain`,
        { headers: auth.headers, timeout: REQUEST_TIMEOUT, responseType: 'text' }
      );
      content = exportResp.data;
    }
    // Regular file — download content
    else {
      const downloadResp = await axios.get(
        `${DRIVE_BASE}/files/${fileId}?alt=media`,
        { headers: auth.headers, timeout: REQUEST_TIMEOUT, responseType: 'text' }
      );
      content = downloadResp.data;
    }

    return { success: true, fileId, name, mimeType, content };
  } catch (err) {
    log.error('getFileContent failed', { userId, fileId, error: err.response?.data || err.message });
    return { success: false, error: err.response?.data?.error?.message || err.message };
  }
}

/**
 * Create a new file in Drive.
 */
export async function createFile(userId, { name, mimeType = 'text/plain', content = '', folderId }) {
  if (!name) return { success: false, error: 'File name is required' };

  const auth = await getAuthHeaders(userId, 'google_gmail');
  if (!auth.success) return { success: false, error: auth.error };

  try {
    const metadata = { name, mimeType };
    if (folderId) metadata.parents = [folderId];

    // Multipart upload: metadata + content
    const boundary = 'twinme_boundary_' + Date.now();
    const multipartBody = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(metadata),
      `--${boundary}`,
      `Content-Type: ${mimeType}`,
      '',
      content,
      `--${boundary}--`,
    ].join('\r\n');

    const resp = await axios.post(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink',
      multipartBody,
      {
        headers: {
          Authorization: auth.headers.Authorization,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        timeout: REQUEST_TIMEOUT,
      }
    );

    log.info('File created', { userId, fileId: resp.data?.id, name });
    return {
      success: true,
      fileId: resp.data?.id,
      name: resp.data?.name,
      mimeType: resp.data?.mimeType,
      webViewLink: resp.data?.webViewLink,
    };
  } catch (err) {
    log.error('createFile failed', { userId, error: err.response?.data || err.message });
    return { success: false, error: err.response?.data?.error?.message || err.message };
  }
}

/**
 * Update content of an existing file.
 */
export async function updateFile(userId, fileId, { content }) {
  if (!fileId) return { success: false, error: 'fileId is required' };

  const auth = await getAuthHeaders(userId, 'google_gmail');
  if (!auth.success) return { success: false, error: auth.error };

  try {
    const resp = await axios.patch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&fields=id,name,mimeType,modifiedTime`,
      content || '',
      {
        headers: {
          Authorization: auth.headers.Authorization,
          'Content-Type': 'text/plain',
        },
        timeout: REQUEST_TIMEOUT,
      }
    );

    log.info('File updated', { userId, fileId });
    return {
      success: true,
      fileId: resp.data?.id,
      name: resp.data?.name,
      modifiedTime: resp.data?.modifiedTime,
    };
  } catch (err) {
    log.error('updateFile failed', { userId, fileId, error: err.response?.data || err.message });
    return { success: false, error: err.response?.data?.error?.message || err.message };
  }
}

// ========================================================================
// DOCS
// ========================================================================

/**
 * Create a Google Doc.
 */
export async function createDoc(userId, { title, body }) {
  if (!title) return { success: false, error: 'Document title is required' };

  const auth = await getAuthHeaders(userId, 'google_gmail');
  if (!auth.success) return { success: false, error: auth.error };

  try {
    // Step 1: Create empty doc via Docs API
    const createResp = await axios.post(
      `${DOCS_BASE}/documents`,
      { title },
      { headers: auth.headers, timeout: REQUEST_TIMEOUT }
    );

    const docId = createResp.data?.documentId;

    // Step 2: Insert body text if provided
    if (body && docId) {
      await axios.post(
        `${DOCS_BASE}/documents/${docId}:batchUpdate`,
        {
          requests: [
            {
              insertText: {
                location: { index: 1 },
                text: body,
              },
            },
          ],
        },
        { headers: auth.headers, timeout: REQUEST_TIMEOUT }
      );
    }

    log.info('Doc created', { userId, docId, title });
    return {
      success: true,
      docId,
      title: createResp.data?.title,
      documentUrl: `https://docs.google.com/document/d/${docId}/edit`,
    };
  } catch (err) {
    log.error('createDoc failed', { userId, error: err.response?.data || err.message });
    return { success: false, error: err.response?.data?.error?.message || err.message };
  }
}

/**
 * Get Google Doc content as plain text.
 */
export async function getDocContent(userId, docId) {
  if (!docId) return { success: false, error: 'docId is required' };

  const auth = await getAuthHeaders(userId, 'google_gmail');
  if (!auth.success) return { success: false, error: auth.error };

  try {
    const resp = await axios.get(
      `${DOCS_BASE}/documents/${docId}`,
      { headers: auth.headers, timeout: REQUEST_TIMEOUT }
    );

    // Extract plain text from the document body
    const doc = resp.data;
    let text = '';
    const extractText = (elements) => {
      for (const element of (elements || [])) {
        if (element.paragraph) {
          for (const elem of (element.paragraph.elements || [])) {
            if (elem.textRun?.content) {
              text += elem.textRun.content;
            }
          }
        }
        if (element.table) {
          for (const row of (element.table.tableRows || [])) {
            for (const cell of (row.tableCells || [])) {
              extractText(cell.content);
            }
          }
        }
      }
    };
    extractText(doc.body?.content);

    return {
      success: true,
      docId,
      title: doc.title,
      content: text,
      documentUrl: `https://docs.google.com/document/d/${docId}/edit`,
    };
  } catch (err) {
    log.error('getDocContent failed', { userId, docId, error: err.response?.data || err.message });
    return { success: false, error: err.response?.data?.error?.message || err.message };
  }
}

/**
 * Append text to an existing Google Doc.
 */
export async function appendToDoc(userId, docId, { text }) {
  if (!docId) return { success: false, error: 'docId is required' };
  if (!text) return { success: false, error: 'Text to append is required' };

  const auth = await getAuthHeaders(userId, 'google_gmail');
  if (!auth.success) return { success: false, error: auth.error };

  try {
    // Get the current document to find the end index
    const docResp = await axios.get(
      `${DOCS_BASE}/documents/${docId}`,
      { headers: auth.headers, timeout: REQUEST_TIMEOUT }
    );

    const bodyContent = docResp.data?.body?.content || [];
    // The endIndex of the last content element minus 1 is the insert point
    const lastElement = bodyContent[bodyContent.length - 1];
    const endIndex = lastElement?.endIndex ? lastElement.endIndex - 1 : 1;

    await axios.post(
      `${DOCS_BASE}/documents/${docId}:batchUpdate`,
      {
        requests: [
          {
            insertText: {
              location: { index: endIndex },
              text: '\n' + text,
            },
          },
        ],
      },
      { headers: auth.headers, timeout: REQUEST_TIMEOUT }
    );

    log.info('Text appended to doc', { userId, docId });
    return {
      success: true,
      docId,
      documentUrl: `https://docs.google.com/document/d/${docId}/edit`,
    };
  } catch (err) {
    log.error('appendToDoc failed', { userId, docId, error: err.response?.data || err.message });
    return { success: false, error: err.response?.data?.error?.message || err.message };
  }
}

// ========================================================================
// SHEETS
// ========================================================================

/**
 * Read cells from a Google Sheet.
 */
export async function readSheet(userId, spreadsheetId, range) {
  if (!spreadsheetId) return { success: false, error: 'spreadsheetId is required' };
  if (!range) return { success: false, error: 'Range is required (e.g., "Sheet1!A1:D10")' };

  const auth = await getAuthHeaders(userId, 'google_gmail');
  if (!auth.success) return { success: false, error: auth.error };

  try {
    const resp = await axios.get(
      `${SHEETS_BASE}/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
      { headers: auth.headers, timeout: REQUEST_TIMEOUT }
    );

    return {
      success: true,
      range: resp.data?.range,
      values: resp.data?.values || [],
      majorDimension: resp.data?.majorDimension,
    };
  } catch (err) {
    log.error('readSheet failed', { userId, spreadsheetId, range, error: err.response?.data || err.message });
    return { success: false, error: err.response?.data?.error?.message || err.message };
  }
}

/**
 * Write cells to a Google Sheet.
 */
export async function writeSheet(userId, spreadsheetId, range, values) {
  if (!spreadsheetId) return { success: false, error: 'spreadsheetId is required' };
  if (!range) return { success: false, error: 'Range is required' };
  if (!values || !Array.isArray(values)) return { success: false, error: 'Values must be a 2D array' };

  const auth = await getAuthHeaders(userId, 'google_gmail');
  if (!auth.success) return { success: false, error: auth.error };

  try {
    const resp = await axios.put(
      `${SHEETS_BASE}/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
      {
        range,
        majorDimension: 'ROWS',
        values,
      },
      { headers: auth.headers, timeout: REQUEST_TIMEOUT }
    );

    log.info('Sheet written', { userId, spreadsheetId, range, updatedCells: resp.data?.updatedCells });
    return {
      success: true,
      updatedRange: resp.data?.updatedRange,
      updatedRows: resp.data?.updatedRows,
      updatedColumns: resp.data?.updatedColumns,
      updatedCells: resp.data?.updatedCells,
    };
  } catch (err) {
    log.error('writeSheet failed', { userId, spreadsheetId, range, error: err.response?.data || err.message });
    return { success: false, error: err.response?.data?.error?.message || err.message };
  }
}

/**
 * Create a new Google Spreadsheet.
 */
export async function createSheet(userId, { title, headers }) {
  if (!title) return { success: false, error: 'Spreadsheet title is required' };

  const auth = await getAuthHeaders(userId, 'google_gmail');
  if (!auth.success) return { success: false, error: auth.error };

  try {
    const resp = await axios.post(
      `${SHEETS_BASE}/spreadsheets`,
      {
        properties: { title },
        sheets: [{ properties: { title: 'Sheet1' } }],
      },
      { headers: auth.headers, timeout: REQUEST_TIMEOUT }
    );

    const spreadsheetId = resp.data?.spreadsheetId;

    // Write headers if provided
    if (headers && headers.length > 0 && spreadsheetId) {
      await writeSheet(userId, spreadsheetId, 'Sheet1!A1', [headers]);
    }

    log.info('Spreadsheet created', { userId, spreadsheetId, title });
    return {
      success: true,
      spreadsheetId,
      title: resp.data?.properties?.title,
      spreadsheetUrl: resp.data?.spreadsheetUrl,
    };
  } catch (err) {
    log.error('createSheet failed', { userId, error: err.response?.data || err.message });
    return { success: false, error: err.response?.data?.error?.message || err.message };
  }
}

// ========================================================================
// CONTACTS
// ========================================================================

/**
 * Search contacts (People API).
 */
export async function searchContacts(userId, query) {
  if (!query) return { success: false, error: 'Search query is required' };

  const auth = await getAuthHeaders(userId, 'google_gmail');
  if (!auth.success) return { success: false, error: auth.error };

  try {
    const resp = await axios.get(`${PEOPLE_BASE}/people:searchContacts`, {
      headers: auth.headers,
      params: {
        query,
        readMask: 'names,emailAddresses,phoneNumbers,organizations',
        pageSize: 10,
      },
      timeout: REQUEST_TIMEOUT,
    });

    const contacts = (resp.data?.results || []).map(r => {
      const person = r.person || {};
      return {
        resourceName: person.resourceName,
        name: person.names?.[0]?.displayName,
        email: person.emailAddresses?.[0]?.value,
        phone: person.phoneNumbers?.[0]?.value,
        organization: person.organizations?.[0]?.name,
      };
    });

    return { success: true, contacts };
  } catch (err) {
    log.error('searchContacts failed', { userId, query, error: err.response?.data || err.message });
    return { success: false, error: err.response?.data?.error?.message || err.message };
  }
}

/**
 * Get contact details by resource name.
 */
export async function getContact(userId, resourceName) {
  if (!resourceName) return { success: false, error: 'resourceName is required' };

  const auth = await getAuthHeaders(userId, 'google_gmail');
  if (!auth.success) return { success: false, error: auth.error };

  try {
    const resp = await axios.get(
      `${PEOPLE_BASE}/${resourceName}?personFields=names,emailAddresses,phoneNumbers,organizations,addresses,birthdays,biographies,urls`,
      { headers: auth.headers, timeout: REQUEST_TIMEOUT }
    );

    const person = resp.data || {};
    return {
      success: true,
      contact: {
        resourceName: person.resourceName,
        name: person.names?.[0]?.displayName,
        givenName: person.names?.[0]?.givenName,
        familyName: person.names?.[0]?.familyName,
        emails: person.emailAddresses?.map(e => e.value) || [],
        phones: person.phoneNumbers?.map(p => p.value) || [],
        organization: person.organizations?.[0]?.name,
        title: person.organizations?.[0]?.title,
        addresses: person.addresses?.map(a => a.formattedValue) || [],
        birthday: person.birthdays?.[0]?.date,
        bio: person.biographies?.[0]?.value,
        urls: person.urls?.map(u => u.value) || [],
      },
    };
  } catch (err) {
    log.error('getContact failed', { userId, resourceName, error: err.response?.data || err.message });
    return { success: false, error: err.response?.data?.error?.message || err.message };
  }
}
