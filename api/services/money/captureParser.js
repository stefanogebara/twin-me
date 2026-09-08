/**
 * Capture parser: a bank's push notification, verbatim, becomes a sighting.
 * ======================================================================
 * The phone is the real-time path. Santander España and Bizum push the moment
 * a card is charged or a Bizum moves; the text arrives here from an iOS Shortcut
 * automation or the Android notification listener. Pure: text in, sighting out.
 *
 * Known shapes (Spanish, EUR):
 *   "Compra realizada con tu tarjeta terminada en 1234 por 12,50€ en MERCADONA el 07/09/2026"
 *   "Pago con tarjeta *1234 de 8,40 EUR en CAFETERIA UNIVERSIDAD"
 *   "Has enviado un Bizum de 20,00€ a Juan Pérez"
 *   "Has recibido un Bizum de 15,00€ de Ana López"
 *   "Ingreso de 850,00€ en tu cuenta: Nómina"
 *   "Pago de 3,20 € con Apple Pay en METRO MADRID"
 * Anything with a EUR amount still yields a low-confidence sighting so nothing is lost.
 */

const AMOUNT = /(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s?(?:€|EUR\b|euros?\b)/i;
const CARD = /(?:terminada en|acabada en|\*{1,4}|tarjeta\s+\*?)\s?(\d{4})\b/i;
const DATE_ES = /\bel\s+(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(?:a las\s+)?(\d{1,2}):(\d{2}))?/i;
const IN_WORDS = /\b(has recibido|recibido|ingreso|abono|transferencia recibida|devoluci[oó]n|reembolso)\b/i;
const OUT_WORDS = /\b(compra|pago|cargo|retirada|has enviado|enviado|domiciliaci[oó]n|recibo|adeudo|transferencia (?:enviada|realizada))\b/i;

export const CHANNEL_WORDS = [
  [/\bbizum\b/i, 'bizum'],
  [/apple pay|google pay/i, 'card'],
  [/tarjeta/i, 'card'],
  [/domiciliaci[oó]n|recibo|adeudo/i, 'direct_debit'],
  [/transferencia|ingreso|n[oó]mina/i, 'transfer'],
  [/retirada|cajero/i, 'cash'],
];

/** "1.234,56" or "1234.56" or "12,5" → 1234.56 */
export function parseEuroAmount(s) {
  if (!s) return null;
  let t = String(s).trim();
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** Normalise a merchant string to a stable key: lowercase, ascii, no store numbers or cities glued on. */
export function merchantKey(raw) {
  if (!raw) return 'unknown';
  return String(raw)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(s\.?l\.?u?|s\.?a\.?|sl|sa|slu|ltd|gmbh|inc)\b/g, ' ')
    .replace(/\b\d{2,}\b/g, ' ')                 // store numbers, dates glued to names
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/).slice(0, 3).join(' ') || 'unknown';
}

function merchantFrom(text) {
  // "... por 12,50€ en MERCADONA el 07/09/2026" | "... en CAFETERIA UNIVERSIDAD" | "... a Juan Pérez" | "... de Ana López"
  const patterns = [
    /* "por" and "de" end the name too: an Android notification often puts the shop before
       the amount ("Compra en EL CORTE INGLES por 116,76 EUR"), where iOS put it after. */
    /\ben\s+([A-ZÁÉÍÓÚÑ][^.,\n]*?)(?=\s+el\s+\d{1,2}\/|\s+con\s+|\s+por\s+|\s+de\s+\d|\s*[.,:]|\s*$)/,
    /\b(?:a|de)\s+([A-ZÁÉÍÓÚÑ][^.,\n]*?)(?=\s+el\s+\d{1,2}\/|\s*[.,:]|\s*$)/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const s = m[1].trim();
    /* Case matters here. The guard exists to drop "tu tarjeta" and "la compra", and made
       case-insensitive it also drops EL CORTE INGLES, a real shop whose name begins with an
       article. Spanish notifications write articles in lower case and shop names in capitals. */
    if (/^(tu|su|la|el|un|una) /.test(s) || /^(Bizum|Apple Pay|Google Pay)$/i.test(s)) continue;
    return s.slice(0, 80);
  }
  return null;
}

