/**
 * The receipts inbox.
 * ===================
 * Every person gets one address of their own, on the money domain. A receipt, an invoice,
 * a renewal notice or a price-change email forwarded to it becomes a sighting in the ledger:
 * the amount and the shop the bank already saw, plus what the bank never sees, which is the
 * line items, the plan, the order reference, and a price rise before it is charged.
 *
 * Nothing here reads anyone's mailbox. The address only ever receives what the person
 * chose to forward, which is the whole point: the value of email without the scope.
 *
 * Wire: Resend receives mail for the domain, posts an `email.received` event to
 * /api/money/inbox/resend, and this fetches the message by id and reads it. The read is a
 * model extraction with a deterministic gate: an amount the email does not literally contain
 * is thrown away. The model phrases nothing on the page; it only fills fields the ledger
 * then treats like any other sighting.
 *
 * Env: RESEND_API_KEY (already present for sending), RESEND_WEBHOOK_SECRET (the receiving
 * webhook's signing secret), MONEY_INBOX_DOMAIN (default in.twinme.me).
 */

import crypto from 'node:crypto';
import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';
import { complete, TIER_EXTRACTION } from '../llmGateway.js';
import { ingestSighting } from './store.js';
import { merchantKey } from './captureParser.js';

const log = createLogger('MoneyInbox');

export const INBOX_FACT_KIND = 'inbox_address';
export const RECEIPT_KINDS = Object.freeze(['receipt', 'invoice', 'renewal', 'price_change']);
/** A webhook older than this is replayed or delayed past usefulness; either way it is refused. */
const SIGNATURE_TOLERANCE_S = 5 * 60;

export function inboxDomain() {
  return process.env.MONEY_INBOX_DOMAIN || 'in.twinme.me';
}

export function isInboxConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_WEBHOOK_SECRET);
}

/* ------------------------------------------------------------------ the address */

/** The person's own address, minted once and kept as a fact the page never shows as a fact. */
export async function inboxAddress(userId) {
  const { data: existing } = await supabaseAdmin
    .from('money_facts')
    .select('value')
    .eq('user_id', userId).eq('kind', INBOX_FACT_KIND)
    .limit(1);
  if (existing?.[0]?.value) return existing[0].value;
  /* Twelve hex characters from the system's randomness: not guessable, short enough to read
     out, and prefixed so it is recognisably ours in a person's forwarding history. */
  const address = `r-${crypto.randomBytes(6).toString('hex')}@${inboxDomain()}`;
  const { error } = await supabaseAdmin.from('money_facts').insert({
    user_id: userId, kind: INBOX_FACT_KIND, subject: '', value: address, source: 'system',
    answered_at: new Date().toISOString(),
  });
  if (error) throw new Error(`inbox address failed: ${error.message}`);
  return address;
}

/** Whose inbox an incoming address is, or null. Case-insensitive; the mailbox part is ours. */
export async function userForAddress(address) {
  const clean = String(address || '').trim().toLowerCase().replace(/^.*<([^>]+)>.*$/, '$1');
  if (!clean.endsWith(`@${inboxDomain().toLowerCase()}`)) return null;
  const { data } = await supabaseAdmin
    .from('money_facts')
    .select('user_id')
    .eq('kind', INBOX_FACT_KIND).eq('value', clean)
    .limit(1);
  return data?.[0]?.user_id || null;
}

/* ------------------------------------------------------------------ the signature */

/**
 * Svix's standard, which Resend uses: HMAC-SHA256 over "id.timestamp.body" with the secret
 * after "whsec_" base64-decoded, compared in constant time against any of the "v1,..."
 * entries in the signature header. Pure, so a test can hand it a known vector.
 */
export function verifySvix({ rawBody, headers, secret, now = Math.floor(Date.now() / 1000) }) {
  if (!secret || !rawBody) return false;
  const id = headers['svix-id'];
  const ts = headers['svix-timestamp'];
  const sigs = String(headers['svix-signature'] || '');
  if (!id || !ts || !sigs) return false;
  const age = Math.abs(now - Number(ts));
  if (!Number.isFinite(age) || age > SIGNATURE_TOLERANCE_S) return false;
  const key = Buffer.from(String(secret).replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key).update(`${id}.${ts}.${rawBody}`).digest();
  return sigs.split(/\s+/).some((entry) => {
    const [version, value] = entry.split(',');
    if (version !== 'v1' || !value) return false;
    const given = Buffer.from(value, 'base64');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}

/* ------------------------------------------------------------------ the message */

export async function fetchReceivedEmail(id) {
  const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
  });
  if (!res.ok) throw new Error(`resend receiving ${res.status}`);
  return res.json();
}

/** The readable part of a message, bounded, with markup stripped when there is no text. */
export function messageText({ subject, text, html }) {
  const body = text && text.trim()
    ? text
    : String(html || '')
      .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&euro;/g, 'EUR');
  return `${subject || ''}\n${body}`.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 6000);
}

/* ------------------------------------------------------------------ the reading */

const EXTRACTION_SYSTEM = [
  'You read one email and return one JSON object and nothing else.',
  'Fields: kind (one of receipt, invoice, renewal, price_change, none), merchant (the business, short),',
  'amount (the total actually charged or to be charged, as a number), currency (ISO code),',
  'date (ISO 8601 date of the charge or invoice, or null), items (array of {label, amount}, at most 12),',
  'order_ref (string or null), plan (string or null), previous_amount (number or null, for a price change),',
  'next_charge_at (ISO date or null, for a renewal), confidence (0 to 1).',
  'Rules: never invent a number; every amount must appear in the email. If the email is not about a',
  'payment, kind is none. Marketing, newsletters and shipping updates without a charge are none.',
].join(' ');

