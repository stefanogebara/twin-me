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
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { 'Authorization': `Bearer ${makeJwt()}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  if (!res.ok) throw new Error(`enablebanking ${path} ${res.status}: ${(text || '').slice(0, 200)}`);
  return json;
}

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

/** Exchange the code from the redirect for a session and its accounts. */
export async function createSession(code) {
  const j = await api('/sessions', { method: 'POST', body: JSON.stringify({ code }) });
  return {
    sessionId: j.session_id,
    validUntil: j.access?.valid_until || null,
    accounts: (j.accounts || []).map((a) => ({ uid: a.uid, iban: a.account_id?.iban || null, name: a.name || a.product || null, currency: a.currency || 'EUR' })),
  };
}

/** One page of transactions for an account since a date (YYYY-MM-DD). */
export async function fetchTransactions(accountUid, dateFrom, continuationKey = null) {
  const qs = new URLSearchParams({ date_from: dateFrom });
  if (continuationKey) qs.set('continuation_key', continuationKey);
  const j = await api(`/accounts/${encodeURIComponent(accountUid)}/transactions?${qs}`);
  return { rows: j.transactions || [], continuationKey: j.continuation_key || null };
}

/**
 * A feed row becomes a sighting. Pure, exported for tests.
 * Enable Banking transaction shape (Berlin Group derived): transaction_amount {amount, currency},
 * credit_debit_indicator CRDT|DBIT, booking_date, value_date, creditor {name}, debtor {name},
 * remittance_information [string], entry_reference / transaction_id.
 */
export function toSighting(row, accountId) {
  const amt = Math.abs(Number(row.transaction_amount?.amount ?? row.amount ?? 0));
  const isCredit = (row.credit_debit_indicator || '').toUpperCase() === 'CRDT';
  const counterparty = isCredit ? row.debtor?.name : row.creditor?.name;
  const remittance = Array.isArray(row.remittance_information) ? row.remittance_information.join(' ') : (row.remittance_information || '');
  const merchantRaw = counterparty || remittance || null;
  const date = row.value_date || row.booking_date || row.transaction_date;
  return {
    source: 'bankfeed',
    source_ref: row.entry_reference || row.transaction_id || `${date}|${amt}|${merchantRaw}`,
    account_id: accountId,
    raw_json: row,
    amount: amt,
    currency: row.transaction_amount?.currency || row.currency || 'EUR',
    direction: isCredit ? 'in' : 'out',
    merchant_raw: merchantRaw,
    merchant_key: merchantKey(merchantRaw),
    occurred_at: date ? new Date(`${date}T12:00:00Z`).toISOString() : null,
    card_last4: null,
    parse_confidence: 1,
    channel: /bizum/i.test(remittance) ? 'bizum' : (/tarjeta|card/i.test(remittance) ? 'card' : (/recibo|adeudo/i.test(remittance) ? 'direct_debit' : 'transfer')),
  };
}
