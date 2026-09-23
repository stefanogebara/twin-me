/**
 * Outlook observation fetcher.
 * Extracted from observationIngestion.js — do not change function signatures.
 */

import { createLogger } from '../logger.js';
import { sanitizeExternal, getSupabase, _hasNangoMapping } from '../observationUtils.js';

const log = createLogger('ObservationIngestion');

/**
 * Fetch Microsoft Outlook signals and return natural-language observations.
 * Privacy-safe: only folder/count metadata, no message content.
 *
 * Signals emitted:
 *  1. Inbox size estimate (totalItemCount from inbox folder)
 *  2. Custom mail folder count (organization habits)
 *  3. Contact count (network breadth)
 */
async function fetchOutlookObservations(userId) {
  const observations = [];

  const supabase = await getSupabase();
  if (!supabase) return observations;

  const isNangoManaged = await _hasNangoMapping(supabase, userId, 'outlook');
  if (!isNangoManaged) {
    log.warn('Outlook: no Nango connection', { userId });
    return observations;
  }

  let nangoService;
  try {
    nangoService = await import('../nangoService.js');
  } catch (e) {
    log.warn('Outlook: nangoService import failed', { error: e });
    return observations;
  }

  // ── 1. Mail folders (inbox size + custom folder count) ───────────────────
  let inboxCount = null;
  let customFolderCount = 0;
  try {
    const foldersResult = await nangoService.outlook.getMailFolders(userId);
    if (foldersResult.success && Array.isArray(foldersResult.data?.value)) {
      const folders = foldersResult.data.value;
      const inbox = folders.find(f => f.displayName === 'Inbox' || f.id === 'inbox');
      if (inbox?.totalItemCount != null && inbox.totalItemCount > 0) {
        inboxCount = inbox.totalItemCount;
      }
      // Count folders the user created (not system defaults)
      const systemNames = new Set(['Inbox', 'Sent Items', 'Deleted Items', 'Drafts', 'Junk Email', 'Outbox', 'Archive', 'Conversation History', 'Notes']);
      customFolderCount = folders.filter(f => !systemNames.has(f.displayName)).length;
    }
  } catch (e) {
    log.warn('Outlook mail folders error', { error: e });
  }

  if (inboxCount !== null) {
    const sizeLabel = inboxCount > 5000 ? 'very large' : inboxCount > 1000 ? 'large' : inboxCount > 200 ? 'moderate' : 'manageable';
    observations.push({
      content: `Outlook inbox contains approximately ${inboxCount.toLocaleString()} messages (${sizeLabel} inbox)`,
      contentType: 'weekly_summary',
    });
  }
  if (customFolderCount > 0) {
    observations.push({
      content: `Organizes Outlook email into ${customFolderCount} custom folder${customFolderCount !== 1 ? 's' : ''} — structured email habits`,
      contentType: 'weekly_summary',
    });
  }

  // ── 2. Contact count (network breadth) ────────────────────────────────────
  try {
    const contactsResult = await nangoService.outlook.getContacts(userId, 100);
    if (contactsResult.success) {
      const contacts = contactsResult.data?.value || [];
      if (contacts.length > 0) {
        observations.push({
          content: `Outlook contacts list has at least ${contacts.length} contact${contacts.length !== 1 ? 's' : ''} — ${contacts.length >= 80 ? 'broad' : contacts.length >= 30 ? 'moderate' : 'focused'} professional network`,
          contentType: 'weekly_summary',
        });
      }
    }
  } catch (e) {
    log.warn('Outlook contacts error', { error: e });
  }

  // ── 3. Subject classification from recent inbox messages ─────────────────
  // Reads subject field from Microsoft Graph message objects — no body accessed.
  try {
    const messagesResult = await nangoService.outlook.getRecentMessages(userId, 50);
    if (messagesResult.success && Array.isArray(messagesResult.data?.value)) {
      const messages = messagesResult.data.value;

      // PII stripping: remove email addresses, phone numbers, title-case name sequences
      const stripPii = (s) => s
        .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '')
        .replace(/\b\d[\d\s().+-]{6,}\d\b/g, '')
        .replace(/\b([A-Z][a-z]+\s){1,}[A-Z][a-z]+\b/g, '');

      // Regex-based register classification — no LLM
      const registers = {
        formal: /\b(meeting|request|per our|following up|follow.?up|regarding|per your|as discussed|action item|proposal|invoice|agenda|quarterly|schedule|confirm|pursuant|sincerely|dear\s+\w+)\b/i,
        casual: /\b(hey|hi|quick question|quick update|thoughts|fyi|heads up|checking in|catching up|loop you in|just wanted|what do you think|lmk|tbh|btw)\b/i,
        action_oriented: /\b(action required|please review|please confirm|urgent|deadline|time.sensitive|asap|reminder|due|overdue|next steps|deliverable|approve|sign off)\b/i,
        personal: /\b(happy birthday|happy anniversary|congrats|congratulations|miss you|miss me|love you|thinking of you|personal|family|vacation|holiday|weekend|dinner|lunch|party|celebrate|wedding|baby)\b/i,
      };

      const counts = { formal: 0, casual: 0, action_oriented: 0, personal: 0 };
      let classifiedCount = 0;
      for (const msg of messages) {
        const raw = sanitizeExternal(msg.subject || '', 200);
        if (!raw) continue;
        const s = stripPii(raw);
        let matched = false;
        if (registers.formal.test(s)) { counts.formal++; matched = true; }
        if (registers.casual.test(s)) { counts.casual++; matched = true; }
        if (registers.action_oriented.test(s)) { counts.action_oriented++; matched = true; }
        if (registers.personal.test(s)) { counts.personal++; matched = true; }
        if (matched) classifiedCount++;
      }
      const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      const topRegister = dominant[0];
      if (topRegister && topRegister[1] > 0) {
        const label = topRegister[0].replace('_', '-');
        observations.push({
          content: `Outlook inbox reflects a ${label} communication register (${topRegister[1]} of ${classifiedCount} classified inbox subjects matched this pattern)`,
          contentType: 'weekly_summary',
        });
      }

      // Sender domain diversity from the same batch of inbox messages
      const senderDomains = messages
        .map(msg => {
          const addr = msg.from?.emailAddress?.address || '';
          const match = addr.match(/@([a-zA-Z0-9.-]+)/);
          return match ? match[1].toLowerCase() : null;
        })
        .filter(Boolean);
      const automatedPattern = /\b(noreply|no-reply|newsletter|notifications|support|mailer|bounce|amazonses|mailchimp|sendgrid|mailgun|hubspot|constantcontact)\b/i;
      const uniquePersonalDomains = [...new Set(senderDomains.filter(d => !automatedPattern.test(d)))];
      if (uniquePersonalDomains.length > 0) {
        observations.push({
          content: `Outlook inbox receives messages from ${uniquePersonalDomains.length} distinct sender domain${uniquePersonalDomains.length !== 1 ? 's' : ''} — ${uniquePersonalDomains.length >= 15 ? 'broad' : uniquePersonalDomains.length >= 6 ? 'moderate' : 'focused'} incoming network`,
          contentType: 'weekly_summary',
        });
      }
    }
  } catch (e) {
    log.warn('Outlook subject/sender analysis error', { error: e });
  }

  // ── 4. Meeting pattern analysis from calendar events ─────────────────────
  // Reads event subject and start/end times only — no attendee PII accessed.
  try {
    const eventsResult = await nangoService.outlook.getCalendarEvents(userId, 100);
    if (eventsResult.success && Array.isArray(eventsResult.data?.value)) {
      const events = eventsResult.data.value;

      // Filter to upcoming / recent 30-day window
      const now = Date.now();
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      const windowEvents = events.filter(ev => {
        const start = ev.start?.dateTime ? new Date(ev.start.dateTime).getTime() : null;
        return start !== null && Math.abs(start - now) < thirtyDaysMs;
      });

      if (windowEvents.length > 0) {
        // Meeting type patterns from subject (regex, no LLM)
        const meetingPatterns = {
          one_on_one: /\b(1:1|one.on.one|1 on 1|1-on-1|sync|check.?in)\b/i,
          standup: /\b(standup|stand.?up|daily|scrum)\b/i,
          review: /\b(review|retrospective|retro|demo|showcase|planning)\b/i,
          call: /\b(call|phone|interview|intro)\b/i,
        };
        const meetCounts = { one_on_one: 0, standup: 0, review: 0, call: 0, other: 0 };
        for (const ev of windowEvents) {
          const subj = sanitizeExternal(ev.subject || '', 150);
          let matched = false;
          for (const [type, pattern] of Object.entries(meetingPatterns)) {
            if (pattern.test(subj)) { meetCounts[type]++; matched = true; break; }
          }
          if (!matched) meetCounts.other++;
        }

        // Weekly meeting frequency
        const weeksInWindow = Math.max(1, thirtyDaysMs / (7 * 24 * 60 * 60 * 1000));
        const meetingsPerWeek = Math.round(windowEvents.length / weeksInWindow);
        const freqLabel = meetingsPerWeek >= 15 ? 'heavy meeting load' : meetingsPerWeek >= 7 ? 'moderate meeting cadence' : 'light meeting schedule';
        observations.push({
          content: `Calendar shows approximately ${meetingsPerWeek} meeting${meetingsPerWeek !== 1 ? 's' : ''} per week — ${freqLabel} (${windowEvents.length} events in 30-day window)`,
          contentType: 'weekly_summary',
        });

        // Dominant meeting type
        const topMeetType = Object.entries(meetCounts)
          .filter(([k]) => k !== 'other')
          .sort((a, b) => b[1] - a[1])[0];
        if (topMeetType && topMeetType[1] > 0) {
          const typeLabel = topMeetType[0].replace('_', '-');
          observations.push({
            content: `Most frequent calendar event type: ${typeLabel} meetings (${topMeetType[1]} in past 30 days)`,
            contentType: 'weekly_summary',
          });
        }
      }
    }
  } catch (e) {
    log.warn('Outlook calendar meeting pattern error', { error: e });
  }

  return observations;
}

export default fetchOutlookObservations;
export { fetchOutlookObservations };
