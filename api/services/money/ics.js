/**
 * A calendar feed, read as text.
 * ==============================
 * Canvas and Blackboard, which is where a student's deadlines and exams actually live, do
 * not hand out OAuth; both hand out a private link to an iCalendar file (Canvas: Calendar,
 * "Calendar feed"; Blackboard: Calendar, "Get external calendar link"). Any calendar app
 * reads that link, and so does this. Nothing is written back; the link is read, parsed and
 * reduced to the same shape Google's events take (calendar.js), so everything downstream,
 * the diary cost, the away windows, the week's word, works the same whichever the source.
 *
 * The parser covers what those two products emit: folded lines, VALUE=DATE for all-day,
 * DTEND or DURATION, TZID or Z, escaped commas and newlines in SUMMARY. Recurrence rules
 * are not expanded: Canvas and Blackboard write each occurrence out.
 *
 * Pure: text in, events out.
 */

const DAY = 86400000;

/** Where a feed comes from, from its address; only ever a label. */
export function feedKind(url) {
  const u = String(url || '').toLowerCase();
  if (u.includes('instructure.com') || u.includes('/feeds/calendars/')) return 'canvas';
  if (u.includes('blackboard') || u.includes('/calendarfeed/')) return 'blackboard';
  if (u.includes('moodle') || u.includes('/calendar/export_execute')) return 'moodle';
  return 'ics';
}

export const FEED_LABELS = { canvas: 'Canvas', blackboard: 'Blackboard', moodle: 'Moodle', ics: 'A calendar link' };

/**
 * Whether a link may be fetched at all: https, a real host name, not this machine.
 * The content decides the rest (it must begin with BEGIN:VCALENDAR).
 */
export function isFeedUrl(url) {
  let u;
  try { u = new URL(String(url || '')); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  if (!host.includes('.') || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[')) return false;
  return true;
}

/** Unfold RFC 5545 lines: a line starting with a space or tab continues the one before. */
function unfold(text) {
  return String(text || '').replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '');
}

const unescape = (s) => String(s || '').replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').replace(/\s+/g, ' ').trim();

/** "20260921" or "20260921T230000Z" or "20260921T180000" (+TZID) to an ISO instant, and whether it was a date. */
function parseStamp(value, params) {
  const v = String(value || '').trim();
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  const isDate = !h || /VALUE=DATE\b/i.test(params || '');
  if (isDate) return { iso: new Date(Date.UTC(+y, +mo - 1, +d)).toISOString(), date: true };
  const utc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || 0));
  if (z) return { iso: new Date(utc).toISOString(), date: false };
  /* A floating or TZID time. Feeds from these products are UTC in practice; a named zone
     is honoured when the runtime knows it, else the wall time is taken as Madrid's. */
  const tz = (String(params || '').match(/TZID=([^;:]+)/i) || [])[1] || 'Europe/Madrid';
  return { iso: new Date(utc - zoneOffsetMs(tz, utc)).toISOString(), date: false };
}

/** The offset of a zone at an instant, in ms, via Intl; zero when the zone is unknown. */
function zoneOffsetMs(tz, utcMs) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(utcMs));
    const get = (t) => Number(parts.find((p) => p.type === t)?.value || 0);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    return asUtc - utcMs;
  } catch { return 0; }
}

/** "P1D", "PT1H30M", "P1DT2H" to ms. */
function parseDuration(v) {
  const m = String(v || '').match(/^(-)?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (!m) return 0;
  const ms = ((+m[2] || 0) * 7 + (+m[3] || 0)) * DAY + (+m[4] || 0) * 3600000 + (+m[5] || 0) * 60000 + (+m[6] || 0) * 1000;
  return m[1] ? -ms : ms;
}

/**
 * The events in an iCalendar text, in calendar.js's shape:
 * { id, title, start, end, location, attendees_count, recurring, all_day, source }.
 * @param {string} text
 * @param {object} [opts] { source: 'canvas' | 'blackboard' | 'ics' }
 */
export function parseIcs(text, opts = {}) {
  const source = opts.source || 'ics';
  const lines = unfold(text).split('\n');
  const out = [];
  let ev = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === 'BEGIN:VEVENT') { ev = {}; continue; }
    if (line === 'END:VEVENT') {
      if (ev && ev.start && !ev.cancelled) {
        const end = ev.end || (ev.duration ? new Date(new Date(ev.start).getTime() + ev.duration).toISOString() : (ev.all_day ? new Date(new Date(ev.start).getTime() + DAY).toISOString() : ev.start));
        out.push({
          id: ev.id || `${source}:${ev.start}:${ev.title || ''}`.slice(0, 200),
          title: ev.title || 'Untitled',
          start: ev.start,
          end,
          location: ev.location || null,
          attendees_count: 0,
          recurring: ev.rrule ? `${source}:${ev.id || ev.title || ''}` : null,
          all_day: Boolean(ev.all_day),
          source,
        });
      }
      ev = null; continue;
    }
    if (!ev) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const head = line.slice(0, colon); const value = line.slice(colon + 1);
    const [name, ...params] = head.split(';');
    const key = name.toUpperCase(); const p = params.join(';');
    if (key === 'UID') ev.id = value.trim().slice(0, 200);
    else if (key === 'SUMMARY') ev.title = unescape(value).slice(0, 200);
    else if (key === 'LOCATION') ev.location = unescape(value).slice(0, 200) || null;
    else if (key === 'DTSTART') { const s = parseStamp(value, p); if (s) { ev.start = s.iso; ev.all_day = s.date; } }
    else if (key === 'DTEND') { const s = parseStamp(value, p); if (s) ev.end = s.iso; }
    else if (key === 'DURATION') ev.duration = parseDuration(value);
    else if (key === 'RRULE') ev.rrule = value;
    else if (key === 'STATUS' && /CANCELLED/i.test(value)) ev.cancelled = true;
  }
  return out.sort((a, b) => (a.start < b.start ? -1 : 1));
}

/** Whether a body is a calendar at all. */
export function looksLikeIcs(text) {
  return /^\s*BEGIN:VCALENDAR/i.test(String(text || '').slice(0, 200));
}
