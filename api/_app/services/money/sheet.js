import { beginReconciliationRead, finishReconciliationRead } from './reconciliationRead.js';
import { financialEvidenceBlocked, financialEvidenceReason } from './financialCompleteness.js';
/**
 * The month as a sheet.
 * =====================
 * Stefano asked for "a live budget sheet in your Drive that I maintain from whatever data
 * you feed me" (2026-09-23). A sheet the product maintains elsewhere is a second ledger to
 * keep honest; this is the one ledger, handed over as a file: a row per payment of the
 * month, the day where the person is, the place, the kind of place as the page names it,
 * the amount, the channel the bank recorded, and whether the ledger expects it back.
 * No scope, no sync, nothing to drift. Pure where it can be; one read where it must.
 */
import * as XLSX from 'xlsx';
import { dayIn } from './zone.js';
import { ledgerCurrency } from './currency.js';
import { kindWord } from './chat.js';
import { listOwnTransactions, listPlaces, categoryOfPayment, userLanguage, personProfileCached, listFacts } from './store.js';
import { personRoles, roleOf } from './spending.js';
import { quietly } from './quietly.js';
import { maskEvidenceCards } from './evidencePrivacy.js';

const HEADERS = {
  en: ['Day', 'Place', 'Kind', 'Amount', 'Currency', 'Channel', 'Comes back'],
  es: ['Día', 'Lugar', 'Tipo', 'Importe', 'Moneda', 'Canal', 'Vuelve'],
  'pt-BR': ['Dia', 'Lugar', 'Tipo', 'Valor', 'Moeda', 'Canal', 'Volta'],
};
const YES = { en: 'yes', es: 'sí', 'pt-BR': 'sim' };
const NOT_READ = { en: 'not read yet', es: 'sin leer todavía', 'pt-BR': 'ainda não lido' };
const CHANNEL = {
  en: { card: 'card', transfer: 'transfer', bizum: 'Bizum', cash: 'cash', direct_debit: 'direct debit' },
  es: { card: 'tarjeta', transfer: 'transferencia', bizum: 'Bizum', cash: 'efectivo', direct_debit: 'recibo' },
  'pt-BR': { card: 'cartão', transfer: 'transferência', bizum: 'Bizum', cash: 'dinheiro', direct_debit: 'débito' },
};
const L = (language) => (HEADERS[language] ? language : 'en');

/** The month key a request may name: YYYY-MM, or null for the current month. */
export function monthOf(query, now = new Date(), zone = null) {
  const s = String(query || '').trim();
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) return s;
  return dayIn(now, zone).slice(0, 7);
}

/**
 * Header and rows for one month, oldest first, in the person's language and zone. A row the
 * person disowned is not here (the read leaves it out); one in another currency is, with its
 * own currency named, since a file is the place to see everything.
 */
export function sheetRows(transactions, { month, places = [], recurring = [], facts = [], language = 'en', zone = null } = {}) {
  const roles = personRoles(facts || []);
  const lang = L(language);
  const byKey = new Map((places || []).map((p) => [p.merchant_key, p]));
  const back = new Set((recurring || []).map((r) => r.merchant_key));
  const rows = (transactions || [])
    .filter((t) => dayIn(t.occurred_at, zone).slice(0, 7) === month)
    .sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at))
    .map((t) => {
      const place = byKey.get(t.merchant_key);
      const kind = categoryOfPayment(place, t.channel, roleOf(roles, t.merchant_key));
      return [
        dayIn(t.occurred_at, zone),
        maskEvidenceCards(place?.name || t.merchant_raw || t.merchant_key || ''),
        kind ? kindWord(lang, kind) : NOT_READ[lang],
        Number(t.amount) || 0,
        t.currency || ledgerCurrency(),
        (CHANNEL[lang] && CHANNEL[lang][t.channel]) || t.channel || '',
        back.has(t.merchant_key) ? YES[lang] : '',
      ];
    });
  return { header: HEADERS[lang], rows };
}

/** The workbook's bytes: one sheet named after the month. */
export function sheetFile({ header, rows }, month) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws['!cols'] = [{ wch: 11 }, { wch: 32 }, { wch: 16 }, { wch: 11 }, { wch: 9 }, { wch: 14 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws, month);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/** One read of the ledger, the places and what comes back; the file for the month asked. */
export async function monthSheet(userId, { month = null, now = new Date(), deps = {} } = {}) {
  const reconciliationRead = await beginReconciliationRead(userId);
  const requireComplete = status => { if (financialEvidenceBlocked(status)) throw Object.assign(new Error(financialEvidenceReason(status)), { code: 'PAYMENT_REVIEW_REQUIRED' }); };
  requireComplete(reconciliationRead.initial);
  const read = { listOwnTransactions, listPlaces, userLanguage, personProfileCached, listFacts, recurringFor: async () => [], ...deps };
  const profile = await read.personProfileCached(userId).catch(quietly('sheet/profile', null));
  const zone = profile?.timezone || null;
  const key = monthOf(month, now, zone);
  const since = new Date(`${key}-01T00:00:00Z`); since.setUTCDate(since.getUTCDate() - 1);
  const [transactions, places, language, recurring, facts] = await Promise.all([
    read.listOwnTransactions(userId, { since: since.toISOString(), limit: 20000 }),
    read.listPlaces(userId).catch(quietly('sheet/places', [])),
    read.userLanguage(userId).catch(quietly('sheet/language', 'en')),
    read.recurringFor(userId).catch(quietly('sheet/recurring', [])),
    read.listFacts(userId).catch(quietly('sheet/facts', [])),
  ]);
  requireComplete(await finishReconciliationRead(reconciliationRead));
  const table = sheetRows(transactions, { month: key, places, recurring, facts, language: language || 'en', zone });
  return { month: key, rows: table.rows.length, filename: `twinme-${key}.xlsx`, buffer: sheetFile(table, key) };
}