/** Every number the email literally contains, so a figure the model produced can be checked. */
export function amountsIn(text) {
  const out = new Set();
  for (const m of String(text).matchAll(/(\d{1,3}(?:[.,]\d{3})*|\d+)(?:[.,](\d{1,2}))?/g)) {
    const whole = m[1].replace(/[.,]/g, '');
    const cents = m[2] ?? '00';
    const n = Number(`${whole}.${cents.padEnd(2, '0')}`);
    if (Number.isFinite(n)) out.add(Math.round(n * 100) / 100);
  }
  return out;
}

/** The model's answer, held to the email. Returns null when there is nothing to keep. */
export function gateReceipt(raw, text) {
  if (!raw || typeof raw !== 'object') return null;
  const kind = String(raw.kind || '').toLowerCase();
  if (!RECEIPT_KINDS.includes(kind)) return null;
  const amount = Math.round(Number(raw.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const present = amountsIn(text);
  if (!present.has(amount)) return null;
  const items = Array.isArray(raw.items)
    ? raw.items
      .map((i) => ({ label: String(i?.label || '').slice(0, 80), amount: Math.round(Number(i?.amount) * 100) / 100 }))
      .filter((i) => i.label && Number.isFinite(i.amount) && present.has(i.amount))
      .slice(0, 12)
    : [];
  const date = raw.date && !Number.isNaN(new Date(raw.date).getTime()) ? new Date(raw.date).toISOString() : null;
  const previous = Number(raw.previous_amount);
  return {
    kind,
    merchant: String(raw.merchant || '').trim().slice(0, 80) || null,
    amount,
    currency: /^[A-Z]{3}$/.test(String(raw.currency || '')) ? raw.currency : 'EUR',
    date,
    items,
    order_ref: raw.order_ref ? String(raw.order_ref).slice(0, 80) : null,
    plan: raw.plan ? String(raw.plan).slice(0, 80) : null,
    previous_amount: kind === 'price_change' && Number.isFinite(previous) && present.has(Math.round(previous * 100) / 100) ? Math.round(previous * 100) / 100 : null,
    next_charge_at: raw.next_charge_at && !Number.isNaN(new Date(raw.next_charge_at).getTime()) ? new Date(raw.next_charge_at).toISOString() : null,
    confidence: Math.min(0.95, Math.max(0.3, Number(raw.confidence) || 0.6)),
  };
}

export async function extractReceipt({ subject, from, text, html, userId }) {
  const body = messageText({ subject, text, html });
  const reply = await complete({
    tier: TIER_EXTRACTION,
    system: EXTRACTION_SYSTEM,
    messages: [{ role: 'user', content: `From: ${from || ''}\n\n${body}` }],
    maxTokens: 600,
    temperature: 0,
    userId,
    serviceName: 'money-inbox',
    skipCache: true,
  });
  const raw = reply?.content ?? reply?.text ?? reply;
  let parsed = null;
  try {
    const s = typeof raw === 'string' ? raw : JSON.stringify(raw);
    parsed = JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
  } catch { parsed = null; }
  return gateReceipt(parsed, body);
}

/* ------------------------------------------------------------------ the sighting */

/** A gated receipt as the ledger's own row. Pure. */
export function receiptToSighting(receipt, { emailId, from, subject, receivedAt }) {
  const merchant = receipt.merchant || String(from || '').replace(/^.*<([^>]+)>.*$/, '$1').split('@')[1]?.split('.')[0] || 'Email receipt';
  const occurred = receipt.date || receivedAt || new Date().toISOString();
  return {
    source: 'email',
    source_ref: `email:${crypto.createHash('sha256').update(String(emailId)).digest('hex').slice(0, 32)}`,
    raw_text: `${subject || ''}`.slice(0, 500),
    raw_json: {
      kind: receipt.kind, items: receipt.items, order_ref: receipt.order_ref, plan: receipt.plan,
      previous_amount: receipt.previous_amount, next_charge_at: receipt.next_charge_at, from: from || null,
    },
    amount: receipt.amount,
    currency: receipt.currency,
    direction: 'out',
    channel: 'card',
    merchant_raw: merchant,
    merchant_key: merchantKey(merchant),
    card_last4: null,
    occurred_at: occurred,
    parse_confidence: receipt.confidence,
  };
}

/**
 * One received email, end to end. Returns what happened so the route can answer the
 * webhook honestly and quickly; every reason is a word the log can group on.
 */
export async function ingestReceivedEmail(event) {
  const data = event?.data || {};
  const to = Array.isArray(data.to) ? data.to[0] : data.to;
  const userId = await userForAddress(to);
  if (!userId) return { outcome: 'unknown_address' };
  const id = data.email_id || data.id;
  if (!id) return { outcome: 'no_id' };
  const message = await fetchReceivedEmail(id);
  const receipt = await extractReceipt({ subject: message.subject, from: message.from, text: message.text, html: message.html, userId });
  if (!receipt) return { outcome: 'not_a_receipt', userId };
  const sighting = receiptToSighting(receipt, { emailId: id, from: message.from, subject: message.subject, receivedAt: message.created_at });
  const result = await ingestSighting(userId, sighting);
  log.info('receipt read', { userId, kind: receipt.kind, action: result.action });
  return { outcome: 'read', userId, kind: receipt.kind, action: result.action, transaction_id: result.transaction?.id || null };
}
