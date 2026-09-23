/**
 * GDPR parser: LinkedIn.
 * Extracted verbatim from gdprImportService.js (audit A2-M2a god-file split).
 * Pure code motion — only import/export plumbing added.
 */

import { csvToObjects } from '../shared.js';
import { safeAdmZip } from '../zipSafety.js';
import { createLogger } from '../../logger.js';

const log = createLogger('GDPRImport');

// ---------------------------------------------------------------------------
// LinkedIn — GDPR export (multi-CSV ZIP)
// ---------------------------------------------------------------------------
// Source: LinkedIn -> Settings -> Data Privacy -> Get a copy of your data
// ("Fast file only" for CSVs). Arrives as a ZIP of 20+ CSVs. We only parse the
// ones that carry soul signature signal — positions, skills, connections,
// education, certifications, recommendations, articles, search queries. No
// LLM, pure string work. Never store raw PII (emails, full connection names).
// ---------------------------------------------------------------------------

function findLinkedInCsv(zip, baseNameRegex) {
  const entry = zip.getEntries().find(e => baseNameRegex.test(e.entryName));
  if (!entry) return null;
  try {
    return entry.getData().toString('utf8');
  } catch {
    return null;
  }
}

function parseLinkedInDate(s) {
  // LinkedIn date formats vary: "Jan 2020", "2020", "2020-01-15", "01/15/2020", "" (means "present")
  if (!s) return null;
  const trimmed = String(s).trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (!Number.isNaN(d.getTime())) return d;
  // Try "Mon YYYY"
  const m = trimmed.match(/^([A-Za-z]{3,})\s+(\d{4})$/);
  if (m) {
    const d2 = new Date(`${m[1]} 1, ${m[2]}`);
    if (!Number.isNaN(d2.getTime())) return d2;
  }
  return null;
}

function linkedInPositions(zip, out) {
  const csv = findLinkedInCsv(zip, /(^|\/)Positions\.csv$/i);
  if (!csv) return;
  const rows = csvToObjects(csv);
  if (rows.length === 0) return;

  const MAX_PER_POSITION = 50;
  const companies = new Set();
  const dated = [];

  for (const r of rows) {
    const company = (r['Company Name'] || '').trim();
    const title = (r['Title'] || '').trim();
    const started = (r['Started On'] || '').trim();
    const finished = (r['Finished On'] || '').trim();
    if (!company && !title) continue;
    if (company) companies.add(company);
    dated.push({ company, title, started, finished, startDate: parseLinkedInDate(started) });
  }

  // Most recent by start date (nulls last)
  dated.sort((a, b) => {
    const av = a.startDate ? a.startDate.getTime() : 0;
    const bv = b.startDate ? b.startDate.getTime() : 0;
    return bv - av;
  });

  const count = dated.length;
  if (count === 0) return;

  const mostRecent = dated[0];
  const mrRange = `${mostRecent.started || '?'}-${mostRecent.finished || 'present'}`;
  out.push(
    `Your LinkedIn career spans ${count} position${count === 1 ? '' : 's'} across ${companies.size} compan${companies.size === 1 ? 'y' : 'ies'}. ` +
    `Most recent: ${mostRecent.title || 'unspecified role'} at ${mostRecent.company || 'unspecified company'} (${mrRange}).`
  );

  for (const p of dated.slice(0, MAX_PER_POSITION)) {
    const range = `${p.started || '?'}-${p.finished || 'present'}`;
    const title = p.title || 'unspecified role';
    const company = p.company || 'unspecified company';
    out.push(`You worked as ${title} at ${company} (${range}).`);
  }
}

function linkedInSkills(zip, out) {
  const csv = findLinkedInCsv(zip, /(^|\/)Skills\.csv$/i);
  if (!csv) return;
  const rows = csvToObjects(csv);
  if (rows.length === 0) return;
  const skills = rows.map(r => (r['Name'] || '').trim()).filter(Boolean);
  if (skills.length === 0) return;
  const top = skills.slice(0, 15).join(', ');
  out.push(`Your LinkedIn lists ${skills.length} skill${skills.length === 1 ? '' : 's'} including: ${top}.`);
}

