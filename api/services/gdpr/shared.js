/**
 * GDPR import — cross-parser helpers: timezone/date utils, content hashing,
 * and the two hand-rolled CSV parsers.
 * Extracted verbatim from gdprImportService.js (audit A2-M2a god-file split).
 * Pure code motion — only import/export plumbing added.
 */
import crypto from 'crypto';

/**
 * Hour-of-day (0-23) for a Date in the given IANA timezone. Falls back to the
 * server-local hour when no/invalid timezone (audit: time-of-day buckets used
 * getHours() = the Vercel server's UTC hour, skewing every non-UTC user's
 * "evening / late-night" insights). Exported for testing.
 */
export function getHourInTimeZone(date, timeZone) {
  if (!date || isNaN(date.getTime())) return 0;
  if (!timeZone) return date.getHours();
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', hourCycle: 'h23' }).formatToParts(date);
    const hourPart = parts.find(p => p.type === 'hour');
    const n = hourPart ? parseInt(hourPart.value, 10) : NaN;
    return Number.isFinite(n) ? (n % 24) : date.getHours();
  } catch {
    return date.getHours();
  }
}

/**
 * Day-of-week (0=Sun..6=Sat) for a Date in the given IANA timezone. Falls back
 * to the server-local weekday when no/invalid timezone (audit: Netflix
 * day-of-week rollup bucketed on the server's UTC weekday). Exported for testing.
 */
export function getDayInTimeZone(date, timeZone) {
  if (!date || isNaN(date.getTime())) return 0;
  if (!timeZone) return date.getDay();
  try {
    const wd = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date);
    const idx = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd);
    return idx >= 0 ? idx : date.getDay();
  } catch {
    return date.getDay();
  }
}

/**
 * "Mon YYYY" label for a Date in the given IANA timezone (falls back to
 * server-local). Exported for testing. (audit: individual-entry month/year
 * labels rendered in the server's UTC month, off-by-one near month boundaries.)
 */
export function monthYearInTimeZone(date, timeZone) {
  try {
    return date.toLocaleString('en-US', { timeZone: timeZone || undefined, month: 'short', year: 'numeric' });
  } catch {
    return date.toLocaleString('en-US', { month: 'short', year: 'numeric' });
  }
}

function contentHash(platform, content) {
  return crypto
    .createHash('sha256')
    .update(`${platform}:${content.substring(0, 100)}`)
    .digest('hex')
    .substring(0, 16);
}
function parseCsvRows(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // Simple CSV split (no quoted commas in Whoop CSVs)
    const cells = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const row = {};
    headers.forEach((h, idx) => { row[h] = cells[idx] ?? ''; });
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Minimal CSV parser
// ---------------------------------------------------------------------------
// Hand-rolled to avoid adding a new dep for two small parsers. Handles:
//   - quoted fields with embedded commas
//   - escaped quotes ("")
//   - CRLF and LF line endings
//   - BOM
// Not a full RFC 4180 impl, but sufficient for Letterboxd and Goodreads exports.

function parseCsv(text) {
  if (!text) return [];
  // Strip UTF-8 BOM if present
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }  // escaped quote
        else { inQuotes = false; }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') { inQuotes = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') { continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function csvToObjects(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1)
    .filter(r => r.some(cell => cell && cell.trim().length > 0))
    .map(r => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = r[i] !== undefined ? r[i].trim() : ''; });
      return obj;
    });
}

// getHourInTimeZone / getDayInTimeZone / monthYearInTimeZone carry their

// original `export function` declarations above.

export { contentHash, parseCsvRows, parseCsv, csvToObjects };
