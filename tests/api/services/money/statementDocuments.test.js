/**
 * One payment is one line, whichever documents describe it.
 * =========================================================
 * Audit finding C1, seen on production: a person imported the sheet they keep (14 lines,
 * 372,07 spent) and then their bank's PDF of the same month, and the ledger held 36 lines and
 * 882,67 for a month of 22 lines and 510,60. Every upload is a sighting of source `statement`,
 * and a statement row could never join a line another statement already backed, so every
 * payment written in both files was counted twice.
 *
 * These run the real importer (the CSV reader, pdfGrid for the PDF, toSightings) and the real
 * ingestSightings and planIngestion against an in-memory ledger that answers the two
 * ingestion RPCs the way database/migrations/20260925125543_money_deferred_sightings.sql does:
 * a line's backings name each sighting and its source, and nothing about its document.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const db = vi.hoisted(() => {
  const DAY = 86400000;
  const state = { sightings: [], transactions: [], revision: 0, clock: Date.parse('2026-09-26T08:00:00Z') };
  const json = (value) => JSON.parse(JSON.stringify(value));
  const pick = (row, columns) => Object.fromEntries(columns.map((c) => [c, row[c] ?? null]));
  /* The columns jsonb_populate_recordset keeps: legacy_refs and anything else the plan carries go. */
  const SIGHTING = ['id', 'account_id', 'source', 'source_ref', 'raw_text', 'raw_json', 'amount', 'currency', 'direction', 'merchant_raw', 'merchant_key', 'occurred_at', 'channel', 'card_last4', 'parse_confidence', 'reconciliation'];
  const TRANSACTION = ['id', 'account_id', 'occurred_at', 'posted_at', 'amount', 'currency', 'merchant_raw', 'merchant_key', 'channel', 'card_last4', 'primary_sighting_id'];
  const names = (input, s) => input.source === s.source && (input.source_ref === s.source_ref
    || (input.legacy_refs || []).includes(s.source_ref)
    || (input.legacy_refs || []).some((ref) => /^(pend:|bank:fallback:)/.test(ref)
      && s.source_ref.startsWith(`${ref}#`) && /^\d+$/.test(s.source_ref.slice(ref.length + 1))));

  function prepare({ p_sightings: inputs }) {
    if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 250) throw new Error('invalid ingestion request');
    const prior = state.sightings.filter((s) => inputs.some((input) => names(input, s)));
    const times = inputs.map((input) => Date.parse(input.occurred_at));
    const from = Math.min(...times) - 4 * DAY; const to = Math.max(...times) + 4 * DAY;
    const linked = new Set(prior.map((s) => s.transaction_id).filter(Boolean));
    const transactions = state.transactions
      .filter((t) => (Date.parse(t.occurred_at) >= from && Date.parse(t.occurred_at) <= to) || linked.has(t.id))
      .sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at) || (a.id < b.id ? -1 : 1))
      .map((t) => {
        const primary = state.sightings.find((s) => s.id === t.primary_sighting_id);
        return {
          ...t, primary_source: primary?.source ?? null, primary_status: primary?.raw_json?.status ?? null,
          backings: state.sightings.filter((s) => s.transaction_id === t.id)
            .map((s) => ({ id: s.id, source: s.source, status: s.raw_json?.status ?? null })),
        };
      });
    return { protocol: 2, revision: state.revision, sightings: prior, transactions };
  }

  function commit({ p_revision: revision, p_sightings: sightings, p_creates: creates, p_updates: updates, p_links: links }) {
    if (revision !== state.revision) return { error: { code: 'PT409', message: 'money ingestion changed; retry' } };
    const to = new Map(links.map((l) => [l.sighting_id, l.transaction_id]));
    /* The checks commit_money_ingestion makes before it writes a row. */
    for (const s of sightings) {
      if (!to.has(s.id)) throw new Error('duplicate or missing ingestion disposition');
      const deferred = s.reconciliation?.state === 'deferred';
      const old = state.sightings.find((x) => x.id === s.id);
      if ((to.get(s.id) === null) !== deferred || (old?.transaction_id && old.transaction_id !== to.get(s.id))) {
        throw new Error('invalid evidence transition');
      }
      for (const id of s.reconciliation?.candidate_ids || []) {
        if (!state.transactions.some((t) => t.id === id)) throw new Error('candidate ownership mismatch');
      }
    }
    for (const t of [...creates, ...updates]) {
      if (![...to.values()].includes(t.id)) throw new Error('unbacked transaction mutation');
    }
    const now = new Date(state.clock += 60000).toISOString();
    for (const s of sightings) {
      const at = state.sightings.findIndex((x) => x.id === s.id);
      const row = { ...pick(s, SIGHTING), transaction_id: at >= 0 ? state.sightings[at].transaction_id : null };
      if (at >= 0) state.sightings[at] = row; else state.sightings.push(row);
    }
    for (const t of creates) state.transactions.push({ ...pick(t, TRANSACTION), created_at: now });
    for (const u of updates) {
      const t = state.transactions.find((x) => x.id === u.id);
      if (!t) throw new Error('transaction update mismatch');
      for (const c of TRANSACTION) if (c !== 'id' && c in u) t[c] = u[c];
    }
    for (const [sightingId, transactionId] of to) state.sightings.find((x) => x.id === sightingId).transaction_id = transactionId;
    for (const id of new Set([...to.values()].filter(Boolean))) {
      const t = state.transactions.find((x) => x.id === id);
      if (!t || state.sightings.find((s) => s.id === t.primary_sighting_id)?.transaction_id !== id) {
        throw new Error('transaction ownership or evidence mismatch');
      }
    }
    state.revision += 1;
    return { data: { revision: state.revision } };
  }

  return {
    state,
    reset() { state.sightings = []; state.transactions = []; state.revision = 0; },
    async rpc(name, args) {
      try {
        if (name === 'prepare_money_ingestion') return { data: json(prepare(json(args))), error: null };
        if (name === 'commit_money_ingestion') {
          const out = commit(json(args));
          return out.error ? { data: null, error: out.error } : { data: out.data, error: null };
        }
      } catch (error) { return { data: null, error: { code: 'P0001', message: error.message } }; }
      throw new Error(`unexpected rpc ${name}`);
    },
  };
});
vi.mock('../../../../api/_app/services/database.js', () => ({ supabaseAdmin: { rpc: (name, args) => db.rpc(name, args) } }));

