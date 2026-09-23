/**
 * Attendee Researcher
 * ====================
 * Given a list of attendees from a calendar event, researches each one in parallel:
 *   - Memory stream: past interactions / facts about this person
 *   - Contacts: email + LinkedIn from Google contacts (if available)
 *   - Web search: person background
 *   - Web search: company context
 *
 * Returns structured research per attendee to be fed into the briefing prompt.
 */

import { retrieveMemories } from '../memoryStreamService.js';
import { webSearch } from '../webSearchService.js';
import { getEmails } from '../googleWorkspaceActions.js';
import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';

const log = createLogger('AttendeeResearcher');

/**
 * Pull the user's recent Gmail history with this attendee — the real
 * "last touchpoint" signal. Memory-stream history is sparse and lossy;
 * the actual email thread subjects + snippets + dates are the
 * authoritative record of what's been discussed.
 *
 * Gmail's `q` supports `(from:X OR to:X)` — that catches both directions
 * of the thread. Returns up to 3 most-recent, formatted compactly.
 */
async function getEmailHistory(userId, email) {
  if (!email) return [];
  try {
    const res = await getEmails(userId, {
      query: `(from:${email} OR to:${email})`,
      maxResults: 5,
    });
    if (!res.success || !Array.isArray(res.emails)) return [];
    return res.emails
      .filter((e) => e.subject || e.snippet)
      .slice(0, 3)
      .map((e) => {
        const when = e.date ? new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
        const subject = (e.subject || '(no subject)').slice(0, 80);
        const snippet = (e.snippet || '').slice(0, 120);
        return `${when ? `[${when}] ` : ''}"${subject}"${snippet ? ` — ${snippet}` : ''}`;
      });
  } catch (err) {
    log.debug('getEmailHistory failed (non-fatal)', { email, error: err.message });
    return [];
  }
}

async function getContactInfo(userId, email) {
  try {
    const { data } = await supabaseAdmin
      .from('user_contacts')
      .select('name, linkedin_url, company, title, notes')
      .eq('user_id', userId)
      .ilike('email', email)
      .maybeSingle();
    return data || null;
  } catch {
    return null;
  }
}

async function getMemoriesAboutPerson(userId, name, email) {
  const query = `${name || email} meeting interaction conversation`;
  try {
    const memories = await retrieveMemories(userId, query, 5, { weights: [0.5, 0.7, 1.0] });
    return memories
      .filter(m => {
        const c = m.content.toLowerCase();
        return (name && c.includes(name.toLowerCase())) || c.includes(email.toLowerCase());
      })
      .map(m => m.content)
      .slice(0, 3);
  } catch {
    return [];
  }
}

async function researchAttendee(userId, attendee) {
  const { email, name, isExternal } = attendee;

  const [contactInfo, pastMemories, emailHistory] = await Promise.all([
    getContactInfo(userId, email),
    getMemoriesAboutPerson(userId, name, email),
    getEmailHistory(userId, email),
  ]);

  const displayName = name || contactInfo?.name || email.split('@')[0];
  const domain = email.split('@')[1] || '';
  const company = contactInfo?.company || (domain && !isPersonalDomain(domain) ? domainToCompanyName(domain) : null);

  const searchPromises = [];

  if (isExternal && displayName !== email.split('@')[0]) {
    searchPromises.push(
      webSearch(`${displayName} ${company || ''} background professional`, { count: 3 })
        .then(r => r.success ? r.results : [])
    );
  } else {
    searchPromises.push(Promise.resolve([]));
  }

  if (isExternal && company) {
    searchPromises.push(
      webSearch(`${company} company overview recent news`, { count: 3 })
        .then(r => r.success ? r.results : [])
    );
  } else {
    searchPromises.push(Promise.resolve([]));
  }

  const [personSearch, companySearch] = await Promise.all(searchPromises);

  // Merge memory-stream history + real Gmail thread history. Gmail entries
  // are the authoritative record so they lead; memory fills gaps.
  const pastInteractions = [...emailHistory, ...pastMemories].slice(0, 5);

  return {
    email,
    name: displayName,
    company: company || null,
    title: contactInfo?.title || null,
    linkedin: contactInfo?.linkedin_url || null,
    pastInteractions,
    emailThreadCount: emailHistory.length,
    personBackground: personSearch.map(r => `${r.title}: ${r.description}`).filter(Boolean),
    companyContext: companySearch.map(r => `${r.title}: ${r.description}`).filter(Boolean),
  };
}

const PERSONAL_DOMAINS = new Set(['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'me.com', 'protonmail.com']);

function isPersonalDomain(domain) {
  return PERSONAL_DOMAINS.has(domain.toLowerCase());
}

function domainToCompanyName(domain) {
  return domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
}

export async function researchAttendees(userId, attendees) {
  if (!attendees || attendees.length === 0) return [];

  const externalAttendees = attendees.filter(a => a.isExternal !== false);
  log.debug('Researching attendees', { total: attendees.length, external: externalAttendees.length });

  const results = await Promise.all(
    externalAttendees.map(a => researchAttendee(userId, a).catch(err => {
      log.warn('Attendee research failed', { email: a.email, error: err.message });
      return { email: a.email, name: a.name || a.email, pastInteractions: [], personBackground: [], companyContext: [] };
    }))
  );

  return results;
}
