/**
 * LinkedIn GDPR export parser.
 *
 * LinkedIn exports come as a zip of CSVs (no nested structure):
 *
 *   Connections.csv      "First Name,Last Name,URL,Email Address,Company,Position,Connected On"
 *   Profile.csv          single-row CSV with headline, summary, etc.
 *   Positions.csv        position history
 *   Education.csv        education history
 *   Skills.csv           one skill per row
 *   Reactions.csv        "Date,Type,Link"  -- Type = LIKE/PRAISE/INTEREST/...
 *   Searches.csv         search query + date
 *   Shares.csv           posts / shared content
 *   messages.csv         (optional) -- only if user requested it; skipped for
 *                        privacy
 *
 * We extract: connection count, top job titles in network, posting cadence,
 * reaction-type distribution, top search topics.
 *
 * Privacy: messages.csv intentionally NOT read. We surface only counts,
 * never recipient names or content.
 */

import { findEntry, listEntriesUnder, readEntryUtf8, bump, topN, safeDate } from '../zipHelpers.js';

export async function detectLinkedInExport(zip) {
  // LinkedIn has very distinctive top-level CSVs. Require at least two.
  const markers = ['Connections.csv', 'Profile.csv', 'Positions.csv', 'Skills.csv'];
  let hits = 0;
  for (const m of markers) {
    if (findEntry(zip, (n) => n === m || n.endsWith('/' + m))) hits += 1;
  }
  return hits >= 2;
}

// Lightweight CSV parser tuned for LinkedIn's format. LinkedIn quotes
// fields containing commas but rarely embeds newlines in values, so a
// state machine that handles "" escapes is enough.
function parseCsv(text) {
  if (!text) return [];
  const rows = [];
  let cur = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') {
        cur.push(cell);
        cell = '';
      } else if (ch === '\n') {
        cur.push(cell);
        rows.push(cur);
        cur = [];
        cell = '';
      } else if (ch === '\r') {
        // ignore
      } else {
        cell += ch;
      }
    }
  }
  if (cell.length > 0 || cur.length > 0) {
    cur.push(cell);
    rows.push(cur);
  }
  return rows;
}

function parseCsvFromZip(zip, filename) {
  const text = readEntryUtf8(zip, (n) => n === filename || n.endsWith('/' + filename));
  if (!text) return { header: [], rows: [] };
  // LinkedIn prefixes some exports with a "Notes:" header block followed
  // by a blank line and then the real CSV — strip that if present.
  const cutoff = text.indexOf('\n\n');
  const csvBody = cutoff > 0 && /^Notes:/i.test(text) ? text.slice(cutoff + 2) : text;
  const rows = parseCsv(csvBody);
  if (rows.length === 0) return { header: [], rows: [] };
  return {
    header: rows[0],
    // Drop only fully-empty rows. Some LinkedIn exports (e.g. Skills.csv)
    // have just one column, so the old `r.length > 1` filter dropped all
    // their data rows. Trim each cell and require any non-empty content.
    rows: rows.slice(1).filter((r) => r.some((cell) => cell?.trim()?.length > 0)),
  };
}

export async function parseLinkedInExport(zip) {
  const connections = parseCsvFromZip(zip, 'Connections.csv');
  const reactions = parseCsvFromZip(zip, 'Reactions.csv');
  const searches = parseCsvFromZip(zip, 'Searches.csv');
  const shares = parseCsvFromZip(zip, 'Shares.csv');
  const profile = parseCsvFromZip(zip, 'Profile.csv');
  const skills = parseCsvFromZip(zip, 'Skills.csv');

  // Connections: aggregate top companies and positions in user's network.
  const companyCount = {};
  const positionCount = {};
  for (const row of connections.rows) {
    const [, , , , company, position] = row;
    if (company) bump(companyCount, company.trim());
    if (position) bump(positionCount, position.trim());
  }

  // Reactions: distribution by type.
  const reactionTypes = {};
  for (const row of reactions.rows) {
    const type = row[1];
    if (type) bump(reactionTypes, type.trim());
  }

  // Searches: top topics (raw query strings).
  const searchTopics = {};
  for (const row of searches.rows) {
    const query = row[0];
    if (query && query.trim().length > 1) bump(searchTopics, query.trim().toLowerCase());
  }

  // Shares: posting cadence over last 90 days.
  const shareDates = [];
  for (const row of shares.rows) {
    const d = safeDate(row[0]);
    if (d) shareDates.push(d);
  }
  shareDates.sort((a, b) => a - b);
  const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const recentShares = shareDates.filter((d) => d.getTime() >= ninetyDaysAgo).length;

  const profileRow = profile.rows[0] ?? [];
  const headlineIdx = profile.header.findIndex((h) => h.trim() === 'Headline');
  const summaryIdx = profile.header.findIndex((h) => h.trim() === 'Summary');

  const aggregates = {
    profile: {
      headline: headlineIdx >= 0 ? profileRow[headlineIdx] ?? null : null,
      has_summary: summaryIdx >= 0 ? Boolean(profileRow[summaryIdx]?.trim()) : false,
    },
    totals: {
      connections: connections.rows.length,
      reactions: reactions.rows.length,
      searches: searches.rows.length,
      shares: shares.rows.length,
      skills: skills.rows.length,
      shares_last_90d: recentShares,
    },
    top_network_companies: topN(companyCount, 10, 'company'),
    top_network_positions: topN(positionCount, 10, 'position'),
    reaction_type_breakdown: reactionTypes,
    top_search_topics: topN(searchTopics, 10, 'query'),
  };

  return { aggregates, observations: buildLinkedInObservations(aggregates) };
}

function buildLinkedInObservations(a) {
  const out = [];
  if (a.totals.connections > 0) {
    out.push(
      `LinkedIn network: ${a.totals.connections} connections, ${a.totals.skills} listed skills, ${a.totals.shares} total posts.`
    );
  }
  if (a.top_network_companies.length > 0) {
    const named = a.top_network_companies
      .slice(0, 5)
      .map((c) => `${c.company} (${c.count})`)
      .join(', ');
    out.push(`Most-represented companies in LinkedIn network: ${named}.`);
  }
  if (a.totals.shares_last_90d >= 1) {
    out.push(
      `LinkedIn posting cadence: ${a.totals.shares_last_90d} posts in the last 90 days.`
    );
  }
  if (Object.keys(a.reaction_type_breakdown).length > 0) {
    const breakdown = Object.entries(a.reaction_type_breakdown)
      .sort((x, y) => y[1] - x[1])
      .slice(0, 3)
      .map(([t, c]) => `${t.toLowerCase()} ${c}`)
      .join(', ');
    out.push(`LinkedIn reaction style: ${breakdown}.`);
  }
  return out;
}