import { parseDelimited, toSightings, documentFingerprint } from '../../../../api/_app/services/money/statements/importer.js';
import { pdfGrid } from '../../../../api/_app/services/money/statements/pdfGrid.js';
import { ingestSightings } from '../../../../api/_app/services/money/ingestion.js';

const USER = '00000000-0000-4000-8000-000000000001';
const ACCOUNT = '00000000-0000-4000-8000-000000000010';
const fixture = (name) => readFileSync(resolve(process.cwd(), 'tests/fixtures/statements', name));
const SHEET = fixture('gastos-septiembre.csv');
const PDF = fixture('extracto-web.pdf');

/** A file into the ledger the way the upload does it: rows, sightings for one account, one write. */
async function importFile(bytes, name = 'file.csv') {
  const rows = /\.pdf$/i.test(name) ? await pdfGrid(bytes) : parseDelimited(bytes.toString('utf8'));
  const { sightings } = toSightings(rows, { accountId: ACCOUNT, defaultCurrency: 'EUR', document: documentFingerprint(bytes) });
  return ingestSightings(USER, sightings);
}
const csv = (...rows) => Buffer.from(['Fecha;Concepto;Importe', ...rows].join('\n'));
/* Quoted, as a bank's export quotes a concept with commas in it. */
const card = (shop) => `"PAGO MOVIL EN ${shop}, MADRID ES, TARJ. :*123456"`;

const cents = (n) => Math.round(Number(n) * 100);
function month() {
  const lines = db.state.transactions;
  const total = (sign) => lines.filter((t) => Math.sign(t.amount) === sign).reduce((n, t) => n + cents(t.amount), 0) / 100;
  return { lines: lines.length, out: Math.abs(total(-1)), in: total(1) };
}
const backers = (line) => db.state.sightings.filter((s) => s.transaction_id === line.id);
const deferred = () => db.state.sightings.filter((s) => s.reconciliation?.state === 'deferred');

beforeEach(() => db.reset());