function linkedInConnections(zip, out) {
  const csv = findLinkedInCsv(zip, /(^|\/)Connections\.csv$/i);
  if (!csv) return;
  // LinkedIn's Connections.csv often has a 2-3 line "Notes:" preamble before the header row.
  // Detect the header by finding the first line that contains "First Name".
  const lines = csv.split(/\r?\n/);
  const headerIdx = lines.findIndex(l => /First Name/i.test(l) && /Last Name/i.test(l));
  const cleaned = headerIdx > 0 ? lines.slice(headerIdx).join('\n') : csv;

  const rows = csvToObjects(cleaned);
  if (rows.length === 0) return;

  const companies = new Map();
  const positions = new Map();
  for (const r of rows) {
    const c = (r['Company'] || '').trim();
    const p = (r['Position'] || '').trim();
    if (c) companies.set(c, (companies.get(c) || 0) + 1);
    if (p) positions.set(p, (positions.get(p) || 0) + 1);
  }

  out.push(`Your LinkedIn has ${rows.length} first-degree connection${rows.length === 1 ? '' : 's'}.`);

  const MAX_COMPANIES = 10;
  const MAX_POSITIONS = 5;
  const topCompanies = [...companies.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_COMPANIES);
  if (topCompanies.length > 0) {
    const fmt = topCompanies.map(([c, n]) => `${c} (${n})`).join(', ');
    out.push(`Top companies in your LinkedIn network: ${fmt}.`);
  }

  const topPositions = [...positions.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_POSITIONS);
  if (topPositions.length > 0) {
    const fmt = topPositions.map(([p, n]) => `${p} (${n})`).join(', ');
    out.push(`Most common roles among your LinkedIn connections: ${fmt}.`);
  }
}

function linkedInEducation(zip, out) {
  const csv = findLinkedInCsv(zip, /(^|\/)Education\.csv$/i);
  if (!csv) return;
  const rows = csvToObjects(csv);
  if (rows.length === 0) return;
  for (const r of rows.slice(0, 25)) {
    const school = (r['School Name'] || '').trim();
    const degree = (r['Degree Name'] || '').trim();
    const start = (r['Start Date'] || '').trim();
    const end = (r['End Date'] || '').trim();
    if (!school && !degree) continue;
    const range = start || end ? ` (${start || '?'}-${end || '?'})` : '';
    const degreePart = degree ? `${degree} at ` : '';
    const schoolPart = school || 'unspecified school';
    out.push(`Your LinkedIn education: ${degreePart}${schoolPart}${range}.`);
  }
}

function linkedInCertifications(zip, out) {
  const csv = findLinkedInCsv(zip, /(^|\/)Certifications\.csv$/i);
  if (!csv) return;
  const rows = csvToObjects(csv);
  if (rows.length === 0) return;

  const now = Date.now();
  let active = 0;
  let expired = 0;
  const emitted = [];
  for (const r of rows.slice(0, 50)) {
    const name = (r['Name'] || '').trim();
    const authority = (r['Authority'] || '').trim();
    if (!name) continue;
    const finished = parseLinkedInDate(r['Finished On'] || '');
    if (finished) {
      if (finished.getTime() < now) expired++;
      else active++;
    } else {
      active++; // no expiry = active
    }
    const authPart = authority ? ` from ${authority}` : '';
    emitted.push(`You hold ${name}${authPart}.`);
  }
  if (active + expired > 0) {
    out.push(`Your LinkedIn lists ${active + expired} certification${(active + expired) === 1 ? '' : 's'} (${active} active, ${expired} expired).`);
  }
  out.push(...emitted);
}

