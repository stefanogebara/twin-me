/**
 * Attachments: a photo or a file handed to the ledger in the chat.
 * ================================================================
 * A person holds a receipt, a bill, a lease, a statement. Each is worth something to
 * the ledger, and until now the only door was the receipts inbox (email) or the statement
 * upload on Sources. This is the third door, the one in the conversation: drop the file,
 * the ledger reads it and says in one sentence what it kept.
 *
 * Three readings, tried in this order, each on the machinery that already exists:
 *
 *   statement   an Excel or CSV export from the bank: statements/importer.js reads the
 *               rows, and every payment in it joins the ledger (ingestSightings)
 *   receipt     any text the document holds (a photo through the vision model, a PDF's
 *               own text) read by inbox.js's receipt extractor, gated the same way: an
 *               amount the model names must appear in the document, or it is nothing
 *   note        a document about money that is not a receipt (a contract, a letter, a
 *               scholarship award): one sentence, held to the same rule, kept as a
 *               note fact in the person's context, like anything they tell the chat
 *
 * Anything else reads as nothing and says so. The file itself is never kept: the bytes
 * are read in memory and dropped; only what they said reaches the database, with a hash
 * of the file as the sighting's reference so the same receipt sent twice is one row.
 *
 * Nothing here phrases a number the ledger did not compute or the document did not
 * literally contain. Every dependency is injected so the reading is testable without a
 * model, a database or a bank.
 */

import crypto from 'node:crypto';