describe('a kept sheet and the bank PDF of the same month', () => {
  it('reads the sheet as the person kept it: 14 lines, 372,07 spent', async () => {
    await importFile(SHEET, 'gastos.csv');
    expect(month()).toEqual({ lines: 14, out: 372.07, in: 500 });
  });

  it('is 22 lines, 510,60 out and 1 350,00 in when the sheet comes first', async () => {
    await importFile(SHEET, 'gastos.csv');
    const result = await importFile(PDF, 'extracto.pdf');
    expect(month()).toEqual({ lines: 22, out: 510.6, in: 1350 });
    expect(result).toMatchObject({ seen: 22, created: 8, attached: 14, deferred: 0 });
    /* The sheet's Cabify is the day of the ride, the 9th; the bank's is its value date, the 10th. */
    const cabify = db.state.transactions.find((t) => cents(t.amount) === -960);
    expect(backers(cabify).map((s) => s.occurred_at.slice(0, 10)).sort()).toEqual(['2026-09-09', '2026-09-10']);
  });

  it('is the same month when the PDF comes first', async () => {
    await importFile(PDF, 'extracto.pdf');
    const result = await importFile(SHEET, 'gastos.csv');
    expect(month()).toEqual({ lines: 22, out: 510.6, in: 1350 });
    expect(result).toMatchObject({ seen: 14, created: 0, attached: 14, deferred: 0 });
  });

  it('adds nothing when either file is imported a second time', async () => {
    await importFile(SHEET, 'gastos.csv');
    await importFile(PDF, 'extracto.pdf');
    expect(await importFile(SHEET, 'gastos.csv')).toMatchObject({ created: 0, deferred: 0 });
    expect(await importFile(PDF, 'extracto.pdf')).toMatchObject({ created: 0, deferred: 0 });
    expect(month()).toEqual({ lines: 22, out: 510.6, in: 1350 });
    expect(db.state.sightings).toHaveLength(36);
  });

  it('keeps on every row the file it came from, and joins a line at most once per file', async () => {
    await importFile(SHEET, 'gastos.csv');
    await importFile(PDF, 'extracto.pdf');
    const sheet = documentFingerprint(SHEET); const pdf = documentFingerprint(PDF);
    expect(sheet).toMatch(/^[0-9a-f]{16}$/);
    expect(sheet).not.toBe(pdf);
    expect(db.state.sightings.filter((s) => s.raw_json.document === sheet)).toHaveLength(14);
    expect(db.state.sightings.filter((s) => s.raw_json.document === pdf)).toHaveLength(22);
    for (const line of db.state.transactions) {
      const documents = backers(line).map((s) => s.raw_json.document);
      expect(new Set(documents).size).toBe(documents.length);
    }
  });
});

describe('a month already counted twice', () => {
  it('joins a third file to those lines without opening another or holding one for review', async () => {
    /* Production today: the sheet and the PDF went in before a row kept its file, so none
       recorded one, and the month is 36 lines. */
    for (const [bytes, name] of [[SHEET, 'gastos.csv'], [PDF, 'extracto.pdf']]) {
      const rows = /\.pdf$/i.test(name) ? await pdfGrid(bytes) : parseDelimited(bytes.toString('utf8'));
      await ingestSightings(USER, toSightings(rows, { accountId: ACCOUNT, defaultCurrency: 'EUR' }).sightings);
    }
    expect(month()).toEqual({ lines: 36, out: 882.67, in: 1850 });
    /* Two of those payments in another export of the same bank, worded its own way (the same
       words as the PDF's would be the PDF's own rows again, by their refs). "Mercadona Calle
       Alcala" is one shop with the sheet's "Mercadona" and the PDF's line, so it takes the older
       of the two; "Renfe Cercanias" names only the PDF's, not the sheet's "Cercanias". */
    const other = (shop, amount) => `01/09/2026;"COMPRA EN ${shop}, MADRID ES, TARJETA 5540XXXXXXXX3456";${amount}`;
    const result = await importFile(csv(other('MERCADONA CALLE ALCALA', '-48,20'), other('RENFE CERCANIAS', '-1,70')));
    expect(result).toMatchObject({ created: 0, attached: 2, deferred: 0 });
    expect(month()).toEqual({ lines: 36, out: 882.67, in: 1850 });
    const joined = db.state.transactions.filter((t) => backers(t).length === 2);
    expect(joined.map((t) => t.merchant_key).sort()).toEqual(['mercadona', 'renfe cercanias']);
  });
});