function linkedInRecommendations(zip, out) {
  const csv = findLinkedInCsv(zip, /(^|\/)Recommendations_Received\.csv$/i);
  if (!csv) return;
  const rows = csvToObjects(csv);
  if (rows.length === 0) return;

  out.push(`You've received ${rows.length} LinkedIn recommendation${rows.length === 1 ? '' : 's'}.`);

  const quoted = rows.slice(0, 3);
  for (const r of quoted) {
    const first = (r['First Name'] || '').trim();
    const last = (r['Last Name'] || '').trim();
    const company = (r['Company'] || '').trim();
    const jobTitle = (r['Job Title'] || '').trim();
    const text = (r['Text'] || '').trim();
    if (!text) continue;
    const who = [first, last].filter(Boolean).join(' ') || 'Someone';
    const rolePart = jobTitle || company ? ` (${[jobTitle, company].filter(Boolean).join(' at ')})` : '';
    const excerpt = text.length > 200 ? text.slice(0, 200).trim() + '...' : text;
    out.push(`${who}${rolePart} wrote: "${excerpt}"`);
  }
}

function linkedInArticles(zip, out) {
  const csv = findLinkedInCsv(zip, /(^|\/)Articles\.csv$/i);
  if (!csv) return;
  const rows = csvToObjects(csv);
  if (rows.length === 0) return;
  const titles = rows.map(r => (r['Title'] || '').trim()).filter(Boolean);
  if (titles.length === 0) return;
  const preview = titles.slice(0, 15).map(t => `"${t}"`).join(', ');
  out.push(`You've published ${titles.length} article${titles.length === 1 ? '' : 's'} on LinkedIn. Titles: ${preview}.`);
}

function linkedInSearchQueries(zip, out) {
  const csv = findLinkedInCsv(zip, /(^|\/)SearchQueries\.csv$/i);
  if (!csv) return;
  const rows = csvToObjects(csv);
  if (rows.length === 0) return;

  const queries = rows.map(r => (r['Search Query'] || '').trim()).filter(Boolean);
  if (queries.length === 0) return;

  // Rough topic clustering — word frequency on 4+ char tokens
  const stop = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'your', 'have', 'about', 'into']);
  const wordCounts = new Map();
  for (const q of queries) {
    const tokens = q.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length >= 4 && !stop.has(t));
    for (const t of tokens) wordCounts.set(t, (wordCounts.get(t) || 0) + 1);
  }
  const top = [...wordCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const patterns = top.length > 0 ? top.map(([w, n]) => `${w} (${n})`).join(', ') : 'none detected';
  out.push(`Your LinkedIn search history shows ${queries.length} quer${queries.length === 1 ? 'y' : 'ies'}. Top patterns: ${patterns}.`);
}

function parseLinkedIn(buffer) {
  if (!(buffer[0] === 0x50 && buffer[1] === 0x4B)) {
    throw new Error('LinkedIn import expects a ZIP file (the full export from linkedin.com).');
  }

  let zip;
  try {
    zip = safeAdmZip(buffer);
  } catch (e) {
    throw new Error(`LinkedIn ZIP could not be opened: ${e.message}`);
  }

  const observations = [];

  // Each helper is defensive — if the CSV is missing or unreadable, it no-ops.
  try { linkedInPositions(zip, observations); } catch (e) { log.warn('LinkedIn Positions parse failed:', e.message); }
  try { linkedInSkills(zip, observations); } catch (e) { log.warn('LinkedIn Skills parse failed:', e.message); }
  try { linkedInConnections(zip, observations); } catch (e) { log.warn('LinkedIn Connections parse failed:', e.message); }
  try { linkedInEducation(zip, observations); } catch (e) { log.warn('LinkedIn Education parse failed:', e.message); }
  try { linkedInCertifications(zip, observations); } catch (e) { log.warn('LinkedIn Certifications parse failed:', e.message); }
  try { linkedInRecommendations(zip, observations); } catch (e) { log.warn('LinkedIn Recommendations parse failed:', e.message); }
  try { linkedInArticles(zip, observations); } catch (e) { log.warn('LinkedIn Articles parse failed:', e.message); }
  try { linkedInSearchQueries(zip, observations); } catch (e) { log.warn('LinkedIn SearchQueries parse failed:', e.message); }

  if (observations.length === 0) {
    throw new Error('LinkedIn ZIP did not contain any of the expected CSVs (Positions, Skills, Connections, etc.).');
  }

  return observations;
}

export { parseLinkedIn };