/** Vercel caps a request body at 4.5 MB; a photo shrinks on the client before it comes. */
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
/** What the composer accepts: photos, PDFs, plain text, and the bank's own exports. */
export const ATTACHMENT_EXTENSIONS = Object.freeze(['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'pdf', 'txt', 'csv', 'tsv', 'xlsx', 'xls']);
const STATEMENT_EXTENSIONS = Object.freeze(['xlsx', 'xls', 'csv', 'tsv']);
const MAX_NOTES = 30;
const SUMMARY_MAX = 200;

const EUR = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const euro = (n) => EUR.format(Math.abs(Number(n) || 0)).replace(/\u20ac/g, 'EUR').replace(/[\u00a0\u202f]/g, ' ');
const extOf = (name = '') => { const m = /\.([a-z0-9]+)$/i.exec(String(name).trim()); return m ? m[1].toLowerCase() : ''; };

/** Whether the composer should take this file at all. Pure. */
export function acceptsAttachment(filename, mimeType = '') {
  const ext = extOf(filename);
  if (ATTACHMENT_EXTENSIONS.includes(ext)) return true;
  const mt = String(mimeType || '').toLowerCase();
  return mt.startsWith('image/') || mt === 'application/pdf' || mt === 'text/plain' || mt === 'text/csv';
}

/** The hash that makes the same file one row however often it is sent. Pure. */
export function attachmentRef(buffer) {
  return `upload:${crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 32)}`;
}

/** Every number the document literally contains, so a sentence the model wrote can be checked. */
function amountsIn(text) {
  const out = new Set();
  for (const m of String(text).matchAll(/(\d{1,3}(?:[.,]\d{3})*|\d+)(?:[.,](\d{1,2}))?/g)) {
    const whole = m[1].replace(/[.,]/g, '');
    const cents = m[2] ?? '00';
    const n = Number(`${whole}.${cents.padEnd(2, '0')}`);
    if (Number.isFinite(n)) out.add(Math.round(n * 100) / 100);
  }
  return out;
}

/**
 * The model's one sentence about a document, held to the document: not NONE, not long,
 * and every figure in it present in the text. Returns the sentence or null. Pure.
 */
export function gateSummary(raw, text) {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim().replace(/^["'`]+|["'`]+$/g, '');
  if (!s || /^none\.?$/i.test(s) || s.length > SUMMARY_MAX) return null;
  const present = amountsIn(text);
  for (const n of amountsIn(s)) if (!present.has(n)) return null;
  return s;
}

const SUMMARY_SYSTEM = [
  'You read one document a person handed to their own money ledger. Return one sentence, at most 160 characters,',
  'in plain words, saying what the document says about their money: an amount they owe or are owed, a date,',
  'a rule of a contract, a price. Never invent a number; every figure must appear in the document.',
  'If the document says nothing about money, return exactly NONE. No preamble, no quotes.',
].join(' ');

/**
 * One file, read. Returns { kind, said, receipts, sighting, fact } where kind is one of
 * statement | receipt | note | nothing | unreadable. `deps` carries every side effect.
 */
export async function readAttachment(userId, { buffer, filename = '', mimeType = '', note = '' } = {}, deps) {
  const {
    extractText, extractReceipt, receiptToSighting, ingestSighting, ingestSightings,
    parseStatement, complete, listFacts, rememberNote, afterLedgerChange,
  } = deps;
  const name = String(filename || 'file').slice(0, 120);
  const said = (kind, text, extra = {}) => ({ kind, said: text, receipts: [], ...extra });
  if (!Buffer.isBuffer(buffer) || !buffer.length) return said('unreadable', 'Nothing arrived in that file.');
  if (buffer.length > MAX_ATTACHMENT_BYTES) return said('unreadable', 'That file is over 4 MB. A photo of it would come through.');
  if (!acceptsAttachment(name, mimeType)) return said('unreadable', 'It reads photos, PDFs, plain text and bank exports as Excel or CSV.');

  /* 1. A bank export: rows, not prose. */
  if (STATEMENT_EXTENSIONS.includes(extOf(name)) && parseStatement) {
    let rows = null;
    try { rows = parseStatement(buffer, name); } catch { rows = null; }
    if (rows && rows.sightings && rows.sightings.length) {
      const result = await ingestSightings(userId, rows.sightings);
      if (afterLedgerChange) await afterLedgerChange(userId).catch(() => {});
      const created = Number(result?.created) || 0;
      return said('statement', `Read ${rows.sightings.length} ${rows.sightings.length === 1 ? 'payment' : 'payments'} from ${name}; ${created} ${created === 1 ? 'was' : 'were'} new to the ledger.`, { read: rows.sightings.length, created });
    }
    if (rows && rows.header) return said('nothing', `${name} has a statement header but no row in it read as a payment.`);
    /* A CSV that is not a statement falls through to the text reading. */
  }

  /* 2. The text the document holds. */
  const read = await extractText(buffer, { filename: name, mimeType, userId });
  const text = read && read.ok ? String(read.text || '').trim() : '';
  if (!text) {
    if (read && read.needsOcr) return said('unreadable', `${name} is a scan with no text layer. A photo of the page reads.`);
    return said('unreadable', `${name} could not be read.`);
  }

  /* 3. A receipt, by the inbox's own reading and gate. */
  const receipt = await extractReceipt({ subject: name, from: null, text, userId });
  if (receipt) {
    const sighting = {
      ...receiptToSighting(receipt, { emailId: attachmentRef(buffer), from: null, subject: name, receivedAt: new Date().toISOString() }),
      source: 'upload',
      source_ref: attachmentRef(buffer),
      raw_text: `${name}${note ? ` - ${String(note).slice(0, 300)}` : ''}`.slice(0, 500),
    };
    sighting.raw_json = { ...(sighting.raw_json || {}), filename: name, note: note ? String(note).slice(0, 300) : null, method: read.method || null };
    /* One row joins the ledger; the readings are not recomputed here. A photo through the
       vision model, the receipt reading and the row already take most of the time a request
       may live, and the full refresh after them ran the first receipt into the API's
       timeout. The daily run recomputes every reading with this row in it. */
    const result = await ingestSighting(userId, sighting);
    const tx = result && result.transaction ? result.transaction : null;
    const when = receipt.date ? new Date(receipt.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'today';
    const items = receipt.items && receipt.items.length ? ` ${receipt.items.length} ${receipt.items.length === 1 ? 'item' : 'items'} on it.` : '';
    const twice = result && result.action === 'existing' ? ' It was already in the ledger.' : '';
    const merchant = receipt.merchant || 'That receipt';
    return said('receipt', `${merchant}, ${euro(receipt.amount)} on ${when}, kept as a payment.${items}${twice}${note ? ' Your note stays with it.' : ''}`, {
      sighting,
      receipts: tx ? [{ id: tx.id, merchant: tx.merchant_raw || merchant, amount: -Math.abs(Number(tx.amount) || receipt.amount), occurred_at: tx.occurred_at || sighting.occurred_at }] : [],
    });
  }

  /* 4. A document about money that is not a receipt: one sentence, kept as a note. */
  let summary = null;
  if (complete) {
    const reply = await complete({
      system: SUMMARY_SYSTEM,
      messages: [{ role: 'user', content: `File: ${name}${note ? `\nThe person says: ${String(note).slice(0, 300)}` : ''}\n\n${text.slice(0, 6000)}` }],
      maxTokens: 120, temperature: 0, userId, serviceName: 'money-attachment', skipCache: true,
    }).catch(() => null);
    const raw = reply?.content ?? reply?.text ?? reply;
    summary = gateSummary(typeof raw === 'string' ? raw : '', `${text}\n${note || ''}`);
  }
  if (!summary) return said('nothing', `Read ${name}. Nothing in it about your money to keep.`);
  const notes = listFacts ? (await listFacts(userId)).filter((f) => f && f.kind === 'note').length : 0;
  if (notes >= MAX_NOTES) return said('nothing', `Read ${name}: ${summary} It holds thirty of your notes already, so this one is not kept; forget one on You and send it again.`);
  const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 8);
  const fact = await rememberNote(userId, { subject: `doc-${hash}`, text: summary });
  return said('note', `Kept from ${name}: ${summary}`, { fact });
}
