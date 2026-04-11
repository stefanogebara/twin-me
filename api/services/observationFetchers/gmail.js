/**
 * Gmail observation fetcher.
 * Extracted from observationIngestion.js — do not change function signatures.
 */

import axios from 'axios';
import { getValidAccessToken } from '../tokenRefreshService.js';
import { createLogger } from '../logger.js';
import { sanitizeExternal } from '../observationUtils.js';

const log = createLogger('ObservationIngestion');

/**
 * Fetch Gmail behavioral signals and return natural-language observations.
 * Privacy-safe: reads only aggregate stats, label names, and message Date/From headers.
 * Never reads message content or subject lines.
 */
async function fetchGmailObservations(userId) {
  const observations = [];

  const tokenResult = await getValidAccessToken(userId, 'google_gmail');
  if (!tokenResult.success || !tokenResult.accessToken) {
    log.warn('Gmail: no valid token', { userId });
    return observations;
  }

  const headers = { Authorization: `Bearer ${tokenResult.accessToken}` };
  const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

  // ── 1. Profile: inbox size category ────────────────────────────────────────
  let totalMessages = null;
  try {
    const profileRes = await axios.get(`${BASE}/profile`, { headers, timeout: 10000 });
    totalMessages = profileRes.data?.messagesTotal ?? null;
  } catch (e) {
    log.warn('Gmail profile error', { error: e });
    return observations;
  }

  if (totalMessages !== null) {
    const sizeLabel =
      totalMessages > 50000 ? 'a very large mailbox (50 000+ messages)' :
      totalMessages > 10000 ? `a large mailbox (~${Math.round(totalMessages / 1000)}k messages)` :
      totalMessages > 1000  ? `a moderate-sized mailbox (~${Math.round(totalMessages / 1000)}k messages)` :
                              `a lean mailbox (${totalMessages} messages)`;
    observations.push({ content: `Manages ${sizeLabel}`, contentType: 'weekly_summary' });
  }

  // ── 1b. Unread email count — reveals email engagement ──────────────────────
  try {
    const [inboxLabel, unreadLabel] = await Promise.all([
      axios.get(`${BASE}/labels/INBOX`, { headers, timeout: 8000 }).catch(() => null),
      axios.get(`${BASE}/labels/UNREAD`, { headers, timeout: 8000 }).catch(() => null),
    ]);
    const inboxUnread = inboxLabel?.data?.messagesUnread ?? null;
    const totalUnread = unreadLabel?.data?.messagesUnread ?? null;

    if (inboxUnread !== null) {
      if (inboxUnread === 0) {
        observations.push({ content: 'Practices inbox zero — 0 unread emails in inbox', contentType: 'daily_summary' });
      } else {
        const urgency = inboxUnread > 50 ? 'a backlog of' : inboxUnread > 20 ? 'a moderate pile of' : '';
        observations.push({ content: `Has ${urgency ? urgency + ' ' : ''}${inboxUnread} unread emails in inbox`, contentType: 'daily_summary' });
      }
    }
    if (totalUnread !== null && inboxUnread !== null && totalMessages) {
      const inboxTotal = inboxLabel?.data?.messagesTotal ?? totalMessages;
      if (inboxTotal > 0) {
        const readPct = Math.round(((inboxTotal - inboxUnread) / inboxTotal) * 100);
        observations.push({ content: `Reads ${readPct}% of incoming email (${inboxTotal - inboxUnread} of ${inboxTotal} inbox messages read)`, contentType: 'weekly_summary' });
      }
    }
  } catch (e) {
    log.warn('Gmail unread tracking error', { error: e.message });
  }

  // ── 2. Custom labels — reveals organization habits ─────────────────────────
  try {
    const labelsRes = await axios.get(`${BASE}/labels`, { headers, timeout: 10000 });
    const customLabels = (labelsRes.data?.labels || [])
      .filter(l => l.type === 'user')
      .map(l => sanitizeExternal(l.name, 60))
      .filter(Boolean);
    if (customLabels.length > 0) {
      const top = customLabels.slice(0, 5).join(', ');
      observations.push({
        content: `Uses ${customLabels.length} custom email labels including: ${top}`,
        contentType: 'weekly_summary',
      });
    }
  } catch (e) {
    log.warn('Gmail labels error', { error: e });
  }

  // ── 3. Weekly volume estimate (INBOX + SENT) ────────────────────────────────
  try {
    const [inboxRes, sentRes] = await Promise.all([
      axios.get(`${BASE}/messages?labelIds=INBOX&q=newer_than:7d&maxResults=1`, { headers, timeout: 10000 }),
      axios.get(`${BASE}/messages?labelIds=SENT&q=newer_than:7d&maxResults=1`, { headers, timeout: 10000 }),
    ]);
    const weeklyInbox = inboxRes.data?.resultSizeEstimate ?? 0;
    const weeklySent = sentRes.data?.resultSizeEstimate ?? 0;
    const total = weeklyInbox + weeklySent;
    if (total > 0) {
      const volLabel =
        total > 200 ? 'heavy (200+ per week)' :
        total > 50  ? `moderate (~${total} per week)` :
                      `light (~${total} per week)`;
      observations.push({
        content: `Email activity this week is ${volLabel} — ~${weeklyInbox} received, ~${weeklySent} sent`,
        contentType: 'weekly_summary',
      });
    }
  } catch (e) {
    log.warn('Gmail volume estimate error', { error: e });
  }

  // ── 4. Time-of-day peak from recent sent messages ──────────────────────────
  try {
    const sentListRes = await axios.get(
      `${BASE}/messages?labelIds=SENT&maxResults=20`,
      { headers, timeout: 10000 }
    );
    const sentIds = (sentListRes.data?.messages || []).map(m => m.id);
    if (sentIds.length >= 5) {
      const dateStrings = await Promise.all(
        sentIds.map(id =>
          axios.get(`${BASE}/messages/${id}?format=metadata&metadataHeaders=Date`, { headers, timeout: 10000 })
            .then(r => r.data?.payload?.headers?.find(h => h.name === 'Date')?.value || null)
            .catch(() => null)
        )
      );
      const hourCounts = { morning: 0, afternoon: 0, evening: 0, night: 0 };
      for (const dateStr of dateStrings.filter(Boolean)) {
        const hour = new Date(dateStr).getHours();
        if (isNaN(hour)) continue;
        if (hour >= 6 && hour < 12) hourCounts.morning++;
        else if (hour >= 12 && hour < 18) hourCounts.afternoon++;
        else if (hour >= 18 && hour < 23) hourCounts.evening++;
        else hourCounts.night++;
      }
      const peakSlot = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
      if (peakSlot && peakSlot[1] > 0) {
        observations.push({
          content: `Tends to send emails in the ${peakSlot[0]} (from recent sent patterns)`,
          contentType: 'weekly_summary',
        });
      }
    }
  } catch (e) {
    log.warn('Gmail time-of-day error', { error: e });
  }

  // ── 5. Sender domain diversity from last 30 days ───────────────────────────
  try {
    const inboxListRes = await axios.get(
      `${BASE}/messages?labelIds=INBOX&q=newer_than:30d&maxResults=30`,
      { headers, timeout: 10000 }
    );
    const inboxIds = (inboxListRes.data?.messages || []).map(m => m.id);
    if (inboxIds.length >= 5) {
      const domains = await Promise.all(
        inboxIds.map(id =>
          axios.get(`${BASE}/messages/${id}?format=metadata&metadataHeaders=From`, { headers, timeout: 10000 })
            .then(r => {
              const from = r.data?.payload?.headers?.find(h => h.name === 'From')?.value || '';
              const match = from.match(/@([a-zA-Z0-9.-]+)/);
              return match ? match[1].toLowerCase() : null;
            })
            .catch(() => null)
        )
      );
      const uniqueDomains = [...new Set(domains.filter(Boolean))];
      // Filter out known automation/transactional senders
      const automatedPattern = /\b(noreply|no-reply|newsletter|notifications|support|mailer|bounce|amazonses|mailchimp|sendgrid|mailgun|hubspot|constantcontact)\b/i;
      const personalDomains = uniqueDomains.filter(d => !automatedPattern.test(d));
      if (personalDomains.length > 0) {
        observations.push({
          content: `Receives email from ${personalDomains.length} distinct senders/organizations in the past month`,
          contentType: 'weekly_summary',
        });
      }
    }
  } catch (e) {
    log.warn('Gmail sender diversity error', { error: e });
  }

  // ── 6. Subject line pattern analysis from 30 SENT messages ────────────────
  // Reads only Subject and Date metadata headers — no body content accessed.
  try {
    const sentSubjectListRes = await axios.get(
      `${BASE}/messages?labelIds=SENT&maxResults=30`,
      { headers, timeout: 10000 }
    );
    const sentSubjectIds = (sentSubjectListRes.data?.messages || []).map(m => m.id);
    if (sentSubjectIds.length >= 5) {
      const subjects = await Promise.all(
        sentSubjectIds.map(id =>
          axios.get(`${BASE}/messages/${id}?format=metadata&metadataHeaders=Subject`, { headers, timeout: 10000 })
            .then(r => r.data?.payload?.headers?.find(h => h.name === 'Subject')?.value || null)
            .catch(() => null)
        )
      );

      // PII stripping: remove email addresses, phone numbers, and sequences of
      // two or more capitalized words (potential person names).
      const stripPii = (s) => s
        .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '')
        .replace(/\b\d[\d\s().+-]{6,}\d\b/g, '')
        .replace(/\b([A-Z][a-z]+\s){1,}[A-Z][a-z]+\b/g, '');

      // Regex-based register classification (no LLM)
      const registers = {
        formal: /\b(meeting|request|per our|following up|follow.?up|regarding|per your|as discussed|action item|proposal|invoice|agenda|quarterly|schedule|confirm|pursuant|sincerely|dear\s+\w+)\b/i,
        casual: /\b(hey|hi|quick question|quick update|thoughts|fyi|heads up|checking in|catching up|loop you in|just wanted|what do you think|lmk|tbh|btw)\b/i,
        action_oriented: /\b(action required|please review|please confirm|urgent|deadline|time.sensitive|asap|reminder|due|overdue|next steps|deliverable|approve|sign off)\b/i,
        personal: /\b(happy birthday|happy anniversary|congrats|congratulations|miss you|miss me|love you|thinking of you|personal|family|vacation|holiday|weekend|dinner|lunch|party|celebrate|wedding|baby)\b/i,
      };

      const counts = { formal: 0, casual: 0, action_oriented: 0, personal: 0 };
      for (const raw of subjects.filter(Boolean)) {
        const s = stripPii(sanitizeExternal(raw, 200));
        if (registers.formal.test(s)) counts.formal++;
        if (registers.casual.test(s)) counts.casual++;
        if (registers.action_oriented.test(s)) counts.action_oriented++;
        if (registers.personal.test(s)) counts.personal++;
      }
      const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      const topRegister = dominant[0];
      if (topRegister && topRegister[1] > 0) {
        const label = topRegister[0].replace('_', '-');
        observations.push({
          content: `Email writing tends toward a ${label} register based on sent subjects (${topRegister[1]} of ${subjects.filter(Boolean).length} classified messages)`,
          contentType: 'weekly_summary',
        });
      }
    }
  } catch (e) {
    log.warn('Gmail subject pattern error', { error: e });
  }

  // ── 7. Day-of-week sending pattern from recent SENT messages ──────────────
  // Uses Date metadata header only — no body content accessed.
  try {
    const sentDowListRes = await axios.get(
      `${BASE}/messages?labelIds=SENT&maxResults=30`,
      { headers, timeout: 10000 }
    );
    const sentDowIds = (sentDowListRes.data?.messages || []).map(m => m.id);
    if (sentDowIds.length >= 5) {
      const dateHeaders = await Promise.all(
        sentDowIds.map(id =>
          axios.get(`${BASE}/messages/${id}?format=metadata&metadataHeaders=Date`, { headers, timeout: 10000 })
            .then(r => r.data?.payload?.headers?.find(h => h.name === 'Date')?.value || null)
            .catch(() => null)
        )
      );
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayCounts = { weekday: 0, weekend: 0 };
      const hourBuckets = Array(24).fill(0);
      for (const dateStr of dateHeaders.filter(Boolean)) {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) continue;
        const dow = d.getDay();
        if (dow === 0 || dow === 6) dayCounts.weekend++;
        else dayCounts.weekday++;
        hourBuckets[d.getHours()]++;
      }
      const total = dayCounts.weekday + dayCounts.weekend;
      if (total >= 5) {
        const weekendPct = Math.round((dayCounts.weekend / total) * 100);
        const dowLabel = weekendPct >= 40
          ? 'tends to email on both weekdays and weekends'
          : weekendPct >= 20
            ? 'primarily emails on weekdays but also on weekends'
            : 'emails almost exclusively on weekdays';
        observations.push({
          content: `Sending rhythm: ${dowLabel} (${weekendPct}% weekend sends from recent activity)`,
          contentType: 'weekly_summary',
        });
      }
    }
  } catch (e) {
    log.warn('Gmail day-of-week pattern error', { error: e });
  }

  // ── 8. Sent network size (unique To: domains from last 30 SENT messages) ──
  // Reads only To metadata header — no body content accessed.
  try {
    const sentToListRes = await axios.get(
      `${BASE}/messages?labelIds=SENT&maxResults=30`,
      { headers, timeout: 10000 }
    );
    const sentToIds = (sentToListRes.data?.messages || []).map(m => m.id);
    if (sentToIds.length >= 5) {
      const toHeaders = await Promise.all(
        sentToIds.map(id =>
          axios.get(`${BASE}/messages/${id}?format=metadata&metadataHeaders=To`, { headers, timeout: 10000 })
            .then(r => r.data?.payload?.headers?.find(h => h.name === 'To')?.value || null)
            .catch(() => null)
        )
      );
      const sentDomains = [];
      for (const toVal of toHeaders.filter(Boolean)) {
        // A To: header may contain multiple addresses — extract all domains
        const matches = toVal.matchAll(/@([a-zA-Z0-9.-]+)/g);
        for (const m of matches) {
          sentDomains.push(m[1].toLowerCase());
        }
      }
      const uniqueSentDomains = [...new Set(sentDomains)];
      const automatedPattern = /\b(noreply|no-reply|newsletter|notifications|support|mailer|bounce|amazonses|mailchimp|sendgrid|mailgun|hubspot|constantcontact)\b/i;
      const humanSentDomains = uniqueSentDomains.filter(d => !automatedPattern.test(d));
      if (humanSentDomains.length > 0) {
        const breadth = humanSentDomains.length >= 15 ? 'broad' : humanSentDomains.length >= 6 ? 'moderate' : 'focused';
        observations.push({
          content: `Outgoing email reaches ${humanSentDomains.length} distinct domain${humanSentDomains.length !== 1 ? 's' : ''} — ${breadth} sent communication network`,
          contentType: 'weekly_summary',
        });
      }
    }
  } catch (e) {
    log.warn('Gmail sent network size error', { error: e });
  }

  // ── 9. Top sender domains (who emails you most) ────────────────────────────
  try {
    const fromListRes = await axios.get(
      `${BASE}/messages?labelIds=INBOX&q=newer_than:7d&maxResults=50`,
      { headers, timeout: 10000 }
    );
    const fromIds = (fromListRes.data?.messages || []).map(m => m.id).slice(0, 20);
    if (fromIds.length >= 5) {
      const fromDomains = await Promise.all(
        fromIds.map(id =>
          axios.get(`${BASE}/messages/${id}?format=metadata&metadataHeaders=From`, { headers, timeout: 10000 })
            .then(r => {
              const from = r.data?.payload?.headers?.find(h => h.name === 'From')?.value || '';
              const match = from.match(/@([a-zA-Z0-9.-]+)/);
              return match ? match[1].toLowerCase() : null;
            })
            .catch(() => null)
        )
      );
      const domainCounts = {};
      for (const d of fromDomains.filter(Boolean)) {
        domainCounts[d] = (domainCounts[d] || 0) + 1;
      }
      const topSenders = Object.entries(domainCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([domain, count]) => `${domain} (${count})`);
      if (topSenders.length > 0) {
        observations.push({
          content: `Most frequent email senders this week: ${topSenders.join(', ')}`,
          contentType: 'weekly_summary',
        });
      }
    }
  } catch (e) {
    log.warn('Gmail top senders error', { error: e });
  }

  return observations;
}

export default fetchGmailObservations;
export { fetchGmailObservations };
