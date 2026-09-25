/**
 * A sheet somebody keeps updating.
 * ================================
 * Enable Banking is not open yet, and plenty of people already keep every cost and every
 * payday in a spreadsheet they touch most days. Uploading that once is the wrong shape: the
 * file is alive. A link re-read on a schedule is the right one, and it is the shape the
 * calendar already uses for a pasted Canvas or Blackboard address (calendar.js, FEED_KIND).
 *
 * Two things already in place make it cheap. importer.js gives every row a source_ref
 * content-addressed on its day, its amount and its text, so re-reading the whole sheet
 * writes nothing for a row that has not changed and exactly one row for a row that has --
 * no diffing, no cursor, no state to get wrong. And shape.js can read a sheet nobody
 * designed for us, so the plan is settled once, with its questions, and reused every time.
 *
 * The dangerous part is that a server fetches a pasted address on a schedule for ever. The
 * guard here is the calendar's (ics.js, isFeedUrl): https only, and never an address that
 * resolves only from inside -- localhost, .local, .internal, a bare IP, a cloud's metadata
 * service. This module is pure; the fetching and the storing live with the caller.
 */
import { isFeedUrl } from '../ics.js';

/** Whether this is an address this will fetch at all. */
export function isSheetUrl(url) {
  return isFeedUrl(url);
}

/** Where the sheet lives, for the one line a screen shows about it. */
export function sheetKind(url) {
  const host = (() => { try { return new URL(String(url || '')).hostname.toLowerCase(); } catch { return ''; } })();
  if (host.endsWith('docs.google.com') || host.endsWith('google.com')) return 'google';
  if (host.endsWith('onedrive.live.com') || host.endsWith('sharepoint.com') || host.endsWith('live.com')) return 'onedrive';
  return 'csv';
}

/**
 * The address to actually fetch.
 *
 * A person pastes what is in their browser bar, and for Google Sheets that is the edit page,
 * which answers with HTML. The same document has a CSV of one tab behind /export, so the
 * link people have is turned into the link this can read, keeping the tab they were looking
 * at. An export or a published link is already CSV and is left alone.
 *
 * @returns {string|null} null when it is not an address this will fetch
 */
export function normaliseSheetUrl(url) {
  const raw = String(url || '').trim();
  if (!isSheetUrl(raw)) return null;

  let u;
  try { u = new URL(raw); } catch { return null; }
  if (sheetKind(raw) !== 'google') return raw;

  /* A Google address that is not a spreadsheet is a document or a slide deck: prose, not a
     ledger, and nothing here could read it. */
  const sheet = u.pathname.match(/^\/spreadsheets\/d\/([^/]+)/);
  if (!sheet) return null;

  /* Already CSV: /export?format=csv, or the "publish to the web" /pub?output=csv. */
  if (/\/export$/.test(u.pathname) || /\/pub$/.test(u.pathname)) return raw;

  /* The tab the person was looking at rides in the fragment, or occasionally the query. */
  const gid = (raw.match(/[#&?]gid=(\d+)/) || [])[1] || '0';
  return `https://docs.google.com/spreadsheets/d/${sheet[1]}/export?format=csv&gid=${gid}`;
}

/* --------------------------------------------------------------- re-reading */

/** A sheet larger than this is not a budget; it is a mistake, and it is not downloaded. */
export const MAX_SHEET_BYTES = 4 * 1024 * 1024;

/**
 * Read a registered sheet once and put what is in it through the ledger.
 *
 * Nothing here diffs. Every row goes to ingestSightings every time, and the content-addressed
 * source_ref means a row that has not changed finds its own line and writes nothing, while a
 * row the person added since finds nothing and opens one. That is why this can run hourly
 * and cost almost nothing.
 *
 * @param {object} feed   { url, plan, accountId }
 * @param {object} deps   { fetchText, parseDelimited, toSightings, ingestSightings, planQuestions }
 * @returns {Promise<{ ok: boolean, reason?: string, read?: number, created?: number, attached?: number, questions?: object[] }>}
 */
export async function readSheetFeed(feed, deps) {
  const url = normaliseSheetUrl(feed?.url);
  if (!url) return { ok: false, reason: 'bad_url' };
  /* Without a settled plan the sheet's columns were never agreed with the person, and
     guessing them on a schedule would write a ledger nobody checked. */
  if (!feed?.plan) return { ok: false, reason: 'no_plan' };

  const text = await deps.fetchText(url, { maxBytes: MAX_SHEET_BYTES }).catch(() => null);
  if (text === null || text === undefined) return { ok: false, reason: 'unreachable' };
  /* Google answers an unshared document with a sign-in page, which parses as one sad column
     of HTML rather than failing outright. */
  if (/^\s*<(!doctype|html)/i.test(text)) return { ok: false, reason: 'not_shared' };

  const rows = deps.parseDelimited(text);
  /* The person may have added a column, or moved the header down. The plan stops fitting and
     the honest answer is to ask again, not to import the wrong columns quietly. */
  const questions = deps.planQuestions(rows, feed.plan);
  if (questions.length) return { ok: false, reason: 'shape_changed', questions };

  const { sightings } = deps.toSightings(rows, { accountId: feed.accountId || null, plan: feed.plan });
  if (!sightings.length) return { ok: false, reason: 'no_rows' };

  const result = await deps.ingestSightings(sightings);
  return { ok: true, read: sightings.length, created: result?.created ?? 0, attached: result?.attached ?? 0 };
}
