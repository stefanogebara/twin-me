/**
 * Google Workspace Tools — Tool Registry Registration
 * =====================================================
 * Registers all Google Workspace actions (Gmail, Calendar, Drive, Docs,
 * Sheets, Contacts) into the tool registry for use during twin chat.
 *
 * Autonomy levels:
 *   Level 1 (SUGGEST)     — Read-only: search, read, list
 *   Level 2 (DRAFT)       — Create drafts, create events, create files
 *   Level 3 (ACT_NOTIFY)  — Send emails, reply, modify, delete
 */

import { registerTool } from '../toolRegistry.js';
import { createLogger } from '../logger.js';
import { draftEmailInUserVoice } from '../departmentExecutors/communicationsExecutor.js';
import { getAutonomyBySkillName } from '../autonomyService.js';
import { supabaseAdmin } from '../database.js';
import { draftEmail } from '../googleWorkspaceActions.js';

const log = createLogger('GoogleWorkspaceTools');

/**
 * Check if the user has a personality profile populated enough to drive
 * personality-aware drafting. Requires at least one non-null OCEAN dimension
 * OR a stylometric fingerprint. Returns false on any error (safe fallback).
 */
async function hasUserPersonalityProfile(userId) {
  try {
    const { data, error } = await supabaseAdmin
      .from('user_personality_profiles')
      .select('ocean_openness, ocean_conscientiousness, ocean_extraversion, ocean_agreeableness, ocean_neuroticism, stylometric_fingerprint')
      .eq('user_id', userId)
      .single();

    if (error || !data) return false;

    const hasOcean = data.ocean_openness != null
      || data.ocean_conscientiousness != null
      || data.ocean_extraversion != null
      || data.ocean_agreeableness != null
      || data.ocean_neuroticism != null;

    return hasOcean || !!data.stylometric_fingerprint;
  } catch {
    return false;
  }
}

