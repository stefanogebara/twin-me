/**
 * Enable Banking adapter: the PSD2 truth path.
 * ============================================
 * Enable Banking is a licensed EU AISP that fronts Santander España (and the
 * other Spanish banks) over one API. PSD2 lets an AISP pull an account four
 * times per 24 hours without the customer present, and requires SCA on first
 * access and every 180 days. So this adapter is a batch path, never real time.
 *
 * Auth: a JWT signed RS256 with the application's private key, `kid` = app id
 * (Enable Banking's scheme). Flow: GET /aspsps → POST /auth (returns a URL the
 * user opens at the bank) → POST /sessions with the returned code → account
 * uids → GET /accounts/{uid}/transactions. Verify the exact field names against
 * the current Enable Banking docs before the first live run; the shape below
 * follows their published API and is env-gated so nothing runs without keys.
 *
 * Env: ENABLE_BANKING_APP_ID, ENABLE_BANKING_PRIVATE_KEY (PEM), ENABLE_BANKING_REDIRECT_URL
 */

import crypto from 'node:crypto';
import { merchantKey } from '../captureParser.js';
import { parseNarrative, channelFrom, cardFrom, prettyMerchant } from '../narrative.js';
import { quietly } from '../../quietly.js';

const BASE = process.env.ENABLE_BANKING_BASE_URL || 'https://api.enablebanking.com';

export function isConfigured() {
  return Boolean(process.env.ENABLE_BANKING_APP_ID && process.env.ENABLE_BANKING_PRIVATE_KEY);
}