describe('equal payments', () => {
  it('keeps two equal payments on one day in one file as two lines', async () => {
    const rides = csv('05/09/2026;Metro;-2,50', '05/09/2026;Metro;-2,50');
    await importFile(rides);
    await importFile(rides);
    expect(month()).toEqual({ lines: 2, out: 5, in: 0 });
  });

  it('pairs two equal payments on one day in two files one to one, with nothing held for review', async () => {
    const sheet = csv('05/09/2026;Metro;-2,50', '05/09/2026;Metro;-2,50');
    const bank = csv(`05/09/2026;${card('METRO DE MADRID')};-2,50`, `05/09/2026;${card('METRO DE MADRID')};-2,50`);
    for (const files of [[sheet, bank], [bank, sheet]]) {
      db.reset();
      for (const file of files) expect(await importFile(file)).toMatchObject({ deferred: 0 });
      expect(month()).toEqual({ lines: 2, out: 5, in: 0 });
      for (const line of db.state.transactions) {
        expect(backers(line).map((s) => s.raw_json.document).sort()).toEqual([documentFingerprint(sheet), documentFingerprint(bank)].sort());
      }
    }
  });

  it('holds a row for review when the lines it could be differ by shop, as an alert that names no shop always was', async () => {
    await importFile(csv('05/09/2026;Mercadona;-20,00', '05/09/2026;Lidl;-20,00'));
    const lines = db.state.transactions.map((t) => t.id).sort();
    expect(await importFile(csv(`05/09/2026;${card('CARREFOUR EXPRESS')};-20,00`))).toMatchObject({ created: 0, attached: 0, deferred: 1 });
    expect(month()).toEqual({ lines: 2, out: 40, in: 0 });
    const [held] = deferred();
    expect(held).toMatchObject({ source: 'statement', transaction_id: null, reconciliation: { state: 'deferred', reason: 'ambiguous_weak_match', candidate_ids: lines } });
    /* The bank's alert mail, which names no shop, is held the same way it was before. */
    const alert = { source: 'email', source_ref: 'email:alert-1', amount: 20, currency: 'EUR', direction: 'out', occurred_at: '2026-09-05T17:00:00Z', merchant_key: 'unknown', merchant_raw: null };
    expect(await ingestSightings(USER, [alert])).toMatchObject({ created: 0, deferred: 1 });
    expect(deferred().find((s) => s.source === 'email').reconciliation.candidate_ids).toEqual(lines);
  });

  it('lets the rest of the file settle a row that could not tell two lines apart on its own', async () => {
    await importFile(csv('05/09/2026;Cafe;-2,50', '05/09/2026;Metro;-2,50'));
    const result = await importFile(csv(`05/09/2026;${card('CAFETERIA PEPE')};-2,50`, `05/09/2026;${card('METRO DE MADRID')};-2,50`));
    expect(result).toMatchObject({ created: 0, attached: 2, deferred: 0 });
    const byShop = Object.fromEntries(db.state.transactions.map((t) => [t.merchant_key, backers(t).map((s) => s.merchant_key).sort()]));
    expect(byShop).toEqual({ cafe: ['cafe', 'cafeteria pepe'], metro: ['metro', 'metro de madrid'] });
  });
});

describe('a file never joins a line it already backs', () => {
  it('keeps the day after the overlap when a later export repeats an earlier one', async () => {
    const ride = (day) => `${day}/09/2026;${card('METRO DE MADRID')};-2,50`;
    await importFile(csv(ride('14'), ride('15')));
    /* The later export lists the newest first: the 16th is read before the 15th it repeats. */
    const result = await importFile(csv(ride('16'), ride('15'), ride('14')));
    expect(result).toMatchObject({ created: 1, deferred: 0 });
    expect(month()).toEqual({ lines: 3, out: 7.5, in: 0 });
    expect(db.state.transactions.map((t) => backers(t).length)).toEqual([1, 1, 1]);
  });

  const day = (n) => new Date(Date.UTC(2026, 0, 1) + n * 86400000).toISOString().slice(0, 10).split('-').reverse().join('/');
  it('keeps every daily payment of a file too long for one write', async () => {
    const commute = csv(...Array.from({ length: 260 }, (_, n) => `${day(n)};Metro;-2,50`));
    expect(await importFile(commute)).toMatchObject({ seen: 260, created: 260, attached: 0, deferred: 0 });
    expect(month()).toEqual({ lines: 260, out: 650, in: 0 });
  });

  it('keeps the day after the overlap when the repeated rows only come in a later write', async () => {
    /* January went in first. The year's export lists the newest first, 250 rows to a write: the
       first write ends on the 1st of February and the 31st of January it repeats is in the next. */
    await importFile(csv(...Array.from({ length: 31 }, (_, n) => `${day(n)};Metro;-2,50`)));
    const year = csv(...Array.from({ length: 281 }, (_, n) => `${day(280 - n)};Metro;-2,50`));
    expect(await importFile(year)).toMatchObject({ seen: 281, created: 250, attached: 0, deferred: 0 });
    expect(month()).toEqual({ lines: 281, out: 702.5, in: 0 });
  });
});
