/**
 * Santander España writes a whole sentence where a merchant name belongs:
 *
 *   PAGO MOVIL EN EL CORTE INGLES, MADRID ES, TARJ. :*741245
 *   COMPRA Cabify ES 2636eRmHs0tq, Madrid, TARJETA 5489010523741245 , COMISION 0,00
 *   DEVOLUCION COMPRA EN ARBITRADE MADRID 3, GETAFE, TARJETA 5489…
 *   BIZUM A FAVOR DE <person> CONCEPTO: Sin concepto
 *   TRANSFERENCIA INMEDIATA DE <person>, CONCEPTO Sent from Revolut
 *   LIQUIDACION DEL CONTRATO 0018909 300
 *
 * A ledger that prints those sentences reads like a bank statement, which is the
 * thing the person already could not read. This turns each one into the words they
 * would use: who they paid, how, and on which card.
 *
 * Pure functions, no I/O. The shapes come from a real Santander feed read on
 * 2026-09-08; the reference codes and card digits in the examples are altered.
 */

/** Payment aggregators that print their own name before the merchant's. */
const AGGREGATORS = /^(sq|square|sumup|izettle|iz|paypal|pp|pay|stripe|shopify|glovoapp|glovo|adyen)$/i;

/** Words that are the bank talking, not a merchant. */
const NOISE = /^(comision|comisión|concepto|tarj|tarjeta|es|españa|spain)$/i;

/** How the money moved, from the words the bank uses for it. */
export function channelFrom(text) {
  const t = String(text || '');
  if (/\bbizum\b/i.test(t)) return 'bizum';
  if (/\bpago\s+movil\b|\bpago\s+móvil\b|\bcompra\b|\btarjeta\b|\btarj\./i.test(t)) return 'card';
  if (/\brecibo\b|\badeudo\b|\bdomicili/i.test(t)) return 'direct_debit';
  if (/\bcajero\b|\breintegro\b|\bdisposicion\b|\bdisposición\b/i.test(t)) return 'cash';
  if (/\bnomina\b|\bnómina\b|\btransferencia\b|\btraspaso\b|\bingreso\b/i.test(t)) return 'transfer';
  if (/\bliquidacion\b|\bliquidación\b|\bcomision\b|\bcomisión\b|\bintereses\b/i.test(t)) return 'fee';
  return 'transfer';
}

/** The last four digits of the card, from a masked PAN or a *NNNNNN fragment. */
export function cardFrom(text) {
  const m = String(text || '').match(/(?:TARJETA|TARJ\.?)\s*:?\s*\*?(\d{4,19})/i);
  if (!m) return null;
  return m[1].slice(-4);
}

/** Card descriptors that are a company under a shorthand nobody says out loud. */
const ALIASES = new Map([
  ['facebk', 'Facebook'], ['fb', 'Facebook'], ['amzn', 'Amazon'], ['amzn mktp', 'Amazon'],
  ['googl', 'Google'], ['google play', 'Google Play'], ['uber bv', 'Uber'], ['uber trip', 'Uber'],
  ['paypal', 'PayPal'], ['glovoapp', 'Glovo'], ['aws', 'Amazon Web Services'], ['openai', 'OpenAI'],
]);

/** Names that are read as letters, not as a word, and keep their capitals. */
const ACRONYMS = new Set(['IE', 'IBM', 'BBVA', 'ING', 'KFC', 'SQ', 'EU', 'UK', 'US', 'AB', 'IKEA', 'ONCE', 'ADIF', 'AVE']);

/** Drop a trailing reference code: FACEBK *WPSY2ZDD22, Cabify ES 2636eRmHs0tq, PLAYTOMIC.IO 8C575A28. */
function dropReference(name) {
  const words = name.split(/\s+/).filter(Boolean);
  while (words.length > 1) {
    const last = words[words.length - 1];
    const mixed = /[A-Za-z]/.test(last) && /\d/.test(last) && last.length >= 5 && !last.includes('.');
    const digits = /^\d{1,6}$/.test(last);                                         // 0018909, a store number
    const country = /^(es|uk|us|ie|de|fr|pt|it|nl)$/i.test(last) && !ACRONYMS.has(last.toUpperCase());
    const cut = /^[A-Za-z]$/.test(last);                                           // the bank truncated the name
    const legal = /^(inc|inc\.|llc|ltd|ltd\.|corp|corp\.|co|co\.|sa|s\.a\.|sl|s\.l\.|slu|bv|b\.v\.|gmbh|oy|ab|plc)$/i.test(last) && words.length > 1;
    if (mixed || digits || country || cut || legal) { words.pop(); continue; }
    break;
  }
  return words.join(' ');
}