/**
 * @param {string} text        the notification, verbatim
 * @param {object} [opts]
 * @param {Date|string} [opts.receivedAt]  when the phone forwarded it; default now
 * @param {string} [opts.source]           'phone' (default) or 'bizum'
 * @returns {object|null} a sighting shape, or null if there is no amount
 */
export function parseCapture(text, opts = {}) {
  if (!text || typeof text !== 'string') return null;
  const clean = text.replace(/\s+/g, ' ').trim();
  const am = clean.match(AMOUNT);
  if (!am) return null;
  const amount = parseEuroAmount(am[1]);
  if (amount === null || amount <= 0) return null;

  const isIn = IN_WORDS.test(clean);
  const isOut = OUT_WORDS.test(clean) && !(/has recibido/i.test(clean));
  const direction = isIn && !isOut ? 'in' : 'out';

  let channel = 'card';
  for (const [re, name] of CHANNEL_WORDS) { if (re.test(clean)) { channel = name; break; } }
  if (/\bbizum\b/i.test(clean)) channel = 'bizum';

  const card = clean.match(CARD);
  const merchantRaw = merchantFrom(clean);

  const received = opts.receivedAt ? new Date(opts.receivedAt) : new Date();
  let occurredAt = received;
  const d = clean.match(DATE_ES);
  if (d) {
    const [, dd, mm, yyyy, hh, mi] = d;
    const iso = `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}T${hh ? String(hh).padStart(2, '0') : String(received.getUTCHours()).padStart(2, '0')}:${mi ?? String(received.getUTCMinutes()).padStart(2, '0')}:00Z`;
    const parsed = new Date(iso);
    if (!Number.isNaN(parsed.getTime())) occurredAt = parsed;
  }

  // Confidence: a known verb, a merchant and a card mean the shape matched; a bare amount is a guess.
  let confidence = 0.55;
  if (isIn || isOut) confidence += 0.15;
  if (merchantRaw) confidence += 0.15;
  if (card || channel === 'bizum') confidence += 0.05;

  return {
    source: channel === 'bizum' ? 'bizum' : (opts.source || 'phone'),
    raw_text: clean,
    amount,
    currency: 'EUR',
    direction,
    channel,
    merchant_raw: merchantRaw,
    merchant_key: merchantKey(merchantRaw),
    card_last4: card ? card[1] : null,
    occurred_at: occurredAt.toISOString(),
    parse_confidence: Math.min(0.95, Math.round(confidence * 100) / 100),
  };
}

/**
 * A structured capture from an iOS Shortcut "Transaction" automation (Apple Pay / Wallet):
 * { merchant, amount, card, date } → sighting. Amount may be "12,50 €", "€12.50" or a number.
 */
export function parseStructured(p = {}) {
  const raw = typeof p.amount === 'number' ? String(p.amount) : String(p.amount ?? '');
  const m = raw.match(/(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+[.,]\d{1,2}|\d+)/);
  const amount = m ? parseEuroAmount(m[1]) : null;
  if (!amount || amount <= 0) return null;
  const merchantRaw = p.merchant ? String(p.merchant).slice(0, 80) : null;
  const card = p.card ? String(p.card).match(/(\d{4})\D*$/) : null;
  const when = p.date ? new Date(p.date) : new Date();
  return {
    source: 'phone',
    raw_text: [p.merchant, raw, p.card, p.date].filter(Boolean).join(' · '),
    amount,
    currency: /USD|\$/.test(raw) ? 'USD' : 'EUR',
    direction: p.direction === 'in' ? 'in' : 'out',
    channel: 'card',
    merchant_raw: merchantRaw,
    merchant_key: merchantKey(merchantRaw),
    card_last4: card ? card[1] : null,
    occurred_at: (Number.isNaN(when.getTime()) ? new Date() : when).toISOString(),
    parse_confidence: merchantRaw ? 0.9 : 0.7,
  };
}