function b64url(buf) { return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'); }

/** Short-lived RS256 JWT for the Enable Banking API. */
export function makeJwt(now = Math.floor(Date.now() / 1000)) {
  const appId = process.env.ENABLE_BANKING_APP_ID;
  const key = (process.env.ENABLE_BANKING_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const header = { typ: 'JWT', alg: 'RS256', kid: appId };
  const payload = { iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: now, exp: now + 3600 };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = crypto.sign('RSA-SHA256', Buffer.from(signingInput), key);
  return `${signingInput}.${b64url(sig)}`;
}

async function api(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, { ...init, signal: init.signal || AbortSignal.timeout(8000), headers: { 'Authorization': `Bearer ${makeJwt()}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  if (!res.ok) {
    /* The path is inside the message, and the path carries the query, so anything matching on
       the message alone matches its own request: a test for "transaction_status" in the error
       was true of every failed read, because every read asks for it. The answer is kept apart
       from the question. */
    const error = new Error(`enablebanking ${path} ${res.status}: ${(text || '').slice(0, 200)}`);
    error.status = res.status;
    error.body = text || '';
    throw error;
  }
  return json;
}

/**
 * Which application these credentials belong to, asked once per process. A session is owned
 * by the application that created it: the sandbox app cannot see the production app's
 * sessions and answers SESSION_DOES_NOT_EXIST for every one of them, which is the same
 * answer a genuinely ended session gives. So a dev machine on the sandbox key, sharing the
 * production database, once recorded every real session as expired and told the person to
 * reconnect a bank that was fine. Callers ask this before believing a 404.
 */
let environmentPromise = null;
export function applicationEnvironment() {
  if (!environmentPromise) {
    environmentPromise = api('/application')
      .then((j) => String(j?.environment || 'UNKNOWN').toUpperCase())
      .catch(quietly('enable-banking/api', () => { environmentPromise = null; return 'UNKNOWN'; }));
  }
  return environmentPromise;
}
export async function isProduction() { return (await applicationEnvironment()) === 'PRODUCTION'; }
/** What Enable Banking says about this application, without its key id: the name, the
 *  environment, whether it is active, and whatever status fields it carries. For the feed
 *  log when a session comes back empty; nothing in it is a secret. */
export async function applicationInfo() {
  const j = await api('/application');
  if (!j || typeof j !== 'object') return null;
  const { kid: _kid, ...rest } = j; // eslint-disable-line no-unused-vars
  const keep = Object.fromEntries(Object.entries(rest).filter(([k, v]) => /environment|active|restrict|status|state|countries|services|name|linked|mode|type/i.test(k) && JSON.stringify(v).length < 400));
  return { keys: Object.keys(rest), ...keep };
}
/** The countries the application serves, from the same object, asked once per process. */
let countriesPromise = null;
export function applicationCountries() {
  if (!countriesPromise) {
    countriesPromise = api('/application')
      .then((j) => (Array.isArray(j?.countries) ? j.countries.map((c) => String(c).toUpperCase()) : null))
      .catch(quietly('enable-banking/application-countries', () => { countriesPromise = null; return null; }));
  }
  return countriesPromise;
}
/** Tests swap the credentials mid-process; the answer must not outlive them. */
export function resetApplicationEnvironment() { environmentPromise = null; countriesPromise = null; }

/** Banks available in a country. */
export async function listBanks(country = 'ES') {
  const j = await api(`/aspsps?country=${encodeURIComponent(country)}`);
  return (j?.aspsps || []).map((a) => ({ name: a.name, country: a.country, psuTypes: a.psu_types, maxConsentDays: a.maximum_consent_validity ? Math.round(a.maximum_consent_validity / 86400) : null }));
}

/** Start authorisation at the bank: returns the URL the user opens. */
export async function startAuthorisation({ bankName = 'Banco Santander', country = 'ES', state, validUntil }) {
  const body = {
    access: { valid_until: validUntil || new Date(Date.now() + 180 * 86400000).toISOString() },
    aspsp: { name: bankName, country },
    state,
    redirect_url: process.env.ENABLE_BANKING_REDIRECT_URL,
    psu_type: 'personal',
  };
  const j = await api('/auth', { method: 'POST', body: JSON.stringify(body) });
  return { url: j.url, authorizationId: j.authorization_id };
}

/** The session's shape as the store reads it. Pure. */
export function sessionShape(j) {
  return {
    sessionId: j.session_id,
    validUntil: j.access?.valid_until || null,
    bankName: j.aspsp?.name || null,
    accounts: (j.accounts || []).map((a) => ({ uid: a.uid, identificationHash: a.identification_hash || null, iban: a.account_id?.iban || null, name: a.name || a.product || null, currency: a.currency || 'EUR' })),
    /* What Enable Banking said, for the log when a bank shares nothing: its fields, the
       access it granted, the bank, the kind of user. No secret lives in a session object. */
    raw: {
      keys: Object.keys(j || {}), status: j.status || null, access: j.access || null, aspsp: j.aspsp || null, psu_type: j.psu_type || null, accounts: j.accounts || null,
      /* How many accounts Enable Banking itself holds for the session, and under which
         fields, never their values. More here than in `accounts` means the accounts were
         seen and then withheld from the application (a restricted app); none here means
         the bank shared none. The one line that tells the two apart (2026-09-16). */
      accounts_data: Array.isArray(j.accounts_data) ? { count: j.accounts_data.length, fields: j.accounts_data[0] ? Object.keys(j.accounts_data[0]) : [] } : null,
    },
  };
}

/** Exchange the code from the redirect for a session and its accounts. */
export async function createSession(code) {
  return sessionShape(await api('/sessions', { method: 'POST', body: JSON.stringify({ code }) }));
}

/**
 * The session read again. Revolut's session was created with an empty account list three
 * times on 2026-09-15 although the person had picked an account; a second read is the
 * cheapest thing to try before calling it refused.
 */
export async function getSession(sessionId) {
  return sessionShape(await api(`/sessions/${encodeURIComponent(sessionId)}`, { method: 'GET' }));
}

/**
 * The balance types, in the order that best says "money available now": ISO 20022 interim
 * available, then the Berlin Group's expected (booked plus pending, what Santander sends
 * beside its closing booked), then closing available, then the accounting balance.
 * Source: enablebanking.com/docs/api/reference, Redsys Santander TPP guide 1.9.4.1 s.9.6.
 */
export const BALANCE_PREFERENCE = Object.freeze(['ITAV', 'XPCD', 'CLAV', 'ITBD', 'CLBD', 'OTHR']);

/** Pick the one balance to show from a HalBalances array. Pure. Null when nothing usable. */
export function pickBalance(balances = [], { currency = null } = {}) {
  const all = (balances || []).filter((b) => b && b.balance_amount && Number.isFinite(Number(b.balance_amount.amount)));
  /* A multi-currency account lists one balance per currency; only the account's own counts. */
  const rows = currency ? all.filter((b) => !b.balance_amount.currency || String(b.balance_amount.currency).toUpperCase() === String(currency).toUpperCase()) : all;
  if (!rows.length) return null;
  const rank = (t) => { const i = BALANCE_PREFERENCE.indexOf(String(t || '').toUpperCase()); return i === -1 ? BALANCE_PREFERENCE.length : i; };
  const best = [...rows].sort((a, b) => rank(a.balance_type) - rank(b.balance_type))[0];
  return {
    amount: Math.round(Number(best.balance_amount.amount) * 100) / 100,
    currency: best.balance_amount.currency || 'EUR',
    type: String(best.balance_type || 'OTHR').toUpperCase(),
    /* A figure with an overdraft line inside it is not the person's money. */
    credit_included: Boolean(best.credit_limit_included),
    at: best.last_change_date_time || (best.reference_date ? `${best.reference_date}T00:00:00Z` : null),
  };
}

/**
 * The account's balances. Called only with the person present (PSU headers): a balance
 * read is an account access like any other, and the four a day are spent on transactions.
 */
export async function fetchBalances(accountUid, { psu = null, currency = null } = {}) {
  const headers = psuHeaders(psu);
  /* Without the person's address the bank counts this as one of the four: refused here, so
     the budget the store plans stays true. */
  if (!Object.keys(headers).length) throw Object.assign(new Error('balance read needs the person present'), { code: 'psu_required' });
  const j = await api(`/accounts/${encodeURIComponent(accountUid)}/balances`, { headers });
  return pickBalance(j?.balances || [], { currency });
}

/** One page of transactions for an account since a date (YYYY-MM-DD). */
/* The bank ends a session on its own schedule, and after that every read answers 404 with
   SESSION_DOES_NOT_EXIST or ACCOUNT_DOES_NOT_EXIST. That is not a server fault and must not
   read as one: it means the person has to authorise the bank again, and the product has to
   say so rather than keep showing a month that stopped moving. */
export function isSessionGone(error) {
  const m = String(error?.message || '');
  return /SESSION_DOES_NOT_EXIST|ACCOUNT_DOES_NOT_EXIST/.test(m);
}

/**
 * The headers that tell the bank a person is present. PSD2 caps background reads at four a
 * day; a read made while the person is in the app is not background, and Enable Banking
 * decides which is which purely by the presence of these headers. So a read on open, or
 * on pull-to-refresh, carries the person's address and user agent, and is not counted.
 */
export function psuHeaders(psu) {
  if (!psu || !psu.ip) return {};
  const h = { 'Psu-Ip-Address': String(psu.ip).slice(0, 64) };
  if (psu.userAgent) h['Psu-User-Agent'] = String(psu.userAgent).slice(0, 256);
  return h;
}

/**
 * One page of an account's transactions. Booked and pending both, so a card payment shows
 * the day it is made rather than the day the bank books it; a bank that refuses the
 * status filter gets asked again without it. `psu` marks the read as attended (see above).
 */
export async function fetchTransactions(accountUid, dateFrom, continuationKey = null, { psu = null, status = 'BOTH', signal = null } = {}) {
  const qs = new URLSearchParams({ date_from: dateFrom });
  if (continuationKey) qs.set('continuation_key', continuationKey);
  if (status) qs.set('transaction_status', status);
  const headers = psuHeaders(psu);
  try {
    let j;
    try {
      j = await api(`/accounts/${encodeURIComponent(accountUid)}/transactions?${qs}`, { headers, signal });
    } catch (error) {
      const said = String(error.body ?? error.message ?? '');
      const refused = Number(error.status) === 422 || Number(error.status) === 400;
      if (refused && /date_from|DateFrom|period|too (far|old)|history/i.test(said)) {
        /* A bank that will not reach as far back as it was asked says so rather than
           answering with less. Ninety days is what PSD2 obliges every bank to hold. */
        qs.set('date_from', new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10));
        j = await api(`/accounts/${encodeURIComponent(accountUid)}/transactions?${qs}`, { headers, signal });
      } else if (status && refused && /transaction_status|TransactionStatus/i.test(said)) {
        qs.delete('transaction_status');
        j = await api(`/accounts/${encodeURIComponent(accountUid)}/transactions?${qs}`, { headers, signal });
      } else throw error;
    }
    return { rows: j.transactions || [], continuationKey: j.continuation_key || null };
  } catch (error) {
    if (isSessionGone(error)) {
      /* Only the production application can say a real session has ended; any other
         application simply cannot see it, and must not say more than that. */
      if (await isProduction()) {
        const err = new Error('The bank connection has ended. It needs to be authorised again.');
        err.code = 'bank_session_expired';
        throw err;
      }
      const err = new Error('This environment cannot read that bank session; it belongs to another application.');
      err.code = 'bank_session_unreachable';
      throw err;
    }
    throw error;
  }
}

/**
 * A feed row becomes a sighting. Pure, exported for tests.
 * Enable Banking transaction shape (Berlin Group derived): transaction_amount {amount, currency},
 * credit_debit_indicator CRDT|DBIT, booking_date, value_date, creditor {name}, debtor {name},
 * remittance_information [string], entry_reference / transaction_id.
 */
/**
 * Two pending rows can be identical to the byte: 0,50 to the same person twice in a day,
 * two coffees at the same price at the same shop. Their keys would collide and Postgres
 * refuses a batch that touches one row twice. The second and later copies get an ordinal,
 * in the order the bank gave them, so both are kept and each books against its own line
 * when the bank hands out references. Booked rows already carry the bank's reference.
 * Pure.
 */
export function distinctPending(sightings = [], seen = new Map()) {
  return (sightings || []).map((s) => {
    if (!s || !/^(pend:|bank:fallback:)/.test(String(s.source_ref || ''))) return s;
    const n = (seen.get(s.source_ref) || 0) + 1;
    seen.set(s.source_ref, n);
    return n === 1 ? s : { ...s, source_ref: `${s.source_ref}#${n}`, legacy_refs: (s.legacy_refs || []).map((ref) => `${ref}#${n}`) };
  });
}

export function toSighting(row, accountId) {
  const amt = Math.abs(Number(row.transaction_amount?.amount ?? row.amount ?? 0));
  const isCredit = (row.credit_debit_indicator || '').toUpperCase() === 'CRDT';
  const counterparty = isCredit ? row.debtor?.name : row.creditor?.name;
  const remittance = Array.isArray(row.remittance_information) ? row.remittance_information.join(' ') : (row.remittance_information || '');
  const narrative = counterparty || remittance || null;
  const date = row.value_date || row.booking_date || row.transaction_date;
  /* Santander names nobody in the creditor field and writes a sentence in the remittance
     line instead. The ledger shows the name read out of that sentence; the sentence stays
     as the receipt. A bank that fills the creditor field properly needs no reading. */
  const said = [counterparty, remittance].filter(Boolean).join(' ');
  const read = parseNarrative(narrative);
  const name = counterparty ? prettyMerchant(counterparty) : (read.merchant || narrative);
  /* A pending row has no stable reference yet; the bank hands one out when it books. Its
     own key keeps a pending row from being read twice, and the booked row that follows
     finds the same line by amount and day, then gives it its posting date. */
  const pending = String(row.status || 'BOOK').toUpperCase() === 'PDNG';
  const currency = String(row.transaction_amount?.currency || row.currency || 'EUR').toUpperCase();
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify([accountId, date, amt, currency, isCredit, narrative])).digest('hex').slice(0, 32);
  const stableEntry = !pending && row.entry_reference;
  // transaction_id is explicitly non-unique and may change on every read (provider docs).
  const sourceRef = stableEntry
    ? `bank:${accountId}:${row.entry_reference}`
    : `${pending ? 'pend:' : 'bank:fallback:'}${fingerprint}`;
  /* Every name this payment has already been known by. The bank spells one payment three
     ways over its life -- pending, booked with no reference of its own, booked with the
     reference it finally hands out -- and a spelling the ledger does not recognise opens a
     second line: one El Corte Ingles payment of 134,62 EUR became three lines, and the pull
     at 02:00 on 2026-09-18 added five more copies of payments already held. All three
     spellings are built from the same fingerprint, so a later reading can find the earlier
     one. Oldest-first names last, because the planner takes the first alias that fits and
     the ledger keeps five. */
  const aliases = pending ? [`pend:${date}|${amt}|${narrative}`] : [
    ...(stableEntry ? [`bank:fallback:${fingerprint}`] : []),
    `pend:${fingerprint}`,
    ...(row.entry_reference ? [String(row.entry_reference)] : []),
    ...(row.transaction_id ? [String(row.transaction_id)] : []),
    `${date}|${amt}|${narrative}`,
  ];
  return {
    source: 'bankfeed',
    source_ref: sourceRef,
    legacy_refs: [...new Set(aliases)].filter((ref) => ref && ref.length <= 512 && ref !== sourceRef).slice(0, 5),
    account_id: accountId,
    raw_json: row,
    raw_text: remittance || counterparty || null,
    amount: amt,
    currency,
    direction: isCredit ? 'in' : 'out',
    merchant_raw: name,
    merchant_key: merchantKey(name),
    occurred_at: date ? new Date(`${date}T12:00:00Z`).toISOString() : null,
    card_last4: cardFrom(said),
    parse_confidence: pending ? 0.85 : 1,
    channel: channelFrom(said, { amount: amt }),
  };
}