export function registerGoogleWorkspaceTools() {
  // ========================================================================
  // GMAIL — Read (Level 1)
  // ========================================================================

  registerTool({
    name: 'gmail_search',
    platform: 'google_gmail',
    description: 'Search emails using Gmail query syntax (live from API). Use queries like "from:john subject:meeting", "is:unread", "newer_than:2d".',
    category: 'communication',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Gmail search query (e.g., "from:john subject:meeting")' },
        maxResults: { type: 'number', description: 'Max results to return (default 10, max 50)' },
      },
      required: ['query'],
    },
    requiresConnection: true,
    minAutonomyLevel: 1,
    skillName: 'communications_actions',
    executor: async (userId, params) => {
      const { getEmails } = await import('../googleWorkspaceActions.js');
      return getEmails(userId, params);
    },
  });

  registerTool({
    name: 'gmail_read',
    platform: 'google_gmail',
    description: 'Read a specific email by message ID. Returns full content including body text.',
    category: 'communication',
    parameters: {
      type: 'object',
      properties: {
        messageId: { type: 'string', description: 'Gmail message ID' },
      },
      required: ['messageId'],
    },
    requiresConnection: true,
    minAutonomyLevel: 1,
    skillName: 'communications_actions',
    executor: async (userId, params) => {
      const { getEmail } = await import('../googleWorkspaceActions.js');
      return getEmail(userId, params.messageId);
    },
  });

  // ========================================================================
  // GMAIL — Write (Level 2)
  // ========================================================================

  registerTool({
    name: 'gmail_draft',
    platform: 'google_gmail',
    description: 'Create an email draft in the user\'s Gmail. Does NOT send — saves as draft.',
    category: 'communication',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address' },
        subject: { type: 'string', description: 'Email subject' },
        body: { type: 'string', description: 'Email body (plain text)' },
      },
      required: ['to', 'subject', 'body'],
    },
    requiresConnection: true,
    minAutonomyLevel: 2,
    skillName: 'communications_actions',
    executor: async (userId, params) => {
      // Try personality-aware draft from Communications department executor.
      // Only attempt if: autonomy level permits AND user has a personality profile.
      try {
        const level = await getAutonomyBySkillName(userId, 'communications_actions');
        if (level >= 2) {
          const hasProfile = await hasUserPersonalityProfile(userId);
          if (hasProfile) {
            const personalizedDraft = await draftEmailInUserVoice(userId, {
              to: params.to,
              subject: params.subject,
              context: params.body || '',
            });
            if (personalizedDraft) {
              log.info('gmail_draft: used personality-aware draft', { userId, to: params.to });
              return { draft: personalizedDraft, personalized: true };
            }
          } else {
            log.info('gmail_draft: no personality profile, using generic draft', { userId });
          }
        }
      } catch (err) {
        log.warn('gmail_draft: personality-aware draft failed, falling back to generic', { error: err.message });
      }

      // Fall back to generic draft
      log.info('gmail_draft: using generic draft (fallback)', { userId, to: params.to });
      const result = await draftEmail(userId, params);
      return { draft: result, personalized: false };
    },
  });

  // gmail_archive removed — requires gmail.modify (RESTRICTED/CASA).
  // We use gmail.send+gmail.compose instead to avoid CASA certification.

  // ========================================================================
  // GMAIL — Write (Level 3)
  // ========================================================================

  registerTool({
    name: 'gmail_send',
    platform: 'google_gmail',
    description: 'Send an email on behalf of the user. This actually sends the email.',
    category: 'communication',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address' },
        subject: { type: 'string', description: 'Email subject' },
        body: { type: 'string', description: 'Email body (plain text)' },
      },
      required: ['to', 'subject', 'body'],
    },
    requiresConnection: true,
    minAutonomyLevel: 3,
    skillName: 'communications_actions',
    executor: async (userId, params) => {
      const { sendEmail } = await import('../googleWorkspaceActions.js');
      return sendEmail(userId, params);
    },
  });

  registerTool({
    name: 'gmail_reply',
    platform: 'google_gmail',
    description: 'Reply to an email by message ID. Sends the reply immediately.',
    category: 'communication',
    parameters: {
      type: 'object',
      properties: {
        messageId: { type: 'string', description: 'Gmail message ID to reply to' },
        body: { type: 'string', description: 'Reply body (plain text)' },
      },
      required: ['messageId', 'body'],
    },
    requiresConnection: true,
    minAutonomyLevel: 3,
    skillName: 'communications_actions',
    executor: async (userId, params) => {
      const { replyToEmail } = await import('../googleWorkspaceActions.js');
      return replyToEmail(userId, params.messageId, { body: params.body });
    },
  });

  // ========================================================================
  // CALENDAR — Read (Level 1)
  // ========================================================================

  registerTool({
    name: 'calendar_today',
    platform: 'google_calendar',
    description: 'Get today\'s calendar events (live from Google Calendar API).',
    category: 'schedule',
    parameters: { type: 'object', properties: {} },
    requiresConnection: true,
    minAutonomyLevel: 1,
    skillName: 'scheduling_actions',
    executor: async (userId) => {
      const { getEvents } = await import('../googleWorkspaceActions.js');
      // Compute today's boundaries in the user's local timezone
      let userTimezone = 'UTC';
      try {
        const { supabaseAdmin } = await import('../database.js');
        const { data } = await supabaseAdmin
          .from('users')
          .select('timezone')
          .eq('id', userId)
          .single();
        if (data?.timezone) userTimezone = data.timezone;
      } catch { /* non-fatal — falls back to UTC */ }

      const now = new Date();
      // Get the user's local date string (YYYY-MM-DD) then build midnight boundaries in that TZ
      const localDateStr = now.toLocaleDateString('en-CA', { timeZone: userTimezone }); // YYYY-MM-DD
      const todayStart = new Date(`${localDateStr}T00:00:00`);
      // Shift to actual UTC by computing the timezone offset for that date
      const todayStartUTC = new Date(
        todayStart.toLocaleString('en-US', { timeZone: 'UTC' }) // parse as UTC
      );
      // Simpler: just use the local date string to build RFC3339 boundaries with the timezone offset
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: userTimezone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        timeZoneName: 'longOffset',
        hour12: false,
      });
      // Build ISO boundary strings that Google Calendar API will interpret correctly
      // by computing the UTC offset for the user's timezone
      const offsetMatch = formatter.format(now).match(/GMT([+-]\d{2}:\d{2})/);
      const offset = offsetMatch ? offsetMatch[1] : '+00:00';
      const todayStartISO = `${localDateStr}T00:00:00${offset}`;
      const [y, m, d] = localDateStr.split('-').map(Number);
      const tomorrowDateStr = (() => {
        const t = new Date(y, m - 1, d + 1);
        return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
      })();
      const todayEndISO = `${tomorrowDateStr}T00:00:00${offset}`;
      return getEvents(userId, { timeMin: todayStartISO, timeMax: todayEndISO });
    },
  });

  registerTool({
    name: 'calendar_upcoming',
    platform: 'google_calendar',
    description: 'Get upcoming calendar events for the next N days (default 7).',
    category: 'schedule',
    parameters: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Number of days to look ahead (default 7, max 30)' },
      },
    },
    requiresConnection: true,
    minAutonomyLevel: 1,
    skillName: 'scheduling_actions',
    executor: async (userId, params) => {
      const { getEvents } = await import('../googleWorkspaceActions.js');
      const days = Math.min(params?.days || 7, 30);
      const now = new Date();
      const timeMin = now.toISOString();
      const timeMax = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
      return getEvents(userId, { timeMin, timeMax, maxResults: 50 });
    },
  });

  registerTool({
    name: 'calendar_find_free_slots',
    platform: 'google_calendar',
    description: 'Find free time slots in the user\'s calendar within a date range.',
    category: 'schedule',
    parameters: {
      type: 'object',
      properties: {
        timeMin: { type: 'string', description: 'Start of range (ISO 8601)' },
        timeMax: { type: 'string', description: 'End of range (ISO 8601)' },
        durationMinutes: { type: 'number', description: 'Minimum slot duration in minutes (default 30)' },
      },
      required: ['timeMin', 'timeMax'],
    },
    requiresConnection: true,
    minAutonomyLevel: 1,
    skillName: 'scheduling_actions',
    executor: async (userId, params) => {
      const { findFreeSlots } = await import('../googleWorkspaceActions.js');
      return findFreeSlots(userId, params);
    },
  });

  // ========================================================================
  // CALENDAR — Write (Level 2)
  // ========================================================================

  registerTool({
    name: 'calendar_create',
    platform: 'google_calendar',
    description: 'Create a new calendar event. Always use the user\'s local time in datetime strings — NOT UTC. The timezone will be applied automatically.',
    category: 'schedule',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Event title' },
        start: { type: 'string', description: 'Start time in LOCAL time (ISO 8601 without Z, e.g., "2026-04-18T15:00:00" for 3pm local). Do NOT append Z — timezone is set automatically.' },
        end: { type: 'string', description: 'End time in LOCAL time (ISO 8601 without Z, defaults to 1 hour after start)' },
        description: { type: 'string', description: 'Event description (optional)' },
        attendees: { type: 'string', description: 'Comma-separated attendee emails (optional)' },
        location: { type: 'string', description: 'Event location (optional)' },
      },
      required: ['summary', 'start'],
    },
    requiresConnection: true,
    minAutonomyLevel: 2,
    skillName: 'scheduling_actions',
    executor: async (userId, params) => {
      const { createEvent } = await import('../googleWorkspaceActions.js');
      const { supabaseAdmin } = await import('../database.js');
      const parsed = { ...params };
      if (typeof parsed.attendees === 'string') {
        parsed.attendees = parsed.attendees.split(',').map(e => e.trim()).filter(Boolean);
      }
      // Fetch user's timezone from the database and pass it to createEvent
      // so Google Calendar stores the event in the correct local time zone
      try {
        const { data } = await supabaseAdmin
          .from('users')
          .select('timezone')
          .eq('id', userId)
          .single();
        if (data?.timezone) {
          parsed.userTimezone = data.timezone;
        }
      } catch { /* non-fatal — falls back to UTC */ }
      return createEvent(userId, parsed);
    },
  });

  // ========================================================================
  // CALENDAR — Write (Level 3)
  // ========================================================================

  registerTool({
    name: 'calendar_modify_event',
    platform: 'google_calendar',
    description: 'Modify an existing calendar event by event ID. Use LOCAL time in datetime strings.',
    category: 'schedule',
    parameters: {
      type: 'object',
      properties: {
        eventId: { type: 'string', description: 'Calendar event ID to modify' },
        summary: { type: 'string', description: 'New event title (optional)' },
        start: { type: 'string', description: 'New start time in LOCAL time (ISO 8601 without Z, optional)' },
        end: { type: 'string', description: 'New end time in LOCAL time (ISO 8601 without Z, optional)' },
        location: { type: 'string', description: 'New location (optional)' },
      },
      required: ['eventId'],
    },
    requiresConnection: true,
    minAutonomyLevel: 3,
    skillName: 'scheduling_actions',
    executor: async (userId, params) => {
      const { modifyEvent } = await import('../googleWorkspaceActions.js');
      const { supabaseAdmin } = await import('../database.js');
      const { eventId, ...updates } = params;
      // Fetch user's timezone and pass it through so datetimes are interpreted correctly
      try {
        const { data } = await supabaseAdmin
          .from('users')
          .select('timezone')
          .eq('id', userId)
          .single();
        if (data?.timezone) {
          updates.userTimezone = data.timezone;
        }
      } catch { /* non-fatal */ }
      return modifyEvent(userId, eventId, updates);
    },
  });

  registerTool({
    name: 'calendar_delete_event',
    platform: 'google_calendar',
    description: 'Delete a calendar event by event ID.',
    category: 'schedule',
    parameters: {
      type: 'object',
      properties: {
        eventId: { type: 'string', description: 'Calendar event ID to delete' },
      },
      required: ['eventId'],
    },
    requiresConnection: true,
    minAutonomyLevel: 3,
    skillName: 'scheduling_actions',
    executor: async (userId, params) => {
      const { deleteEvent } = await import('../googleWorkspaceActions.js');
      return deleteEvent(userId, params.eventId);
    },
  });

  // ========================================================================
  // DRIVE — Read (Level 1)
  // ========================================================================

  registerTool({
    name: 'drive_search',
    platform: 'google_gmail',
    description: 'Search files in Google Drive by name.',
    category: 'productivity',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term for file names' },
        maxResults: { type: 'number', description: 'Max results (default 20)' },
      },
      required: ['query'],
    },
    requiresConnection: true,
    minAutonomyLevel: 1,
    skillName: 'google_drive_actions',
    executor: async (userId, params) => {
      const { searchFiles } = await import('../googleWorkspaceActions.js');
      return searchFiles(userId, params);
    },
  });

  registerTool({
    name: 'drive_read_file',
    platform: 'google_gmail',
    description: 'Read the content of a file in Google Drive (text-based files).',
    category: 'productivity',
    parameters: {
      type: 'object',
      properties: {
        fileId: { type: 'string', description: 'Google Drive file ID' },
      },
      required: ['fileId'],
    },
    requiresConnection: true,
    minAutonomyLevel: 1,
    skillName: 'google_drive_actions',
    executor: async (userId, params) => {
      const { getFileContent } = await import('../googleWorkspaceActions.js');
      return getFileContent(userId, params.fileId);
    },
  });

  // ========================================================================
  // DRIVE — Write (Level 2)
  // ========================================================================

  registerTool({
    name: 'drive_create_file',
    platform: 'google_gmail',
    description: 'Create a new file in Google Drive.',
    category: 'productivity',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'File name' },
        mimeType: { type: 'string', description: 'MIME type (default text/plain)' },
        content: { type: 'string', description: 'File content' },
        folderId: { type: 'string', description: 'Parent folder ID (optional)' },
      },
      required: ['name'],
    },
    requiresConnection: true,
    minAutonomyLevel: 2,
    skillName: 'google_drive_actions',
    executor: async (userId, params) => {
      const { createFile } = await import('../googleWorkspaceActions.js');
      return createFile(userId, params);
    },
  });

  // ========================================================================
  // DOCS — Read (Level 1)
  // ========================================================================

  registerTool({
    name: 'docs_read',
    platform: 'google_gmail',
    description: 'Read a Google Doc\'s content as plain text.',
    category: 'productivity',
    parameters: {
      type: 'object',
      properties: {
        documentId: { type: 'string', description: 'Google Doc document ID' },
      },
      required: ['documentId'],
    },
    requiresConnection: true,
    minAutonomyLevel: 1,
    skillName: 'google_docs_actions',
    executor: async (userId, params) => {
      const { getDocContent } = await import('../googleWorkspaceActions.js');
      return getDocContent(userId, params.documentId);
    },
  });

  // ========================================================================
  // DOCS — Write (Level 2)
  // ========================================================================

  registerTool({
    name: 'docs_create',
    platform: 'google_gmail',
    description: 'Create a new Google Doc.',
    category: 'productivity',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Document title' },
        body: { type: 'string', description: 'Initial document body text (optional)' },
      },
      required: ['title'],
    },
    requiresConnection: true,
    minAutonomyLevel: 2,
    skillName: 'google_docs_actions',
    executor: async (userId, params) => {
      const { createDoc } = await import('../googleWorkspaceActions.js');
      return createDoc(userId, params);
    },
  });

  registerTool({
    name: 'docs_append',
    platform: 'google_gmail',
    description: 'Append text to an existing Google Doc.',
    category: 'productivity',
    parameters: {
      type: 'object',
      properties: {
        docId: { type: 'string', description: 'Google Doc ID' },
        text: { type: 'string', description: 'Text to append' },
      },
      required: ['docId', 'text'],
    },
    requiresConnection: true,
    minAutonomyLevel: 2,
    skillName: 'google_docs_actions',
    executor: async (userId, params) => {
      const { appendToDoc } = await import('../googleWorkspaceActions.js');
      return appendToDoc(userId, params.docId, { text: params.text });
    },
  });

  // ========================================================================
  // SHEETS — Read (Level 1)
  // ========================================================================

  registerTool({
    name: 'sheets_read',
    platform: 'google_gmail',
    description: 'Read cells from a Google Sheet.',
    category: 'productivity',
    parameters: {
      type: 'object',
      properties: {
        spreadsheetId: { type: 'string', description: 'Google Spreadsheet ID' },
        range: { type: 'string', description: 'Cell range (e.g., "Sheet1!A1:D10")' },
      },
      required: ['spreadsheetId', 'range'],
    },
    requiresConnection: true,
    minAutonomyLevel: 1,
    skillName: 'google_sheets_actions',
    executor: async (userId, params) => {
      const { readSheet } = await import('../googleWorkspaceActions.js');
      return readSheet(userId, params.spreadsheetId, params.range);
    },
  });

  // ========================================================================
  // SHEETS — Write (Level 2)
  // ========================================================================

  registerTool({
    name: 'sheets_write',
    platform: 'google_gmail',
    description: 'Write values to cells in a Google Sheet.',
    category: 'productivity',
    parameters: {
      type: 'object',
      properties: {
        spreadsheetId: { type: 'string', description: 'Google Spreadsheet ID' },
        range: { type: 'string', description: 'Cell range (e.g., "Sheet1!A1:D3")' },
        values: { type: 'array', description: '2D array of values (rows of cells)', items: { type: 'array', items: { type: 'string' } } },
      },
      required: ['spreadsheetId', 'range', 'values'],
    },
    requiresConnection: true,
    minAutonomyLevel: 2,
    skillName: 'google_sheets_actions',
    executor: async (userId, params) => {
      const { writeSheet } = await import('../googleWorkspaceActions.js');
      return writeSheet(userId, params.spreadsheetId, params.range, params.values);
    },
  });

  registerTool({
    name: 'sheets_create',
    platform: 'google_gmail',
    description: 'Create a new Google Spreadsheet.',
    category: 'productivity',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Spreadsheet title' },
        headers: { type: 'array', description: 'Column header names (optional)', items: { type: 'string' } },
      },
      required: ['title'],
    },
    requiresConnection: true,
    minAutonomyLevel: 2,
    skillName: 'google_sheets_actions',
    executor: async (userId, params) => {
      const { createSheet } = await import('../googleWorkspaceActions.js');
      return createSheet(userId, params);
    },
  });

  // ========================================================================
  // CONTACTS — Read (Level 1)
  // ========================================================================

  registerTool({
    name: 'contacts_search',
    platform: 'google_gmail',
    description: 'Search the user\'s Google Contacts by name, email, or phone.',
    category: 'communication',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (name, email, phone, etc.)' },
      },
      required: ['query'],
    },
    requiresConnection: true,
    minAutonomyLevel: 1,
    skillName: 'google_contacts_actions',
    executor: async (userId, params) => {
      const { searchContacts } = await import('../googleWorkspaceActions.js');
      return searchContacts(userId, params.query);
    },
  });

  log.info('Google Workspace tools registered', { count: 21 });
}

/**
 * Tool names exposed to the twin chat for the [AVAILABLE ACTIONS] prompt block.
 * These are the primary tools the LLM can invoke via [ACTION: tool_name ...] syntax.
 */
export const GOOGLE_WORKSPACE_TOOL_NAMES = [
  // Gmail
  'gmail_search',
  'gmail_read',
  'gmail_draft',
  'gmail_send',
  'gmail_reply',
  // Calendar
  'calendar_today',
  'calendar_upcoming',
  'calendar_find_free_slots',
  'calendar_create',
  'calendar_modify_event',
  'calendar_delete_event',
  // Drive
  'drive_search',
  'drive_read_file',
  'drive_create_file',
  // Docs
  'docs_read',
  'docs_create',
  'docs_append',
  // Sheets
  'sheets_read',
  'sheets_write',
  'sheets_create',
  // Contacts
  'contacts_search',
];