/** Words the bank glues to a name: a leading date (31AUG), a trailing city fragment. */
function stripDatePrefix(name) {
  return name.replace(/^\d{1,2}(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC|JAN|APR|AUG|DEC)\s+/i, '');
}

/** An aggregator prints "SQ *SHAKE SHACK"; the merchant is the half that is not the aggregator. */
function throughAggregator(name) {
  const star = name.indexOf('*');
  if (star < 0) return name;
  const before = name.slice(0, star).trim();
  const after = name.slice(star + 1).trim();
  if (AGGREGATORS.test(before.replace(/[^A-Za-z]/g, ''))) return after || before;
  return before || after;
}

/** Title case, leaving a domain and a read-as-letters name as they came. */
export function prettyMerchant(name) {
  const raw = String(name || '').trim().replace(/\s{2,}/g, ' ');
  if (!raw) return null;
  return raw
    .split(' ')
    .map((w) => {
      if (w.includes('.')) {
        /* A domain is a name, not a shout: BOLT.EU/O/2609041118 reads as Bolt.eu. */
        const domain = w.replace(/^([\w-]+(?:\.[\w-]+)+)[/\\].*$/, '$1');
        return /[a-z]/.test(domain) && /[A-Z]/.test(domain) ? domain : domain.charAt(0).toUpperCase() + domain.slice(1).toLowerCase();
      }
      if (ACRONYMS.has(w.toUpperCase())) return w.toUpperCase();         // IE, BBVA
      if (/[a-z]/.test(w) && /[A-Z]/.test(w)) return w;                  // Cabify, McDonald
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * The merchant or person, the channel and the card, read out of one Santander narrative.
 * Returns { merchant, channel, cardLast4, isRefund }. `merchant` is null when the sentence
 * names no counterparty (a settlement, an interest line), and the caller keeps the raw text.
 */
export function parseNarrative(text) {
  const t = String(text || '').replace(/\s{2,}/g, ' ').trim();
  const channel = channelFrom(t);
  const cardLast4 = cardFrom(t);
  const isRefund = /^devolucion|^devolución|^abono/i.test(t);
  if (!t) return { merchant: null, channel, cardLast4, isRefund };

  /* A person, on a Bizum or a transfer: the name runs to CONCEPTO or to the end. */
  const person = t.match(/\b(?:A\s+FAVOR\s+DE|DE)\s+(.+?)(?:\s*,?\s*CONCEPTO\b|\s*,\s*$|\s*\.\s*$|$)/i);
  if ((channel === 'bizum' || channel === 'transfer') && person) {
    const name = prettyMerchant(person[1].replace(/[.,\s]+$/, ''));
    return { merchant: name || null, channel, cardLast4, isRefund };
  }

  /* A shop, on a card: the name sits after EN or after COMPRA, and ends at the first comma. */
  const shop = t.match(/(?:PAGO\s+MOVIL\s+EN|PAGO\s+MÓVIL\s+EN|COMPRA\s+EN|COMPRA|EN)\s+(.+)/i);
  if (shop) {
    let name = shop[1].split(',')[0];
    name = stripDatePrefix(name.trim());
    name = throughAggregator(name);
    name = dropReference(name).trim();
    if (name && !NOISE.test(name)) return { merchant: ALIASES.get(name.toLowerCase()) || prettyMerchant(name), channel, cardLast4, isRefund };
  }

  /* The bank charging its own account still deserves a name a person can read. */
  if (/\bliquidacion\b|\bliquidación\b/i.test(t)) return { merchant: 'Account settlement', channel, cardLast4, isRefund };
  if (/\bcomision\b|\bcomisión\b|\bintereses\b/i.test(t)) return { merchant: 'Bank fee', channel, cardLast4, isRefund };

  return { merchant: null, channel, cardLast4, isRefund };
}
