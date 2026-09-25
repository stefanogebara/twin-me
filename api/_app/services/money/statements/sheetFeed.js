/**
 * Unwired sheet-feed core. Do not expose a route or schedule until stable row updates /
 * deletions and a safe network adapter are implemented. Content-derived statement refs
 * deduplicate unchanged rows, but edits create new identities and absent rows remain.
 * Re-reading still performs ingestion writes; this is not a zero-cost synchronization.
 *
 * URL checks here validate syntax only. The caller's fetchText must validate and pin
 * public DNS addresses at every redirect, enforce deadlines and stream the byte limit.
 * A hostname passing isFeedUrl does not establish private-network safety.
 */
import { createHash } from 'node:crypto';
import { planQuestions as interpretationQuestions } from './shape.js';
import { isFeedUrl } from '../ics.js';

/** Syntactic eligibility only; not DNS, redirect or connection safety. */
export function isSheetUrl(url) {
  return isFeedUrl(url);
}

/** Where the sheet lives, for the one line a screen shows about it. */
export function sheetKind(url) {
  const host = (() => { try { return new URL(String(url || '')).hostname.toLowerCase(); } catch { return ''; } })();
  const belongsTo = (domain) => host === domain || host.endsWith(`.${domain}`);
  if (belongsTo('google.com')) return 'google';
  if (belongsTo('sharepoint.com') || belongsTo('live.com')) return 'onedrive';
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

/** Canonical fetch identity; fragments do not reach the server. */
function sourceIdentity(url) {
  const normalised = normaliseSheetUrl(url);
  if (!normalised) return null;
  const parsed = new URL(normalised);
  parsed.hash = '';
  parsed.searchParams.sort();
  return parsed.href;
}

const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function approvalBinding(feed) {
  const source = sourceIdentity(feed?.url);
  const p = feed?.plan;
  if (!source || typeof feed?.accountId !== 'string' || !feed.accountId.trim()
    || !p || !Number.isInteger(p.index) || p.index < 0 || !p.columns
    || typeof p.columns !== 'object' || Array.isArray(p.columns)
    || (p.currency != null && !/^[A-Z]{3}$/.test(p.currency))
    || (p.year != null && (!Number.isInteger(p.year) || p.year < 2000 || p.year > 2100))
    || !['dmy', 'mdy', 'ymd'].includes(p.dateOrder) || ![',', '.'].includes(p.decimal)
    || !['signed', 'all_out', 'all_in', 'debit_credit'].includes(p.sign)) return null;
  const columns = Object.entries(p.columns).sort(([a], [b]) => a.localeCompare(b));
  if (!columns.length || columns.some(([, at]) => !Number.isInteger(at) || at < 0)) return null;
  if (p.columns.date === undefined && p.columns.valueDate === undefined) return null;
  if (p.columns.amount === undefined && p.columns.debit === undefined && p.columns.credit === undefined) return null;
  return digest({ source, accountId: feed.accountId, index: p.index, columns,
    dateOrder: p.dateOrder, decimal: p.decimal, sign: p.sign,
    currency: p.currency ?? null, year: p.year ?? null });
}

function schemaFingerprint(rows, plan) {
  if (!Array.isArray(rows)) return null;
  const header = rows[plan.index];
  if (!Array.isArray(header) || !header.length
    || Object.values(plan.columns).some((at) => at >= header.length)
    || rows.slice(plan.index + 1).some((row) => !Array.isArray(row) || row.length > header.length)) return null;
  // Exact header text and position: a rename or reorder requires a new review.
  return digest({ index: plan.index, header: header.map((cell) => String(cell ?? '')) });
}

/**
 * Call only after an explicit confirmation of the preview; answered questions are not
 * consent. The future registration route must store this server-side with its owner.
 * This digest is a change detector, not a signed authorization token: never accept an
 * arbitrary client-supplied approval or regenerate one during a scheduled read.
 */
export function createSheetApproval(feed, rows, { confirmed = false } = {}) {
  if (confirmed !== true) return null;
  const binding = approvalBinding(feed);
  if (!binding) return null;
  const schema = schemaFingerprint(rows, feed.plan);
  if (!schema || interpretationQuestions(rows, feed.plan).length) return null;
  return { version: 1, binding, schema };
}

/* --------------------------------------------------------------- re-reading */

/** Requested byte limit; the future network adapter must enforce it while streaming. */
export const MAX_SHEET_BYTES = 4 * 1024 * 1024;

/**
 * Read a registered sheet once and put what is in it through the ledger.
 *
 * Approval must still match the canonical source, account, interpretation and header.
 * This does not reconcile edited or deleted rows; production wiring remains blocked.
 *
 * @param {object} feed   { url, plan, accountId, approval }
 * @param {object} deps   { fetchText, parseDelimited, toSightings, ingestSightings, planQuestions }
 * @returns {Promise<{ ok: boolean, reason?: string, read?: number, created?: number, attached?: number, questions?: object[] }>}
 */
export async function readSheetFeed(feed, deps) {
  const url = normaliseSheetUrl(feed?.url);
  if (!url) return { ok: false, reason: 'bad_url' };
  // Having a plan or answering its questions does not establish explicit approval.
  if (!feed?.plan) return { ok: false, reason: 'no_plan' };
  const binding = approvalBinding(feed);
  // Copy primitive fields: a mutable approval reference is not a snapshot across await.
  const approval = { version: feed.approval?.version, binding: feed.approval?.binding, schema: feed.approval?.schema };
  if (!binding || approval.version !== 1 || approval.binding !== binding
    || typeof approval.schema !== 'string') return { ok: false, reason: 'approval_required' };

  const text = await deps.fetchText(url, { maxBytes: MAX_SHEET_BYTES }).catch(() => null);
  if (text === null || text === undefined) return { ok: false, reason: 'unreachable' };
  /* Google answers an unshared document with a sign-in page, which parses as one sad column
     of HTML rather than failing outright. */
  if (/^\s*<(!doctype|html)/i.test(text)) return { ok: false, reason: 'not_shared' };

  const rows = deps.parseDelimited(text);
  if (approvalBinding(feed) !== binding || feed.approval?.version !== approval.version
    || feed.approval?.binding !== approval.binding || feed.approval?.schema !== approval.schema) {
    return { ok: false, reason: 'approval_required' };
  }
  const schema = schemaFingerprint(rows, feed.plan);
  if (!schema || schema !== approval.schema) return { ok: false, reason: 'approval_required' };
  // New rows can introduce unanswered interpretation questions despite stable headers.
  const questions = deps.planQuestions(rows, feed.plan);
  if (questions.length) return { ok: false, reason: 'shape_changed', questions };

  const { sightings } = deps.toSightings(rows, { accountId: feed.accountId || null, plan: feed.plan });
  if (!sightings.length) return { ok: false, reason: 'no_rows' };

  const result = await deps.ingestSightings(sightings);
  return { ok: true, read: sightings.length, created: result?.created ?? 0, attached: result?.attached ?? 0 };
}
